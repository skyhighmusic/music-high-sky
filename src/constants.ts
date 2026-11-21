import type {
  ArtistProfile,
  DistributionStatus,
  PlatformDirectoryItem,
  PlatformSettings,
  ReleaseStatus,
  UserRole,
} from './types';

import { resolveMediaUrl } from './services/storageService';

export const BRAND_LOGO_URL = resolveMediaUrl(
  '/assets/aistudio/file_000000000bac82089111293ade072b49_d7557414.png'
);

export const ARTIST_PORTRAIT_URL = resolveMediaUrl(
  '/assets/aistudio/file_00000000e8048208b7ac0a676246b477_c73908a1.png'
);

export const BOOTSTRAPPED_ADMIN_EMAIL = 'highsky2711@gmail.com';

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Administrator',
  artist: 'Artist — Sunil Kumar',
  label_manager: 'Label Manager',
};

export const RELEASE_STATUSES: ReleaseStatus[] = [
  'Draft',
  'Submitted',
  'Under Review',
  'Metadata Correction Required',
  'Approved',
  'Scheduled',
  'Processing',
  'Delivered',
  'Live',
  'Rejected',
  'Takedown Requested',
  'Taken Down',
  'Archived',
];

export const DISTRIBUTION_STATUSES: DistributionStatus[] = [
  'Planned',
  'Submitted to Partner',
  'Processing',
  'Delivered',
  'Live',
  'Rejected',
  'Takedown Requested',
  'Taken Down',
];

export const MUSIC_GENRES = [
  'Hindi Music',
  'Haryanvi Music',
  'Romantic',
  'Emotional',
  'Motivational',
  'Rap',
  'Cinematic Music',
  'Indie Pop',
  'Punjabi Pop',
  'Sufi / Acoustic',
  'Devotional',
  'Hip-Hop',
];

export const MUSIC_LANGUAGES = [
  'Hindi',
  'Haryanvi',
  'English',
  'Punjabi',
  'Bhojpuri',
  'Rajasthani',
  'Urdu',
  'Marathi',
  'Tamil',
  'Telugu',
  'Instrumental',
];

export const MUSIC_MOODS = [
  'Romantic',
  'Emotional',
  'Motivational',
  'Cinematic',
  'Energetic',
  'Soulful',
  'Melancholic',
  'Uplifting',
  'Aggressive / Rap',
  'Peaceful',
];

export const DEFAULT_SUNIL_KUMAR_PROFILE: Omit<ArtistProfile, 'createdAt' | 'updatedAt'> = {
  id: 'sunil-kumar',
  name: 'Sunil Kumar',
  professions: ['Musician', 'Singer', 'Lyricist', 'Independent Artist'],
  genres: [
    'Hindi Music',
    'Haryanvi Music',
    'Romantic',
    'Emotional',
    'Motivational',
    'Rap',
    'Cinematic Music',
  ],
  languages: ['Hindi', 'Haryanvi', 'English'],
  label: 'Music High Sky',
  primaryMarket: 'India',
  distributionScope: 'Worldwide',
  biography:
    'Sunil Kumar is an independent Indian musician, singer, and lyricist releasing original Hindi, Haryanvi, English, and cinematic music worldwide through the official distributor label Music High Sky. Blending heartfelt romantic and emotional melodies with motivational, rap, and contemporary cinematic production, every release is crafted with complete artistic authenticity and independent ownership.',
  profilePhotoUrl: ARTIST_PORTRAIT_URL,
  spotifyUrl: '',
  youtubeUrl: '',
  instagramUrl: '',
  facebookUrl: '',
};

