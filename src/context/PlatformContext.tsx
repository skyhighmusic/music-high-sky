import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  clearDriveAccessToken,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  testConnection,
} from '../firebase';
import {
  ARTIST_PORTRAIT_URL,
  BRAND_LOGO_URL,
  DEFAULT_PLATFORMS,
  DEFAULT_PLATFORM_SETTINGS,
  DEFAULT_SUNIL_KUMAR_PROFILE,
} from '../constants';
import {
  ensureUserAndBootstrap,
  syncAttachedCatalogToFirestore,
  syncOfficialPlaylistsToFirestore,
} from '../services/firestoreService';
import { resolveMediaUrl } from '../services/storageService';
import type {
  AnalyticsRecord,
  ArtistProfile,
  ArtworkRecord,
  AudioTrackRecord,
  AuditLogRecord,
  CopyrightRecord,
  DistributionRecord,
  ImportJobRecord,
  MediaAssetRecord,
  NotificationRecord,
  PlatformDirectoryItem,
  PlatformSettings,
  PlaylistRecord,
  PlaylistTrackRecord,
  ReleaseRecord,
  RoyaltyRecord,
  UserProfile,
  VideoReleaseRecord,
} from '../types';

export interface ToastMessage {
  id: string;
  tone: 'success' | 'error' | 'info';
  text: string;
}

interface PlatformContextValue {
  authLoading: boolean;
  dataLoading: boolean;
  currentUser: UserProfile | null;
  signInGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  artist: ArtistProfile;
  brandLogoUrl: string;
  artistPhotoUrl: string;
  releases: ReleaseRecord[];
  audioTracks: AudioTrackRecord[];
  videoReleases: VideoReleaseRecord[];
  artworks: ArtworkRecord[];
  playlists: PlaylistRecord[];
  playlistTracks: PlaylistTrackRecord[];
  mediaAssets: MediaAssetRecord[];
  importJobs: ImportJobRecord[];
  distributionRecords: DistributionRecord[];
  platforms: PlatformDirectoryItem[];
  royalties: RoyaltyRecord[];
  analytics: AnalyticsRecord[];
  copyrightRecords: CopyrightRecord[];
  notifications: NotificationRecord[];
  auditLogs: AuditLogRecord[];
  users: UserProfile[];
  settings: PlatformSettings;
  catalogSyncing: boolean;
  resyncAttachedCatalog: () => Promise<void>;
  resyncOfficialPlaylists: () => Promise<void>;
  toasts: ToastMessage[];
  pushToast: (text: string, tone?: 'success' | 'error' | 'info') => void;
  dismissToast: (id: string) => void;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

function sortByTimestampDesc<T extends { createdAt?: { toMillis?: () => number } | null }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    const am = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const bm = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return bm - am;
  });
}

