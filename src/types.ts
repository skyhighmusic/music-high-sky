import type { Timestamp } from 'firebase/firestore';

export type UserRole = 'super_admin' | 'artist' | 'label_manager';

export type NavSection =
  | 'dashboard'
  | 'artist-profile'
  | 'playlists'
  | 'music-library'
  | 'audio-releases'
  | 'video-releases'
  | 'import-manager'
  | 'new-release'
  | 'release-calendar'
  | 'distribution'
  | 'analytics'
  | 'royalties'
  | 'copyright'
  | 'marketing'
  | 'ai-studio'
  | 'ai-assistant'
  | 'tour-maps'
  | 'studio-3d'
  | 'reports'
  | 'notifications'
  | 'users'
  | 'settings';

export type ReleaseType = 'audio' | 'video';

export type ReleaseStatus =
  | 'Draft'
  | 'Submitted'
  | 'Under Review'
  | 'Metadata Correction Required'
  | 'Approved'
  | 'Scheduled'
  | 'Processing'
  | 'Delivered'
  | 'Live'
  | 'Rejected'
  | 'Takedown Requested'
  | 'Taken Down'
  | 'Archived';

export type DistributionStatus =
  | 'Planned'
  | 'Submitted to Partner'
  | 'Processing'
  | 'Delivered'
  | 'Live'
  | 'Rejected'
  | 'Takedown Requested'
  | 'Taken Down';

