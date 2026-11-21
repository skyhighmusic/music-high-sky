import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, getDriveAccessToken, handleFirestoreError, OperationType } from '../firebase';
import { clamp, logAudit, makeId } from './firestoreService';
import {
  uploadStructuredMediaToStorage,
  type StructuredStorageBucketArea,
} from './storageService';
import type {
  AudioTrackRecord,
  ImportFileLogEntry,
  MediaAssetRecord,
  MediaAssetType,
  ReleaseRecord,
  UserProfile,
  VideoReleaseRecord,
} from '../types';

export interface OfficialDriveSource {
  id: string;
  label: string;
  kind: 'file' | 'folder';
  url: string;
  description: string;
}

export const OFFICIAL_GOOGLE_DRIVE_SOURCES: OfficialDriveSource[] = [
  {
    id: '1Fbw9G92Fy1MrM0rmMbJfcD0w7Xn6PS2H',
    label: 'Source 1 — Google Drive File',
    kind: 'file',
    url: 'https://drive.google.com/file/d/1Fbw9G92Fy1MrM0rmMbJfcD0w7Xn6PS2H/view?usp=drivesdk',
    description: 'Official Music High Sky branding asset, artist photograph, or release media file.',
  },
  {
    id: '1PHM-N_GyZnk0g2LAMF5QIu91VqSIkvD0',
    label: 'Source 2 — Google Drive File',
    kind: 'file',
    url: 'https://drive.google.com/file/d/1PHM-N_GyZnk0g2LAMF5QIu91VqSIkvD0/view?usp=drivesdk',
    description: 'Official Music High Sky branding asset, artist photograph, or release media file.',
  },
  {
    id: '1aVPjVOFcNwTQh72b7hXs8lpI4eQq8jAy',
    label: 'Source 3 — Google Drive Folder',
    kind: 'folder',
    url: 'https://drive.google.com/drive/folders/1aVPjVOFcNwTQh72b7hXs8lpI4eQq8jAy',
    description: 'Complete Music High Sky folder containing audio songs, official videos, covers, and brand files.',
  },
];

export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
  thumbnailLink?: string;
  parents?: string[];
  imageMediaMetadata?: { width?: number; height?: number };
  videoMediaMetadata?: { width?: number; height?: number; durationMillis?: string };
}

export type ClassifiedDriveCategory =
  | 'branding_logo'
  | 'artist_photo'
  | 'audio_song'
  | 'video_song'
  | 'album_artwork'
  | 'unsupported';

export interface DiscoveredDriveItem {
  file: DriveFileMetadata;
  sourceLabel: string;
  sourceUrl: string;
  folderPath: string;
  category: ClassifiedDriveCategory;
  extension: string;
  sizeBytes: number;
  proposedTitle?: string;
  needsAdminReview?: boolean;
  accessError?: string;
}

export interface DriveInspectionSummary {
  items: DiscoveredDriveItem[];
  sourceErrors: { sourceLabel: string; sourceId: string; message: string }[];
  counts: {
    totalDiscovered: number;
    audioCount: number;
    videoCount: number;
    artworkCount: number;
    artistImageCount: number;
    brandingCount: number;
    unsupportedCount: number;
  };
}

export interface DriveImportProgress {
  phase: 'inspecting' | 'importing' | 'syncing_playlists' | 'done';
  currentIndex: number;
  totalItems: number;
  currentFileName: string;
  importedCount: number;
  duplicateCount: number;
  failedCount: number;
  pendingVerificationCount: number;
  logs: ImportFileLogEntry[];
}

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_FIELDS =
  'id,name,mimeType,size,modifiedTime,webViewLink,thumbnailLink,parents,imageMediaMetadata(width,height),videoMediaMetadata(width,height,durationMillis)';

const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'flac']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov']);
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);

function getExtension(name: string): string {
  const parts = name.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1].trim() : '';
}

function normalizeMatchKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[-–—_]+/g, ' ')
    .replace(/\b(sunil\s*kumar|sunilkumar|music\s*high\s*sky|usesuno\.com|official|audio|video|cover|artwork|part\s*\d+)\b/gi, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

function cleanSongTitleFromFilename(fileName: string): {
  title: string;
  subtitle: string;
  missingFields: string[];
} {
  const withoutExt = fileName.replace(/\.[^.]+$/, '').trim();
  const missingFields: string[] = [];

  // Extract Part 1 / Part 2 suffix if present
  let subtitle = '';
  let base = withoutExt;
  const partMatch = base.match(/[-–—\s]*(part\s*\d+)$/i);
  if (partMatch) {
    subtitle = partMatch[1].replace(/part\s*/i, 'Part ');
    base = base.slice(0, partMatch.index).trim();
  }

  // Strip trailing artist/source markers without inventing titles
  base = base
    .replace(/[-–—]\s*(sunil\s*kumar|sunilkumar|usesuno\.com)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  const title = base || withoutExt || 'Untitled Track (Review Required)';
  missingFields.push('Release Date', 'Genre Confirmation', 'Composer/Producer Credits');
  return { title, subtitle, missingFields };
}

function detectLanguageHint(text: string): { language: string; confident: boolean } {
  const lower = text.toLowerCase();
  if (lower.includes('haryanvi') || lower.includes('rao sahab') || text.includes('राव')) {
    return { language: 'Haryanvi', confident: true };
  }
  if (/[\u0900-\u097F]/.test(text) || lower.includes('hindi')) {
    return { language: 'Hindi', confident: true };
  }
  return { language: 'Hindi', confident: false };
}

function detectGenreHint(text: string): { genre: string; mood: string; confident: boolean } {
  const lower = text.toLowerCase();
  if (lower.includes('romantic') || lower.includes('ishq') || text.includes('इश्क') || text.includes('आशिक़')) {
    return { genre: 'Romantic', mood: 'Romantic', confident: true };
  }
  if (lower.includes('rap') || lower.includes('hip hop') || lower.includes('hip-hop')) {
    return { genre: 'Rap', mood: 'Energetic', confident: true };
  }
  if (lower.includes('cinematic')) {
    return { genre: 'Cinematic Music', mood: 'Cinematic', confident: true };
  }
  if (lower.includes('motivational') || lower.includes('motivation')) {
    return { genre: 'Motivational', mood: 'Motivational', confident: true };
  }
  if (lower.includes('emotional') || lower.includes('sad') || text.includes('माँ')) {
    return { genre: 'Emotional', mood: 'Emotional', confident: true };
  }
  if (lower.includes('haryanvi')) {
    return { genre: 'Haryanvi Music', mood: '', confident: true };
  }
  return { genre: 'Pending Classification', mood: '', confident: false };
}

/**
 * Classifies a Google Drive file using its actual MIME type, file extension,
 * folder location, and filename cues (without guessing song titles).
 */
export function classifyDriveFile(
  file: DriveFileMetadata,
  sourceId: string,
  folderPath: string
): ClassifiedDriveCategory {
  const ext = getExtension(file.name);
  const mime = (file.mimeType || '').toLowerCase();
  const combinedText = `${folderPath} ${file.name}`.toLowerCase();

  // Audio formats: MP3, WAV, FLAC
  if (
    AUDIO_EXTENSIONS.has(ext) ||
    mime === 'audio/mpeg' ||
    mime === 'audio/mp3' ||
    mime === 'audio/wav' ||
    mime === 'audio/x-wav' ||
    mime === 'audio/flac' ||
    mime === 'audio/x-flac'
  ) {
    return 'audio_song';
  }

  // Video formats: MP4, MOV
  if (
    VIDEO_EXTENSIONS.has(ext) ||
    mime === 'video/mp4' ||
    mime === 'video/quicktime'
  ) {
    return 'video_song';
  }

  // Images: inspect whether branding logo, Sunil Kumar artist portrait, or album artwork
  if (IMAGE_EXTENSIONS.has(ext) || mime.startsWith('image/')) {
    if (
      combinedText.includes('logo') ||
      combinedText.includes('brand') ||
      combinedText.includes('music high sky') ||
      combinedText.includes('music_high_sky') ||
      combinedText.includes('emblem') ||
      sourceId === '1Fbw9G92Fy1MrM0rmMbJfcD0w7Xn6PS2H'
    ) {
      if (
        combinedText.includes('sunil') &&
        !combinedText.includes('logo') &&
        !combinedText.includes('music high sky')
      ) {
        return 'artist_photo';
      }
      return 'branding_logo';
    }

    if (
      combinedText.includes('profile') ||
      combinedText.includes('portrait') ||
      combinedText.includes('artist') ||
      combinedText.includes('sunil') ||
      sourceId === '1PHM-N_GyZnk0g2LAMF5QIu91VqSIkvD0'
    ) {
      return 'artist_photo';
    }

    return 'album_artwork';
  }

  return 'unsupported';
}

async function driveFetchJson<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const errJson = (await res.json()) as { error?: { message?: string } };
      if (errJson.error?.message) detail = `${res.status}: ${errJson.error.message}`;
    } catch {
      // keep status code
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

async function listDriveFolderRecursive(
  folderId: string,
  folderPath: string,
  sourceLabel: string,
  sourceUrl: string,
  accessToken: string,
  visitedFolders: Set<string>,
  collected: DiscoveredDriveItem[]
): Promise<void> {
  if (visitedFolders.has(folderId)) return;
  visitedFolders.add(folderId);

  let pageToken = '';
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const url =
      `${DRIVE_API_BASE}/files?q=${q}` +
      `&fields=${encodeURIComponent(`nextPageToken,files(${DRIVE_FIELDS})`)}` +
      `&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');

    const data = await driveFetchJson<{
      files?: DriveFileMetadata[];
      nextPageToken?: string;
    }>(url, accessToken);

    for (const file of data.files || []) {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        await listDriveFolderRecursive(
          file.id,
          `${folderPath}/${file.name}`,
          sourceLabel,
          sourceUrl,
          accessToken,
          visitedFolders,
          collected
        );
      } else {
        const category = classifyDriveFile(file, folderId, folderPath);
        const parsed =
          category === 'audio_song' || category === 'video_song'
            ? cleanSongTitleFromFilename(file.name)
            : undefined;
        collected.push({
          file,
          sourceLabel,
          sourceUrl: file.webViewLink || sourceUrl,
          folderPath,
          category,
          extension: getExtension(file.name).toUpperCase(),
          sizeBytes: Number(file.size || 0),
          proposedTitle: parsed?.title,
          needsAdminReview: Boolean(parsed && parsed.missingFields.length > 0),
        });
      }
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);
}

/**
 * Inspects all 3 official Google Drive sources (2 individual files + 1 recursive folder)
 * using the authenticated in-memory Google Drive read-only token.
 */
export async function inspectOfficialGoogleDriveSources(
  accessToken?: string
): Promise<DriveInspectionSummary> {
  const token = accessToken || getDriveAccessToken();
  if (!token) {
    throw new Error(
      'Google Drive is not connected yet. Click "Connect Google Drive" to grant read-only access.'
    );
  }

  const items: DiscoveredDriveItem[] = [];
  const sourceErrors: { sourceLabel: string; sourceId: string; message: string }[] = [];
  const seenFileIds = new Set<string>();
  const visitedFolders = new Set<string>();

  for (const src of OFFICIAL_GOOGLE_DRIVE_SOURCES) {
    try {
      const metaUrl = `${DRIVE_API_BASE}/files/${encodeURIComponent(
        src.id
      )}?fields=${encodeURIComponent(DRIVE_FIELDS)}&supportsAllDrives=true`;
      const meta = await driveFetchJson<DriveFileMetadata>(metaUrl, token);

      if (meta.mimeType === 'application/vnd.google-apps.folder') {
        const folderItems: DiscoveredDriveItem[] = [];
        await listDriveFolderRecursive(
          meta.id,
          meta.name || 'Music High Sky Drive',
          src.label,
          src.url,
          token,
          visitedFolders,
          folderItems
        );
        for (const item of folderItems) {
          if (!seenFileIds.has(item.file.id)) {
            seenFileIds.add(item.file.id);
            items.push(item);
          }
        }
      } else {
        if (!seenFileIds.has(meta.id)) {
          seenFileIds.add(meta.id);
          const category = classifyDriveFile(meta, src.id, src.label);
          const parsed =
            category === 'audio_song' || category === 'video_song'
              ? cleanSongTitleFromFilename(meta.name)
              : undefined;
          items.push({
            file: meta,
            sourceLabel: src.label,
            sourceUrl: meta.webViewLink || src.url,
            folderPath: src.label,
            category,
            extension: getExtension(meta.name).toUpperCase(),
            sizeBytes: Number(meta.size || 0),
            proposedTitle: parsed?.title,
            needsAdminReview: Boolean(parsed && parsed.missingFields.length > 0),
          });
        }
      }
    } catch (err) {
      sourceErrors.push({
        sourceLabel: src.label,
        sourceId: src.id,
        message:
          err instanceof Error
            ? err.message
            : 'Unable to access this Google Drive source with the current account.',
      });
    }
  }

  const counts = {
    totalDiscovered: items.length,
    audioCount: items.filter((i) => i.category === 'audio_song').length,
    videoCount: items.filter((i) => i.category === 'video_song').length,
    artworkCount: items.filter((i) => i.category === 'album_artwork').length,
    artistImageCount: items.filter((i) => i.category === 'artist_photo').length,
    brandingCount: items.filter((i) => i.category === 'branding_logo').length,
    unsupportedCount: items.filter((i) => i.category === 'unsupported').length,
  };

  return { items, sourceErrors, counts };
}

async function downloadDriveFileBlob(fileId: string, accessToken: string): Promise<Blob> {
  const url = `${DRIVE_API_BASE}/files/${encodeURIComponent(
    fileId
  )}?alt=media&supportsAllDrives=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Drive download failed (HTTP ${res.status}). Check file sharing permissions.`);
  }
  return await res.blob();
}

async function readAudioMetricsFromBlob(blob: Blob): Promise<{
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  waveformPeaks: number[];
}> {
  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      return { durationSeconds: 0, sampleRate: 44100, channels: 2, waveformPeaks: [] };
    }
    const ctx = new AudioCtx();
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
      const channelData = decoded.getChannelData(0);
      const bars = 64;
      const step = Math.max(1, Math.floor(channelData.length / bars));
      const peaks: number[] = [];
      for (let i = 0; i < bars; i++) {
        let maxAmp = 0;
        const start = i * step;
        const end = Math.min(start + step, channelData.length);
        for (let j = start; j < end; j += Math.max(1, Math.floor(step / 64))) {
          const val = Math.abs(channelData[j]);
          if (val > maxAmp) maxAmp = val;
        }
        peaks.push(Number(Math.max(0.08, Math.min(1, maxAmp)).toFixed(3)));
      }
      return {
        durationSeconds: Math.round(decoded.duration),
        sampleRate: decoded.sampleRate || 44100,
        channels: decoded.numberOfChannels || 2,
        waveformPeaks: peaks,
      };
    } finally {
      await ctx.close();
    }
  } catch {
    return { durationSeconds: 0, sampleRate: 44100, channels: 2, waveformPeaks: [] };
  }
}

async function readImageDimensionsFromBlob(blob: Blob): Promise<{ width: number; height: number }> {
  return await new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const result = { width: img.naturalWidth || 0, height: img.naturalHeight || 0 };
      URL.revokeObjectURL(url);
      resolve(result);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 0, height: 0 });
    };
    img.src = url;
  });
}

function mapCategoryToStorageArea(category: ClassifiedDriveCategory): StructuredStorageBucketArea | null {
  switch (category) {
    case 'branding_logo':
      return 'branding';
    case 'artist_photo':
      return 'artist_photo';
    case 'audio_song':
      return 'audio_song';
    case 'video_song':
      return 'video_song';
    case 'album_artwork':
      return 'album_artwork';
    default:
      return null;
  }
}

function mapCategoryToMediaAssetType(category: ClassifiedDriveCategory): MediaAssetType | null {
  switch (category) {
    case 'branding_logo':
    case 'artist_photo':
    case 'audio_song':
    case 'video_song':
    case 'album_artwork':
      return category;
    default:
      return null;
  }
}

/**
 * Executes the full authorized Google Drive -> Firebase Storage -> Firestore import pipeline.
 * - Preserves original filenames & extensions in structured Firebase Storage folders
 * - Links permanent getDownloadURL() links into Firestore releases, tracks, videos, artwork, artist profile, settings & media_assets
 * - Deduplicates by driveFileId, normalized filename, and title
 * - Never deletes or alters Google Drive files
 * - Never invents missing metadata (flags Pending Verification)
 */
export async function executeGoogleDriveImport(params: {
  items: DiscoveredDriveItem[];
  actor: UserProfile;
  accessToken?: string;
  onlyFileIds?: Set<string>;
  onProgress?: (progress: DriveImportProgress) => void;
}): Promise<{ jobId: string; progress: DriveImportProgress }> {
  const token = params.accessToken || getDriveAccessToken();
  if (!token) {
    throw new Error('Google Drive session expired. Please reconnect Google Drive to continue.');
  }

  const targetItems = params.onlyFileIds
    ? params.items.filter((it) => params.onlyFileIds!.has(it.file.id))
    : params.items;

  // Order import so branding -> artist_photo -> audio_song -> video_song -> album_artwork
  // That way album_artwork can immediately attach to newly imported songs by filename match!
  const categoryPriority: Record<ClassifiedDriveCategory, number> = {
    branding_logo: 1,
    artist_photo: 2,
    audio_song: 3,
    video_song: 4,
    album_artwork: 5,
    unsupported: 6,
  };
  const orderedItems = [...targetItems].sort(
    (a, b) => categoryPriority[a.category] - categoryPriority[b.category]
  );

  // Snapshot existing Firestore records for strict deduplication
  const [releasesSnap, tracksSnap, videosSnap, assetsSnap] = await Promise.all([
    getDocs(query(collection(db, 'releases'), where('distributorLabel', '==', 'Music High Sky'))),
    getDocs(query(collection(db, 'audio_tracks'), where('validated', '==', true))),
    getDocs(query(collection(db, 'video_releases'), where('validated', '==', true))),
    getDocs(
      query(
        collection(db, 'media_assets'),
        where('assetType', 'in', [
          'branding_logo',
          'artist_photo',
          'audio_song',
          'video_song',
          'album_artwork',
          'playlist_cover',
        ])
      )
    ),
  ]);

  const existingReleases = releasesSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<ReleaseRecord, 'id'>),
  }));
  const existingTracks = tracksSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<AudioTrackRecord, 'id'>),
  }));
  const existingVideos = videosSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<VideoReleaseRecord, 'id'>),
  }));
  const existingAssets = assetsSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<MediaAssetRecord, 'id'>),
  }));

  const existingDriveIds = new Set<string>([
    ...existingAssets.map((a) => a.driveFileId || '').filter(Boolean),
    ...existingReleases.map((r) => r.driveFileId || '').filter(Boolean),
    ...existingTracks.map((t) => t.driveFileId || '').filter(Boolean),
    ...existingVideos.map((v) => v.driveFileId || '').filter(Boolean),
  ]);

  const existingReleaseKeys = new Map<string, string>();
  for (const r of existingReleases) {
    const key = normalizeMatchKey(r.title);
    if (key) existingReleaseKeys.set(key, r.id);
  }
  const existingFileNameKeys = new Set<string>([
    ...existingTracks.map((t) => t.fileName.toLowerCase()),
    ...existingVideos.map((v) => (v.fileName || '').toLowerCase()),
  ]);

  const jobId = makeId('imp');
  const todayIso = new Date().toISOString().slice(0, 10);

  const progress: DriveImportProgress = {
    phase: 'importing',
    currentIndex: 0,
    totalItems: orderedItems.length,
    currentFileName: '',
    importedCount: 0,
    duplicateCount: 0,
    failedCount: 0,
    pendingVerificationCount: 0,
    logs: [],
  };

  const counts = {
    totalDiscovered: orderedItems.length,
    audioCount: orderedItems.filter((i) => i.category === 'audio_song').length,
    videoCount: orderedItems.filter((i) => i.category === 'video_song').length,
    artworkCount: orderedItems.filter((i) => i.category === 'album_artwork').length,
    artistImageCount: orderedItems.filter((i) => i.category === 'artist_photo').length,
    brandingCount: orderedItems.filter((i) => i.category === 'branding_logo').length,
  };

  try {
    await setDoc(doc(db, 'import_jobs', jobId), {
      sourceType: 'google_drive',
      status: 'running',
      ...counts,
      importedCount: 0,
      duplicateCount: 0,
      failedCount: 0,
      pendingVerificationCount: 0,
      logsJson: '[]',
      triggeredBy: params.actor.uid,
      triggeredByName: clamp(params.actor.displayName, 120),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `import_jobs/${jobId}`);
  }

  for (let idx = 0; idx < orderedItems.length; idx++) {
    const item = orderedItems[idx];
    progress.currentIndex = idx + 1;
    progress.currentFileName = item.file.name;
    params.onProgress?.({ ...progress, logs: [...progress.logs] });

    const area = mapCategoryToStorageArea(item.category);
    const assetType = mapCategoryToMediaAssetType(item.category);

    if (!area || !assetType) {
      progress.logs.push({
        fileId: item.file.id,
        fileName: item.file.name,
        sourceLabel: item.sourceLabel,
        mimeType: item.file.mimeType,
        category: item.category,
        status: 'skipped',
        errorDetails: 'Unsupported file format for Music High Sky media library.',
      });
      continue;
    }

    // Strict deduplication check
    const normalizedTitleKey = normalizeMatchKey(item.file.name);
    const isDuplicateSong =
      (item.category === 'audio_song' || item.category === 'video_song') &&
      (existingDriveIds.has(item.file.id) ||
        existingFileNameKeys.has(item.file.name.toLowerCase()) ||
        (normalizedTitleKey.length >= 4 && existingReleaseKeys.has(normalizedTitleKey)));

    const isDuplicateAsset =
      item.category !== 'audio_song' &&
      item.category !== 'video_song' &&
      existingDriveIds.has(item.file.id);

    if (isDuplicateSong || isDuplicateAsset) {
      progress.duplicateCount += 1;
      progress.logs.push({
        fileId: item.file.id,
        fileName: item.file.name,
        sourceLabel: item.sourceLabel,
        mimeType: item.file.mimeType,
        category: item.category,
        status: 'duplicate',
        releaseId: existingReleaseKeys.get(normalizedTitleKey),
      });
      continue;
    }

    try {
      const blob = await downloadDriveFileBlob(item.file.id, token);
      const uploaded = await uploadStructuredMediaToStorage({
        file: blob,
        area,
        originalFileName: item.file.name,
        artistSlug: 'sunil-kumar',
        contentType: item.file.mimeType || blob.type || undefined,
      });

      const assetId = makeId('ast');
      let linkedReleaseId = '';
      let linkedArtistId = '';
      let metadataStatus: 'verified' | 'pending_verification' = 'verified';

      if (item.category === 'branding_logo') {
        await updateDoc(doc(db, 'settings', 'platform'), {
          brandLogoUrl: clamp(uploaded.downloadUrl, 2000),
          updatedBy: params.actor.uid,
          updatedAt: serverTimestamp(),
        });
      } else if (item.category === 'artist_photo') {
        linkedArtistId = 'sunil-kumar';
        await updateDoc(doc(db, 'artists', 'sunil-kumar'), {
          profilePhotoUrl: clamp(uploaded.downloadUrl, 350000),
          updatedBy: params.actor.uid,
          updatedAt: serverTimestamp(),
        });
      } else if (item.category === 'audio_song') {
        const parsed = cleanSongTitleFromFilename(item.file.name);
        const langHint = detectLanguageHint(`${item.folderPath} ${item.file.name}`);
        const genreHint = detectGenreHint(`${item.folderPath} ${item.file.name}`);
        const metrics = await readAudioMetricsFromBlob(blob);

        const releaseId = makeId('rel');
        const extFmt = item.extension === 'WAV' || item.extension === 'FLAC' ? item.extension : 'MP3';
        const releaseCode = `MHS-DRV-${Math.floor(10000 + Math.random() * 89999)}`;
        const missingList = [
          'Release Date',
          ...(genreHint.confident ? [] : ['Genre']),
          ...(langHint.confident ? [] : ['Language']),
          'Lyricist/Composer Verification',
        ];
        metadataStatus = 'pending_verification';
        progress.pendingVerificationCount += 1;

        await setDoc(doc(db, 'releases', releaseId), {
          releaseCode,
          releaseType: 'audio',
          title: clamp(parsed.title, 200),
          subtitle: clamp(parsed.subtitle, 200),
          primaryArtist: 'Sunil Kumar',
          featuredArtist: '',
          singer: 'Sunil Kumar',
          lyricist: '',
          composer: '',
          musicProducer: '',
          musicDirector: '',
          mixingEngineer: '',
          masteringEngineer: '',
          genre: clamp(genreHint.genre, 100),
          subgenre: '',
          language: clamp(langHint.language, 100),
          mood: clamp(genreHint.mood, 100),
          explicitContent: false,
          originalReleaseDate: '',
          plannedReleaseDate: '',
          releaseTime: '',
          copyrightYear: '',
          copyrightOwner: '',
          phonographicCopyright: '',
          publishingCopyright: '',
          distributorLabel: 'Music High Sky',
          artistCredit: 'Sunil Kumar',
          labelCredit: 'Music High Sky',
          creditNotes: '',
          targetPlatforms: [],
          status: 'Submitted',
          reviewNotes: clamp(
            `Imported from Google Drive (${item.file.name}). Admin review required for: ${missingList.join(', ')}.`,
            1000
          ),
          artworkPreview: '',
          smartLinkSlug: '',
          featured: false,
          driveFileId: clamp(item.file.id, 200),
          sourceOrigin: 'google_drive',
          submittedBy: params.actor.uid,
          submittedByName: clamp(params.actor.displayName, 120),
          submissionDate: todayIso,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const trackId = makeId('trk');
        await setDoc(doc(db, 'audio_tracks', trackId), {
          releaseId,
          fileName: clamp(item.file.name, 260),
          format: extFmt,
          fileSizeBytes: uploaded.bytesTransferred || item.sizeBytes,
          durationSeconds: metrics.durationSeconds,
          sampleRate: metrics.sampleRate,
          channels: metrics.channels,
          waveformPeaks: metrics.waveformPeaks.slice(0, 128),
          masterSourceUrl: clamp(uploaded.downloadUrl, 1000),
          storagePath: clamp(uploaded.storagePath, 600),
          driveFileId: clamp(item.file.id, 200),
          validated: true,
          ownerId: params.actor.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        linkedReleaseId = releaseId;
        existingReleaseKeys.set(normalizeMatchKey(parsed.title), releaseId);
        existingFileNameKeys.add(item.file.name.toLowerCase());
      } else if (item.category === 'video_song') {
        const parsed = cleanSongTitleFromFilename(item.file.name);
        const langHint = detectLanguageHint(`${item.folderPath} ${item.file.name}`);
        const genreHint = detectGenreHint(`${item.folderPath} ${item.file.name}`);

        const releaseId = makeId('rel');
        const extFmt = item.extension === 'MOV' ? 'MOV' : 'MP4';
        const releaseCode = `MHS-VID-${Math.floor(10000 + Math.random() * 89999)}`;
        const durationSec = item.file.videoMediaMetadata?.durationMillis
          ? Math.round(Number(item.file.videoMediaMetadata.durationMillis) / 1000)
          : 0;
        const resolution =
          item.file.videoMediaMetadata?.width && item.file.videoMediaMetadata?.height
            ? `${item.file.videoMediaMetadata.width}x${item.file.videoMediaMetadata.height}`
            : '';

        metadataStatus = 'pending_verification';
        progress.pendingVerificationCount += 1;

        await setDoc(doc(db, 'releases', releaseId), {
          releaseCode,
          releaseType: 'video',
          title: clamp(parsed.title, 200),
          subtitle: clamp(parsed.subtitle, 200),
          primaryArtist: 'Sunil Kumar',
          featuredArtist: '',
          singer: 'Sunil Kumar',
          lyricist: '',
          composer: '',
          musicProducer: '',
          musicDirector: '',
          mixingEngineer: '',
          masteringEngineer: '',
          genre: clamp(genreHint.genre, 100),
          subgenre: '',
          language: clamp(langHint.language, 100),
          mood: clamp(genreHint.mood, 100),
          explicitContent: false,
          originalReleaseDate: '',
          plannedReleaseDate: '',
          releaseTime: '',
          copyrightYear: '',
          copyrightOwner: '',
          phonographicCopyright: '',
          publishingCopyright: '',
          distributorLabel: 'Music High Sky',
          artistCredit: 'Sunil Kumar',
          labelCredit: 'Music High Sky',
          creditNotes: '',
          targetPlatforms: ['YouTube', 'YouTube Music'],
          status: 'Submitted',
          reviewNotes: clamp(
            `Official music video imported from Google Drive (${item.file.name}). Admin review required for release date, production credits, and genre confirmation.`,
            1000
          ),
          artworkPreview: '',
          smartLinkSlug: '',
          featured: false,
          driveFileId: clamp(item.file.id, 200),
          sourceOrigin: 'google_drive',
          submittedBy: params.actor.uid,
          submittedByName: clamp(params.actor.displayName, 120),
          submissionDate: todayIso,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const videoId = makeId('vid');
        await setDoc(doc(db, 'video_releases', videoId), {
          releaseId,
          director: '',
          producer: '',
          productionCompany: 'Music High Sky',
          description: '',
          fileName: clamp(item.file.name, 260),
          format: extFmt,
          fileSizeBytes: uploaded.bytesTransferred || item.sizeBytes,
          durationSeconds: durationSec,
          resolution: clamp(resolution, 40),
          youtubeUrl: '',
          videoCopyrightInfo: '',
          masterSourceUrl: clamp(uploaded.downloadUrl, 1000),
          storagePath: clamp(uploaded.storagePath, 600),
          driveFileId: clamp(item.file.id, 200),
          thumbnailPreview: '',
          validated: true,
          ownerId: params.actor.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        linkedReleaseId = releaseId;
        existingReleaseKeys.set(normalizeMatchKey(parsed.title), releaseId);
        existingFileNameKeys.add(item.file.name.toLowerCase());
      } else if (item.category === 'album_artwork') {
        const dims = await readImageDimensionsFromBlob(blob);
        const artKey = normalizeMatchKey(item.file.name);
        const matchedReleaseId = artKey ? existingReleaseKeys.get(artKey) : undefined;
        if (matchedReleaseId) {
          linkedReleaseId = matchedReleaseId;
          await updateDoc(doc(db, 'releases', matchedReleaseId), {
            artworkPreview: clamp(uploaded.downloadUrl, 350000),
            updatedAt: serverTimestamp(),
          });
          const artId = makeId('art');
          const artFormat =
            item.extension === 'PNG' ? 'PNG' : item.extension === 'JPEG' ? 'JPEG' : 'JPG';
          await setDoc(doc(db, 'artwork', artId), {
            releaseId: matchedReleaseId,
            kind: 'cover_art',
            fileName: clamp(item.file.name, 260),
            format: artFormat,
            width: dims.width,
            height: dims.height,
            aspectRatioValid: dims.width > 0 && dims.width === dims.height,
            previewDataUrl: clamp(uploaded.downloadUrl, 350000),
            locked: false,
            ownerId: params.actor.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          metadataStatus = 'pending_verification';
          progress.pendingVerificationCount += 1;
        }
      }

      // Record asset in media_assets collection
      await setDoc(doc(db, 'media_assets', assetId), {
        assetType,
        fileName: clamp(item.file.name, 260),
        originalFileName: clamp(item.file.name, 260),
        mimeType: clamp(item.file.mimeType || blob.type || 'application/octet-stream', 120),
        fileExtension: clamp(item.extension, 20),
        fileSizeBytes: uploaded.bytesTransferred || item.sizeBytes,
        storagePath: clamp(uploaded.storagePath, 600),
        downloadUrl: clamp(uploaded.downloadUrl, 2000),
        sourceType: 'google_drive',
        sourceUrl: clamp(item.sourceUrl, 1000),
        driveFileId: clamp(item.file.id, 200),
        linkedReleaseId: clamp(linkedReleaseId, 128),
        linkedArtistId: clamp(linkedArtistId, 128),
        linkedPlaylistId: '',
        metadataStatus,
        uploadedBy: params.actor.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      existingDriveIds.add(item.file.id);
      progress.importedCount += 1;
      progress.logs.push({
        fileId: item.file.id,
        fileName: item.file.name,
        sourceLabel: item.sourceLabel,
        mimeType: item.file.mimeType,
        category: item.category,
        status: metadataStatus === 'pending_verification' ? 'pending_verification' : 'imported',
        storagePath: uploaded.storagePath,
        downloadUrl: uploaded.downloadUrl,
        releaseId: linkedReleaseId || undefined,
      });
    } catch (err) {
      progress.failedCount += 1;
      const errMsg = err instanceof Error ? err.message : String(err);
      progress.logs.push({
        fileId: item.file.id,
        fileName: item.file.name,
        sourceLabel: item.sourceLabel,
        mimeType: item.file.mimeType,
        category: item.category,
        status: 'failed',
        errorDetails: errMsg.slice(0, 400),
      });
    }

    params.onProgress?.({ ...progress, logs: [...progress.logs] });
  }

  const finalStatus =
    progress.failedCount === 0
      ? 'completed'
      : progress.importedCount > 0
        ? 'completed_with_errors'
        : 'failed';

  const logsJson = JSON.stringify(progress.logs).slice(0, 440000);
  await updateDoc(doc(db, 'import_jobs', jobId), {
    status: finalStatus,
    importedCount: progress.importedCount,
    duplicateCount: progress.duplicateCount,
    failedCount: progress.failedCount,
    pendingVerificationCount: progress.pendingVerificationCount,
    logsJson,
    updatedAt: serverTimestamp(),
  });

  await logAudit({
    actorUid: params.actor.uid,
    actorName: params.actor.displayName,
    actorRole: params.actor.role,
    action: 'GOOGLE_DRIVE_IMPORT_EXECUTED',
    entityType: 'import_jobs',
    entityId: jobId,
    summary: `Google Drive import ${finalStatus}: ${progress.importedCount} imported, ${progress.duplicateCount} duplicates, ${progress.failedCount} failed, ${progress.pendingVerificationCount} pending review.`,
  });

  progress.phase = 'done';
  params.onProgress?.({ ...progress, logs: [...progress.logs] });
  return { jobId, progress };
}