export const PlatformProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [artist, setArtist] = useState<ArtistProfile>({
    ...DEFAULT_SUNIL_KUMAR_PROFILE,
    createdAt: null,
    updatedAt: null,
  });
  const [releases, setReleases] = useState<ReleaseRecord[]>([]);
  const [audioTracks, setAudioTracks] = useState<AudioTrackRecord[]>([]);
  const [videoReleases, setVideoReleases] = useState<VideoReleaseRecord[]>([]);
  const [artworks, setArtworks] = useState<ArtworkRecord[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistRecord[]>([]);
  const [playlistTracks, setPlaylistTracks] = useState<PlaylistTrackRecord[]>([]);
  const [mediaAssets, setMediaAssets] = useState<MediaAssetRecord[]>([]);
  const [importJobs, setImportJobs] = useState<ImportJobRecord[]>([]);
  const [distributionRecords, setDistributionRecords] = useState<DistributionRecord[]>([]);
  const [platforms, setPlatforms] = useState<PlatformDirectoryItem[]>(DEFAULT_PLATFORMS);
  const [royalties, setRoyalties] = useState<RoyaltyRecord[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsRecord[]>([]);
  const [copyrightRecords, setCopyrightRecords] = useState<CopyrightRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [settings, setSettings] = useState<PlatformSettings>({
    ...DEFAULT_PLATFORM_SETTINGS,
    updatedAt: null,
  });
  const [catalogSyncing, setCatalogSyncing] = useState(false);
  const syncedUidRef = useRef<string | null>(null);
  const playlistSyncKeyRef = useRef<string>('');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = (text: string, tone: 'success' | 'error' | 'info' = 'success') => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, tone, text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Resolve official brand logo & artist portrait dynamically from Firebase Storage / Firestore assets with original fallback
  const brandLogoUrl = useMemo(() => {
    const fromSettings = resolveMediaUrl(settings.brandLogoUrl);
    if (fromSettings) return fromSettings;
    const brandAsset = mediaAssets.find((a) => a.assetType === 'branding_logo');
    if (brandAsset?.downloadUrl) return resolveMediaUrl(brandAsset.downloadUrl);
    return BRAND_LOGO_URL;
  }, [settings.brandLogoUrl, mediaAssets]);

  const artistPhotoUrl = useMemo(() => {
    const fromArtist = resolveMediaUrl(artist.profilePhotoUrl);
    if (fromArtist) return fromArtist;
    const artistAsset = mediaAssets.find((a) => a.assetType === 'artist_photo');
    if (artistAsset?.downloadUrl) return resolveMediaUrl(artistAsset.downloadUrl);
    return ARTIST_PORTRAIT_URL;
  }, [artist.profilePhotoUrl, mediaAssets]);

  // Keep browser favicon synchronized with the official Music High Sky logo
  useEffect(() => {
    if (!brandLogoUrl || typeof document === 'undefined') return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    if (link.href !== brandLogoUrl) {
      link.href = brandLogoUrl;
    }
  }, [brandLogoUrl]);

  useEffect(() => {
    testConnection();
  }, []);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setCurrentUser(null);
        setAuthLoading(false);
        return;
      }
      setAuthLoading(true);
      try {
        const profile = await ensureUserAndBootstrap({
          uid: fbUser.uid,
          displayName: fbUser.displayName,
          email: fbUser.email,
          photoURL: fbUser.photoURL,
          emailVerified: fbUser.emailVerified,
        });
        setCurrentUser(profile);
      } catch (err) {
        console.error('Auth profile hydration failed:', err);
        pushToast('Unable to load user profile from Firestore.', 'error');
        setCurrentUser(null);
      } finally {
        setAuthLoading(false);
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setReleases([]);
      setAudioTracks([]);
      setVideoReleases([]);
      setArtworks([]);
      setPlaylists([]);
      setPlaylistTracks([]);
      setMediaAssets([]);
      setImportJobs([]);
      setDistributionRecords([]);
      setRoyalties([]);
      setAnalytics([]);
      setCopyrightRecords([]);
      setNotifications([]);
      setAuditLogs([]);
      setUsers([]);
      return;
    }

    setDataLoading(true);
    const unsubs: Unsubscribe[] = [];

    // Watch current user profile for live role updates
    unsubs.push(
      onSnapshot(
        doc(db, 'users', currentUser.uid),
        (snap) => {
          if (snap.exists()) {
            setCurrentUser(snap.data() as UserProfile);
          }
        },
        (err) => handleFirestoreError(err, OperationType.GET, `users/${currentUser.uid}`)
      )
    );

    // Watch official Sunil Kumar artist profile
    unsubs.push(
      onSnapshot(
        doc(db, 'artists', 'sunil-kumar'),
        (snap) => {
          if (snap.exists()) {
            setArtist(snap.data() as ArtistProfile);
          }
        },
        (err) => handleFirestoreError(err, OperationType.GET, 'artists/sunil-kumar')
      )
    );

    // Watch platform settings
    unsubs.push(
      onSnapshot(
        doc(db, 'settings', 'platform'),
        (snap) => {
          if (snap.exists()) {
            setSettings(snap.data() as PlatformSettings);
          }
        },
        (err) => handleFirestoreError(err, OperationType.GET, 'settings/platform')
      )
    );

    // Watch releases (rule-aligned query)
    unsubs.push(
      onSnapshot(
        query(collection(db, 'releases'), where('distributorLabel', '==', 'Music High Sky')),
        (snap) => {
          const rows = snap.docs.map((d) => {
            const data = d.data() as Omit<ReleaseRecord, 'id'>;
            return {
              id: d.id,
              ...data,
              artworkPreview: resolveMediaUrl(data.artworkPreview),
            };
          });
          setReleases(sortByTimestampDesc(rows));
          setDataLoading(false);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'releases')
      )
    );

    // Watch audio_tracks
    unsubs.push(
      onSnapshot(
        query(collection(db, 'audio_tracks'), where('validated', '==', true)),
        (snap) => {
          const rows = snap.docs.map((d) => {
            const data = d.data() as Omit<AudioTrackRecord, 'id'>;
            return {
              id: d.id,
              ...data,
              masterSourceUrl: resolveMediaUrl(data.masterSourceUrl),
            };
          });
          setAudioTracks(sortByTimestampDesc(rows));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'audio_tracks')
      )
    );

    // Watch video_releases
    unsubs.push(
      onSnapshot(
        query(collection(db, 'video_releases'), where('validated', '==', true)),
        (snap) => {
          const rows = snap.docs.map((d) => {
            const data = d.data() as Omit<VideoReleaseRecord, 'id'>;
            return {
              id: d.id,
              ...data,
              masterSourceUrl: resolveMediaUrl(data.masterSourceUrl),
              thumbnailPreview: resolveMediaUrl(data.thumbnailPreview),
            };
          });
          setVideoReleases(sortByTimestampDesc(rows));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'video_releases')
      )
    );

    // Watch artwork
    unsubs.push(
      onSnapshot(
        query(
          collection(db, 'artwork'),
          where('kind', 'in', ['cover_art', 'video_thumbnail', 'promo_banner'])
        ),
        (snap) => {
          const rows = snap.docs.map((d) => {
            const data = d.data() as Omit<ArtworkRecord, 'id'>;
            return {
              id: d.id,
              ...data,
              previewDataUrl: resolveMediaUrl(data.previewDataUrl),
            };
          });
          setArtworks(sortByTimestampDesc(rows));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'artwork')
      )
    );

    // Watch official playlists
    unsubs.push(
      onSnapshot(
        query(collection(db, 'playlists'), where('label', '==', 'Music High Sky')),
        (snap) => {
          const rows = snap.docs
            .map((d) => {
              const data = d.data() as Omit<PlaylistRecord, 'id'>;
              return {
                id: d.id,
                ...data,
                coverArtworkUrl: resolveMediaUrl(data.coverArtworkUrl),
              };
            })
            .sort((a, b) => (a.displayOrder ?? 99) - (b.displayOrder ?? 99));
          setPlaylists(rows);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'playlists')
      )
    );

    // Watch playlist_tracks
    unsubs.push(
      onSnapshot(
        query(collection(db, 'playlist_tracks'), where('position', '>=', 0)),
        (snap) => {
          const rows = snap.docs
            .map((d) => ({
              id: d.id,
              ...(d.data() as Omit<PlaylistTrackRecord, 'id'>),
            }))
            .sort((a, b) => a.position - b.position);
          setPlaylistTracks(rows);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'playlist_tracks')
      )
    );

    // Watch media_assets (Firebase Storage registry)
    unsubs.push(
      onSnapshot(
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
        ),
        (snap) => {
          const rows = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<MediaAssetRecord, 'id'>),
          }));
          setMediaAssets(sortByTimestampDesc(rows));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'media_assets')
      )
    );

    // Watch import_jobs (staff sees all, others see own)
    const importJobsQuery =
      currentUser.role === 'super_admin' || currentUser.role === 'label_manager'
        ? collection(db, 'import_jobs')
        : query(collection(db, 'import_jobs'), where('triggeredBy', '==', currentUser.uid));

    unsubs.push(
      onSnapshot(
        importJobsQuery,
        (snap) => {
          const rows = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ImportJobRecord, 'id'>),
          }));
          setImportJobs(sortByTimestampDesc(rows));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'import_jobs')
      )
    );

    // Watch distribution_records
    unsubs.push(
      onSnapshot(
        query(
          collection(db, 'distribution_records'),
          where('distributorLabel', '==', 'Music High Sky')
        ),
        (snap) => {
          const rows = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<DistributionRecord, 'id'>),
          }));
          setDistributionRecords(sortByTimestampDesc(rows));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'distribution_records')
      )
    );

    // Watch platforms
    unsubs.push(
      onSnapshot(
        query(collection(db, 'platforms'), where('category', 'in', ['audio', 'video', 'both'])),
        (snap) => {
          if (!snap.empty) {
            const rows = snap.docs.map((d) => d.data() as PlatformDirectoryItem);
            setPlatforms(rows);
          }
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'platforms')
      )
    );

    // Watch royalties
    unsubs.push(
      onSnapshot(
        query(collection(db, 'royalties'), where('currency', 'in', ['INR', 'USD'])),
        (snap) => {
          const rows = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<RoyaltyRecord, 'id'>),
          }));
          setRoyalties(sortByTimestampDesc(rows));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'royalties')
      )
    );

    // Watch analytics
    unsubs.push(
      onSnapshot(
        query(collection(db, 'analytics'), where('streams', '>=', 0)),
        (snap) => {
          const rows = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<AnalyticsRecord, 'id'>),
          }));
          setAnalytics(sortByTimestampDesc(rows));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'analytics')
      )
    );

    // Watch copyright_records
    unsubs.push(
      onSnapshot(
        query(
          collection(db, 'copyright_records'),
          where('contentIdStatus', 'in', ['Not Enrolled', 'Pending', 'Active', 'Disputed'])
        ),
        (snap) => {
          const rows = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<CopyrightRecord, 'id'>),
          }));
          setCopyrightRecords(sortByTimestampDesc(rows));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'copyright_records')
      )
    );

    // Watch notifications
    unsubs.push(
      onSnapshot(
        query(
          collection(db, 'notifications'),
          where('recipientRole', 'in', ['all', 'super_admin', 'artist', 'label_manager'])
        ),
        (snap) => {
          const rows = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<NotificationRecord, 'id'>) }))
            .filter(
              (n) =>
                currentUser.role === 'super_admin' ||
                n.recipientRole === 'all' ||
                n.recipientRole === currentUser.role ||
                n.recipientUid === currentUser.uid
            );
          setNotifications(sortByTimestampDesc(rows));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
      )
    );

    // Watch audit_logs (staff sees all, artist sees own)
    const auditQuery =
      currentUser.role === 'super_admin' || currentUser.role === 'label_manager'
        ? collection(db, 'audit_logs')
        : query(collection(db, 'audit_logs'), where('actorUid', '==', currentUser.uid));

    unsubs.push(
      onSnapshot(
        auditQuery,
        (snap) => {
          const rows = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<AuditLogRecord, 'id'>),
          }));
          setAuditLogs(sortByTimestampDesc(rows));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'audit_logs')
      )
    );

    // Super Admin watches all users for RBAC management
    if (currentUser.role === 'super_admin') {
      unsubs.push(
        onSnapshot(
          collection(db, 'users'),
          (snap) => {
            const rows = snap.docs.map((d) => d.data() as UserProfile);
            setUsers(rows);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'users')
        )
      );
    } else {
      setUsers([currentUser]);
    }

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [currentUser?.uid, currentUser?.role]);

  const runCatalogSync = async (actor: UserProfile, silentIfUnchanged: boolean) => {
    setCatalogSyncing(true);
    try {
      const res = await syncAttachedCatalogToFirestore(actor);
      if (res.addedReleases > 0 || res.addedTracks > 0 || res.removedSampleReleases > 0) {
        pushToast(
          `Synced ${res.addedReleases} attached Sunil Kumar release${res.addedReleases === 1 ? '' : 's'} into Music High Sky catalog.`,
          'success'
        );
      } else if (!silentIfUnchanged) {
        pushToast(
          `All ${res.totalCatalogFiles} attached Sunil Kumar releases are already synchronized.`,
          'info'
        );
      }
    } catch (err) {
      console.error('Attached catalog sync failed:', err);
      if (!silentIfUnchanged) {
        pushToast(
          err instanceof Error ? err.message : 'Unable to synchronize attached audio files.',
          'error'
        );
      }
    } finally {
      setCatalogSyncing(false);
    }
  };

  useEffect(() => {
    if (!currentUser || currentUser.status === 'suspended') {
      syncedUidRef.current = null;
      return;
    }
    if (syncedUidRef.current === currentUser.uid) return;
    syncedUidRef.current = currentUser.uid;
    void runCatalogSync(currentUser, true);
  }, [currentUser?.uid, currentUser?.status]);

  // Auto-ensure all 9 official Sunil Kumar playlists are synced when releases load or expand
  useEffect(() => {
    if (
      !currentUser ||
      currentUser.status === 'suspended' ||
      (currentUser.role !== 'super_admin' && currentUser.role !== 'label_manager') ||
      dataLoading
    ) {
      return;
    }
    const syncKey = `${currentUser.uid}:${releases.length}`;
    if (playlistSyncKeyRef.current === syncKey) return;
    playlistSyncKeyRef.current = syncKey;
    void syncOfficialPlaylistsToFirestore(currentUser, releases).catch((err) => {
      console.error('Official playlists sync skipped:', err);
    });
  }, [currentUser, releases, dataLoading]);

  const resyncAttachedCatalog = async () => {
    if (!currentUser) return;
    await runCatalogSync(currentUser, false);
  };

  const resyncOfficialPlaylists = async () => {
    if (!currentUser) return;
    try {
      const res = await syncOfficialPlaylistsToFirestore(currentUser, releases);
      pushToast(
        res.createdPlaylists > 0 || res.addedTrackLinks > 0
          ? `Official playlists synced (${res.createdPlaylists} playlists created, ${res.addedTrackLinks} track links added).`
          : 'All 9 official Sunil Kumar playlists are already up to date.',
        'success'
      );
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : 'Unable to synchronize official playlists.',
        'error'
      );
    }
  };

  const signInGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      pushToast('Signed in to Music High Sky.', 'success');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Google sign-in failed.';
      if (!msg.includes('popup-closed-by-user')) {
        pushToast(msg, 'error');
      }
    }
  };

  const logout = async () => {
    clearDriveAccessToken();
    await signOut(auth);
    pushToast('You have been signed out.', 'info');
  };

  return (
    <PlatformContext.Provider
      value={{
        authLoading,
        dataLoading,
        currentUser,
        signInGoogle,
        logout,
        artist,
        brandLogoUrl,
        artistPhotoUrl,
        releases,
        audioTracks,
        videoReleases,
        artworks,
        playlists,
        playlistTracks,
        mediaAssets,
        importJobs,
        distributionRecords,
        platforms,
        royalties,
        analytics,
        copyrightRecords,
        notifications,
        auditLogs,
        users,
        settings,
        catalogSyncing,
        resyncAttachedCatalog,
        resyncOfficialPlaylists,
        toasts,
        pushToast,
        dismissToast,
      }}
    >
      {children}
    </PlatformContext.Provider>
  );
};

export function usePlatform() {
  const ctx = useContext(PlatformContext);
  if (!ctx) throw new Error('usePlatform must be used within PlatformProvider');
  return ctx;
}
