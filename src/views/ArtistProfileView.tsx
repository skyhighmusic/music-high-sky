import React, { useEffect, useMemo, useState } from 'react';
import {
  Edit3,
  Save,
  X,
  ExternalLink,
  Upload,
  Download,
  Search,
  Music,
  Film,
  AlertCircle,
  Play,
  Pause,
  ListMusic,
  Star,
} from 'lucide-react';
import { STATUS_COLORS } from '../constants';
import { usePlatform } from '../context/PlatformContext';
import { usePlayer, type PlayerTrackItem } from '../context/PlayerContext';
import { updateArtistProfileRecord } from '../services/firestoreService';
import type { ArtistProfile, NavSection, ReleaseRecord } from '../types';
import { formatDuration, validateAndCompressArtwork } from '../utils/mediaValidation';
import { exportArtistProfilePdf } from '../utils/reportExport';
import { WaveformPlayer } from '../components/WaveformPlayer';

interface ArtistProfileViewProps {
  onNavigate?: (section: NavSection) => void;
}

type DiscographyFilterMode = 'all' | 'audio' | 'video' | 'latest' | 'oldest';

export const ArtistProfileView: React.FC<ArtistProfileViewProps> = ({ onNavigate }) => {
  const {
    artist,
    brandLogoUrl,
    artistPhotoUrl,
    currentUser,
    releases,
    audioTracks,
    videoReleases,
    playlists,
    playlistTracks,
    pushToast,
  } = usePlatform();
  const { currentTrack, isPlaying: playerIsPlaying, playTrack, playPlaylist } = usePlayer();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ArtistProfile>(artist);
  const [saving, setSaving] = useState(false);
  const [discographyQuery, setDiscographyQuery] = useState('');
  const [discographyFilter, setDiscographyFilter] = useState<DiscographyFilterMode>('all');

  const isSuperAdmin = currentUser?.role === 'super_admin';

  useEffect(() => {
    setDraft(artist);
  }, [artist]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await validateAndCompressArtwork(file, 'cover_art');
      setDraft((prev) => ({ ...prev, profilePhotoUrl: res.previewDataUrl }));
      pushToast('Profile portrait updated in draft. Click Save Profile to publish.', 'info');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to process portrait image.', 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleSave = async () => {
    if (!currentUser) return;
    setSaving(true);
    try {
      await updateArtistProfileRecord(draft, currentUser);
      setEditing(false);
      pushToast('Official artist profile for Sunil Kumar saved to Firestore.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to update artist profile.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const sunilReleases = useMemo(() => {
    const q = discographyQuery.trim().toLowerCase();
    const list = releases
      .filter((r) => {
        const artistStr = `${r.primaryArtist} ${r.artistCredit}`.toLowerCase();
        return artistStr.includes('sunil kumar') || r.distributorLabel === 'Music High Sky';
      })
      .filter((r) => {
        if (discographyFilter === 'audio') return r.releaseType === 'audio';
        if (discographyFilter === 'video') return r.releaseType === 'video';
        return true;
      })
      .filter((r) => {
        if (!q) return true;
        return (
          r.title.toLowerCase().includes(q) ||
          r.releaseCode.toLowerCase().includes(q) ||
          r.genre.toLowerCase().includes(q) ||
          r.language.toLowerCase().includes(q)
        );
      });

    if (discographyFilter === 'latest') {
      return [...list].sort((a, b) =>
        (b.plannedReleaseDate || b.submissionDate || '').localeCompare(
          a.plannedReleaseDate || a.submissionDate || ''
        )
      );
    }
    if (discographyFilter === 'oldest') {
      return [...list].sort((a, b) =>
        (a.plannedReleaseDate || a.submissionDate || '').localeCompare(
          b.plannedReleaseDate || b.submissionDate || ''
        )
      );
    }
    return list;
  }, [releases, discographyFilter, discographyQuery]);

  const trackByReleaseId = useMemo(() => {
    const map = new Map<string, (typeof audioTracks)[number]>();
    for (const trk of audioTracks) map.set(trk.releaseId, trk);
    return map;
  }, [audioTracks]);

  const videoByReleaseId = useMemo(() => {
    const map = new Map<string, (typeof videoReleases)[number]>();
    for (const vid of videoReleases) map.set(vid.releaseId, vid);
    return map;
  }, [videoReleases]);

  const playableDiscographyQueue: PlayerTrackItem[] = useMemo(() => {
    return sunilReleases
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
  }, [sunilReleases, trackByReleaseId]);

  const handlePlayReleaseInBar = (rel: ReleaseRecord) => {
    const trk = trackByReleaseId.get(rel.id);
    if (!trk?.masterSourceUrl) return;
    playTrack(
      {
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
      },
      playableDiscographyQueue,
      'Sunil Kumar – Official Discography'
    );
  };

  const handlePlayArtistPlaylist = (playlistId: string, playlistName: string) => {
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
    if (queue.length > 0) {
      playPlaylist(queue, playlistName, 0);
    } else if (onNavigate) {
      onNavigate('playlists');
    }
  };

  const featuredSongs = useMemo(() => {
    const pinned = releases.filter((r) => r.featured);
    return (pinned.length > 0 ? pinned : releases).slice(0, 4);
  }, [releases]);

  const audioCount = releases.filter((r) => r.releaseType === 'audio').length;
  const videoCount = releases.filter((r) => r.releaseType === 'video').length;

  return (
    <div className="space-y-8">
      {/* Header Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#00D5FF] mb-1">
            Official Artist Dossier · Music High Sky
          </p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-gold-gradient tracking-wide">
            {artist.name}
          </h2>
          <p className="text-sm text-[#C8D0DB] mt-1">
            {artist.professions.join(' · ')}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() =>
              exportArtistProfilePdf(artist, releases.length, 'Music-High-Sky-Sunil-Kumar-Profile.pdf')
            }
            className="btn-electric inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-xl whitespace-nowrap cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Export Profile PDF
          </button>
          {isSuperAdmin && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="btn-gold inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl whitespace-nowrap cursor-pointer"
            >
              <Edit3 className="w-4 h-4" />
              Edit Profile
            </button>
          )}
        </div>
      </div>

      {/* Main 2-Column Profile Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Gold-Framed Portrait & Identity Card */}
        <div className="lg:col-span-4 luxury-card rounded-2xl overflow-hidden border-[#D4AF37]/35 shadow-[0_18px_46px_-18px_rgba(212,175,55,0.28)]">
          <div className="relative aspect-[4/4.3] bg-[#030509]">
            <img
              src={draft.profilePhotoUrl || artistPhotoUrl}
              alt={`${artist.name} Official Studio Portrait`}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-top"
            />
            <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-[#030816] via-[#030816]/80 to-transparent" />
            <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between gap-3">
              <div>
                <p className="font-script text-3xl text-[#F5D58A] leading-none drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
                  {artist.name}
                </p>
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#00D5FF] font-semibold mt-1">
                  {artist.label}
                </p>
              </div>
              <img
                src={brandLogoUrl}
                alt="Music High Sky Emblem"
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-full object-contain ring-1 ring-[#D4AF37]/60 bg-[#020817] shrink-0"
              />
            </div>
          </div>

          <div className="p-5 space-y-4">
            {editing && (
              <label className="btn-electric w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold rounded-xl cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Change Artist Portrait</span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>
            )}

            <div className="grid grid-cols-3 gap-2.5 pt-1">
              <div className="p-3 rounded-xl bg-[#030509]/75 border border-[#D4AF37]/25">
                <span className="text-[10px] text-[#8D9AAA] block">Total</span>
                <span className="text-xl font-bold font-mono tabular-nums text-white">
                  {releases.length}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#030509]/75 border border-[#D4AF37]/20">
                <span className="text-[10px] text-[#8D9AAA] block">Audio</span>
                <span className="text-xl font-bold font-mono tabular-nums text-[#F5D58A]">
                  {audioCount}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#030509]/75 border border-[#00A8FF]/25">
                <span className="text-[10px] text-[#8D9AAA] block">Videos</span>
                <span className="text-xl font-bold font-mono tabular-nums text-[#00D5FF]">
                  {videoCount}
                </span>
              </div>
            </div>

            <div className="gold-divider" />

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-[#8D9AAA]">Distributor Label</span>
                <span className="text-[#F5D58A] font-semibold">{artist.label}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#8D9AAA]">Primary Market</span>
                <span className="text-white">{artist.primaryMarket || 'India'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#8D9AAA]">Distribution Scope</span>
                <span className="text-[#00D5FF] font-medium">
                  {artist.distributionScope || 'Worldwide'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Biography, Genres, Social Links & Official Credit Block */}
        <div className="lg:col-span-8 space-y-6">
          {editing ? (
            <div className="luxury-card rounded-2xl p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-[#D4AF37]/20 pb-4">
                <h3 className="font-display text-lg font-semibold text-[#F5D58A]">
                  Edit Official Artist Profile
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(artist);
                    setEditing(false);
                  }}
                  className="text-[#8D9AAA] hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-[#C8D0DB] mb-1.5">Artist Name</label>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[#C8D0DB] mb-1.5">Official Music Label</label>
                  <input
                    type="text"
                    value={draft.label}
                    onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                    className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[#C8D0DB] mb-1.5">
                    Professional Roles (comma separated)
                  </label>
                  <input
                    type="text"
                    value={draft.professions.join(', ')}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        professions: e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[#C8D0DB] mb-1.5">
                    Primary Languages (comma separated)
                  </label>
                  <input
                    type="text"
                    value={draft.languages.join(', ')}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        languages: e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[#C8D0DB] mb-1.5">
                    Music Genres (comma separated)
                  </label>
                  <input
                    type="text"
                    value={draft.genres.join(', ')}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        genres: e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[#C8D0DB] mb-1.5">Artist Biography</label>
                  <textarea
                    rows={4}
                    value={draft.biography}
                    onChange={(e) => setDraft({ ...draft, biography: e.target.value })}
                    className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[#C8D0DB] mb-1.5">Spotify Artist Profile URL</label>
                  <input
                    type="url"
                    value={draft.spotifyUrl || ''}
                    onChange={(e) => setDraft({ ...draft, spotifyUrl: e.target.value })}
                    placeholder="https://open.spotify.com/artist/..."
                    className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[#C8D0DB] mb-1.5">YouTube Official Channel URL</label>
                  <input
                    type="url"
                    value={draft.youtubeUrl || ''}
                    onChange={(e) => setDraft({ ...draft, youtubeUrl: e.target.value })}
                    placeholder="https://youtube.com/@..."
                    className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[#C8D0DB] mb-1.5">Instagram Profile URL</label>
                  <input
                    type="url"
                    value={draft.instagramUrl || ''}
                    onChange={(e) => setDraft({ ...draft, instagramUrl: e.target.value })}
                    placeholder="https://instagram.com/..."
                    className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[#C8D0DB] mb-1.5">Facebook Page URL</label>
                  <input
                    type="url"
                    value={draft.facebookUrl || ''}
                    onChange={(e) => setDraft({ ...draft, facebookUrl: e.target.value })}
                    placeholder="https://facebook.com/..."
                    className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(artist);
                    setEditing(false);
                  }}
                  className="px-4 py-2 text-xs font-medium text-[#C8D0DB] hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSave}
                  className="btn-gold inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="luxury-card rounded-2xl p-6 space-y-5">
                <div>
                  <h3 className="font-display text-lg font-semibold text-[#F5D58A] mb-2">
                    Artist Biography
                  </h3>
                  <p className="text-sm text-[#C8D0DB] leading-relaxed">{artist.biography}</p>
                </div>

                <div className="gold-divider" />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-[11px] uppercase tracking-[0.18em] font-semibold text-[#00D5FF] mb-2">
                      Music Genres
                    </h4>
                    <p className="text-sm text-white leading-relaxed">
                      {artist.genres.join(' · ')}
                    </p>
                  </div>
                  <div>
                    <h4 className="text-[11px] uppercase tracking-[0.18em] font-semibold text-[#F5D58A] mb-2">
                      Primary Languages
                    </h4>
                    <p className="text-sm text-white leading-relaxed">
                      {artist.languages.join(' · ')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Official Social & DSP Links */}
              <div className="luxury-card rounded-2xl p-6 space-y-4">
                <h3 className="font-display text-lg font-semibold text-[#F5D58A]">
                  Official Streaming &amp; Social Profiles
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {[
                    { label: 'Spotify Artist Profile', url: artist.spotifyUrl },
                    { label: 'YouTube Official Channel', url: artist.youtubeUrl },
                    { label: 'Instagram Profile', url: artist.instagramUrl },
                    { label: 'Facebook Page', url: artist.facebookUrl },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="p-3.5 rounded-xl bg-[#030509]/75 border border-[#D4AF37]/20 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <span className="block text-[#8D9AAA] mb-0.5">{item.label}</span>
                        <span className="block text-white truncate font-mono text-[11px]">
                          {item.url || 'Not linked yet'}
                        </span>
                      </div>
                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 text-[#00D5FF] hover:text-[#F5D58A] shrink-0 transition-colors"
                          aria-label={`Open ${item.label}`}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Standardized Official Release Credit Format */}
              <div className="luxury-card rounded-2xl p-6 space-y-3">
                <h3 className="font-display text-lg font-semibold text-[#F5D58A]">
                  Standardized Official Release Credit Format
                </h3>
                <p className="text-xs text-[#8D9AAA]">
                  Pre-configured automatically on every new Music High Sky release submission (overridable per track).
                </p>
                <div className="p-4 rounded-xl bg-[#030509]/80 border border-[#D4AF37]/25 font-mono text-xs text-[#C8D0DB] space-y-1.5">
                  <p>
                    <span className="text-[#F5D58A]">Artist:</span> {artist.name}
                  </p>
                  <p>
                    <span className="text-[#F5D58A]">Label / Distributor:</span> {artist.label}
                  </p>
                  <p>
                    <span className="text-[#F5D58A]">Release Title:</span> [Song Title]
                  </p>
                  <p>
                    <span className="text-[#F5D58A]">Artist Credit:</span> {artist.name}
                  </p>
                  <p>
                    <span className="text-[#F5D58A]">Label Credit:</span> {artist.label}
                  </p>
                  <p>
                    <span className="text-[#F5D58A]">Copyright Information:</span> As per verified ownership and applicable agreements.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Featured Songs & Artist Playlists Highlights */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
        <div className="lg:col-span-6 luxury-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#00D5FF]">
                SPOTLIGHT · SUNIL KUMAR
              </p>
              <h3 className="font-display text-lg font-bold text-[#F5D58A]">Featured Songs</h3>
            </div>
            <Star className="w-4 h-4 text-[#F5D58A]" />
          </div>
          <div className="divide-y divide-[#D4AF37]/10">
            {featuredSongs.map((rel) => {
              const trk = trackByReleaseId.get(rel.id);
              const playing = currentTrack?.releaseId === rel.id && playerIsPlaying;
              return (
                <div key={rel.id} className="py-2.5 flex items-center gap-3">
                  {rel.artworkPreview ? (
                    <img
                      src={rel.artworkPreview}
                      alt={rel.title}
                      className="w-10 h-10 rounded-lg object-cover border border-[#D4AF37]/30 shrink-0"
                    />
                  ) : (
                    <img
                      src={brandLogoUrl}
                      alt="Music High Sky"
                      className="w-10 h-10 rounded-lg object-contain bg-[#020817] border border-[#D4AF37]/30 p-1 shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-white truncate">{rel.title}</p>
                    <p className="text-[11px] text-[#8D9AAA] truncate">
                      {rel.language} · {rel.genre}
                    </p>
                  </div>
                  {trk?.masterSourceUrl && (
                    <button
                      type="button"
                      onClick={() => handlePlayReleaseInBar(rel)}
                      aria-label={playing ? `Pause ${rel.title}` : `Play ${rel.title}`}
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 cursor-pointer ${
                        playing ? 'bg-[#00D5FF] text-[#020817]' : 'btn-gold'
                      }`}
                    >
                      {playing ? (
                        <Pause className="w-3.5 h-3.5 fill-current" />
                      ) : (
                        <Play className="w-3.5 h-3.5 ml-0.5 fill-current" />
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-6 luxury-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#00D5FF]">
                OFFICIAL COLLECTIONS · MUSIC HIGH SKY
              </p>
              <h3 className="font-display text-lg font-bold text-[#F5D58A]">Artist Playlists</h3>
            </div>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('playlists')}
                className="btn-electric inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer"
              >
                <ListMusic className="w-3.5 h-3.5" />
                View All ({playlists.length})
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {playlists.slice(0, 4).map((pl) => {
              const count = playlistTracks.filter((pt) => pt.playlistId === pl.id).length;
              return (
                <div
                  key={pl.id}
                  onClick={() => onNavigate?.('playlists')}
                  className="p-3 rounded-xl bg-[#030509]/80 border border-[#D4AF37]/20 hover:border-[#F5D58A]/50 flex items-center gap-3 cursor-pointer transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg overflow-hidden border border-[#D4AF37]/30 shrink-0 bg-[#020817]">
                    {pl.coverArtworkUrl ? (
                      <img src={pl.coverArtworkUrl} alt={pl.name} className="w-full h-full object-cover" />
                    ) : (
                      <img src={brandLogoUrl} alt="Music High Sky" className="w-full h-full object-contain p-1" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-white truncate">{pl.name}</p>
                    <p className="text-[11px] font-mono text-[#F5D58A]">{count} tracks</p>
                  </div>
                  {pl.mediaKind !== 'video' && count > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePlayArtistPlaylist(pl.id, pl.name);
                      }}
                      aria-label={`Play ${pl.name}`}
                      className="w-7 h-7 rounded-full btn-gold flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      <Play className="w-3 h-3 ml-0.5 fill-current" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* SUNIL KUMAR – OFFICIAL DISCOGRAPHY */}
      <section aria-label="Sunil Kumar — Official Discography" className="space-y-5 pt-2">
        <div className="gold-divider" />

        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#00D5FF] mb-1">
              OFFICIAL ARTIST DISCOGRAPHY · {artist.label.toUpperCase()}
            </p>
            <h3 className="font-display text-xl sm:text-2xl font-bold text-gold-gradient tracking-wide">
              SUNIL KUMAR – OFFICIAL DISCOGRAPHY
            </h3>
            <p className="text-xs text-[#8D9AAA] mt-1">
              {sunilReleases.length} database-synchronized release{sunilReleases.length === 1 ? '' : 's'} assigned to Sunil Kumar ({audioCount} Audio · {videoCount} Video).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div className="flex flex-wrap items-center p-0.5 bg-[#030509] border border-[#D4AF37]/25 rounded-lg">
              {(
                [
                  { id: 'all', label: 'All Releases' },
                  { id: 'audio', label: 'Audio Songs' },
                  { id: 'video', label: 'Video Songs' },
                  { id: 'latest', label: 'Latest Releases' },
                  { id: 'oldest', label: 'Oldest Releases' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDiscographyFilter(tab.id)}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer transition-colors whitespace-nowrap ${
                    discographyFilter === tab.id
                      ? 'bg-[#D4AF37] text-[#030509]'
                      : 'text-[#C8D0DB] hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative w-56">
              <Search className="w-4 h-4 text-[#8D9AAA] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={discographyQuery}
                onChange={(e) => setDiscographyQuery(e.target.value)}
                placeholder="Search Sunil Kumar songs..."
                className="w-full pl-9 pr-3 py-2 text-xs luxury-input rounded-lg"
              />
            </div>
          </div>
        </div>

        {sunilReleases.length === 0 ? (
          <div className="luxury-card rounded-2xl p-10 text-center space-y-2">
            <p className="font-display text-base font-semibold text-[#F5D58A]">
              No Matching Releases in Discography
            </p>
            <p className="text-xs text-[#8D9AAA]">
              {discographyFilter === 'video'
                ? 'No official video files have been imported or submitted yet. Use Google Drive Import or submit an MP4/MOV video release.'
                : 'Adjust your search query or import songs from Google Drive.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {sunilReleases.map((rel) => {
              const track = trackByReleaseId.get(rel.id);
              const video = videoByReleaseId.get(rel.id);
              const isPlayingNow = currentTrack?.releaseId === rel.id && playerIsPlaying;
              const tone = STATUS_COLORS[rel.status] ?? {
                text: 'text-[#C8D0DB]',
                dot: 'bg-[#C8D0DB]',
              };
              const needsReview = Boolean(
                rel.reviewNotes?.toLowerCase().includes('admin review') || !rel.plannedReleaseDate
              );

              return (
                <article
                  key={rel.id}
                  className="luxury-card luxury-card-hover rounded-2xl overflow-hidden flex flex-col"
                >
                  <div className="p-5 flex flex-col sm:flex-row gap-4">
                    {/* Song Artwork */}
                    <div className="shrink-0">
                      <div className="p-1 rounded-xl bg-gradient-to-br from-[#F5D58A]/50 via-[#D4AF37]/20 to-[#00A8FF]/35">
                        {rel.artworkPreview ? (
                          <img
                            src={rel.artworkPreview}
                            alt={`${rel.title} artwork`}
                            loading="lazy"
                            className="w-full sm:w-28 h-28 rounded-lg object-cover bg-[#030509]"
                          />
                        ) : (
                          <div className="w-full sm:w-28 h-28 rounded-lg bg-[#030509] flex flex-col items-center justify-center gap-1.5">
                            <img
                              src={brandLogoUrl}
                              alt="Music High Sky"
                              referrerPolicy="no-referrer"
                              className="w-10 h-10 rounded-full object-contain"
                            />
                            <span className="text-[9px] font-mono text-[#8D9AAA]">NO COVER</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Metadata */}
                    <div className="min-w-0 flex-1 flex flex-col justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[#00D5FF]">
                            {rel.releaseType === 'audio' ? (
                              <Music className="w-3.5 h-3.5" />
                            ) : (
                              <Film className="w-3.5 h-3.5" />
                            )}
                            {rel.releaseType === 'audio' ? 'Audio Release' : 'Official Video'}
                            <span className="text-[#8D9AAA]">· {rel.releaseCode}</span>
                          </span>
                          <span className={`text-xs font-semibold inline-flex items-center gap-1.5 ${tone.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                            {rel.status}
                          </span>
                        </div>

                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-display text-base font-bold text-white leading-snug">
                            {rel.title}
                            {rel.subtitle ? (
                              <span className="text-xs font-normal text-[#8D9AAA]"> ({rel.subtitle})</span>
                            ) : null}
                          </h4>
                          {rel.releaseType === 'audio' && track?.masterSourceUrl && (
                            <button
                              type="button"
                              onClick={() => handlePlayReleaseInBar(rel)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 shrink-0 cursor-pointer ${
                                isPlayingNow
                                  ? 'bg-[#00D5FF] text-[#020817]'
                                  : 'btn-gold'
                              }`}
                            >
                              {isPlayingNow ? (
                                <>
                                  <Pause className="w-3 h-3 fill-current" />
                                  Playing
                                </>
                              ) : (
                                <>
                                  <Play className="w-3 h-3 fill-current" />
                                  Stream
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        <p className="text-xs text-[#F5D58A] font-medium">
                          {rel.artistCredit || 'Sunil Kumar'} · {rel.labelCredit || 'Music High Sky'}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-[#C8D0DB] pt-2 border-t border-[#D4AF37]/15">
                        <span>
                          Release Date:{' '}
                          <strong className={rel.plannedReleaseDate ? 'text-white' : 'text-[#F5D58A]'}>
                            {rel.plannedReleaseDate || 'Pending Admin Review'}
                          </strong>
                        </span>
                        <span>·</span>
                        <span>{rel.language}</span>
                        <span>·</span>
                        <span>{rel.genre}</span>
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

                  {/* Audio / Video Preview */}
                  <div className="px-5 pb-4 space-y-2.5">
                    {rel.releaseType === 'audio' && track && (
                      <WaveformPlayer
                        peaks={track.waveformPeaks ?? []}
                        audioUrl={track.masterSourceUrl}
                        durationSeconds={track.durationSeconds}
                        label={`${rel.title} · ${track.format}`}
                        compact
                      />
                    )}

                    {rel.releaseType === 'video' && video && (
                      <div className="space-y-2">
                        {video.masterSourceUrl ? (
                          <video
                            controls
                            preload="metadata"
                            poster={video.thumbnailPreview || rel.artworkPreview}
                            src={video.masterSourceUrl}
                            className="w-full rounded-xl border border-[#00A8FF]/25 bg-black max-h-56"
                          />
                        ) : (
                          <div className="p-3 rounded-xl bg-[#030509]/80 border border-[#00A8FF]/20 text-xs text-[#C8D0DB] flex items-center justify-between gap-2">
                            <span>
                              {video.fileName || 'Official Video'} ({video.format})
                            </span>
                            {video.youtubeUrl && (
                              <a
                                href={video.youtubeUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[#00D5FF] hover:text-white"
                              >
                                Watch <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {needsReview && rel.reviewNotes && (
                      <div className="flex items-start gap-2 text-[11px] text-[#C8D0DB] bg-[#030509]/70 border border-[#D4AF37]/20 rounded-lg px-3 py-2">
                        <AlertCircle className="w-3.5 h-3.5 text-[#F5D58A] shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{rel.reviewNotes}</span>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
