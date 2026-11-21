import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  PlusCircle,
  Eye,
  X,
  Upload,
  CheckCircle2,
  Trash2,
  Disc3,
  Music,
  Film,
  CalendarClock,
  Globe2,
  Clock,
  Activity,
  Wallet,
  Play,
  Pause,
  AlertCircle,
  RefreshCw,
  Star,
  ListPlus,
  UserCheck,
  ListMusic,
  CloudDownload,
} from 'lucide-react';
import { RELEASE_STATUSES, STATUS_COLORS } from '../constants';
import { usePlatform } from '../context/PlatformContext';
import { usePlayer, type PlayerTrackItem } from '../context/PlayerContext';
import {
  addReleaseToPlaylist,
  deleteReleaseByAdmin,
  replacePreApprovalArtwork,
  toggleReleaseFeatured,
  updateReleaseStatusAndReview,
} from '../services/firestoreService';
import type { NavSection, ReleaseRecord, ReleaseStatus } from '../types';
import { formatDuration, validateAndCompressArtwork } from '../utils/mediaValidation';
import { WaveformPlayer } from '../components/WaveformPlayer';
import { AnimatedCounter } from '../components/AnimatedCounter';
import { QuickActionsMenu } from '../components/QuickActionsMenu';
import { DashboardQuickActionsWidget } from '../components/DashboardQuickActionsWidget';

interface DashboardViewProps {
  onNavigate: (section: NavSection) => void;
}

