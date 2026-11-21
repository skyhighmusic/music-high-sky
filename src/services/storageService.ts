import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { app, auth, db, firebaseConfig } from '../firebase';
import type {
  ArtworkRecord,
  AudioTrackRecord,
  ReleaseRecord,
  VideoReleaseRecord,
} from '../types';

const STORAGE_BASE_URL_KEY = 'mhs_cloud_media_base_url';

export const CLOUD_STORAGE_BUCKET = firebaseConfig.storageBucket || '';

/**
 * Returns the configured external CDN / Cloud Storage base URL (if any),
 * checking runtime admin override first, then VITE_CLOUD_MEDIA_BASE_URL.
 */
export function getCloudMediaBaseUrl(): string {
  try {
    const stored =
      typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_BASE_URL_KEY) : null;
    if (stored && stored.trim()) {
      return stored.trim().replace(/\/+$/, '');
    }
  } catch {
    // localStorage may be unavailable in restricted contexts
  }
  const envBase = (import.meta.env.VITE_CLOUD_MEDIA_BASE_URL as string | undefined) || '';
  return envBase.trim().replace(/\/+$/, '');
}

export function setCloudMediaBaseUrl(url: string): void {
  try {
    if (typeof window === 'undefined') return;
    const cleaned = url.trim().replace(/\/+$/, '');
    if (cleaned) {
      window.localStorage.setItem(STORAGE_BASE_URL_KEY, cleaned);
    } else {
      window.localStorage.removeItem(STORAGE_BASE_URL_KEY);
    }
  } catch {
    // ignore storage quota / privacy errors
  }
}

export function isCloudHostedUrl(url?: string | null): boolean {
  if (!url) return false;
  return /^https?:\/\//i.test(url.trim());
}

/**
 * Resolves a media URL against the configured external Cloud Storage / CDN base URL
 * when the stored URL is a root-relative local asset path (e.g. "/assets/aistudio/...").
 * Full HTTPS URLs (such as Firebase Storage download URLs), data URLs, and blob URLs
 * are returned unchanged.
 */
export function resolveMediaUrl(url?: string | null): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (
    !trimmed ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }
  const baseUrl = getCloudMediaBaseUrl();
  if (baseUrl && trimmed.startsWith('/')) {
    return `${baseUrl}${trimmed}`;
  }
  return trimmed;
}

export type CloudMediaCategory = 'artwork' | 'audio' | 'video';

export interface CloudUploadResult {
  downloadUrl: string;
  storagePath: string;
  bytesTransferred: number;
}

function sanitizeStorageSegment(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 96) || 'asset';
}

/**
 * Dynamically loads firebase/storage on demand (keeping @firebase/storage out of
 * the initial entry bundle) and uploads a File or Blob to Firebase Storage.
 */
export async function uploadMediaToCloudStorage(params: {
  file: File | Blob;
  category: CloudMediaCategory;
  releaseCode: string;
  fileName: string;
  contentType?: string;
  onProgress?: (percent: number) => void;
}): Promise<CloudUploadResult> {
  if (!CLOUD_STORAGE_BUCKET) {
    throw new Error('Firebase Storage bucket is not configured in firebase-applet-config.json.');
  }
  if (!auth.currentUser) {
    throw new Error('Sign in to upload media assets to Firebase Storage.');
  }

  const { getStorage, ref, uploadBytesResumable, getDownloadURL } = await import(
    'firebase/storage'
  );
  const storage = getStorage(app);

  const safeRelease = sanitizeStorageSegment(params.releaseCode || 'catalog');
  const safeFile = sanitizeStorageSegment(params.fileName || `${params.category}.bin`);
  const storagePath = `music-high-sky/${params.category}/${safeRelease}/${Date.now()}_${safeFile}`;
  const storageRef = ref(storage, storagePath);

  const metadata = {
    contentType:
      params.contentType ||
      (params.file instanceof File && params.file.type ? params.file.type : undefined),
    cacheControl: 'public,max-age=31536000,immutable',
  };

  return await new Promise<CloudUploadResult>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, params.file, metadata);
    task.on(
      'state_changed',
      (snapshot) => {
        if (snapshot.totalBytes > 0 && params.onProgress) {
          const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          params.onProgress(pct);
        }
      },
      (error) => {
        const msg = error?.message || 'Firebase Storage upload failed.';
        if (msg.includes('storage/unauthorized') || msg.includes('403')) {
          reject(
            new Error(
              `Firebase Storage denied access on ${CLOUD_STORAGE_BUCKET}. Deploy storage.rules in Firebase Console to enable cloud uploads.`
            )
          );
          return;
        }
        if (msg.includes('storage/bucket-not-found') || msg.includes('404')) {
          reject(
            new Error(
              `Firebase Storage bucket "${CLOUD_STORAGE_BUCKET}" is not initialized yet in Firebase Console → Storage.`
            )
          );
          return;
        }
        reject(new Error(msg));
      },
      async () => {
        try {
          const downloadUrl = await getDownloadURL(task.snapshot.ref);
          resolve({
            downloadUrl,
            storagePath,
            bytesTransferred: task.snapshot.totalBytes,
          });
        } catch (urlErr) {
          reject(
            urlErr instanceof Error ? urlErr : new Error('Failed to fetch cloud download URL.')
          );
        }
      }
    );
  });
}