export type NotificationCategory =
  | 'New Song Submission'
  | 'Submission Received'
  | 'Metadata Correction Required'
  | 'Release Approved'
  | 'Release Scheduled'
  | 'Distribution Completed'
  | 'Song Live on Platform'
  | 'Royalty Report Available'
  | 'Payment Status Updated';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  role: UserRole;
  status: 'active' | 'suspended';
  emailNotifications?: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface ArtistProfile {
  id: string;
  name: string;
  professions: string[];
  genres: string[];
  languages: string[];
  label: string;
  primaryMarket?: string;
  distributionScope?: string;
  biography: string;
  profilePhotoUrl?: string;
  spotifyUrl?: string;
  youtubeUrl?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  updatedBy?: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface ReleaseRecord {
  id: string;
  releaseCode: string;
  releaseType: ReleaseType;
  title: string;
  subtitle?: string;
  primaryArtist: string;
  featuredArtist?: string;
  singer?: string;
  lyricist?: string;
  composer?: string;
  musicProducer?: string;
  musicDirector?: string;
  mixingEngineer?: string;
  masteringEngineer?: string;
  genre: string;
  subgenre?: string;
  language: string;
  mood?: string;
  explicitContent?: boolean;
  originalReleaseDate?: string;
  plannedReleaseDate?: string;
  releaseTime?: string;
  copyrightYear?: string;
  copyrightOwner?: string;
  phonographicCopyright?: string;
  publishingCopyright?: string;
  distributorLabel: string;
  artistCredit: string;
  labelCredit: string;
  creditNotes?: string;
  targetPlatforms?: string[];
  status: ReleaseStatus;
  reviewNotes?: string;
  artworkPreview?: string;
  smartLinkSlug?: string;
  featured?: boolean;
  driveFileId?: string;
  sourceOrigin?: string;
  submittedBy: string;
  submittedByName?: string;
  submissionDate: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface AudioTrackRecord {
  id: string;
  releaseId: string;
  fileName: string;
  format: 'WAV' | 'FLAC' | 'MP3';
  fileSizeBytes: number;
  durationSeconds?: number;
  sampleRate?: number;
  channels?: number;
  waveformPeaks?: number[];
  masterSourceUrl?: string;
  storagePath?: string;
  driveFileId?: string;
  validated: boolean;
  ownerId: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface VideoReleaseRecord {
  id: string;
  releaseId: string;
  director?: string;
  producer?: string;
  productionCompany?: string;
  description?: string;
  fileName?: string;
  format: 'MP4' | 'MOV' | 'MKV' | 'WEBM' | 'EXTERNAL';
  fileSizeBytes?: number;
  durationSeconds?: number;
  resolution?: string;
  youtubeUrl?: string;
  videoCopyrightInfo?: string;
  masterSourceUrl?: string;
  storagePath?: string;
  driveFileId?: string;
  thumbnailPreview?: string;
  validated: boolean;
  ownerId: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface ArtworkRecord {
  id: string;
  releaseId: string;
  kind: 'cover_art' | 'video_thumbnail' | 'promo_banner';
  fileName: string;
  format: 'JPG' | 'JPEG' | 'PNG';
  width: number;
  height: number;
  aspectRatioValid: boolean;
  previewDataUrl?: string;
  locked?: boolean;
  ownerId: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface DistributionRecord {
  id: string;
  releaseId: string;
  releaseTitle: string;
  releaseType: ReleaseType;
  platformId?: string;
  platformName: string;
  distributorLabel: string;
  partnerName?: string;
  externalReferenceId?: string;
  status: DistributionStatus;
  deliveryConfirmedDate?: string;
  liveUrl?: string;
  evidenceNotes?: string;
  ownerId: string;
  updatedBy?: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface PlatformDirectoryItem {
  id: string;
  name: string;
  category: 'audio' | 'video' | 'both';
  regionScope?: string;
  serviceAvailabilityNote?: string;
  enabled: boolean;
}

export interface RoyaltyRecord {
  id: string;
  period: string;
  releaseId?: string;
  releaseTitle: string;
  platformName: string;
  territory?: string;
  currency: 'INR' | 'USD';
  streams: number;
  estimatedRoyalty: number;
  confirmedRoyalty: number;
  paymentStatus: 'Estimated' | 'Confirmed' | 'Pending Payment' | 'Paid';
  paymentReference?: string;
  paidDate?: string;
  sourceType: 'CSV Import' | 'Manual Verified Entry';
  sourceReportName?: string;
  verifiedBy: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface AnalyticsRecord {
  id: string;
  period: string;
  releaseId?: string;
  releaseTitle: string;
  platformName: string;
  territory: string;
  streams: number;
  sourceReportName?: string;
  verifiedBy: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface CopyrightRecord {
  id: string;
  releaseId?: string;
  releaseTitle: string;
  songOwnership?: string;
  masterRecordingRights?: string;
  publishingRights?: string;
  lyricsOwnership?: string;
  compositionOwnership?: string;
  registrationNumber?: string;
  isrc?: string;
  upcEan?: string;
  contentIdStatus: 'Not Enrolled' | 'Pending' | 'Active' | 'Disputed';
  contentIdAssetId?: string;
  licensingNotes?: string;
  distributionAgreementRef?: string;
  takedownStatus: 'None' | 'Requested' | 'In Progress' | 'Completed';
  takedownNotes?: string;
  verifiedByAdmin: boolean;
  verifiedByUid?: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface NotificationRecord {
  id: string;
  recipientUid?: string;
  recipientRole: 'all' | UserRole;
  category: NotificationCategory;
  title: string;
  message: string;
  releaseId?: string;
  read: boolean;
  emailDispatchEnabled: boolean;
  actorUid: string;
  createdAt?: Timestamp | null;
}

export interface AuditLogRecord {
  id: string;
  actorUid: string;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId?: string;
  summary: string;
  createdAt?: Timestamp | null;
}

export interface PlatformSettings {
  id: string;
  labelName: string;
  defaultArtistCredit: string;
  defaultLabelCredit: string;
  defaultCopyrightNotice?: string;
  supportEmail?: string;
  emailNotificationsEnabled?: boolean;
  reminderDaysBeforeRelease?: number;
  defaultCurrency: 'INR' | 'USD';
  payoutGatewayLabel?: string;
  partnerApiMode?: 'Manual Partner Workflow' | 'Partner Webhook Ready';
  brandLogoUrl?: string;
  updatedBy?: string;
  updatedAt?: Timestamp | null;
}

export interface PlaylistRecord {
  id: string;
  slug: string;
  name: string;
  description: string;
  artistId: string;
  artistName: string;
  label: string;
  category:
    | 'all_songs'
    | 'latest'
    | 'hindi'
    | 'haryanvi'
    | 'romantic'
    | 'emotional'
    | 'motivational'
    | 'rap_cinematic'
    | 'videos'
    | 'custom';
  mediaKind: 'audio' | 'video' | 'mixed';
  coverArtworkUrl?: string;
  featured?: boolean;
  displayOrder: number;
  autoRule?: string;
  createdBy: string;
  updatedBy?: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface PlaylistTrackRecord {
  id: string;
  playlistId: string;
  releaseId: string;
  position: number;
  addedBy: string;
  createdAt?: Timestamp | null;
}

export type MediaAssetType =
  | 'branding_logo'
  | 'artist_photo'
  | 'audio_song'
  | 'video_song'
  | 'album_artwork'
  | 'playlist_cover';

export interface MediaAssetRecord {
  id: string;
  assetType: MediaAssetType;
  fileName: string;
  originalFileName: string;
  mimeType: string;
  fileExtension: string;
  fileSizeBytes: number;
  storagePath: string;
  downloadUrl: string;
  sourceType: 'google_drive' | 'direct_upload' | 'attached_catalog';
  sourceUrl?: string;
  driveFileId?: string;
  linkedReleaseId?: string;
  linkedArtistId?: string;
  linkedPlaylistId?: string;
  metadataStatus: 'verified' | 'pending_verification';
  uploadedBy: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface ImportFileLogEntry {
  fileId: string;
  fileName: string;
  sourceLabel: string;
  mimeType: string;
  category:
    | 'branding_logo'
    | 'artist_photo'
    | 'audio_song'
    | 'video_song'
    | 'album_artwork'
    | 'unsupported';
  status: 'imported' | 'duplicate' | 'failed' | 'pending_verification' | 'skipped';
  storagePath?: string;
  downloadUrl?: string;
  releaseId?: string;
  errorDetails?: string;
}

export interface ImportJobRecord {
  id: string;
  sourceType: 'google_drive' | 'attached_catalog';
  status: 'running' | 'completed' | 'completed_with_errors' | 'failed';
  totalDiscovered: number;
  audioCount: number;
  videoCount: number;
  artworkCount: number;
  artistImageCount: number;
  brandingCount: number;
  importedCount: number;
  duplicateCount: number;
  failedCount: number;
  pendingVerificationCount: number;
  logsJson: string;
  triggeredBy: string;
  triggeredByName: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface MarketingKit {
  youtubeTitles: string[];
  youtubeDescription: string;
  seoTags: string[];
  trendingHashtags: string[];
  instagramCaptions: string[];
  facebookPost: string;
  releaseAnnouncement: string;
  spotifyCopy: string;
}