const PAGE_SIZE = 8;

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const {
    currentUser,
    brandLogoUrl,
    releases,
    audioTracks,
    videoReleases,
    artworks,
    playlists,
    playlistTracks,
    distributionRecords,
    analytics,
    royalties,
    settings,
    dataLoading,
    catalogSyncing,
    resyncAttachedCatalog,
    pushToast,
  } = usePlatform();
  const { currentTrack, isPlaying: playerIsPlaying, playTrack, playPlaylist } = usePlayer();

  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'audio' | 'video'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | ReleaseStatus>('all');
  const [sortKey, setSortKey] = useState<'submissionDate' | 'plannedReleaseDate' | 'title' | 'status'>('submissionDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null);
  const [reviewStatus, setReviewStatus] = useState<ReleaseStatus>('Under Review');
  const [reviewNotes, setReviewNotes] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [busyAction, setBusyAction] = useState(false);

  const [showAllTrending, setShowAllTrending] = useState(false);
  const [playlistPickerRelease, setPlaylistPickerRelease] = useState<ReleaseRecord | null>(null);

  const isStaff = currentUser?.role === 'super_admin' || currentUser?.role === 'label_manager';
  const isSuperAdmin = currentUser?.role === 'super_admin';

  const selectedRelease = useMemo(
    () => releases.find((r) => r.id === selectedReleaseId) ?? null,
    [releases, selectedReleaseId]
  );

  const openInspector = (rel: ReleaseRecord) => {
    setSelectedReleaseId(rel.id);
    setReviewStatus(rel.status);
    setReviewNotes(rel.reviewNotes || '');
    setScheduleDate(rel.plannedReleaseDate || '');
  };

  const curSymbol = (settings.defaultCurrency || 'INR') === 'USD' ? '$' : '₹';

  const metrics = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const totalReleases = releases.length;
    const audioSongs = releases.filter((r) => r.releaseType === 'audio').length;
    const videoSongs = releases.filter((r) => r.releaseType === 'video').length;
    const upcoming = releases.filter(
      (r) =>
        (r.status === 'Scheduled' || (r.plannedReleaseDate && r.plannedReleaseDate >= todayIso)) &&
        r.status !== 'Live' &&
        r.status !== 'Rejected' &&
        r.status !== 'Taken Down'
    ).length;
    const liveOnDsps = releases.filter((r) => ['Delivered', 'Live'].includes(r.status)).length;
    const pendingDist =
      distributionRecords.filter((d) =>
        ['Planned', 'Submitted to Partner', 'Processing'].includes(d.status)
      ).length ||
      releases.filter((r) =>
        ['Submitted', 'Under Review', 'Approved', 'Processing'].includes(r.status)
      ).length;
    const totalStreams = analytics.reduce((acc, a) => acc + (a.streams || 0), 0);
    const estimatedRoyalties = royalties.reduce((acc, r) => acc + (r.estimatedRoyalty || 0), 0);

    return [
      { label: 'Total Music Releases', value: totalReleases, icon: Disc3, accent: 'gold' as const },
      { label: 'Audio Songs', value: audioSongs, icon: Music, accent: 'blue' as const },
      { label: 'Official Video Songs', value: videoSongs, icon: Film, accent: 'blue' as const },
      { label: 'Upcoming Releases', value: upcoming, icon: CalendarClock, accent: 'gold' as const },
      { label: 'Live on Digital Platforms', value: liveOnDsps, icon: Globe2, accent: 'blue' as const },
      { label: 'Pending Distribution', value: pendingDist, icon: Clock, accent: 'gold' as const },
      { label: 'Total Streams', value: totalStreams, icon: Activity, accent: 'blue' as const },
      {
        label: 'Estimated Royalties',
        value: estimatedRoyalties,
        prefix: curSymbol,
        decimals: 2,
        icon: Wallet,
        accent: 'gold' as const,
      },
    ];
  }, [releases, distributionRecords, analytics, royalties, curSymbol]);

  const trackByReleaseId = useMemo(() => {
    const map = new Map<string, (typeof audioTracks)[number]>();
    for (const trk of audioTracks) {
      map.set(trk.releaseId, trk);
    }
    return map;
  }, [audioTracks]);

  const videoByReleaseId = useMemo(() => {
    const map = new Map<string, (typeof videoReleases)[number]>();
    for (const vid of videoReleases) {
      map.set(vid.releaseId, vid);
    }
    return map;
  }, [videoReleases]);

  // Verified stream counts per release (strictly from verified analytics collection; never fabricated)
  const verifiedStreamsByRelease = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of analytics) {
      if (row.releaseId) {
        map.set(row.releaseId, (map.get(row.releaseId) ?? 0) + (row.streams || 0));
      }
    }
    return map;
  }, [analytics]);

  // Trending Songs priority: 1) Admin Featured Songs, 2) Verified DSP Analytics, 3) Latest Verified Releases
  const trendingSongs = useMemo(() => {
    const hasVerifiedAnalytics = verifiedStreamsByRelease.size > 0;
    const hasAdminFeatured = releases.some((r) => Boolean(r.featured));
    const list = [...releases].sort((a, b) => {
      // Priority 1: Administrator Featured Songs
      if (Boolean(a.featured) !== Boolean(b.featured)) {
        return a.featured ? -1 : 1;
      }
      // Priority 2: Verified Streaming Analytics
      if (hasVerifiedAnalytics) {
        const sa = verifiedStreamsByRelease.get(a.id) ?? 0;
        const sb = verifiedStreamsByRelease.get(b.id) ?? 0;
        if (sb !== sa) return sb - sa;
      }
      // Priority 3: Latest Verified Releases
      const rank = (r: ReleaseRecord) => {
        if (r.status === 'Live') return 4;
        if (r.status === 'Delivered' || r.status === 'Approved' || r.status === 'Scheduled') return 3;
        if (r.plannedReleaseDate && r.artworkPreview) return 2;
        if (r.artworkPreview) return 1;
        return 0;
      };
      const diff = rank(b) - rank(a);
      if (diff !== 0) return diff;
      const dateCmp = (b.plannedReleaseDate || b.submissionDate || '').localeCompare(
        a.plannedReleaseDate || a.submissionDate || ''
      );
      if (dateCmp !== 0) return dateCmp;
      return a.title.localeCompare(b.title);
    });
    return {
      hasVerifiedAnalytics,
      hasAdminFeatured,
      all: list,
      visible: showAllTrending ? list : list.slice(0, 8),
    };
  }, [releases, verifiedStreamsByRelease, showAllTrending]);

  const playableTrendingQueue: PlayerTrackItem[] = useMemo(() => {
    return trendingSongs.all
      .filter((r) => r.releaseType === 'audio' && Boolean(trackByReleaseId.get(r.id)?.masterSourceUrl))
      .map((r) => {
        const trk = trackByReleaseId.get(r.id)!;
        return {
          releaseId: r.id,
          title: r.title,
          artistName: r.artistCredit || 'Sunil Kumar',
          labelName: r.labelCredit || 'Music High Sky',
          artworkUrl: r.artworkPreview,
          audioUrl: trk.masterSourceUrl!,
          durationSeconds: trk.durationSeconds,
          format: trk.format,
          language: r.language,
          genre: r.genre,
        };
      });
  }, [trendingSongs.all, trackByReleaseId]);

  const toggleTrendingPreview = (rel: ReleaseRecord) => {
    const track = trackByReleaseId.get(rel.id);
    if (rel.releaseType !== 'audio' || !track?.masterSourceUrl) {
      openInspector(rel);
      return;
    }
    const item: PlayerTrackItem = {
      releaseId: rel.id,
      title: rel.title,
      artistName: rel.artistCredit || 'Sunil Kumar',
      labelName: rel.labelCredit || 'Music High Sky',
      artworkUrl: rel.artworkPreview,
      audioUrl: track.masterSourceUrl,
      durationSeconds: track.durationSeconds,
      format: track.format,
      language: rel.language,
      genre: rel.genre,
    };
    playTrack(item, playableTrendingQueue, 'Trending Songs – Sunil Kumar');
  };

  const handleToggleFeatured = async (rel: ReleaseRecord) => {
    if (!currentUser || !isStaff) return;
    try {
      await toggleReleaseFeatured({
        release: rel,
        featured: !rel.featured,
        actor: currentUser,
      });
      pushToast(
        rel.featured
          ? `Removed "${rel.title}" from Featured Trending Songs.`
          : `Pinned "${rel.title}" as Featured on Dashboard Trending Songs.`,
        'success'
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to update featured status.', 'error');
    }
  };

  const handleAddReleaseToPlaylist = async (playlistId: string, release: ReleaseRecord) => {
    if (!currentUser) return;
    const existing = playlistTracks.filter((pt) => pt.playlistId === playlistId);
    if (existing.some((pt) => pt.releaseId === release.id)) {
      pushToast('This song is already in that playlist.', 'info');
      setPlaylistPickerRelease(null);
      return;
    }
    const maxPos = existing.reduce((m, pt) => Math.max(m, pt.position), -1);
    try {
      await addReleaseToPlaylist({
        playlistId,
        releaseId: release.id,
        position: maxPos + 1,
        actor: currentUser,
      });
      const plName = playlists.find((p) => p.id === playlistId)?.name || 'playlist';
      pushToast(`Added "${release.title}" to "${plName}".`, 'success');
      setPlaylistPickerRelease(null);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to add song to playlist.', 'error');
    }
  };

  const featuredPlaylists = useMemo(() => {
    const featured = playlists.filter((p) => p.featured);
    return (featured.length > 0 ? featured : playlists).slice(0, 5);
  }, [playlists]);

  const handlePlayDashboardPlaylist = (playlistId: string, playlistName: string) => {
    const links = playlistTracks
      .filter((pt) => pt.playlistId === playlistId)
      .sort((a, b) => a.position - b.position);
    const queue: PlayerTrackItem[] = [];
    for (const l of links) {
      const rel = releases.find((r) => r.id === l.releaseId);
      const trk = rel ? trackByReleaseId.get(rel.id) : undefined;
      if (rel && rel.releaseType === 'audio' && trk?.masterSourceUrl) {
        queue.push({
          releaseId: rel.id,
          title: rel.title,
          artistName: rel.artistCredit || 'Sunil Kumar',
          labelName: rel.labelCredit || 'Music High Sky',
          artworkUrl: rel.artworkPreview,
          audioUrl: trk.masterSourceUrl,
          durationSeconds: trk.durationSeconds,
          format: trk.format,
          language: rel.language,
          genre: rel.genre,
        });
      }
    }
    if (queue.length === 0) {
      onNavigate('playlists');
      return;
    }
    playPlaylist(queue, playlistName, 0);
  };

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return releases
      .filter((r) => {
        if (typeFilter !== 'all' && r.releaseType !== typeFilter) return false;
        if (statusFilter !== 'all' && r.status !== statusFilter) return false;
        if (!q) return true;
        return (
          r.title.toLowerCase().includes(q) ||
          r.releaseCode.toLowerCase().includes(q) ||
          r.primaryArtist.toLowerCase().includes(q) ||
          r.language.toLowerCase().includes(q) ||
          r.genre.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const av = String(a[sortKey] ?? '').toLowerCase();
        const bv = String(b[sortKey] ?? '').toLowerCase();
        const cmp = av.localeCompare(bv);
        return sortDir === 'asc' ? cmp : -cmp;
      });
  }, [releases, searchTerm, typeFilter, statusFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handleSaveStatusUpdate = async () => {
    if (!selectedRelease || !currentUser) return;
    setBusyAction(true);
    try {
      await updateReleaseStatusAndReview({
        release: selectedRelease,
        newStatus: reviewStatus,
        reviewNotes,
        plannedReleaseDate: scheduleDate,
        actor: currentUser,
        emailAlertsEnabled: Boolean(settings.emailNotificationsEnabled),
      });
      pushToast(`Release ${selectedRelease.releaseCode} updated to ${reviewStatus}.`, 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Status update failed.', 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const handleReplaceArtwork = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedRelease || !currentUser) return;
    setBusyAction(true);
    try {
      const validated = await validateAndCompressArtwork(
        file,
        selectedRelease.releaseType === 'video' ? 'video_thumbnail' : 'cover_art'
      );
      const existingArt = artworks.find((a) => a.releaseId === selectedRelease.id);
      await replacePreApprovalArtwork({
        release: selectedRelease,
        artworkId: existingArt?.id,
        previewDataUrl: validated.previewDataUrl,
        fileName: validated.fileName,
        format: validated.format,
        width: validated.width,
        height: validated.height,
        aspectRatioValid: validated.aspectRatioValid,
        actor: currentUser,
      });
      pushToast('Cover artwork replaced and saved.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Artwork replacement failed.', 'error');
    } finally {
      setBusyAction(false);
      e.target.value = '';
    }
  };

  const handleDeleteRelease = async (rel: ReleaseRecord) => {
    if (!currentUser || !isSuperAdmin) return;
    setBusyAction(true);
    try {
      await deleteReleaseByAdmin(rel, currentUser);
      setSelectedReleaseId(null);
      pushToast(`Deleted ${rel.releaseCode} from catalog.`, 'info');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Delete failed.', 'error');
    } finally {
      setBusyAction(false);
    }
  };

  const selectedTrack = selectedRelease
    ? audioTracks.find((t) => t.releaseId === selectedRelease.id)
    : undefined;
  const selectedVideo = selectedRelease
    ? videoReleases.find((v) => v.releaseId === selectedRelease.id)
    : undefined;
  const canReplaceArtwork =
    selectedRelease &&
    ['Draft', 'Submitted', 'Under Review', 'Metadata Correction Required'].includes(
      selectedRelease.status
    ) &&
    (isSuperAdmin || selectedRelease.submittedBy === currentUser?.uid);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-8"
    >
      {/* Executive Hero Title Row */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-[#00D5FF] mb-1">
            EXECUTIVE LABEL OVERVIEW · MUSIC HIGH SKY
          </p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-gold-gradient tracking-wide">
            Release &amp; Distribution Dashboard
          </h2>
          <p className="text-sm text-[#8D9AAA] mt-1">
            Official command console for <span className="text-[#C8D0DB] font-medium">Sunil Kumar</span> — audio masters, music videos, DSP distribution, and verified royalties.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {isStaff && (
            <button
              type="button"
              onClick={() => onNavigate('import-manager')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#F5D58A] bg-[#06152E] border border-[#D4AF37]/35 hover:border-[#F5D58A] rounded-lg whitespace-nowrap cursor-pointer"
            >
              <CloudDownload className="w-3.5 h-3.5" />
              Drive Import
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate('playlists')}
            className="btn-electric inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg whitespace-nowrap cursor-pointer"
          >
            <ListMusic className="w-3.5 h-3.5" />
            Official Playlists
          </button>
          <button
            type="button"
            onClick={() => onNavigate('new-release')}
            className="btn-gold inline-flex items-center gap-2 px-4 py-2 text-xs rounded-lg whitespace-nowrap cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            Submit Release
          </button>
        </div>
      </div>

      {/* 8 Luxury Glass Navy KPI Cards */}
      <section aria-label="Executive metrics" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <div
              key={m.label}
              className="luxury-card luxury-card-hover rounded-xl p-5 flex flex-col justify-between gap-4"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-[#C8D0DB]">{m.label}</span>
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    m.accent === 'gold'
                      ? 'bg-[#D4AF37]/14 text-[#F5D58A] border border-[#D4AF37]/30'
                      : 'bg-[#00A8FF]/14 text-[#00D5FF] border border-[#00A8FF]/30'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                {dataLoading ? (
                  <div className="h-8 w-20 bg-[#06152E] rounded animate-pulse" />
                ) : (
                  <AnimatedCounter
                    value={m.value}
                    prefix={m.prefix}
                    decimals={m.decimals}
                  />
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* One-Click Dashboard Quick Actions Widget */}
      <DashboardQuickActionsWidget onNavigate={onNavigate} />

      {/* TRENDING SONGS – Featured Artist: SUNIL KUMAR */}
      <section aria-label="Trending Songs — Sunil Kumar" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#00D5FF] mb-1">
              {trendingSongs.hasAdminFeatured
                ? 'ADMIN FEATURED & VERIFIED RELEASES · FEATURED ARTIST: SUNIL KUMAR'
                : trendingSongs.hasVerifiedAnalytics
                  ? 'RANKED BY VERIFIED DSP ANALYTICS · FEATURED ARTIST: SUNIL KUMAR'
                  : 'LATEST VERIFIED RELEASES · FEATURED ARTIST: SUNIL KUMAR'}
            </p>
            <h3 className="font-display text-xl sm:text-2xl font-bold text-gold-gradient tracking-wide">
              TRENDING SONGS – SUNIL KUMAR
            </h3>
            <p className="text-xs text-[#8D9AAA] mt-1">
              Ordered by Administrator Featured picks, verified DSP streaming reports, and latest verified releases. Zero synthetic streams or rankings.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('artist-profile')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#F5D58A] bg-[#06152E] border border-[#D4AF37]/30 hover:border-[#F5D58A] rounded-lg cursor-pointer"
            >
              <UserCheck className="w-3.5 h-3.5" />
              View Artist Profile
            </button>
            <button
              type="button"
              disabled={catalogSyncing}
              onClick={() => void resyncAttachedCatalog()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#C8D0DB] hover:text-white bg-[#06152E] border border-[#D4AF37]/30 rounded-lg cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#F5D58A] ${catalogSyncing ? 'animate-spin' : ''}`} />
              {catalogSyncing ? 'Syncing...' : 'Verify Sync'}
            </button>
            {trendingSongs.all.length > 8 && (
              <button
                type="button"
                onClick={() => setShowAllTrending((v) => !v)}
                className="btn-electric px-3.5 py-2 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap"
              >
                {showAllTrending
                  ? 'Show Top 8'
                  : `View All ${trendingSongs.all.length} Songs`}
              </button>
            )}
          </div>
        </div>

        {dataLoading || (catalogSyncing && trendingSongs.all.length === 0) ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="luxury-card rounded-2xl p-4 space-y-3 animate-pulse"
              >
                <div className="aspect-square rounded-xl bg-[#06152E]" />
                <div className="h-4 bg-[#06152E] rounded w-3/4" />
                <div className="h-3 bg-[#06152E] rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : trendingSongs.all.length === 0 ? (
          <div className="luxury-card rounded-2xl p-8 text-center space-y-3">
            <p className="font-display text-base font-semibold text-[#F5D58A]">
              Synchronizing Sunil Kumar’s Official Catalog
            </p>
            <p className="text-xs text-[#8D9AAA] max-w-md mx-auto">
              No release records are loaded yet. Import your files from Google Drive or click Verify Sync above.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {trendingSongs.visible.map((rel) => {
              const track = trackByReleaseId.get(rel.id);
              const video = videoByReleaseId.get(rel.id);
              const isPlaying = currentTrack?.releaseId === rel.id && playerIsPlaying;
              const isCurrentTrack = currentTrack?.releaseId === rel.id;
              const hasPlayableAudio = rel.releaseType === 'audio' && Boolean(track?.masterSourceUrl);
              const tone = STATUS_COLORS[rel.status] ?? {
                text: 'text-[#C8D0DB]',
                dot: 'bg-[#C8D0DB]',
              };
              const verifiedStreams = verifiedStreamsByRelease.get(rel.id);

              return (
                <article
                  key={rel.id}
                  className={`luxury-card luxury-card-hover rounded-2xl overflow-hidden flex flex-col border transition-colors ${
                    isCurrentTrack
                      ? 'border-[#00D5FF]/70 shadow-[0_0_28px_-10px_rgba(0,213,255,0.45)]'
                      : 'border-[#D4AF37]/25'
                  }`}
                >
                  {/* Gold-Framed Album Artwork with Direct Persistent Player Trigger */}
                  <div className="relative aspect-square bg-[#030509] overflow-hidden group">
                    {rel.artworkPreview ? (
                      <img
                        src={rel.artworkPreview}
                        alt={`${rel.title} artwork`}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-2.5 bg-[radial-gradient(circle_at_50%_40%,rgba(0,168,255,0.14),transparent_60%),linear-gradient(180deg,#06152E,#030509)] p-4 text-center">
                        <img
                          src={brandLogoUrl}
                          alt="Music High Sky"
                          referrerPolicy="no-referrer"
                          className="w-16 h-16 rounded-full object-contain ring-1 ring-[#D4AF37]/50 bg-[#020817]"
                        />
                        <span className="text-[10px] font-mono tracking-wider text-[#F5D58A]/85">
                          ARTWORK PENDING REVIEW
                        </span>
                      </div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-[#020817] via-[#020817]/20 to-transparent" />

                    {/* Top Media Type, Duration & Admin Feature Star */}
                    <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 text-[10px] font-mono">
                      <span className="px-2 py-1 rounded-md bg-[#020817]/85 border border-[#00A8FF]/35 text-[#00D5FF] uppercase tracking-wider inline-flex items-center gap-1">
                        {rel.releaseType === 'audio' ? (
                          <Music className="w-3 h-3" />
                        ) : (
                          <Film className="w-3 h-3" />
                        )}
                        {rel.releaseType === 'audio'
                          ? `${track?.format || 'AUDIO'}`
                          : `${video?.format || 'VIDEO'}`}
                      </span>

                      <div className="flex items-center gap-1.5">
                        {track?.durationSeconds ? (
                          <span className="px-2 py-1 rounded-md bg-[#020817]/85 border border-[#D4AF37]/30 text-[#F5D58A] tabular-nums">
                            {formatDuration(track.durationSeconds)}
                          </span>
                        ) : null}
                        {isStaff && (
                          <button
                            type="button"
                            onClick={() => void handleToggleFeatured(rel)}
                            title={rel.featured ? 'Unfeature from Trending' : 'Feature on Trending'}
                            aria-label={rel.featured ? 'Unfeature song' : 'Feature song'}
                            className={`p-1.5 rounded-md bg-[#020817]/85 border cursor-pointer transition-colors ${
                              rel.featured
                                ? 'border-[#F5D58A] text-[#F5D58A]'
                                : 'border-[#D4AF37]/25 text-[#8D9AAA] hover:text-[#F5D58A]'
                            }`}
                          >
                            <Star className={`w-3 h-3 ${rel.featured ? 'fill-current' : ''}`} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Floating Play/Pause Button on Artwork */}
                    <button
                      type="button"
                      onClick={() => toggleTrendingPreview(rel)}
                      aria-label={isPlaying ? `Pause ${rel.title}` : `Play ${rel.title}`}
                      className={`absolute bottom-3 right-3 w-11 h-11 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-lg ${
                        isPlaying
                          ? 'bg-[#00D5FF] text-[#020817] shadow-[0_0_24px_rgba(0,213,255,0.65)]'
                          : 'btn-gold'
                      }`}
                    >
                      {isPlaying ? (
                        <Pause className="w-4 h-4 fill-current" />
                      ) : (
                        <Play className="w-4 h-4 ml-0.5 fill-current" />
                      )}
                    </button>
                  </div>

                  {/* Song Metadata & Actions */}
                  <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className={`font-semibold inline-flex items-center gap-1.5 ${tone.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                          {rel.featured ? 'Featured' : rel.status}
                        </span>
                        {verifiedStreams !== undefined && verifiedStreams > 0 && (
                          <span className="font-mono text-[#00D5FF] tabular-nums">
                            {verifiedStreams.toLocaleString()} streams
                          </span>
                        )}
                      </div>

                      <h4
                        className="font-display text-sm font-bold text-white leading-snug line-clamp-2"
                        title={rel.title}
                      >
                        {rel.title}
                      </h4>

                      <p className="text-xs text-[#F5D58A] font-medium truncate">
                        {rel.artistCredit || 'Sunil Kumar'} · {rel.labelCredit || 'Music High Sky'}
                      </p>

                      <p className="text-[11px] text-[#8D9AAA] truncate">
                        {rel.language} · {rel.genre}
                        {rel.plannedReleaseDate ? ` · ${rel.plannedReleaseDate}` : ''}
                      </p>
                    </div>

                    <div className="pt-2.5 border-t border-[#D4AF37]/15 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => toggleTrendingPreview(rel)}
                        className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-semibold rounded-lg cursor-pointer transition-colors ${
                          isPlaying
                            ? 'bg-[#00A8FF]/20 border border-[#00D5FF]/50 text-[#00D5FF]'
                            : 'btn-gold'
                        }`}
                      >
                        {isPlaying ? (
                          <>
                            <Pause className="w-3.5 h-3.5" />
                            Pause
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5" />
                            {hasPlayableAudio ? 'Play' : 'Preview'}
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setPlaylistPickerRelease(rel)}
                        title="Add to Playlist"
                        aria-label={`Add ${rel.title} to playlist`}
                        className="p-2 rounded-lg bg-[#06152E] border border-[#D4AF37]/30 hover:border-[#F5D58A] text-[#F5D58A] cursor-pointer shrink-0"
                      >
                        <ListPlus className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => openInspector(rel)}
                        title="View Release Details"
                        className="btn-electric inline-flex items-center justify-center gap-1 px-2.5 py-2 text-xs font-semibold rounded-lg cursor-pointer shrink-0"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Details
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Featured Official Playlists Strip */}
      {featuredPlaylists.length > 0 && (
        <section aria-label="Featured Playlists — Sunil Kumar" className="space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#00D5FF]">
                SUNIL KUMAR · OFFICIAL PLAYLIST COLLECTIONS
              </p>
              <h3 className="font-display text-lg sm:text-xl font-bold text-[#F5D58A]">
                Featured Playlists
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('playlists')}
              className="btn-electric px-3.5 py-2 text-xs font-semibold rounded-lg cursor-pointer self-start sm:self-auto"
            >
              Browse All {playlists.length} Playlists
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            {featuredPlaylists.map((pl) => {
              const count = playlistTracks.filter((pt) => pt.playlistId === pl.id).length;
              return (
                <div
                  key={pl.id}
                  onClick={() => onNavigate('playlists')}
                  className="luxury-card luxury-card-hover rounded-xl p-3.5 flex items-center gap-3 cursor-pointer"
                >
                  <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-[#D4AF37]/35 bg-[#030509] shrink-0">
                    {pl.coverArtworkUrl ? (
                      <img
                        src={pl.coverArtworkUrl}
                        alt={pl.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img
                        src={brandLogoUrl}
                        alt="Music High Sky"
                        className="w-full h-full object-contain p-1.5"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-display font-bold text-white truncate">{pl.name}</p>
                    <p className="text-[11px] font-mono text-[#F5D58A]">
                      {count} {count === 1 ? 'track' : 'tracks'}
                    </p>
                  </div>
                  {pl.mediaKind !== 'video' && count > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePlayDashboardPlaylist(pl.id, pl.name);
                      }}
                      aria-label={`Play ${pl.name}`}
                      className="w-8 h-8 rounded-full btn-gold flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 ml-0.5 fill-current" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Add to Playlist Picker Modal */}
      {playlistPickerRelease && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="luxury-card rounded-2xl max-w-md w-full border border-[#D4AF37]/40 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-[#D4AF37]/20 pb-3">
              <div className="min-w-0">
                <p className="text-[10px] font-mono uppercase tracking-wider text-[#00D5FF]">
                  Add to Official Playlist
                </p>
                <h4 className="font-display text-base font-bold text-[#F5D58A] truncate">
                  {playlistPickerRelease.title}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setPlaylistPickerRelease(null)}
                className="text-[#8D9AAA] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {playlists.map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => void handleAddReleaseToPlaylist(pl.id, playlistPickerRelease)}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl bg-[#030509]/80 hover:bg-[#06152E] border border-[#D4AF37]/20 hover:border-[#F5D58A]/50 flex items-center justify-between gap-2 cursor-pointer transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{pl.name}</p>
                    <p className="text-[11px] text-[#8D9AAA] truncate">{pl.description}</p>
                  </div>
                  <ListPlus className="w-4 h-4 text-[#00D5FF] shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Luxury Release Management Table */}
      <section className="luxury-card rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-[#D4AF37]/20 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-lg font-semibold text-[#F5D58A] tracking-wide">
              Release Management Catalog
            </h3>
            <p className="text-xs text-[#8D9AAA] mt-0.5">
              {filtered.length} matching release{filtered.length === 1 ? '' : 's'} · Distributor: Music High Sky
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 sm:flex-none sm:w-64">
              <Search className="w-4 h-4 text-[#8D9AAA] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                placeholder="Search title, ID, genre, language..."
                className="w-full pl-9 pr-3 py-2 text-xs luxury-input rounded-lg"
              />
            </div>

            <div className="flex items-center p-0.5 bg-[#030509] border border-[#D4AF37]/25 rounded-lg">
              {(['all', 'audio', 'video'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTypeFilter(t);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors capitalize cursor-pointer whitespace-nowrap ${
                    typeFilter === t
                      ? 'bg-[#D4AF37] text-[#030509]'
                      : 'text-[#C8D0DB] hover:text-white'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as 'all' | ReleaseStatus);
                setPage(1);
              }}
              aria-label="Filter by status"
              className="px-3 py-2 text-xs luxury-input rounded-lg"
            >
              <option value="all">All Statuses</option>
              {RELEASE_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#D4AF37]/15 text-[11px] font-semibold tracking-wider text-[#F5D58A]/85 bg-[#030509]/55">
                <th className="py-3.5 px-4 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => toggleSort('title')}
                    className="inline-flex items-center gap-1 hover:text-white cursor-pointer"
                  >
                    Release Artwork &amp; Song Title <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3.5 px-4 whitespace-nowrap">Artist</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Release Type</th>
                <th className="py-3.5 px-4 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => toggleSort('plannedReleaseDate')}
                    className="inline-flex items-center gap-1 hover:text-white cursor-pointer"
                  >
                    Release Date <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3.5 px-4 whitespace-nowrap">Digital Platforms</th>
                <th className="py-3.5 px-4 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => toggleSort('status')}
                    className="inline-flex items-center gap-1 hover:text-white cursor-pointer"
                  >
                    Distribution Status <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3.5 px-4 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D4AF37]/10 text-xs">
              {dataLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={7} className="py-4 px-4">
                      <div className="h-4 bg-[#06152E] rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-14 px-4 text-center">
                    <p className="font-display text-base font-semibold text-[#F5D58A]">
                      {releases.length === 0
                        ? 'Your Official Release Catalog Awaits'
                        : 'No Releases Match Your Current Filters'}
                    </p>
                    <p className="text-xs text-[#8D9AAA] mt-1.5 max-w-md mx-auto leading-relaxed">
                      {releases.length === 0
                        ? 'Zero fabricated entries exist in your workspace. Submit your first audio song or official music video for Sunil Kumar under Music High Sky.'
                        : 'Adjust your search query or status filter to inspect catalog entries.'}
                    </p>
                    {releases.length === 0 && (
                      <button
                        type="button"
                        onClick={() => onNavigate('new-release')}
                        className="mt-5 btn-gold inline-flex items-center gap-2 px-5 py-2.5 text-xs rounded-lg cursor-pointer"
                      >
                        <PlusCircle className="w-4 h-4" />
                        Submit First Release
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginated.map((rel) => {
                  const tone = STATUS_COLORS[rel.status] ?? {
                    text: 'text-[#C8D0DB]',
                    dot: 'bg-[#C8D0DB]',
                  };
                  const dspCount = (rel.targetPlatforms ?? []).length;
                  const dspPreview = (rel.targetPlatforms ?? []).slice(0, 2).join(', ');
                  return (
                    <tr
                      key={rel.id}
                      className="hover:bg-[#06152E]/65 transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3.5 min-w-[220px]">
                          {rel.artworkPreview ? (
                            <img
                              src={rel.artworkPreview}
                              alt={rel.title}
                              className="w-11 h-11 rounded-lg object-cover shrink-0 border border-[#D4AF37]/40"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-lg bg-[#030509] border border-[#D4AF37]/25 flex items-center justify-center text-[10px] font-mono text-[#F5D58A] shrink-0">
                              {rel.releaseType === 'audio' ? 'AUD' : 'VID'}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold text-white truncate max-w-[220px]">
                              {rel.title}
                            </p>
                            <p className="text-[11px] font-mono text-[#8D9AAA] truncate">
                              {rel.releaseCode} · {rel.language} · {rel.genre}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-[#C8D0DB] font-medium whitespace-nowrap">
                        {rel.artistCredit || rel.primaryArtist}
                      </td>
                      <td className="py-3.5 px-4 text-[#C8D0DB] whitespace-nowrap">
                        {rel.releaseType === 'audio' ? 'Audio Song' : 'Official Music Video'}
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-[#C8D0DB] whitespace-nowrap">
                        {rel.plannedReleaseDate || 'Unscheduled'}
                      </td>
                      <td className="py-3.5 px-4 text-[#8D9AAA] whitespace-nowrap">
                        {dspCount > 0
                          ? `${dspPreview}${dspCount > 2 ? ` +${dspCount - 2}` : ''}`
                          : 'Not assigned'}
                      </td>
                      <td className={`py-3.5 px-4 font-semibold whitespace-nowrap ${tone.text}`}>
                        {rel.status}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openInspector(rel)}
                          className="btn-electric inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filtered.length > PAGE_SIZE && (
          <div className="px-5 py-3.5 border-t border-[#D4AF37]/15 flex items-center justify-between text-xs text-[#8D9AAA]">
            <span className="font-mono tabular-nums">
              Page {safePage} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-[#D4AF37]/25 disabled:opacity-40 hover:border-[#F5D58A] text-white cursor-pointer"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg border border-[#D4AF37]/25 disabled:opacity-40 hover:border-[#F5D58A] text-white cursor-pointer"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Luxury Release Inspector & Approval Modal */}
      {selectedRelease && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="luxury-card rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-[#D4AF37]/40">
            <div className="p-5 border-b border-[#D4AF37]/20 flex items-start justify-between gap-4 sticky top-0 bg-[#040D22]/95 backdrop-blur-md z-10">
              <div className="min-w-0">
                <p className="text-xs font-mono text-[#00D5FF]">
                  {selectedRelease.releaseCode} ·{' '}
                  {selectedRelease.releaseType === 'audio' ? 'Audio Release' : 'Official Music Video'}
                </p>
                <h3 className="font-display text-xl font-bold text-[#F5D58A] mt-0.5 truncate">
                  {selectedRelease.title}
                  {selectedRelease.subtitle ? ` (${selectedRelease.subtitle})` : ''}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReleaseId(null)}
                aria-label="Close release inspector"
                className="p-1.5 text-[#8D9AAA] hover:text-white rounded-md cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="space-y-2.5">
                  {selectedRelease.artworkPreview ? (
                    <img
                      src={selectedRelease.artworkPreview}
                      alt={selectedRelease.title}
                      className="w-full aspect-square rounded-xl object-cover border border-[#D4AF37]/40"
                    />
                  ) : (
                    <div className="w-full aspect-square rounded-xl bg-[#030509] border border-[#D4AF37]/20 flex items-center justify-center text-xs text-[#8D9AAA]">
                      No artwork attached
                    </div>
                  )}
                  {canReplaceArtwork && (
                    <label className="w-full btn-electric inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Replace Artwork</span>
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png"
                        onChange={handleReplaceArtwork}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                <div className="md:col-span-2 space-y-4">
                  <div className="p-4 rounded-xl bg-[#030509]/80 border border-[#D4AF37]/25 space-y-1.5 text-xs">
                    <p className="font-semibold text-[#F5D58A]">Official Release Credit Format</p>
                    <p className="text-white">
                      <span className="text-[#8D9AAA]">Release Title:</span> {selectedRelease.title}
                    </p>
                    <p className="text-white">
                      <span className="text-[#8D9AAA]">Artist Credit:</span>{' '}
                      {selectedRelease.artistCredit}
                    </p>
                    <p className="text-white">
                      <span className="text-[#8D9AAA]">Label Credit:</span>{' '}
                      {selectedRelease.labelCredit}
                    </p>
                    <p className="text-[#C8D0DB]">
                      <span className="text-[#8D9AAA]">Copyright:</span>{' '}
                      {selectedRelease.phonographicCopyright ||
                        selectedRelease.copyrightOwner ||
                        'As per verified ownership and applicable agreements.'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                    <div>
                      <span className="text-[#8D9AAA] block">Primary / Featured Artist</span>
                      <span className="text-white">
                        {selectedRelease.primaryArtist}
                        {selectedRelease.featuredArtist ? ` ft. ${selectedRelease.featuredArtist}` : ''}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#8D9AAA] block">Genre / Language / Mood</span>
                      <span className="text-white">
                        {selectedRelease.genre} · {selectedRelease.language}
                        {selectedRelease.mood ? ` · ${selectedRelease.mood}` : ''}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#8D9AAA] block">Singer / Lyricist</span>
                      <span className="text-white">
                        {selectedRelease.singer || 'Sunil Kumar'} /{' '}
                        {selectedRelease.lyricist || 'Sunil Kumar'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#8D9AAA] block">Composer / Producer</span>
                      <span className="text-white">
                        {selectedRelease.composer || '—'} / {selectedRelease.musicProducer || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#8D9AAA] block">Planned Release Date</span>
                      <span className="font-mono text-[#00D5FF]">
                        {selectedRelease.plannedReleaseDate || 'Unscheduled'}{' '}
                        {selectedRelease.releaseTime || ''}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#8D9AAA] block">Explicit Content</span>
                      <span className="text-white">
                        {selectedRelease.explicitContent ? 'Yes (Explicit)' : 'No (Clean)'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {selectedTrack && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[#C8D0DB]">
                    Validated Audio Master · {selectedTrack.fileName} ({selectedTrack.format},{' '}
                    {(selectedTrack.sampleRate || 44100) / 1000} kHz)
                  </p>
                  <WaveformPlayer
                    peaks={selectedTrack.waveformPeaks ?? []}
                    audioUrl={selectedTrack.masterSourceUrl}
                    durationSeconds={selectedTrack.durationSeconds}
                    label={selectedTrack.fileName}
                    compact
                  />
                </div>
              )}

              {selectedRelease.reviewNotes && (
                <div className="p-3.5 rounded-xl bg-[#D4AF37]/8 border border-[#D4AF37]/30 flex items-start gap-2.5 text-xs">
                  <AlertCircle className="w-4 h-4 text-[#F5D58A] shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-[#F5D58A]">Metadata &amp; Review Flag</p>
                    <p className="text-[#C8D0DB] mt-0.5 leading-relaxed">
                      {selectedRelease.reviewNotes}
                    </p>
                  </div>
                </div>
              )}

              {selectedVideo && (
                <div className="p-4 rounded-xl bg-[#030509]/80 border border-[#00A8FF]/25 text-xs space-y-1.5">
                  <p className="font-semibold text-[#00D5FF]">Official Music Video Metadata</p>
                  <p className="text-[#C8D0DB]">
                    Director: {selectedVideo.director || '—'} · Producer:{' '}
                    {selectedVideo.producer || '—'} · Production:{' '}
                    {selectedVideo.productionCompany || '—'}
                  </p>
                  <p className="text-[#8D9AAA]">
                    File: {selectedVideo.fileName || 'External'} ({selectedVideo.format}) ·{' '}
                    {selectedVideo.resolution || 'Verified'}
                  </p>
                  {selectedVideo.youtubeUrl && (
                    <p className="text-[#00A8FF] break-all">YouTube: {selectedVideo.youtubeUrl}</p>
                  )}
                </div>
              )}

              <div className="space-y-1">
                <p className="text-xs font-semibold text-[#F5D58A]">Intended Digital Platforms</p>
                <p className="text-xs text-[#C8D0DB] leading-relaxed">
                  {(selectedRelease.targetPlatforms ?? []).join(' · ') || 'No destinations selected'}
                </p>
              </div>

              {isStaff ? (
                <div className="p-4 rounded-xl bg-[#030509]/80 border border-[#D4AF37]/25 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-display text-sm font-semibold text-[#F5D58A]">
                      Release Approval &amp; Lifecycle Control
                    </h4>
                    <span className="text-xs text-[#8D9AAA]">
                      Current: <strong className="text-[#00D5FF]">{selectedRelease.status}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-[#C8D0DB] mb-1">Update Status</label>
                      <select
                        value={reviewStatus}
                        onChange={(e) => setReviewStatus(e.target.value as ReleaseStatus)}
                        className="w-full px-3 py-2 text-xs luxury-input rounded-lg"
                      >
                        {RELEASE_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-[#C8D0DB] mb-1">
                        Scheduled Release Date
                      </label>
                      <input
                        type="date"
                        value={scheduleDate}
                        onChange={(e) => setScheduleDate(e.target.value)}
                        className="w-full px-3 py-2 text-xs luxury-input rounded-lg font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-[#C8D0DB] mb-1">
                      Review / Metadata Correction Notes
                    </label>
                    <textarea
                      rows={2}
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      placeholder="Add approval notes, metadata correction instructions, or partner delivery remarks..."
                      className="w-full px-3 py-2 text-xs luxury-input rounded-lg"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    {isSuperAdmin ? (
                      <button
                        type="button"
                        disabled={busyAction}
                        onClick={() => handleDeleteRelease(selectedRelease)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-950/35 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete Release
                      </button>
                    ) : (
                      <span />
                    )}
                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={handleSaveStatusUpdate}
                      className="btn-gold inline-flex items-center gap-2 px-5 py-2 text-xs rounded-lg cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {busyAction ? 'Saving...' : 'Apply Status Update'}
                    </button>
                  </div>
                </div>
              ) : (
                selectedRelease.reviewNotes && (
                  <div className="p-4 rounded-xl bg-[#030509]/80 border border-[#D4AF37]/25 text-xs">
                    <p className="font-semibold text-[#F5D58A] mb-1">Label Reviewer Notes</p>
                    <p className="text-[#C8D0DB]">{selectedRelease.reviewNotes}</p>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {!selectedRelease && <QuickActionsMenu onNavigate={onNavigate} />}
    </motion.div>
  );
};