export type StructuredStorageBucketArea =
  | 'branding'
  | 'artist_photo'
  | 'audio_song'
  | 'video_song'
  | 'album_artwork'
  | 'playlist_cover';

function preserveOriginalFileName(originalName: string, fallback: string): string {
  const trimmed = (originalName || '').trim();
  if (!trimmed) return fallback;
  // Preserve original filename and extension while stripping path separators and control characters
  const cleaned = trimmed
    .replace(/[\\/#?%*:|"<>]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  return cleaned || fallback;
}

export function buildStructuredStoragePath(
  area: StructuredStorageBucketArea,
  originalFileName: string,
  artistSlug = 'sunil-kumar'
): string {
  const safeArtist = sanitizeStorageSegment(artistSlug || 'sunil-kumar');
  const preservedName = preserveOriginalFileName(originalFileName, 'media-file');
  switch (area) {
    case 'branding': {
      const ext = preservedName.includes('.') ? preservedName.split('.').pop() : 'png';
      return `music-high-sky/branding/music-high-sky-logo.${ext || 'png'}`;
    }
    case 'artist_photo': {
      const ext = preservedName.includes('.') ? preservedName.split('.').pop() : 'jpg';
      return `music-high-sky/artists/${safeArtist}/profile-photo.${ext || 'jpg'}`;
    }
    case 'audio_song':
      return `music-high-sky/audio/${safeArtist}/song-files/${preservedName}`;
    case 'video_song':
      return `music-high-sky/videos/${safeArtist}/video-files/${preservedName}`;
    case 'album_artwork':
      return `music-high-sky/artwork/${safeArtist}/album-covers/${preservedName}`;
    case 'playlist_cover':
      return `music-high-sky/playlists/${safeArtist}/playlist-covers/${preservedName}`;
  }
}

/**
 * Uploads media to Firebase Storage using the official Music High Sky structured hierarchy
 * while preserving original filenames & file extensions, returning the permanent getDownloadURL().
 */
export async function uploadStructuredMediaToStorage(params: {
  file: File | Blob;
  area: StructuredStorageBucketArea;
  originalFileName: string;
  artistSlug?: string;
  contentType?: string;
  onProgress?: (percent: number) => void;
}): Promise<CloudUploadResult> {
  if (!CLOUD_STORAGE_BUCKET) {
    throw new Error('Firebase Storage bucket is not configured in firebase-applet-config.json.');
  }
  if (!auth.currentUser) {
    throw new Error('Sign in to upload media assets to Firebase Storage.');
  }

  const { getStorage, ref, uploadBytesResumable, getDownloadURL } = await import(
    'firebase/storage'
  );
  const storage = getStorage(app);

  const storagePath = buildStructuredStoragePath(
    params.area,
    params.originalFileName,
    params.artistSlug || 'sunil-kumar'
  );
  const storageRef = ref(storage, storagePath);

  const metadata = {
    contentType:
      params.contentType ||
      (params.file instanceof File && params.file.type ? params.file.type : undefined),
    cacheControl: 'public,max-age=31536000',
    customMetadata: {
      originalFileName: params.originalFileName.slice(0, 200),
      label: 'Music High Sky',
      artist: 'Sunil Kumar',
    },
  };

  return await new Promise<CloudUploadResult>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, params.file, metadata);
    task.on(
      'state_changed',
      (snapshot) => {
        if (snapshot.totalBytes > 0 && params.onProgress) {
          const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          params.onProgress(pct);
        }
      },
      (error) => {
        const msg = error?.message || 'Firebase Storage upload failed.';
        if (msg.includes('storage/unauthorized') || msg.includes('403')) {
          reject(
            new Error(
              `Firebase Storage denied access on ${CLOUD_STORAGE_BUCKET}. Deploy storage.rules in Firebase Console to enable cloud uploads.`
            )
          );
          return;
        }
        if (msg.includes('storage/bucket-not-found') || msg.includes('404')) {
          reject(
            new Error(
              `Firebase Storage bucket "${CLOUD_STORAGE_BUCKET}" is not initialized yet in Firebase Console -> Storage.`
            )
          );
          return;
        }
        reject(new Error(msg));
      },
      async () => {
        try {
          const downloadUrl = await getDownloadURL(task.snapshot.ref);
          resolve({
            downloadUrl,
            storagePath,
            bytesTransferred: task.snapshot.totalBytes,
          });
        } catch (urlErr) {
          reject(
            urlErr instanceof Error ? urlErr : new Error('Failed to fetch Firebase Storage download URL.')
          );
        }
      }
    );
  });
}

export interface AssetOffloadProgress {
  completed: number;
  total: number;
  currentLabel: string;
  uploadedCount: number;
  skippedCount: number;
  failedCount: number;
  lastError?: string;
}

/**
 * Migrates local-bundled (/assets/...) or inline base64 (data:...) album artwork,
 * audio tracks, and video releases to Firebase Storage and updates Firestore records
 * with their permanent HTTPS download URLs.
 */