export const DEFAULT_PLATFORMS: PlatformDirectoryItem[] = [
  {
    id: 'spotify',
    name: 'Spotify',
    category: 'audio',
    regionScope: 'Worldwide',
    serviceAvailabilityNote: 'Delivered via authorized distributor partner feed',
    enabled: true,
  },
  {
    id: 'apple-music',
    name: 'Apple Music',
    category: 'audio',
    regionScope: 'Worldwide',
    serviceAvailabilityNote: 'Delivered via authorized distributor partner feed',
    enabled: true,
  },
  {
    id: 'youtube-music',
    name: 'YouTube Music',
    category: 'both',
    regionScope: 'Worldwide',
    serviceAvailabilityNote: 'Art Track & Official Music Video delivery where supported',
    enabled: true,
  },
  {
    id: 'amazon-music',
    name: 'Amazon Music',
    category: 'audio',
    regionScope: 'Worldwide',
    serviceAvailabilityNote: 'Delivered via authorized distributor partner feed',
    enabled: true,
  },
  {
    id: 'instagram-facebook-music',
    name: 'Instagram / Facebook Music',
    category: 'audio',
    regionScope: 'Worldwide',
    serviceAvailabilityNote: 'Meta Audio Library & Reels catalog delivery',
    enabled: true,
  },
  {
    id: 'jiosaavn',
    name: 'JioSaavn',
    category: 'audio',
    regionScope: 'India & Global Diaspora',
    serviceAvailabilityNote: 'Primary Indian streaming DSP',
    enabled: true,
  },
  {
    id: 'gaana',
    name: 'Gaana',
    category: 'audio',
    regionScope: 'India',
    serviceAvailabilityNote: 'Indian digital music catalog delivery',
    enabled: true,
  },
  {
    id: 'wynk-music',
    name: 'Wynk Music',
    category: 'audio',
    regionScope: 'India',
    serviceAvailabilityNote: 'Subject to current service availability and partner routing',
    enabled: true,
  },
  {
    id: 'deezer',
    name: 'Deezer',
    category: 'audio',
    regionScope: 'Worldwide',
    serviceAvailabilityNote: 'Global streaming delivery',
    enabled: true,
  },
  {
    id: 'tidal',
    name: 'Tidal',
    category: 'audio',
    regionScope: 'Worldwide',
    serviceAvailabilityNote: 'Lossless hi-res audio delivery supported',
    enabled: true,
  },
  {
    id: 'youtube-official',
    name: 'YouTube',
    category: 'video',
    regionScope: 'Worldwide',
    serviceAvailabilityNote: 'Official Music Video channel & CMS delivery',
    enabled: true,
  },
  {
    id: 'facebook-video',
    name: 'Facebook',
    category: 'video',
    regionScope: 'Worldwide',
    serviceAvailabilityNote: 'Official Music Video distribution on Meta Video',
    enabled: true,
  },
  {
    id: 'instagram-video',
    name: 'Instagram',
    category: 'video',
    regionScope: 'Worldwide',
    serviceAvailabilityNote: 'Official Reels & video showcase distribution',
    enabled: true,
  },
];

export const DEFAULT_PLATFORM_SETTINGS: Omit<PlatformSettings, 'updatedAt'> = {
  id: 'platform',
  labelName: 'Music High Sky',
  defaultArtistCredit: 'Sunil Kumar',
  defaultLabelCredit: 'Music High Sky',
  defaultCopyrightNotice:
    'As per verified ownership and applicable Music High Sky distribution agreements.',
  supportEmail: 'highsky2711@gmail.com',
  emailNotificationsEnabled: true,
  reminderDaysBeforeRelease: 7,
  defaultCurrency: 'INR',
  payoutGatewayLabel: 'Authorized Bank / NEFT / UPI / Wire Settlement',
  partnerApiMode: 'Manual Partner Workflow',
};

export const STATUS_COLORS: Record<string, { text: string; dot: string }> = {
  Draft: { text: 'text-[#C8D0DB]', dot: 'bg-[#C8D0DB]' },
  Submitted: { text: 'text-[#00A8FF]', dot: 'bg-[#00A8FF]' },
  'Under Review': { text: 'text-[#00D5FF]', dot: 'bg-[#00D5FF]' },
  'Metadata Correction Required': { text: 'text-[#F5D58A]', dot: 'bg-[#F5D58A]' },
  Approved: { text: 'text-[#D4AF37]', dot: 'bg-[#D4AF37]' },
  Scheduled: { text: 'text-violet-300', dot: 'bg-violet-400' },
  Processing: { text: 'text-[#00A8FF]', dot: 'bg-[#00A8FF]' },
  Delivered: { text: 'text-[#00D5FF]', dot: 'bg-[#00D5FF]' },
  Live: { text: 'text-emerald-400', dot: 'bg-emerald-400' },
  Rejected: { text: 'text-rose-400', dot: 'bg-rose-500' },
  'Takedown Requested': { text: 'text-amber-300', dot: 'bg-amber-400' },
  'Taken Down': { text: 'text-rose-300', dot: 'bg-rose-400' },
  Archived: { text: 'text-slate-400', dot: 'bg-slate-400' },
  Planned: { text: 'text-[#C8D0DB]', dot: 'bg-[#8D9AAA]' },
  'Submitted to Partner': { text: 'text-[#00A8FF]', dot: 'bg-[#00A8FF]' },
  Estimated: { text: 'text-[#C8D0DB]', dot: 'bg-[#8D9AAA]' },
  Confirmed: { text: 'text-[#00D5FF]', dot: 'bg-[#00D5FF]' },
  'Pending Payment': { text: 'text-[#F5D58A]', dot: 'bg-[#D4AF37]' },
  Paid: { text: 'text-emerald-400', dot: 'bg-emerald-400' },
};
