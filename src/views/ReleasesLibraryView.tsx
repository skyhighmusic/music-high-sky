import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  PlusCircle,
  Search,
  X,
  ExternalLink,
  CheckCircle2,
  Upload,
  Disc3,
  Film,
  AlertCircle,
  AlertTriangle,
  Play,
  Pause,
  Archive,
  Send,
  Trash2,
  Check,
  Minus,
  Loader2,
} from 'lucide-react';
import { STATUS_COLORS } from '../constants';
import { usePlatform } from '../context/PlatformContext';
import { usePlayer, type PlayerTrackItem } from '../context/PlayerContext';
import {
  deleteReleaseByAdmin,
  replacePreApprovalArtwork,
  updateDistributionRecordItem,
  updateReleaseStatusAndReview,
} from '../services/firestoreService';
import type { NavSection, ReleaseRecord, ReleaseStatus, ReleaseType } from '../types';
import { formatBytes, formatDuration, validateAndCompressArtwork } from '../utils/mediaValidation';
import { WaveformPlayer } from '../components/WaveformPlayer';

interface ReleasesLibraryViewProps {
  releaseType: ReleaseType | 'all';
  onCreateNew: (type: ReleaseType) => void;
  onNavigate: (section: NavSection) => void;
}

export const ReleasesLibraryView: React.FC<ReleasesLibraryViewProps> = ({
  releaseType,
  onCreateNew,
  onNavigate,
}) => {
  const {
    currentUser,
    brandLogoUrl,
    releases,
    audioTracks,
    videoReleases,
    artworks,
    distributionRecords,
    settings,
    pushToast,
  } = usePlatform();
  const { currentTrack, isPlaying: playerIsPlaying, playTrack } = usePlayer();

  const [queryText, setQueryText] = useState('');
  const [subFilter, setSubFilter] = useState<'all' | 'audio' | 'video'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState<'archive' | 'distribute' | 'delete' | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const isStaff = currentUser?.role === 'super_admin' || currentUser?.role === 'label_manager';
  const isSuperAdmin = currentUser?.role === 'super_admin';

  const effectiveType = releaseType === 'all' ? subFilter : releaseType;

  const scopedReleases = useMemo(
    () =>
      releases.filter((r) =>
        effectiveType === 'all' ? true : r.releaseType === effectiveType
      ),
    [releases, effectiveType]
  );

  const items = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return scopedReleases;
    return scopedReleases.filter((r) => {
      const searchableFields = [
        r.title,
        r.subtitle,
        r.primaryArtist,
        r.featuredArtist,
        r.artistCredit,
        r.releaseCode,
        r.genre,
        r.language,
        r.status,
      ];
      return searchableFields.some((field) =>
        field ? field.toLowerCase().includes(q) : false
      );
    });
  }, [scopedReleases, queryText]);

  const hasActiveSearch = queryText.trim().length > 0;

  // Prune any selected IDs that no longer exist in releases
  useEffect(() => {
    const validIds = new Set(releases.map((r) => r.id));
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (validIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [releases]);

  // Clear selection when switching library view type (all / audio / video)
  useEffect(() => {
    setSelectedIds(new Set());
    setConfirmDeleteOpen(false);
  }, [releaseType]);

  // Close delete confirmation modal with Escape when not busy
  useEffect(() => {
    if (!confirmDeleteOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && bulkBusy !== 'delete') {
        setConfirmDeleteOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmDeleteOpen, bulkBusy]);

  const selectedReleases = useMemo(
    () => releases.filter((r) => selectedIds.has(r.id)),
    [releases, selectedIds]
  );

  const visibleSelectedCount = useMemo(
    () => items.reduce((acc, r) => (selectedIds.has(r.id) ? acc + 1 : acc), 0),
    [items, selectedIds]
  );

  const allVisibleSelected = items.length > 0 && visibleSelectedCount === items.length;
  const someVisibleSelected = visibleSelectedCount > 0 && visibleSelectedCount < items.length;

  const toggleSelectOne = (id: string) => {
    if (bulkBusy) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    if (bulkBusy || items.length === 0) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        items.forEach((r) => next.delete(r.id));
      } else {
        items.forEach((r) => next.add(r.id));
      }
      return next;
    });
  };

  const clearSelection = () => {
    if (bulkBusy) return;
    setSelectedIds(new Set());
  };

  const handleBulkStatusUpdate = async (action: 'archive' | 'distribute') => {
    if (!currentUser || !isStaff) {
      pushToast('Label Manager or Super Admin access is required for bulk catalog actions.', 'error');
      return;
    }
    if (selectedReleases.length === 0 || bulkBusy) return;

    const targetStatus: ReleaseStatus = action === 'archive' ? 'Archived' : 'Delivered';
    const reviewNotes =
      action === 'archive'
        ? 'Archived from Music High Sky catalog via bulk action.'
        : 'Queued and delivered to target DSPs via Music High Sky bulk distribution.';

    setBulkBusy(action);
    setBulkProgress({ done: 0, total: selectedReleases.length });

    let succeeded = 0;
    let failed = 0;
    const processedIds = new Set<string>();
    const todayIso = new Date().toISOString().slice(0, 10);

    for (let i = 0; i < selectedReleases.length; i += 1) {
      const rel = selectedReleases[i];
      try {
        if (!isSuperAdmin && rel.status === 'Taken Down') {
          throw new Error('Taken Down releases require Super Admin override.');
        }

        await updateReleaseStatusAndReview({
          release: rel,
          newStatus: targetStatus,
          reviewNotes,
          actor: currentUser,
          emailAlertsEnabled: Boolean(settings.emailNotificationsEnabled),
        });

        if (action === 'distribute') {
          const pendingDist = distributionRecords.filter(
            (rec) =>
              rec.releaseId === rel.id &&
              ['Planned', 'Submitted to Partner', 'Processing'].includes(rec.status)
          );
          for (const rec of pendingDist) {
            await updateDistributionRecordItem({
              record: rec,
              partnerName: rec.partnerName || 'Music High Sky Partner Feed',
              externalReferenceId: rec.externalReferenceId || '',
              status: 'Delivered',
              deliveryConfirmedDate: rec.deliveryConfirmedDate || todayIso,
              liveUrl: rec.liveUrl || '',
              evidenceNotes:
                rec.evidenceNotes || 'Delivered via Music High Sky library bulk distribution.',
              actor: currentUser,
              emailAlertsEnabled: Boolean(settings.emailNotificationsEnabled),
            });
          }
        }

        succeeded += 1;
        processedIds.add(rel.id);
      } catch {
        failed += 1;
      } finally {
        setBulkProgress({ done: i + 1, total: selectedReleases.length });
      }
    }

    setSelectedIds((prev) => {
      const next = new Set(prev);
      processedIds.forEach((id) => next.delete(id));
      return next;
    });
    setBulkBusy(null);
    setBulkProgress(null);

    const verb = action === 'archive' ? 'Archived' : 'Distributed';
    if (failed === 0) {
      pushToast(
        `${verb} ${succeeded} ${succeeded === 1 ? 'release' : 'releases'} successfully.`,
        'success'
      );
    } else if (succeeded > 0) {
      pushToast(
        `${verb} ${succeeded} of ${succeeded + failed} releases (${failed} could not be updated).`,
        'info'
      );
    } else {
      pushToast(
        `Failed to ${action} selected ${failed === 1 ? 'release' : 'releases'}. Check permissions and try again.`,
        'error'
      );
    }
  };

  const handleBulkDeleteConfirmed = async () => {
    if (!currentUser || !isSuperAdmin) {
      pushToast('Super Admin privileges are required to permanently delete releases.', 'error');
      setConfirmDeleteOpen(false);
      return;
    }
    if (selectedReleases.length === 0 || bulkBusy) return;

    setBulkBusy('delete');
    setBulkProgress({ done: 0, total: selectedReleases.length });

    let succeeded = 0;
    let failed = 0;
    const deletedIds = new Set<string>();

    for (let i = 0; i < selectedReleases.length; i += 1) {
      const rel = selectedReleases[i];
      try {
        await deleteReleaseByAdmin(rel, currentUser);
        succeeded += 1;
        deletedIds.add(rel.id);
      } catch {
        failed += 1;
      } finally {
        setBulkProgress({ done: i + 1, total: selectedReleases.length });
      }
    }

    setSelectedIds((prev) => {
      const next = new Set(prev);
      deletedIds.forEach((id) => next.delete(id));
      return next;
    });
    setBulkBusy(null);
    setBulkProgress(null);
    setConfirmDeleteOpen(false);

    if (failed === 0) {
      pushToast(
        `Permanently deleted ${succeeded} ${succeeded === 1 ? 'release' : 'releases'}.`,
        'success'
      );
    } else if (succeeded > 0) {
      pushToast(
        `Deleted ${succeeded} of ${succeeded + failed} releases (${failed} failed).`,
        'info'
      );
    } else {
      pushToast('Could not delete the selected releases. Please try again.', 'error');
    }
  };

  const handleQuickApprove = async (rel: ReleaseRecord) => {
    if (!currentUser || !isStaff) return;
    setBusyId(rel.id);
    try {
      await updateReleaseStatusAndReview({
        release: rel,
        newStatus: 'Approved',
        reviewNotes: 'Metadata and masters verified by Music High Sky.',
        actor: currentUser,
        emailAlertsEnabled: Boolean(settings.emailNotificationsEnabled),
      });
      pushToast(`"${rel.title}" approved for scheduling & partner distribution.`, 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Approval failed.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleArtworkSwap = async (rel: ReleaseRecord, file: File) => {
    if (!currentUser) return;
    setBusyId(rel.id);
    try {
      const validated = await validateAndCompressArtwork(
        file,
        rel.releaseType === 'video' ? 'video_thumbnail' : 'cover_art'
      );
      const art = artworks.find((a) => a.releaseId === rel.id);
      await replacePreApprovalArtwork({
        release: rel,
        artworkId: art?.id,
        previewDataUrl: validated.previewDataUrl,
        fileName: validated.fileName,
        format: validated.format,
        width: validated.width,
        height: validated.height,
        aspectRatioValid: validated.aspectRatioValid,
        actor: currentUser,
      });
      pushToast(`Updated artwork for "${rel.title}".`, 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Artwork update failed.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const headingTitle =
    releaseType === 'all'
      ? 'Official Music Library'
      : releaseType === 'audio'
        ? 'Audio Releases'
        : 'Official Video Releases';

  const headingKicker =
    releaseType === 'all'
      ? 'MUSIC HIGH SKY · MASTER ARCHIVE & STREAMING CATALOG'
      : releaseType === 'audio'
        ? 'MUSIC HIGH SKY · AUDIO CATALOG'
        : 'MUSIC HIGH SKY · OFFICIAL MUSIC VIDEOS';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-[#00D5FF] mb-1">
            {headingKicker}
          </p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-gold-gradient tracking-wide">
            {headingTitle}
          </h2>
          <p className="text-sm text-[#8D9AAA] mt-1">
            {releaseType === 'video'
              ? 'Cinematic showcase of official MP4/MOV music videos, production credits, thumbnails, and platform delivery.'
              : 'Curated label library featuring large gold-framed artwork, studio waveform visualizations, metadata, and live DSP status.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onCreateNew(releaseType === 'video' ? 'video' : 'audio')}
            className="btn-gold inline-flex items-center gap-2 px-4 py-2 text-xs rounded-lg whitespace-nowrap cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            Submit {releaseType === 'video' ? 'Video' : 'Release'}
          </button>
        </div>
      </div>

      {/* Dedicated Search & Filter Bar */}
      <div
        role="search"
        aria-label="Search releases by title or artist name"
        className="luxury-card rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-3"
      >
        <div className="relative flex-1 min-w-0">
          <Search
            className="w-4 h-4 text-[#00D5FF] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            id="releases-library-search"
            type="text"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            aria-label="Search tracks or video releases by title or artist name"
            placeholder={
              releaseType === 'video'
                ? 'Search video releases by title or artist name...'
                : releaseType === 'audio'
                  ? 'Search audio tracks by title or artist name...'
                  : 'Search tracks or video releases by title or artist name...'
            }
            className="w-full min-h-[42px] pl-10 pr-10 py-2 text-sm luxury-input rounded-lg"
          />
          {hasActiveSearch && (
            <button
              type="button"
              onClick={() => setQueryText('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-[#8D9AAA] hover:text-white hover:bg-[#06152E] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between md:justify-end gap-3 shrink-0">
          {releaseType === 'all' && (
            <div className="flex items-center p-0.5 bg-[#030509] border border-[#D4AF37]/25 rounded-lg">
              {(['all', 'audio', 'video'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSubFilter(t)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md capitalize whitespace-nowrap cursor-pointer transition-colors ${
                    subFilter === t
                      ? 'bg-[#D4AF37] text-[#030509]'
                      : 'text-[#C8D0DB] hover:text-white'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {items.length > 0 && (
            <button
              type="button"
              role="checkbox"
              aria-checked={
                allVisibleSelected ? 'true' : someVisibleSelected ? 'mixed' : 'false'
              }
              aria-label={
                allVisibleSelected
                  ? 'Deselect all visible releases'
                  : 'Select all visible releases'
              }
              disabled={bulkBusy !== null}
              onClick={toggleSelectAllVisible}
              className={`min-h-[40px] inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D5FF] disabled:opacity-50 ${
                allVisibleSelected || someVisibleSelected
                  ? 'bg-[#D4AF37]/15 border-[#D4AF37]/60 text-[#F5D58A]'
                  : 'bg-[#030509] border-[#D4AF37]/25 text-[#C8D0DB] hover:border-[#D4AF37]/50 hover:text-white'
              }`}
            >
              <span
                aria-hidden="true"
                className={`w-4 h-4 rounded-[4px] flex items-center justify-center border transition-colors ${
                  allVisibleSelected || someVisibleSelected
                    ? 'bg-[#D4AF37] border-[#F5D58A] text-[#030509]'
                    : 'bg-[#06152E] border-[#8D9AAA]/60 text-transparent'
                }`}
              >
                {allVisibleSelected ? (
                  <Check className="w-3 h-3 stroke-[3]" />
                ) : someVisibleSelected ? (
                  <Minus className="w-3 h-3 stroke-[3]" />
                ) : null}
              </span>
              <span>{allVisibleSelected ? 'Deselect All' : 'Select All'}</span>
            </button>
          )}

          <p className="text-xs font-mono tabular-nums text-[#8D9AAA] whitespace-nowrap">
            {hasActiveSearch
              ? `${items.length} of ${scopedReleases.length} matching`
              : `${items.length} ${items.length === 1 ? 'release' : 'releases'}`}
          </p>
        </div>
      </div>

      {/* Bulk Action Toolbar */}
      <AnimatePresence>
        {selectedReleases.length > 0 && (
          <motion.div
            key="bulk-action-toolbar"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            role="toolbar"
            aria-label="Bulk release actions"
            className="md:sticky md:top-4 z-20 rounded-xl border border-[#D4AF37]/55 bg-[#06152E]/95 backdrop-blur-md shadow-[0_12px_36px_rgba(0,0,0,0.55)] px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
          >
            <div className="flex flex-wrap items-center gap-3 min-w-0">
              <div className="inline-flex items-center gap-2 text-sm text-white">
                <span className="w-6 h-6 rounded-md bg-[#D4AF37] text-[#030509] inline-flex items-center justify-center shrink-0">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </span>
                <span className="font-mono tabular-nums font-bold text-[#F5D58A]">
                  {selectedReleases.length}
                </span>
                <span className="font-medium text-[#C8D0DB] whitespace-nowrap">
                  {selectedReleases.length === 1 ? 'release selected' : 'releases selected'}
                </span>
                {visibleSelectedCount < selectedReleases.length && (
                  <span className="text-xs font-mono tabular-nums text-[#8D9AAA] whitespace-nowrap">
                    ({visibleSelectedCount} visible)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {items.length > 0 && !allVisibleSelected && (
                  <button
                    type="button"
                    disabled={bulkBusy !== null}
                    onClick={toggleSelectAllVisible}
                    className="min-h-[34px] px-2.5 py-1 text-xs font-semibold text-[#00D5FF] hover:text-white rounded-md hover:bg-[#020817]/60 whitespace-nowrap shrink-0 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D5FF] disabled:opacity-50"
                  >
                    Select all ({items.length})
                  </button>
                )}
                <button
                  type="button"
                  disabled={bulkBusy !== null}
                  onClick={clearSelection}
                  className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#8D9AAA] hover:text-white rounded-md hover:bg-[#020817]/60 whitespace-nowrap shrink-0 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D5FF] disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={!isStaff || bulkBusy !== null}
                title={
                  !isStaff
                    ? 'Label Manager or Super Admin role required to distribute releases'
                    : 'Deliver selected releases to target DSPs'
                }
                onClick={() => handleBulkStatusUpdate('distribute')}
                className="btn-electric min-h-[40px] inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D5FF] disabled:opacity-45 disabled:cursor-not-allowed"
              >
                {bulkBusy === 'distribute' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>
                  {bulkBusy === 'distribute' && bulkProgress
                    ? `Distributing ${bulkProgress.done}/${bulkProgress.total}`
                    : 'Distribute'}
                </span>
              </button>

              <button
                type="button"
                disabled={!isStaff || bulkBusy !== null}
                title={
                  !isStaff
                    ? 'Label Manager or Super Admin role required to archive releases'
                    : 'Archive selected releases'
                }
                onClick={() => handleBulkStatusUpdate('archive')}
                className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-[#D4AF37]/45 bg-[#030509] text-[#F5D58A] hover:bg-[#D4AF37]/15 hover:border-[#F5D58A] whitespace-nowrap shrink-0 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5D58A] disabled:opacity-45 disabled:cursor-not-allowed"
              >
                {bulkBusy === 'archive' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Archive className="w-3.5 h-3.5" />
                )}
                <span>
                  {bulkBusy === 'archive' && bulkProgress
                    ? `Archiving ${bulkProgress.done}/${bulkProgress.total}`
                    : 'Archive'}
                </span>
              </button>

              <button
                type="button"
                disabled={!isSuperAdmin || bulkBusy !== null}
                title={
                  !isSuperAdmin
                    ? 'Super Admin role required to permanently delete releases'
                    : 'Permanently delete selected releases'
                }
                onClick={() => setConfirmDeleteOpen(true)}
                className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-rose-400/45 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25 hover:text-white whitespace-nowrap shrink-0 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:opacity-45 disabled:cursor-not-allowed"
              >
                {bulkBusy === 'delete' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>
                  {bulkBusy === 'delete' && bulkProgress
                    ? `Deleting ${bulkProgress.done}/${bulkProgress.total}`
                    : 'Delete'}
                </span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {items.length === 0 ? (
        hasActiveSearch ? (
          <div className="luxury-card rounded-2xl p-12 text-center space-y-3">
            <Search className="w-10 h-10 text-[#00D5FF]/70 mx-auto" aria-hidden="true" />
            <p className="font-display text-lg font-semibold text-[#F5D58A]">
              No Matching Releases Found
            </p>
            <p className="text-xs text-[#8D9AAA] max-w-md mx-auto leading-relaxed">
              No {effectiveType === 'video' ? 'video releases' : effectiveType === 'audio' ? 'audio tracks' : 'tracks or video releases'} matched{' '}
              <span className="text-white font-medium">&ldquo;{queryText.trim()}&rdquo;</span> by title or artist name.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setQueryText('')}
                className="btn-electric inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Clear Search</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="luxury-card rounded-2xl p-14 text-center space-y-4">
            <img
              src={brandLogoUrl}
              alt="Music High Sky"
              referrerPolicy="no-referrer"
              className="w-16 h-16 rounded-full mx-auto object-contain ring-1 ring-[#D4AF37]/40 bg-[#030509]"
            />
            <p className="font-display text-lg font-semibold text-[#F5D58A]">
              No {effectiveType === 'video' ? 'Official Music Videos' : effectiveType === 'audio' ? 'Audio Releases' : 'Catalog Releases'} Yet
            </p>
            <p className="text-xs text-[#8D9AAA] max-w-md mx-auto leading-relaxed">
              Submit an audio master or official music video for Sunil Kumar to populate the Music High Sky library with gold-framed artwork and electric-blue waveforms.
            </p>
            <div className="pt-2 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => onCreateNew('audio')}
                className="btn-gold inline-flex items-center gap-2 px-5 py-2.5 text-xs rounded-lg cursor-pointer"
              >
                <Disc3 className="w-4 h-4" />
                Submit Audio Release
              </button>
              <button
                type="button"
                onClick={() => onCreateNew('video')}
                className="btn-electric inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-lg cursor-pointer"
              >
                <Film className="w-4 h-4" />
                Submit Official Video
              </button>
            </div>
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {items.map((rel) => {
            const track = audioTracks.find((t) => t.releaseId === rel.id);
            const video = videoReleases.find((v) => v.releaseId === rel.id);
            const tone = STATUS_COLORS[rel.status] ?? {
              text: 'text-[#C8D0DB]',
              dot: 'bg-[#C8D0DB]',
            };
            const canReplace =
              ['Draft', 'Submitted', 'Under Review', 'Metadata Correction Required'].includes(
                rel.status
              ) &&
              (currentUser?.role === 'super_admin' || rel.submittedBy === currentUser?.uid);
            const isSelected = selectedIds.has(rel.id);

            return (
              <article
                key={rel.id}
                className={`luxury-card luxury-card-hover rounded-2xl overflow-hidden flex flex-col transition-all ${
                  isSelected
                    ? '!border-[#F5D58A]/75 ring-1 ring-[#D4AF37]/45 shadow-[0_0_24px_rgba(212,175,55,0.16)]'
                    : ''
                }`}
              >
                {/* Cinematic Album / Video Cover Header */}
                <div className="p-5 flex flex-col sm:flex-row gap-5">
                  <div className="shrink-0">
                    <div className="p-1 rounded-xl bg-gradient-to-br from-[#F5D58A]/50 via-[#D4AF37]/20 to-[#00A8FF]/35">
                      {rel.artworkPreview ? (
                        <img
                          src={rel.artworkPreview}
                          alt={rel.title}
                          className={`${
                            rel.releaseType === 'video'
                              ? 'w-full sm:w-44 h-28'
                              : 'w-full sm:w-36 h-36'
                          } rounded-lg object-cover bg-[#030509]`}
                        />
                      ) : (
                        <div
                          className={`${
                            rel.releaseType === 'video'
                              ? 'w-full sm:w-44 h-28'
                              : 'w-full sm:w-36 h-36'
                          } rounded-lg bg-[#030509] flex flex-col items-center justify-center gap-2`}
                        >
                          <img
                            src={brandLogoUrl}
                            alt="Music High Sky"
                            referrerPolicy="no-referrer"
                            className="w-12 h-12 rounded-full object-contain opacity-85"
                          />
                          <span className="text-[10px] font-mono text-[#8D9AAA]">
                            {rel.releaseType === 'audio' ? 'AUDIO MASTER' : 'OFFICIAL VIDEO'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1 flex flex-col justify-between gap-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={isSelected}
                            aria-label={`Select ${rel.title}`}
                            disabled={bulkBusy !== null}
                            onClick={() => toggleSelectOne(rel.id)}
                            className="w-8 h-8 -ml-1.5 rounded-lg inline-flex items-center justify-center shrink-0 cursor-pointer hover:bg-[#06152E] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D5FF] disabled:opacity-50"
                          >
                            <span
                              aria-hidden="true"
                              className={`w-[18px] h-[18px] rounded-[4px] border flex items-center justify-center transition-colors ${
                                isSelected
                                  ? 'bg-[#D4AF37] border-[#F5D58A] text-[#030509]'
                                  : 'bg-[#030509] border-[#8D9AAA]/60 text-transparent hover:border-[#D4AF37]'
                              }`}
                            >
                              <Check className="w-3 h-3 stroke-[3]" />
                            </span>
                          </button>
                          <span className="text-[11px] font-mono tabular-nums text-[#00D5FF] truncate">
                            {rel.releaseCode}
                          </span>
                        </div>
                        <span className={`text-xs font-semibold shrink-0 ${tone.text}`}>
                          {rel.status}
                        </span>
                      </div>
                      <h3 className="font-display text-lg font-bold text-white truncate">
                        {rel.title}
                        {rel.subtitle ? ` (${rel.subtitle})` : ''}
                      </h3>
                      <p className="text-xs text-[#F5D58A] font-medium">
                        {rel.artistCredit} · {rel.labelCredit}
                      </p>
                      <p className="text-xs text-[#8D9AAA]">
                        {rel.language} · {rel.genre}
                        {rel.mood ? ` · ${rel.mood}` : ''}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono tabular-nums text-[#C8D0DB] pt-2 border-t border-[#D4AF37]/15">
                      <span>Release: {rel.plannedReleaseDate || 'Unscheduled'}</span>
                      <span>·</span>
                      <span>{(rel.targetPlatforms ?? []).length} DSPs</span>
                      {track?.durationSeconds ? (
                        <>
                          <span>·</span>
                          <span className="text-[#00D5FF]">
                            {formatDuration(track.durationSeconds)}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Integrated Electric Blue Waveform or Video Details */}
                <div className="px-5 pb-4 space-y-3">
                  {rel.releaseType === 'audio' && track && (
                    <div className="space-y-1.5">
                      <WaveformPlayer
                        peaks={track.waveformPeaks ?? []}
                        audioUrl={track.masterSourceUrl}
                        durationSeconds={track.durationSeconds}
                        label={`${rel.title} (${track.format})`}
                        compact
                      />
                      <p className="text-[11px] font-mono text-[#8D9AAA]">
                        {formatBytes(track.fileSizeBytes)} · {(track.sampleRate || 44100) / 1000}{' '}
                        kHz · {track.channels || 2}ch Studio Master
                      </p>
                    </div>
                  )}

                  {rel.releaseType === 'video' && video && (
                    <div className="space-y-2">
                      {video.masterSourceUrl && (
                        <video
                          controls
                          preload="metadata"
                          poster={video.thumbnailPreview || rel.artworkPreview}
                          src={video.masterSourceUrl}
                          className="w-full rounded-xl border border-[#00A8FF]/25 bg-black max-h-56"
                        />
                      )}
                      <div className="p-3.5 rounded-xl bg-[#030509]/75 border border-[#00A8FF]/20 text-xs space-y-1">
                        <p className="text-[#C8D0DB]">
                          <span className="text-[#8D9AAA]">Director:</span> {video.director || '—'} ·{' '}
                          <span className="text-[#8D9AAA]">Producer:</span> {video.producer || '—'}
                        </p>
                        <p className="text-[#8D9AAA]">
                          <span className="text-[#8D9AAA]">Production:</span>{' '}
                          {video.productionCompany || '—'} · {video.format} ({video.resolution || 'HD'})
                        </p>
                        {video.youtubeUrl && (
                          <a
                            href={video.youtubeUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[#00D5FF] hover:text-white pt-1"
                          >
                            <span>Watch YouTube Reference</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {rel.reviewNotes && (
                    <div className="flex items-start gap-2 text-[11px] text-[#C8D0DB] bg-[#030509]/70 border border-[#D4AF37]/20 rounded-lg px-3 py-2">
                      <AlertCircle className="w-3.5 h-3.5 text-[#F5D58A] shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{rel.reviewNotes}</span>
                    </div>
                  )}
                </div>

                {/* Card Footer Actions */}
                <div className="mt-auto px-5 py-3.5 bg-[#030509]/60 border-t border-[#D4AF37]/15 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-[#8D9AAA] truncate max-w-[55%]">
                    Lyricist: {rel.lyricist || 'Pending Admin Verification'}
                  </span>

                  <div className="flex items-center gap-2 shrink-0">
                    {rel.releaseType === 'audio' && track?.masterSourceUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          const queue: PlayerTrackItem[] = items
                            .filter((r) => r.releaseType === 'audio')
                            .map((r): PlayerTrackItem | null => {
                              const t = audioTracks.find((at) => at.releaseId === r.id);
                              if (!t?.masterSourceUrl) return null;
                              return {
                                releaseId: r.id,
                                title: r.title,
                                artistName: r.artistCredit || r.primaryArtist,
                                labelName: r.labelCredit || 'Music High Sky',
                                audioUrl: t.masterSourceUrl,
                                artworkUrl: r.artworkPreview || undefined,
                                durationSeconds: t.durationSeconds,
                                format: t.format,
                                language: r.language,
                                genre: r.genre,
                              };
                            })
                            .filter((x): x is PlayerTrackItem => x !== null);
                          const target = queue.find((q) => q.releaseId === rel.id);
                          if (target) playTrack(target, queue, headingTitle);
                        }}
                        className="btn-gold inline-flex items-center gap-1 px-3 py-1.5 text-[11px] rounded-lg cursor-pointer"
                      >
                        {currentTrack?.releaseId === rel.id && playerIsPlaying ? (
                          <>
                            <Pause className="w-3 h-3 fill-current" />
                            <span>Playing</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3 h-3 fill-current" />
                            <span>Stream</span>
                          </>
                        )}
                      </button>
                    )}

                    {canReplace && (
                      <label className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-[#C8D0DB] hover:text-white bg-[#06152E] border border-[#D4AF37]/30 rounded-lg cursor-pointer">
                        <Upload className="w-3 h-3 text-[#F5D58A]" />
                        <span>Replace Art</span>
                        <input
                          type="file"
                          accept=".jpg,.jpeg,.png"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleArtworkSwap(rel, f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    )}

                    {isStaff && ['Submitted', 'Under Review'].includes(rel.status) && (
                      <button
                        type="button"
                        disabled={busyId === rel.id}
                        onClick={() => handleQuickApprove(rel)}
                        className="btn-gold inline-flex items-center gap-1 px-3 py-1.5 text-[11px] rounded-lg cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Approve
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onNavigate('distribution')}
                      className="btn-electric px-3 py-1.5 text-[11px] font-semibold rounded-lg cursor-pointer"
                    >
                      DSP Status
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      <AnimatePresence>
        {confirmDeleteOpen && selectedReleases.length > 0 && (
          <motion.div
            key="bulk-delete-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-50 bg-[#020817]/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => {
              if (bulkBusy !== 'delete') setConfirmDeleteOpen(false);
            }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="bulk-delete-modal-title"
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.16 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl border border-rose-400/35 bg-[#06152E] shadow-[0_24px_64px_rgba(0,0,0,0.75)] p-6 space-y-5"
            >
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-400/40 text-rose-300 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3
                    id="bulk-delete-modal-title"
                    className="font-display text-lg font-bold text-white"
                  >
                    Delete {selectedReleases.length}{' '}
                    {selectedReleases.length === 1 ? 'Release' : 'Releases'}?
                  </h3>
                  <p className="text-xs text-[#C8D0DB] mt-1 leading-relaxed">
                    This permanently removes the selected release records from Music High Sky. This action cannot be undone.
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-[#030509]/85 border border-[#D4AF37]/20 p-3 max-h-44 overflow-y-auto space-y-1.5">
                {selectedReleases.slice(0, 6).map((rel) => (
                  <div
                    key={rel.id}
                    className="flex items-center justify-between gap-2 text-xs py-0.5"
                  >
                    <span className="text-white font-medium truncate">{rel.title}</span>
                    <span className="font-mono tabular-nums text-[11px] text-[#8D9AAA] shrink-0">
                      {rel.releaseCode}
                    </span>
                  </div>
                ))}
                {selectedReleases.length > 6 && (
                  <p className="text-[11px] font-mono text-[#F5D58A] pt-1 border-t border-[#D4AF37]/15">
                    +{selectedReleases.length - 6} additional{' '}
                    {selectedReleases.length - 6 === 1 ? 'release' : 'releases'}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={bulkBusy === 'delete'}
                  onClick={() => setConfirmDeleteOpen(false)}
                  className="min-h-[40px] px-4 py-2 text-xs font-semibold rounded-lg border border-[#D4AF37]/30 bg-[#030509] text-[#C8D0DB] hover:text-white hover:border-[#D4AF37]/60 whitespace-nowrap cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D5FF] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={bulkBusy === 'delete'}
                  onClick={handleBulkDeleteConfirmed}
                  className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-500 text-white whitespace-nowrap cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:opacity-60"
                >
                  {bulkBusy === 'delete' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {bulkBusy === 'delete' && bulkProgress
                      ? `Deleting ${bulkProgress.done}/${bulkProgress.total}`
                      : `Delete ${selectedReleases.length} ${selectedReleases.length === 1 ? 'Release' : 'Releases'}`}
                  </span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