export async function offloadCatalogAssetsToFirebaseStorage(params: {
  releases: ReleaseRecord[];
  artworks: ArtworkRecord[];
  audioTracks: AudioTrackRecord[];
  videoReleases: VideoReleaseRecord[];
  includeAudioAndVideo: boolean;
  onProgress?: (status: AssetOffloadProgress) => void;
}): Promise<AssetOffloadProgress> {
  const artworkByRelease = new Map<string, ArtworkRecord>();
  for (const art of params.artworks) {
    artworkByRelease.set(art.releaseId, art);
  }
  const releaseById = new Map<string, ReleaseRecord>();
  for (const rel of params.releases) {
    releaseById.set(rel.id, rel);
  }

  type Job = {
    label: string;
    category: CloudMediaCategory;
    releaseCode: string;
    sourceUrl: string;
    fileName: string;
    applyUrl: (downloadUrl: string) => Promise<void>;
  };

  const jobs: Job[] = [];

  // 1. Offload album artwork (covers & thumbnails)
  for (const rel of params.releases) {
    const art = artworkByRelease.get(rel.id);
    const sourceUrl = art?.previewDataUrl || rel.artworkPreview || '';
    if (!sourceUrl || isCloudHostedUrl(sourceUrl)) continue;
    const ext = sourceUrl.startsWith('data:image/png') || sourceUrl.endsWith('.png') ? 'png' : 'jpg';
    jobs.push({
      label: `Cover: ${rel.title}`,
      category: 'artwork',
      releaseCode: rel.releaseCode,
      sourceUrl,
      fileName: art?.fileName || `${rel.releaseCode}-cover.${ext}`,
      applyUrl: async (downloadUrl) => {
        await updateDoc(doc(db, 'releases', rel.id), {
          artworkPreview: downloadUrl,
          updatedAt: serverTimestamp(),
        });
        if (art) {
          await updateDoc(doc(db, 'artwork', art.id), {
            previewDataUrl: downloadUrl,
            updatedAt: serverTimestamp(),
          });
        }
      },
    });
  }

  // 2. Optionally offload audio & video master files
  if (params.includeAudioAndVideo) {
    for (const track of params.audioTracks) {
      if (!track.masterSourceUrl || isCloudHostedUrl(track.masterSourceUrl)) continue;
      const rel = releaseById.get(track.releaseId);
      jobs.push({
        label: `Audio: ${rel?.title || track.fileName}`,
        category: 'audio',
        releaseCode: rel?.releaseCode || track.releaseId,
        sourceUrl: track.masterSourceUrl,
        fileName: track.fileName,
        applyUrl: async (downloadUrl) => {
          await updateDoc(doc(db, 'audio_tracks', track.id), {
            masterSourceUrl: downloadUrl,
            updatedAt: serverTimestamp(),
          });
        },
      });
    }

    for (const video of params.videoReleases) {
      if (!video.masterSourceUrl || isCloudHostedUrl(video.masterSourceUrl)) continue;
      const rel = releaseById.get(video.releaseId);
      jobs.push({
        label: `Video: ${rel?.title || video.fileName || video.releaseId}`,
        category: 'video',
        releaseCode: rel?.releaseCode || video.releaseId,
        sourceUrl: video.masterSourceUrl,
        fileName: video.fileName || `${rel?.releaseCode || video.id}.mp4`,
        applyUrl: async (downloadUrl) => {
          await updateDoc(doc(db, 'video_releases', video.id), {
            masterSourceUrl: downloadUrl,
            updatedAt: serverTimestamp(),
          });
        },
      });
    }
  }

  const progress: AssetOffloadProgress = {
    completed: 0,
    total: jobs.length,
    currentLabel: jobs.length === 0 ? 'All catalog assets are already cloud-hosted.' : 'Preparing upload...',
    uploadedCount: 0,
    skippedCount: 0,
    failedCount: 0,
  };
  params.onProgress?.({ ...progress });

  for (const job of jobs) {
    progress.currentLabel = job.label;
    params.onProgress?.({ ...progress });

    try {
      const response = await fetch(job.sourceUrl);
      if (!response.ok) {
        throw new Error(`Could not fetch local asset (${response.status})`);
      }
      const blob = await response.blob();
      const uploaded = await uploadMediaToCloudStorage({
        file: blob,
        category: job.category,
        releaseCode: job.releaseCode,
        fileName: job.fileName,
        contentType: blob.type || undefined,
      });
      await job.applyUrl(uploaded.downloadUrl);
      progress.uploadedCount += 1;
    } catch (err) {
      progress.failedCount += 1;
      progress.lastError = err instanceof Error ? err.message : String(err);
      // Fail fast on bucket / permission errors rather than spamming every file
      if (
        progress.lastError.includes('not initialized') ||
        progress.lastError.includes('denied access')
      ) {
        progress.completed += 1;
        params.onProgress?.({ ...progress });
        break;
      }
    }

    progress.completed += 1;
    params.onProgress?.({ ...progress });
  }

  return progress;
}
