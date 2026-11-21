import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Play,
  Pause,
  ListMusic,
  Plus,
  Edit3,
  Save,
  X,
  ArrowUp,
  ArrowDown,
  Trash2,
  RefreshCw,
  Upload,
  Film,
  Music,
  Sparkles,
} from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { usePlayer, type PlayerTrackItem } from '../context/PlayerContext';
import {
  addReleaseToPlaylist,
  createCustomPlaylist,
  removeTrackFromPlaylist,
  swapPlaylistTrackPositions,
  updatePlaylistMetadata,
} from '../services/firestoreService';
import { uploadStructuredMediaToStorage } from '../services/storageService';
import { formatDuration, validateAndCompressArtwork } from '../utils/mediaValidation';
import type { PlaylistRecord, ReleaseRecord } from '../types';

export const PlaylistsView: React.FC = () => {
  const {
    currentUser,
    brandLogoUrl,
    playlists,
    playlistTracks,
    releases,
    audioTracks,
    videoReleases,
    resyncOfficialPlaylists,
    pushToast,
  } = usePlatform();
  const { currentTrack, isPlaying, playPlaylist, playTrack } = usePlayer();

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [editingPlaylist, setEditingPlaylist] = useState<PlaylistRecord | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editOrder, setEditOrder] = useState(1);
  const [editFeatured, setEditFeatured] = useState(false);
  const [editCoverUrl, setEditCoverUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [creatingNew, setCreatingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newMediaKind, setNewMediaKind] = useState<'audio' | 'video' | 'mixed'>('audio');

  const [addTrackReleaseId, setAddTrackReleaseId] = useState('');

  const isStaff = currentUser?.role === 'super_admin' || currentUser?.role === 'label_manager';

  const releaseById = useMemo(() => {
    const map = new Map<string, ReleaseRecord>();
    for (const r of releases) map.set(r.id, r);
    return map;
  }, [releases]);

  const audioByReleaseId = useMemo(() => {
    const map = new Map<string, (typeof audioTracks)[number]>();
    for (const t of audioTracks) map.set(t.releaseId, t);
    return map;
  }, [audioTracks]);

  const videoByReleaseId = useMemo(() => {
    const map = new Map<string, (typeof videoReleases)[number]>();
    for (const v of videoReleases) map.set(v.releaseId, v);
    return map;
  }, [videoReleases]);

  const linksByPlaylist = useMemo(() => {
    const map = new Map<string, (typeof playlistTracks)[number][]>();
    for (const link of playlistTracks) {
      if (!releaseById.has(link.releaseId)) continue;
      if (!map.has(link.playlistId)) map.set(link.playlistId, []);
      map.get(link.playlistId)!.push(link);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.position - b.position);
    }
    return map;
  }, [playlistTracks, releaseById]);

  const activePlaylist = useMemo(() => {
    if (selectedPlaylistId) {
      const found = playlists.find((p) => p.id === selectedPlaylistId);
      if (found) return found;
    }
    return playlists[0] || null;
  }, [playlists, selectedPlaylistId]);

  const activePlaylistEntries = useMemo(() => {
    if (!activePlaylist) return [];
    const links = linksByPlaylist.get(activePlaylist.id) || [];
    return links
      .map((link) => {
        const release = releaseById.get(link.releaseId);
        if (!release) return null;
        return {
          link,
          release,
          audio: audioByReleaseId.get(release.id),
          video: videoByReleaseId.get(release.id),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [activePlaylist, linksByPlaylist, releaseById, audioByReleaseId, videoByReleaseId]);

  const buildPlayableQueueForPlaylist = (playlist: PlaylistRecord): PlayerTrackItem[] => {
    const links = linksByPlaylist.get(playlist.id) || [];
    const items: PlayerTrackItem[] = [];
    for (const link of links) {
      const rel = releaseById.get(link.releaseId);
      const track = rel ? audioByReleaseId.get(rel.id) : undefined;
      if (rel && rel.releaseType === 'audio' && track?.masterSourceUrl) {
        items.push({
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
        });
      }
    }
    return items;
  };

  const handlePlayEntirePlaylist = (playlist: PlaylistRecord, startReleaseId?: string) => {
    const queue = buildPlayableQueueForPlaylist(playlist);
    if (queue.length === 0) {
      pushToast(
        playlist.mediaKind === 'video'
          ? 'Video playlist items play inline below when video files are imported.'
          : 'No playable audio tracks are assigned to this playlist yet.',
        'info'
      );
      return;
    }
    const startIdx = startReleaseId
      ? Math.max(
          0,
          queue.findIndex((q) => q.releaseId === startReleaseId)
        )
      : 0;
    if (startReleaseId && queue[startIdx]?.releaseId === currentTrack?.releaseId) {
      playTrack(queue[startIdx], queue, playlist.name);
    } else {
      playPlaylist(queue, playlist.name, startIdx);
    }
  };

  const openEditModal = (pl: PlaylistRecord) => {
    setEditingPlaylist(pl);
    setEditName(pl.name);
    setEditDescription(pl.description);
    setEditOrder(pl.displayOrder);
    setEditFeatured(Boolean(pl.featured));
    setEditCoverUrl(pl.coverArtworkUrl || '');
  };

  const handleUploadPlaylistCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingPlaylist) return;
    setSaving(true);
    try {
      try {
        const uploaded = await uploadStructuredMediaToStorage({
          file,
          area: 'playlist_cover',
          originalFileName: `${editingPlaylist.slug}-${file.name}`,
          artistSlug: 'sunil-kumar',
          contentType: file.type,
        });
        setEditCoverUrl(uploaded.downloadUrl);
        pushToast('Playlist cover uploaded to Firebase Storage.', 'success');
      } catch {
        const compressed = await validateAndCompressArtwork(file, 'cover_art');
        setEditCoverUrl(compressed.previewDataUrl);
        pushToast('Playlist cover prepared for Firestore save.', 'info');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to process playlist cover.', 'error');
    } finally {
      setSaving(false);
      e.target.value = '';
    }
  };

  const handleSavePlaylistEdit = async () => {
    if (!editingPlaylist || !currentUser || !editName.trim()) return;
    setSaving(true);
    try {
      await updatePlaylistMetadata({
        playlistId: editingPlaylist.id,
        name: editName,
        description: editDescription,
        coverArtworkUrl: editCoverUrl,
        featured: editFeatured,
        displayOrder: editOrder,
        actor: currentUser,
      });
      setEditingPlaylist(null);
      pushToast(`Updated playlist "${editName}".`, 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to update playlist.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePlaylist = async () => {
    if (!currentUser || !newName.trim()) return;
    setSaving(true);
    try {
      const id = await createCustomPlaylist({
        name: newName,
        description: newDescription || 'Curated Sunil Kumar playlist on Music High Sky.',
        mediaKind: newMediaKind,
        displayOrder: playlists.length + 1,
        actor: currentUser,
      });
      setCreatingNew(false);
      setNewName('');
      setNewDescription('');
      setSelectedPlaylistId(id);
      pushToast(`Created official playlist "${newName}".`, 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to create playlist.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddTrack = async () => {
    if (!activePlaylist || !addTrackReleaseId || !currentUser) return;
    const existingLinks = linksByPlaylist.get(activePlaylist.id) || [];
    if (existingLinks.some((l) => l.releaseId === addTrackReleaseId)) {
      pushToast('This release is already in the selected playlist.', 'info');
      return;
    }
    const maxPos = existingLinks.reduce((m, l) => Math.max(m, l.position), -1);
    try {
      await addReleaseToPlaylist({
        playlistId: activePlaylist.id,
        releaseId: addTrackReleaseId,
        position: maxPos + 1,
        actor: currentUser,
      });
      setAddTrackReleaseId('');
      pushToast(`Added track to "${activePlaylist.name}".`, 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to add track.', 'error');
    }
  };

  const handleRemoveTrack = async (linkId: string) => {
    try {
      await removeTrackFromPlaylist(linkId);
      pushToast('Removed track from playlist.', 'info');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to remove track.', 'error');
    }
  };

  const handleMoveTrack = async (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= activePlaylistEntries.length) return;
    const a = activePlaylistEntries[index].link;
    const b = activePlaylistEntries[targetIdx].link;
    try {
      await swapPlaylistTrackPositions(
        { id: a.id, position: a.position },
        { id: b.id, position: b.position }
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to reorder track.', 'error');
    }
  };

  const handleSyncOfficial = async () => {
    setSyncing(true);
    try {
      await resyncOfficialPlaylists();
    } finally {
      setSyncing(false);
    }
  };

  const availableToAdd = useMemo(() => {
    if (!activePlaylist) return [];
    const present = new Set((linksByPlaylist.get(activePlaylist.id) || []).map((l) => l.releaseId));
    return releases.filter((r) => {
      if (present.has(r.id)) return false;
      if (activePlaylist.mediaKind === 'audio') return r.releaseType === 'audio';
      if (activePlaylist.mediaKind === 'video') return r.releaseType === 'video';
      return true;
    });
  }, [activePlaylist, linksByPlaylist, releases]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-8"
    >
      {/* Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-[#00D5FF] mb-1">
            OFFICIAL ARTIST PLAYLISTS · SUNIL KUMAR · MUSIC HIGH SKY
          </p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-gold-gradient tracking-wide">
            Curated Artist Playlists
          </h2>
          <p className="text-sm text-[#8D9AAA] mt-1">
            Database-driven playlists automatically categorized from verified Sunil Kumar release metadata and editable by Music High Sky administrators.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {isStaff && (
            <>
              <button
                type="button"
                disabled={syncing}
                onClick={handleSyncOfficial}
                className="btn-electric inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                Sync Official Playlists
              </button>
              <button
                type="button"
                onClick={() => setCreatingNew(true)}
                className="btn-gold inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                New Playlist
              </button>
            </>
          )}
        </div>
      </div>

      {/* 9+ Official Playlists Grid */}
      <section aria-label="Official Playlists Directory" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {playlists.map((pl) => {
          const entries = linksByPlaylist.get(pl.id) || [];
          const isSelected = activePlaylist?.id === pl.id;
          const coverUrl =
            pl.coverArtworkUrl ||
            entries.map((e) => releaseById.get(e.releaseId)?.artworkPreview).find(Boolean) ||
            '';

          return (
            <article
              key={pl.id}
              onClick={() => setSelectedPlaylistId(pl.id)}
              className={`luxury-card luxury-card-hover rounded-2xl p-4 flex items-center gap-4 cursor-pointer transition-all ${
                isSelected
                  ? 'border-[#F5D58A]/70 shadow-[0_0_26px_-10px_rgba(212,175,55,0.45)]'
                  : 'border-[#D4AF37]/20'
              }`}
            >
              <div className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0 border border-[#D4AF37]/35 bg-[#030509]">
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt={pl.name}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-[radial-gradient(circle_at_50%_40%,rgba(0,168,255,0.16),transparent_65%),#030509]">
                    <img
                      src={brandLogoUrl}
                      alt="Music High Sky"
                      className="w-12 h-12 rounded-full object-contain"
                    />
                  </div>
                )}
                {pl.mediaKind !== 'video' && entries.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlayEntirePlaylist(pl);
                    }}
                    aria-label={`Play ${pl.name}`}
                    className="absolute bottom-1.5 right-1.5 w-8 h-8 rounded-full btn-gold flex items-center justify-center shadow-lg cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 ml-0.5 fill-current" />
                  </button>
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#00D5FF]">
                    {pl.mediaKind === 'video' ? 'Video Playlist' : 'Official Playlist'}
                  </span>
                  {pl.featured && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#F5D58A]">
                      <Sparkles className="w-3 h-3" />
                      Featured
                    </span>
                  )}
                </div>
                <h3 className="font-display text-sm font-bold text-white truncate">{pl.name}</h3>
                <p className="text-[11px] text-[#8D9AAA] line-clamp-2 leading-snug">
                  {pl.description}
                </p>
                <p className="text-[11px] font-mono text-[#F5D58A] pt-0.5">
                  {entries.length} {entries.length === 1 ? 'release' : 'releases'} · Sunil Kumar
                </p>
              </div>
            </article>
          );
        })}
      </section>

      {/* Active Playlist Tracklist & Admin Curation Console */}
      {activePlaylist && (
        <section className="luxury-card rounded-2xl overflow-hidden border-[#D4AF37]/35">
          <div className="p-6 border-b border-[#D4AF37]/20 flex flex-col md:flex-row md:items-center justify-between gap-5 bg-gradient-to-r from-[#06152E]/90 via-[#040D22] to-[#020817]">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-24 h-24 rounded-2xl overflow-hidden border border-[#D4AF37]/50 bg-[#030509] shrink-0">
                {activePlaylist.coverArtworkUrl ||
                activePlaylistEntries.find((e) => e.release.artworkPreview)?.release.artworkPreview ? (
                  <img
                    src={
                      activePlaylist.coverArtworkUrl ||
                      activePlaylistEntries.find((e) => e.release.artworkPreview)?.release
                        .artworkPreview
                    }
                    alt={activePlaylist.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center p-2">
                    <img
                      src={brandLogoUrl}
                      alt="Music High Sky"
                      className="w-16 h-16 rounded-full object-contain"
                    />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-[#00D5FF]">
                  {activePlaylist.label} · {activePlaylist.artistName}
                </p>
                <h3 className="font-display text-xl sm:text-2xl font-bold text-[#F5D58A] truncate mt-0.5">
                  {activePlaylist.name}
                </h3>
                <p className="text-xs text-[#C8D0DB] mt-1 max-w-2xl leading-relaxed">
                  {activePlaylist.description}
                </p>
                <p className="text-[11px] font-mono text-[#8D9AAA] mt-1.5">
                  {activePlaylistEntries.length} track{activePlaylistEntries.length === 1 ? '' : 's'}
                  {activePlaylist.autoRule ? ` · Auto-Rule: ${activePlaylist.autoRule}` : ''}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {activePlaylist.mediaKind !== 'video' && (
                <button
                  type="button"
                  onClick={() => handlePlayEntirePlaylist(activePlaylist)}
                  className="btn-gold inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Play Playlist
                </button>
              )}
              {isStaff && (
                <button
                  type="button"
                  onClick={() => openEditModal(activePlaylist)}
                  className="btn-electric inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-xl cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Edit Playlist
                </button>
              )}
            </div>
          </div>

          {/* Admin Add Track Bar */}
          {isStaff && availableToAdd.length > 0 && (
            <div className="px-6 py-3.5 border-b border-[#D4AF37]/15 bg-[#030509]/50 flex flex-wrap items-center gap-3">
              <span className="text-xs font-semibold text-[#C8D0DB]">Add Song to Playlist:</span>
              <select
                value={addTrackReleaseId}
                onChange={(e) => setAddTrackReleaseId(e.target.value)}
                className="flex-1 min-w-[220px] max-w-md px-3 py-2 text-xs luxury-input rounded-lg"
              >
                <option value="">Select a verified Sunil Kumar release...</option>
                {availableToAdd.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title} ({r.releaseType.toUpperCase()} · {r.language} · {r.genre})
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!addTrackReleaseId}
                onClick={handleAddTrack}
                className="btn-gold px-4 py-2 text-xs font-bold rounded-lg disabled:opacity-40 cursor-pointer"
              >
                Add Track
              </button>
            </div>
          )}

          {/* Tracklist */}
          {activePlaylistEntries.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <ListMusic className="w-8 h-8 text-[#D4AF37]/60 mx-auto" />
              <p className="font-display text-sm font-semibold text-[#F5D58A]">
                No Verified Songs Assigned Yet
              </p>
              <p className="text-xs text-[#8D9AAA] max-w-md mx-auto">
                Only releases with verified matching metadata are auto-assigned to category playlists. Update a song&apos;s genre/mood or add songs manually above.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#D4AF37]/10">
              {activePlaylistEntries.map((entry, idx) => {
                const { release, audio, video, link } = entry;
                const isCurrentlyPlaying =
                  currentTrack?.releaseId === release.id && isPlaying;
                return (
                  <div
                    key={link.id}
                    className={`px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                      isCurrentlyPlaying ? 'bg-[#00A8FF]/10' : 'hover:bg-[#06152E]/60'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <span className="text-xs font-mono text-[#8D9AAA] w-6 text-right shrink-0">
                        {idx + 1}
                      </span>

                      {release.releaseType === 'audio' && audio?.masterSourceUrl ? (
                        <button
                          type="button"
                          onClick={() => handlePlayEntirePlaylist(activePlaylist, release.id)}
                          aria-label={isCurrentlyPlaying ? `Pause ${release.title}` : `Play ${release.title}`}
                          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 cursor-pointer ${
                            isCurrentlyPlaying
                              ? 'bg-[#00D5FF] text-[#020817]'
                              : 'bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#F5D58A] hover:bg-[#D4AF37] hover:text-[#030509]'
                          }`}
                        >
                          {isCurrentlyPlaying ? (
                            <Pause className="w-3.5 h-3.5 fill-current" />
                          ) : (
                            <Play className="w-3.5 h-3.5 ml-0.5 fill-current" />
                          )}
                        </button>
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-[#06152E] border border-[#00A8FF]/30 flex items-center justify-center text-[#00D5FF] shrink-0">
                          {release.releaseType === 'video' ? (
                            <Film className="w-4 h-4" />
                          ) : (
                            <Music className="w-4 h-4" />
                          )}
                        </div>
                      )}

                      {release.artworkPreview ? (
                        <img
                          src={release.artworkPreview}
                          alt={release.title}
                          className="w-11 h-11 rounded-lg object-cover border border-[#D4AF37]/30 shrink-0"
                        />
                      ) : (
                        <img
                          src={brandLogoUrl}
                          alt="Music High Sky"
                          className="w-11 h-11 rounded-lg object-contain bg-[#020817] border border-[#D4AF37]/30 p-1 shrink-0"
                        />
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white truncate">
                          {release.title}
                        </p>
                        <p className="text-xs text-[#8D9AAA] truncate">
                          <span className="text-[#F5D58A]">{release.artistCredit || 'Sunil Kumar'}</span> ·{' '}
                          {release.language} · {release.genre}
                          {release.plannedReleaseDate ? ` · ${release.plannedReleaseDate}` : ''}
                        </p>
                        {release.releaseType === 'video' && video?.masterSourceUrl && (
                          <video
                            controls
                            preload="metadata"
                            poster={video.thumbnailPreview || release.artworkPreview}
                            src={video.masterSourceUrl}
                            className="mt-2 rounded-lg border border-[#00A8FF]/30 max-h-48 w-full max-w-md bg-black"
                          />
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 shrink-0">
                      {audio?.durationSeconds ? (
                        <span className="text-xs font-mono text-[#00D5FF] tabular-nums mr-2">
                          {formatDuration(audio.durationSeconds)}
                        </span>
                      ) : null}

                      {isStaff && (
                        <>
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => void handleMoveTrack(idx, -1)}
                            aria-label="Move track up"
                            className="p-1.5 rounded-lg border border-[#D4AF37]/20 text-[#C8D0DB] hover:text-white disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === activePlaylistEntries.length - 1}
                            onClick={() => void handleMoveTrack(idx, 1)}
                            aria-label="Move track down"
                            className="p-1.5 rounded-lg border border-[#D4AF37]/20 text-[#C8D0DB] hover:text-white disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRemoveTrack(link.id)}
                            aria-label="Remove from playlist"
                            className="p-1.5 rounded-lg border border-rose-500/25 text-rose-300 hover:bg-rose-950/40 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Edit Playlist Modal */}
      {editingPlaylist && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="luxury-card rounded-2xl max-w-lg w-full border border-[#D4AF37]/40 p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-[#D4AF37]/20 pb-3">
              <h3 className="font-display text-lg font-bold text-[#F5D58A]">
                Edit Playlist Details
              </h3>
              <button
                type="button"
                onClick={() => setEditingPlaylist(null)}
                className="text-[#8D9AAA] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-[#C8D0DB] mb-1.5">Playlist Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                />
              </div>

              <div>
                <label className="block text-[#C8D0DB] mb-1.5">Description</label>
                <textarea
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#C8D0DB] mb-1.5">Display Order</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={editOrder}
                    onChange={(e) => setEditOrder(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-[#030509] border border-[#D4AF37]/25 w-full cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editFeatured}
                      onChange={(e) => setEditFeatured(e.target.checked)}
                      className="accent-[#D4AF37]"
                    />
                    <span className="text-white font-medium">Feature on Dashboard</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-1">
                {editCoverUrl ? (
                  <img
                    src={editCoverUrl}
                    alt="Playlist cover preview"
                    className="w-16 h-16 rounded-xl object-cover border border-[#D4AF37]/40"
                  />
                ) : (
                  <img
                    src={brandLogoUrl}
                    alt="Music High Sky"
                    className="w-16 h-16 rounded-xl object-contain bg-[#020817] border border-[#D4AF37]/40 p-1.5"
                  />
                )}
                <label className="btn-electric inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Playlist Cover</span>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp"
                    onChange={handleUploadPlaylistCover}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#D4AF37]/20">
              <button
                type="button"
                onClick={() => setEditingPlaylist(null)}
                className="px-4 py-2 text-xs text-[#C8D0DB] hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSavePlaylistEdit}
                className="btn-gold inline-flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-lg disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create New Custom Playlist Modal */}
      {creatingNew && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="luxury-card rounded-2xl max-w-md w-full border border-[#D4AF37]/40 p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-[#D4AF37]/20 pb-3">
              <h3 className="font-display text-lg font-bold text-[#F5D58A]">
                Create Official Playlist
              </h3>
              <button
                type="button"
                onClick={() => setCreatingNew(false)}
                className="text-[#8D9AAA] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-[#C8D0DB] mb-1.5">Playlist Title</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Sunil Kumar Devotional Classics"
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5">Description</label>
                <textarea
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Curated playlist description..."
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5">Media Format</label>
                <select
                  value={newMediaKind}
                  onChange={(e) => setNewMediaKind(e.target.value as 'audio' | 'video' | 'mixed')}
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                >
                  <option value="audio">Audio Songs</option>
                  <option value="video">Official Music Videos</option>
                  <option value="mixed">Audio &amp; Video Mixed</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#D4AF37]/20">
              <button
                type="button"
                onClick={() => setCreatingNew(false)}
                className="px-4 py-2 text-xs text-[#C8D0DB] hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !newName.trim()}
                onClick={handleCreatePlaylist}
                className="btn-gold inline-flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-lg disabled:opacity-50 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Create Playlist
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};
