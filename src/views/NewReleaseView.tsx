import React, { useEffect, useMemo, useState } from 'react';
import {
  Music,
  Film,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Info,
  Send,
  Save,
  Sparkles,
} from 'lucide-react';
import { MUSIC_GENRES, MUSIC_LANGUAGES, MUSIC_MOODS } from '../constants';
import { usePlatform } from '../context/PlatformContext';
import { createFullReleaseSubmission } from '../services/firestoreService';
import { CLOUD_STORAGE_BUCKET, uploadMediaToCloudStorage } from '../services/storageService';
import type { NavSection, ReleaseType } from '../types';
import {
  formatBytes,
  formatDuration,
  validateAndAnalyzeAudio,
  validateAndAnalyzeVideo,
  validateAndCompressArtwork,
  type ValidatedArtworkResult,
  type ValidatedAudioResult,
  type ValidatedVideoResult,
} from '../utils/mediaValidation';
import { WaveformPlayer } from '../components/WaveformPlayer';

interface NewReleaseViewProps {
  defaultType?: ReleaseType;
  onSuccessNavigate: (section: NavSection) => void;
}

export const NewReleaseView: React.FC<NewReleaseViewProps> = ({
  defaultType = 'audio',
  onSuccessNavigate,
}) => {
  const { currentUser, artist, platforms, releases, settings, pushToast } = usePlatform();

  const [releaseType, setReleaseType] = useState<ReleaseType>(defaultType);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [primaryArtist, setPrimaryArtist] = useState(artist.name || 'Sunil Kumar');
  const [featuredArtist, setFeaturedArtist] = useState('');
  const [singer, setSinger] = useState(artist.name || 'Sunil Kumar');
  const [lyricist, setLyricist] = useState(artist.name || 'Sunil Kumar');
  const [composer, setComposer] = useState(artist.name || 'Sunil Kumar');
  const [musicProducer, setMusicProducer] = useState('');
  const [musicDirector, setMusicDirector] = useState('');
  const [mixingEngineer, setMixingEngineer] = useState('');
  const [masteringEngineer, setMasteringEngineer] = useState('');
  const [genre, setGenre] = useState(MUSIC_GENRES[0]);
  const [subgenre, setSubgenre] = useState('');
  const [language, setLanguage] = useState('Hindi');
  const [mood, setMood] = useState('Romantic');
  const [explicitContent, setExplicitContent] = useState(false);
  const [originalReleaseDate, setOriginalReleaseDate] = useState('');
  const [plannedReleaseDate, setPlannedReleaseDate] = useState('');
  const [releaseTime, setReleaseTime] = useState('00:00');
  const [copyrightYear, setCopyrightYear] = useState(String(new Date().getFullYear()));
  const [copyrightOwner, setCopyrightOwner] = useState('');
  const [phonographicCopyright, setPhonographicCopyright] = useState('');
  const [publishingCopyright, setPublishingCopyright] = useState('');

  // Official Credit Format overrides
  const [artistCredit, setArtistCredit] = useState(settings.defaultArtistCredit || 'Sunil Kumar');
  const [labelCredit, setLabelCredit] = useState(settings.defaultLabelCredit || 'Music High Sky');
  const [creditNotes, setCreditNotes] = useState('');

  // Video specific metadata
  const [director, setDirector] = useState('');
  const [producer, setProducer] = useState('');
  const [productionCompany, setProductionCompany] = useState('');
  const [videoDescription, setVideoDescription] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [videoCopyrightInfo, setVideoCopyrightInfo] = useState('');
  const [masterSourceUrl, setMasterSourceUrl] = useState('');

  // Validated Media Previews
  const [audioData, setAudioData] = useState<ValidatedAudioResult | null>(null);
  const [videoData, setVideoData] = useState<ValidatedVideoResult | null>(null);
  const [artworkData, setArtworkData] = useState<ValidatedArtworkResult | null>(null);
  const [validatingMedia, setValidatingMedia] = useState(false);
  const [dragTarget, setDragTarget] = useState<'media' | 'artwork' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadToCloudStorage, setUploadToCloudStorage] = useState(Boolean(CLOUD_STORAGE_BUCKET));
  const [cloudUploadStatus, setCloudUploadStatus] = useState<string>('');
  const [cloudUploadPercent, setCloudUploadPercent] = useState<number>(0);

  const availablePlatforms = useMemo(
    () =>
      platforms.filter(
        (p) => p.enabled && (p.category === 'both' || p.category === releaseType)
      ),
    [platforms, releaseType]
  );

  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);

  useEffect(() => {
    setSelectedPlatforms(availablePlatforms.map((p) => p.name));
  }, [releaseType, platforms.length]);

  useEffect(() => {
    return () => {
      if (audioData?.objectUrl) URL.revokeObjectURL(audioData.objectUrl);
      if (videoData?.objectUrl) URL.revokeObjectURL(videoData.objectUrl);
    };
  }, [audioData?.objectUrl, videoData?.objectUrl]);

  // Duplicate release guard
  const duplicateMatch = useMemo(() => {
    const cleanTitle = title.trim().toLowerCase();
    if (!cleanTitle) return null;
    return releases.find(
      (r) =>
        r.title.trim().toLowerCase() === cleanTitle &&
        r.releaseType === releaseType &&
        r.status !== 'Rejected' &&
        r.status !== 'Taken Down'
    );
  }, [releases, title, releaseType]);

  // Live metadata & asset completion meter
  const completionStats = useMemo(() => {
    const checks = [
      Boolean(title.trim()),
      Boolean(primaryArtist.trim()),
      Boolean(genre),
      Boolean(language),
      Boolean(plannedReleaseDate),
      releaseType === 'audio'
        ? Boolean(audioData || masterSourceUrl.trim())
        : Boolean(videoData || youtubeUrl.trim() || masterSourceUrl.trim()),
      Boolean(artworkData),
      Boolean(artistCredit.trim() && labelCredit.trim()),
      selectedPlatforms.length > 0,
    ];
    const done = checks.filter(Boolean).length;
    return {
      done,
      total: checks.length,
      percent: Math.round((done / checks.length) * 100),
    };
  }, [
    title,
    primaryArtist,
    genre,
    language,
    plannedReleaseDate,
    releaseType,
    audioData,
    videoData,
    youtubeUrl,
    masterSourceUrl,
    artworkData,
    artistCredit,
    labelCredit,
    selectedPlatforms.length,
  ]);

  const togglePlatform = (name: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    );
  };

  const processAudioFile = async (file: File) => {
    setValidatingMedia(true);
    try {
      if (audioData?.objectUrl) URL.revokeObjectURL(audioData.objectUrl);
      const res = await validateAndAnalyzeAudio(file);
      setAudioData(res);
      pushToast(`Audio master "${res.fileName}" validated (${res.format}).`, 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Audio validation failed.', 'error');
    } finally {
      setValidatingMedia(false);
    }
  };

  const processVideoFile = async (file: File) => {
    setValidatingMedia(true);
    try {
      if (videoData?.objectUrl) URL.revokeObjectURL(videoData.objectUrl);
      const res = await validateAndAnalyzeVideo(file);
      setVideoData(res);
      pushToast(`Music video "${res.fileName}" validated (${res.format}).`, 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Video validation failed.', 'error');
    } finally {
      setValidatingMedia(false);
    }
  };

  const processArtworkFile = async (file: File) => {
    setValidatingMedia(true);
    try {
      const res = await validateAndCompressArtwork(
        file,
        releaseType === 'video' ? 'video_thumbnail' : 'cover_art'
      );
      setArtworkData(res);
      pushToast(
        `${releaseType === 'video' ? 'Thumbnail' : 'Cover artwork'} validated (${res.width}×${res.height}px).`,
        'success'
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Image validation failed.', 'error');
    } finally {
      setValidatingMedia(false);
    }
  };

  const handleAudioFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processAudioFile(file);
    e.target.value = '';
  };

  const handleVideoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processVideoFile(file);
    e.target.value = '';
  };

  const handleArtworkFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processArtworkFile(file);
    e.target.value = '';
  };

  const handleMediaDrop = async (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragTarget(null);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (releaseType === 'audio') {
      await processAudioFile(file);
    } else {
      await processVideoFile(file);
    }
  };

  const handleArtworkDrop = async (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragTarget(null);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processArtworkFile(file);
  };

  const handleSubmit = async (mode: 'Draft' | 'Submitted') => {
    if (!currentUser) return;
    if (!title.trim()) {
      pushToast('Please enter a release title before saving.', 'error');
      return;
    }
    if (mode === 'Submitted' && selectedPlatforms.length === 0) {
      pushToast('Select at least one intended distribution platform.', 'error');
      return;
    }
    if (mode === 'Submitted' && releaseType === 'audio' && !audioData && !masterSourceUrl.trim()) {
      pushToast(
        'Upload a WAV/FLAC/MP3 audio file for validation or provide an external master archive link.',
        'error'
      );
      return;
    }

    setSubmitting(true);
    setCloudUploadStatus('');
    setCloudUploadPercent(0);
    try {
      const year = new Date().getFullYear();
      const seq = String(releases.length + 1).padStart(3, '0');
      const releaseCode = `MHS-${releaseType === 'audio' ? 'AUD' : 'VID'}-${year}-${seq}`;
      const today = new Date().toISOString().slice(0, 10);
      const slug = `${title}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80);

      let resolvedArtworkUrl = artworkData?.previewDataUrl || '';
      let resolvedMasterUrl = masterSourceUrl.trim();
      let cloudFallbackNote = '';

      if (uploadToCloudStorage && CLOUD_STORAGE_BUCKET) {
        try {
          if (artworkData?.file) {
            setCloudUploadStatus('Uploading cover artwork to Firebase Storage...');
            const uploadedArt = await uploadMediaToCloudStorage({
              file: artworkData.file,
              category: 'artwork',
              releaseCode,
              fileName: artworkData.fileName,
              onProgress: setCloudUploadPercent,
            });
            resolvedArtworkUrl = uploadedArt.downloadUrl;
          }

          if (releaseType === 'audio' && audioData?.file) {
            setCloudUploadStatus('Uploading audio master to Firebase Storage...');
            const uploadedAudio = await uploadMediaToCloudStorage({
              file: audioData.file,
              category: 'audio',
              releaseCode,
              fileName: audioData.fileName,
              onProgress: setCloudUploadPercent,
            });
            resolvedMasterUrl = uploadedAudio.downloadUrl;
          } else if (releaseType === 'video' && videoData?.file) {
            setCloudUploadStatus('Uploading video file to Firebase Storage...');
            const uploadedVideo = await uploadMediaToCloudStorage({
              file: videoData.file,
              category: 'video',
              releaseCode,
              fileName: videoData.fileName,
              onProgress: setCloudUploadPercent,
            });
            resolvedMasterUrl = uploadedVideo.downloadUrl;
          }
        } catch (cloudErr) {
          cloudFallbackNote =
            cloudErr instanceof Error ? cloudErr.message : 'Firebase Storage upload unavailable.';
        }
      }

      setCloudUploadStatus('Saving release metadata to Firestore...');
      await createFullReleaseSubmission({
        release: {
          releaseCode,
          releaseType,
          title: title.trim(),
          subtitle: subtitle.trim(),
          primaryArtist: primaryArtist.trim() || 'Sunil Kumar',
          featuredArtist: featuredArtist.trim(),
          singer: singer.trim(),
          lyricist: lyricist.trim(),
          composer: composer.trim(),
          musicProducer: musicProducer.trim(),
          musicDirector: musicDirector.trim(),
          mixingEngineer: mixingEngineer.trim(),
          masteringEngineer: masteringEngineer.trim(),
          genre,
          subgenre: subgenre.trim(),
          language,
          mood,
          explicitContent,
          originalReleaseDate,
          plannedReleaseDate,
          releaseTime,
          copyrightYear,
          copyrightOwner: copyrightOwner.trim(),
          phonographicCopyright: phonographicCopyright.trim(),
          publishingCopyright: publishingCopyright.trim(),
          distributorLabel: 'Music High Sky',
          artistCredit: artistCredit.trim() || 'Sunil Kumar',
          labelCredit: labelCredit.trim() || 'Music High Sky',
          creditNotes: creditNotes.trim(),
          targetPlatforms: selectedPlatforms,
          status: mode,
          reviewNotes: '',
          artworkPreview: resolvedArtworkUrl,
          smartLinkSlug: slug,
          submittedBy: currentUser.uid,
          submittedByName: currentUser.displayName,
          submissionDate: today,
        },
        audioTrack:
          releaseType === 'audio' && (audioData || resolvedMasterUrl)
            ? {
                fileName: audioData?.fileName || `${title.trim()}-master.wav`,
                format: audioData?.format || 'WAV',
                fileSizeBytes: audioData?.fileSizeBytes || 0,
                durationSeconds: audioData?.durationSeconds || 0,
                sampleRate: audioData?.sampleRate || 44100,
                channels: audioData?.channels || 2,
                waveformPeaks: audioData?.waveformPeaks || [],
                masterSourceUrl: resolvedMasterUrl,
                validated: true,
              }
            : undefined,
        videoRelease:
          releaseType === 'video'
            ? {
                director: director.trim(),
                producer: producer.trim(),
                productionCompany: productionCompany.trim(),
                description: videoDescription.trim(),
                fileName: videoData?.fileName || '',
                format: videoData?.format || 'EXTERNAL',
                fileSizeBytes: videoData?.fileSizeBytes || 0,
                durationSeconds: videoData?.durationSeconds || 0,
                resolution: videoData?.resolution || 'Verified Link',
                youtubeUrl: youtubeUrl.trim(),
                videoCopyrightInfo: videoCopyrightInfo.trim(),
                masterSourceUrl: resolvedMasterUrl,
                thumbnailPreview: resolvedArtworkUrl,
                validated: true,
              }
            : undefined,
        artwork: artworkData
          ? {
              kind: releaseType === 'video' ? 'video_thumbnail' : 'cover_art',
              fileName: artworkData.fileName,
              format: artworkData.format,
              width: artworkData.width,
              height: artworkData.height,
              aspectRatioValid: artworkData.aspectRatioValid,
              previewDataUrl: resolvedArtworkUrl,
              locked: false,
            }
          : undefined,
        actor: currentUser,
        emailAlertsEnabled: Boolean(settings.emailNotificationsEnabled),
      });

      if (cloudFallbackNote) {
        pushToast(
          `${releaseCode} saved to Firestore (local preview retained: ${cloudFallbackNote})`,
          'info'
        );
      } else {
        pushToast(
          `${releaseCode} ("${title.trim()}") saved as ${mode} with ${selectedPlatforms.length} planned DSP record(s).`,
          'success'
        );
      }
      onSuccessNavigate(releaseType === 'audio' ? 'audio-releases' : 'video-releases');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Submission failed.', 'error');
    } finally {
      setSubmitting(false);
      setCloudUploadStatus('');
      setCloudUploadPercent(0);
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header & Format Switch */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#00D5FF] mb-1">
            Distributor Label: Music High Sky · Artist: Sunil Kumar
          </p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-gold-gradient tracking-wide">
            New Release Submission
          </h2>
          <p className="text-sm text-[#C8D0DB] mt-1.5 max-w-2xl">
            Prepare an official audio song or music video release with real-time master validation, cover artwork verification, and transparent global DSP planning.
          </p>
        </div>

        {/* Luxury Release Format Switch */}
        <div className="flex items-center p-1 luxury-card rounded-xl shrink-0">
          <button
            type="button"
            onClick={() => setReleaseType('audio')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              releaseType === 'audio'
                ? 'btn-gold'
                : 'text-[#C8D0DB] hover:text-white'
            }`}
          >
            <Music className="w-4 h-4" />
            Audio Song Release
          </button>
          <button
            type="button"
            onClick={() => setReleaseType('video')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              releaseType === 'video'
                ? 'btn-gold'
                : 'text-[#C8D0DB] hover:text-white'
            }`}
          >
            <Film className="w-4 h-4" />
            Official Music Video
          </button>
        </div>
      </div>

      {/* Metadata Completion Progress Indicator */}
      <div className="luxury-card rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2 text-xs">
            <Sparkles className="w-4 h-4 text-[#D4AF37]" />
            <span className="font-semibold text-[#F5D58A] uppercase tracking-[0.14em] text-[11px]">
              Metadata &amp; Master Readiness
            </span>
          </div>
          <span className="text-xs font-mono tabular-nums text-[#00D5FF] font-semibold">
            {completionStats.done} / {completionStats.total} checkpoints ({completionStats.percent}%)
          </span>
        </div>
        <div className="w-full h-2 rounded-full bg-[#030509] border border-[#D4AF37]/20 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#0759C7] via-[#00A8FF] to-[#00D5FF] transition-all duration-300"
            style={{ width: `${completionStats.percent}%` }}
          />
        </div>
      </div>

      {/* Duplicate Release Prevention Guard */}
      {duplicateMatch && (
        <div className="p-4 rounded-xl bg-amber-950/35 border border-[#D4AF37]/50 flex items-start gap-3 text-xs">
          <AlertTriangle className="w-4 h-4 text-[#F5D58A] shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-[#F5D58A]">Potential Duplicate Release Detected</p>
            <p className="text-[#C8D0DB] mt-0.5">
              A {duplicateMatch.releaseType} release titled &ldquo;{duplicateMatch.title}&rdquo; (
              <span className="font-mono text-[#00D5FF]">{duplicateMatch.releaseCode}</span>, status:{' '}
              {duplicateMatch.status}) already exists in Music High Sky. Please verify before submitting to avoid accidental duplicates.
            </p>
          </div>
        </div>
      )}

      {/* Section 1: Song / Video Information */}
      <section className="luxury-card rounded-2xl p-6 sm:p-7 space-y-6">
        <div className="pb-4 border-b border-[#D4AF37]/20">
          <h3 className="font-display text-lg font-semibold text-[#F5D58A] tracking-wide">
            01. {releaseType === 'audio' ? 'Song Metadata & Credits' : 'Official Music Video Metadata'}
          </h3>
          <p className="text-xs text-[#8D9AAA] mt-1">
            Enter accurate international store-ready credits. Required fields are marked with *.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">
              {releaseType === 'audio' ? 'Song Title *' : 'Video Song Title *'}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Dil Ki Aawaz"
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
            />
          </div>
          <div>
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">Subtitle / Version</label>
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="e.g. Unplugged, Acoustic, Official Video"
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
            />
          </div>
          <div>
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">Primary Artist *</label>
            <input
              type="text"
              value={primaryArtist}
              onChange={(e) => setPrimaryArtist(e.target.value)}
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
            />
          </div>
          <div>
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">Featured Artist</label>
            <input
              type="text"
              value={featuredArtist}
              onChange={(e) => setFeaturedArtist(e.target.value)}
              placeholder="Optional featured collaborator"
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
            />
          </div>
          <div>
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">Singer</label>
            <input
              type="text"
              value={singer}
              onChange={(e) => setSinger(e.target.value)}
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
            />
          </div>
          <div>
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">Lyricist</label>
            <input
              type="text"
              value={lyricist}
              onChange={(e) => setLyricist(e.target.value)}
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
            />
          </div>
          <div>
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">Music Composer</label>
            <input
              type="text"
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
            />
          </div>

          {releaseType === 'audio' ? (
            <>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5 font-medium">Music Producer</label>
                <input
                  type="text"
                  value={musicProducer}
                  onChange={(e) => setMusicProducer(e.target.value)}
                  placeholder="Producer name"
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5 font-medium">Music Director</label>
                <input
                  type="text"
                  value={musicDirector}
                  onChange={(e) => setMusicDirector(e.target.value)}
                  placeholder="Music director"
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5 font-medium">Mixing Engineer</label>
                <input
                  type="text"
                  value={mixingEngineer}
                  onChange={(e) => setMixingEngineer(e.target.value)}
                  placeholder="Mixing credits"
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5 font-medium">Mastering Engineer</label>
                <input
                  type="text"
                  value={masteringEngineer}
                  onChange={(e) => setMasteringEngineer(e.target.value)}
                  placeholder="Mastering credits"
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5 font-medium">Video Director</label>
                <input
                  type="text"
                  value={director}
                  onChange={(e) => setDirector(e.target.value)}
                  placeholder="Director name"
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5 font-medium">Video Producer</label>
                <input
                  type="text"
                  value={producer}
                  onChange={(e) => setProducer(e.target.value)}
                  placeholder="Producer name"
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[#C8D0DB] mb-1.5 font-medium">
                  Video Production Company
                </label>
                <input
                  type="text"
                  value={productionCompany}
                  onChange={(e) => setProductionCompany(e.target.value)}
                  placeholder="Production house"
                  className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">Genre *</label>
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
            >
              {MUSIC_GENRES.map((g) => (
                <option key={g} value={g} className="bg-[#06152E]">
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">Subgenre</label>
            <input
              type="text"
              value={subgenre}
              onChange={(e) => setSubgenre(e.target.value)}
              placeholder="e.g. Modern Bollywood Ballad"
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
            />
          </div>
          <div>
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">Language *</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
            >
              {MUSIC_LANGUAGES.map((l) => (
                <option key={l} value={l} className="bg-[#06152E]">
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">Mood</label>
            <select
              value={mood}
              onChange={(e) => setMood(e.target.value)}
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
            >
              {MUSIC_MOODS.map((m) => (
                <option key={m} value={m} className="bg-[#06152E]">
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">Explicit Content</label>
            <select
              value={explicitContent ? 'yes' : 'no'}
              onChange={(e) => setExplicitContent(e.target.value === 'yes')}
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
            >
              <option value="no" className="bg-[#06152E]">No — Clean</option>
              <option value="yes" className="bg-[#06152E]">Yes — Explicit</option>
            </select>
          </div>
          <div>
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">Original Release Date</label>
            <input
              type="date"
              value={originalReleaseDate}
              onChange={(e) => setOriginalReleaseDate(e.target.value)}
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">Planned Release Date</label>
            <input
              type="date"
              value={plannedReleaseDate}
              onChange={(e) => setPlannedReleaseDate(e.target.value)}
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">
              Release Time (IST / Local)
            </label>
            <input
              type="time"
              value={releaseTime}
              onChange={(e) => setReleaseTime(e.target.value)}
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg font-mono"
            />
          </div>
        </div>

        {releaseType === 'video' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2">
            <div className="sm:col-span-2">
              <label className="block text-[#C8D0DB] mb-1.5 font-medium">Video Description</label>
              <textarea
                rows={3}
                value={videoDescription}
                onChange={(e) => setVideoDescription(e.target.value)}
                placeholder="Official music video synopsis, cast, and release credits..."
                className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
              />
            </div>
            <div>
              <label className="block text-[#C8D0DB] mb-1.5 font-medium">
                YouTube Video Link (if already published)
              </label>
              <input
                type="url"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
              />
            </div>
            <div>
              <label className="block text-[#C8D0DB] mb-1.5 font-medium">
                Video Copyright Information
              </label>
              <input
                type="text"
                value={videoCopyrightInfo}
                onChange={(e) => setVideoCopyrightInfo(e.target.value)}
                placeholder="Verified video copyright holder details"
                className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
              />
            </div>
          </div>
        )}
      </section>

      {/* Section 2: Master Media Upload & Artwork Validation */}
      <section className="luxury-card rounded-2xl p-6 sm:p-7 space-y-6">
        <div className="pb-4 border-b border-[#D4AF37]/20 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-lg font-semibold text-[#F5D58A] tracking-wide">
              02. {releaseType === 'audio' ? 'Audio Master & Cover Artwork' : 'Official Video Master & Thumbnail'}
            </h3>
            <p className="text-xs text-[#8D9AAA] mt-1">
              Drag and drop or browse master files for instant studio validation, waveform extraction, and Firestore metadata storage.
            </p>
          </div>
          {validatingMedia && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#00A8FF]/15 border border-[#00A8FF]/40 text-xs text-[#00D5FF]">
              <span className="w-2 h-2 rounded-full bg-[#00D5FF] animate-pulse" />
              Analyzing master file...
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Audio or Video Drag-and-Drop Zone */}
          <div className="space-y-4">
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragTarget('media');
              }}
              onDragLeave={() => setDragTarget(null)}
              onDrop={handleMediaDrop}
              className={`block p-6 rounded-2xl border-2 border-dashed transition-all cursor-pointer ${
                dragTarget === 'media'
                  ? 'bg-[#00A8FF]/15 border-[#00D5FF] shadow-[0_0_28px_-6px_rgba(0,168,255,0.45)]'
                  : 'bg-[#030509]/70 border-[#00A8FF]/35 hover:border-[#00D5FF] hover:bg-[#06152E]/60'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#00A8FF]/15 border border-[#00A8FF]/40 text-[#00D5FF] flex items-center justify-center shrink-0">
                  <Upload className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {releaseType === 'audio'
                      ? 'Drop or Upload Audio Master (WAV, FLAC, MP3)'
                      : 'Drop or Upload Official Music Video (MP4, MOV)'}
                  </p>
                  <p className="text-xs text-[#8D9AAA] mt-1">
                    {validatingMedia
                      ? 'Decoding headers and generating audio waveform...'
                      : 'Instant studio format check, sample rate analysis & live playback preview'}
                  </p>
                </div>
              </div>
              <input
                type="file"
                accept={releaseType === 'audio' ? '.wav,.flac,.mp3' : '.mp4,.mov,.mkv,.webm'}
                onChange={releaseType === 'audio' ? handleAudioFileChange : handleVideoFileChange}
                className="hidden"
              />
            </label>

            {releaseType === 'audio' && audioData && (
              <div className="space-y-2.5">
                <WaveformPlayer
                  peaks={audioData.waveformPeaks}
                  audioUrl={audioData.objectUrl}
                  durationSeconds={audioData.durationSeconds}
                  label={`${audioData.fileName} · ${audioData.format}`}
                />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-[#C8D0DB]">
                  <span className="text-emerald-400 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Validated
                  </span>
                  <span>· {formatBytes(audioData.fileSizeBytes)}</span>
                  <span>· {formatDuration(audioData.durationSeconds)}</span>
                  <span>· {(audioData.sampleRate / 1000).toFixed(1)} kHz</span>
                  <span>· {audioData.channels}ch</span>
                </div>
                {audioData.warnings.map((w, i) => (
                  <p key={i} className="text-[11px] text-[#F5D58A] flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#D4AF37]" />
                    <span>{w}</span>
                  </p>
                ))}
              </div>
            )}

            {releaseType === 'video' && videoData && (
              <div className="space-y-2.5">
                <video
                  src={videoData.objectUrl}
                  controls
                  className="w-full rounded-xl border border-[#D4AF37]/30 bg-black max-h-64"
                />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-[#C8D0DB]">
                  <span className="text-emerald-400 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Validated {videoData.format}
                  </span>
                  <span>· {formatBytes(videoData.fileSizeBytes)}</span>
                  <span>· {formatDuration(videoData.durationSeconds)}</span>
                  <span>· {videoData.resolution}</span>
                </div>
                {videoData.warnings.map((w, i) => (
                  <p key={i} className="text-[11px] text-[#F5D58A] flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#D4AF37]" />
                    <span>{w}</span>
                  </p>
                ))}
              </div>
            )}

            <div className="text-xs">
              <label className="block text-[#8D9AAA] mb-1.5">
                Optional Master Delivery Archive URL (Google Drive / Cloud Storage)
              </label>
              <input
                type="url"
                value={masterSourceUrl}
                onChange={(e) => setMasterSourceUrl(e.target.value)}
                placeholder="https://drive.google.com/..."
                className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
              />
            </div>
          </div>

          {/* Cover Artwork / Video Thumbnail Drag-and-Drop Zone */}
          <div className="space-y-4">
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragTarget('artwork');
              }}
              onDragLeave={() => setDragTarget(null)}
              onDrop={handleArtworkDrop}
              className={`block p-6 rounded-2xl border-2 border-dashed transition-all cursor-pointer ${
                dragTarget === 'artwork'
                  ? 'bg-[#D4AF37]/15 border-[#F5D58A] shadow-[0_0_28px_-6px_rgba(212,175,55,0.45)]'
                  : 'bg-[#030509]/70 border-[#D4AF37]/35 hover:border-[#F5D58A] hover:bg-[#06152E]/60'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#F5D58A] flex items-center justify-center shrink-0">
                  <Upload className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {releaseType === 'audio'
                      ? 'Drop or Upload Cover Artwork (JPG / PNG)'
                      : 'Drop or Upload Official Video Thumbnail (JPG / PNG)'}
                  </p>
                  <p className="text-xs text-[#8D9AAA] mt-1">
                    {releaseType === 'audio'
                      ? 'Validated for 1:1 square aspect ratio (3000×3000px recommended)'
                      : 'Validated for 16:9 widescreen aspect ratio (1920×1080px recommended)'}
                  </p>
                </div>
              </div>
              <input
                type="file"
                accept=".jpg,.jpeg,.png"
                onChange={handleArtworkFileChange}
                className="hidden"
              />
            </label>

            {artworkData && (
              <div className="flex items-start gap-4 p-4 rounded-xl bg-[#030509]/75 border border-[#D4AF37]/35">
                <img
                  src={artworkData.previewDataUrl}
                  alt="Validated Artwork Preview"
                  className={`${
                    releaseType === 'audio' ? 'w-24 h-24' : 'w-36 h-20'
                  } rounded-lg object-cover border border-[#D4AF37]/50 shrink-0 shadow-lg`}
                />
                <div className="min-w-0 flex-1 space-y-1.5 text-xs">
                  <p className="font-semibold text-white truncate">{artworkData.fileName}</p>
                  <p className="font-mono text-[11px] text-[#C8D0DB]">
                    {artworkData.width}×{artworkData.height}px · {artworkData.format} ·{' '}
                    <span
                      className={
                        artworkData.aspectRatioValid ? 'text-emerald-400' : 'text-[#F5D58A]'
                      }
                    >
                      {artworkData.aspectRatioValid ? 'Aspect Ratio Valid' : 'Aspect Ratio Warning'}
                    </span>
                  </p>
                  {artworkData.warnings.map((w, i) => (
                    <p key={i} className="text-[11px] text-[#F5D58A] leading-snug">
                      {w}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Section 3: Copyright & Official Credit Format */}
      <section className="luxury-card rounded-2xl p-6 sm:p-7 space-y-6">
        <div className="pb-4 border-b border-[#D4AF37]/20">
          <h3 className="font-display text-lg font-semibold text-[#F5D58A] tracking-wide">
            03. Copyright Declarations &amp; Official Label Credits
          </h3>
          <p className="text-xs text-[#8D9AAA] mt-1">
            Ownership declarations are recorded as submitted and require formal administrator verification in Copyright Management.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div>
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">Artist Credit *</label>
            <input
              type="text"
              value={artistCredit}
              onChange={(e) => setArtistCredit(e.target.value)}
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
            />
          </div>
          <div>
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">
              Label / Distributor Credit *
            </label>
            <input
              type="text"
              value={labelCredit}
              onChange={(e) => setLabelCredit(e.target.value)}
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
            />
          </div>
          <div>
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">Copyright Year</label>
            <input
              type="text"
              value={copyrightYear}
              onChange={(e) => setCopyrightYear(e.target.value)}
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">Copyright Owner</label>
            <input
              type="text"
              value={copyrightOwner}
              onChange={(e) => setCopyrightOwner(e.target.value)}
              placeholder="Per verified agreement"
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">
              Phonographic Copyright (℗)
            </label>
            <input
              type="text"
              value={phonographicCopyright}
              onChange={(e) => setPhonographicCopyright(e.target.value)}
              placeholder={`℗ ${copyrightYear} Music High Sky / Sunil Kumar (as per verified agreement)`}
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">
              Publishing Copyright (©)
            </label>
            <input
              type="text"
              value={publishingCopyright}
              onChange={(e) => setPublishingCopyright(e.target.value)}
              placeholder={`© ${copyrightYear} Verified Publishing Owner`}
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="block text-[#C8D0DB] mb-1.5 font-medium">
              Custom Release Credit Notes
            </label>
            <input
              type="text"
              value={creditNotes}
              onChange={(e) => setCreditNotes(e.target.value)}
              placeholder="Optional per-release credit formatting instructions"
              className="w-full px-3.5 py-2.5 luxury-input rounded-lg"
            />
          </div>
        </div>
      </section>

      {/* Section 4: Intended DSP Distribution Destinations */}
      <section className="luxury-card rounded-2xl p-6 sm:p-7 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#D4AF37]/20">
          <div>
            <h3 className="font-display text-lg font-semibold text-[#F5D58A] tracking-wide">
              04. Intended Distribution Destinations
            </h3>
            <p className="text-xs text-[#8D9AAA] mt-1">
              Distributor Label: <strong className="text-[#F5D58A]">Music High Sky</strong> · Worldwide Delivery Directory
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => setSelectedPlatforms(availablePlatforms.map((p) => p.name))}
              className="text-[#00D5FF] hover:text-white font-medium cursor-pointer"
            >
              Select All
            </button>
            <span className="text-[#D4AF37]/40">·</span>
            <button
              type="button"
              onClick={() => setSelectedPlatforms([])}
              className="text-[#8D9AAA] hover:text-white cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {availablePlatforms.map((p) => {
            const checked = selectedPlatforms.includes(p.name);
            return (
              <label
                key={p.id}
                className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all cursor-pointer ${
                  checked
                    ? 'bg-[#00A8FF]/12 border-[#00A8FF]/55 text-white shadow-[0_0_20px_-10px_rgba(0,168,255,0.45)]'
                    : 'bg-[#030509]/70 border-[#D4AF37]/15 text-[#8D9AAA] hover:border-[#D4AF37]/40'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => togglePlatform(p.name)}
                  className="mt-0.5 accent-[#00A8FF]"
                />
                <div className="min-w-0">
                  <span className="block text-xs font-semibold text-white">{p.name}</span>
                  <span className="block text-[11px] text-[#8D9AAA] leading-snug mt-0.5">
                    {p.regionScope}
                    {p.serviceAvailabilityNote ? ` · ${p.serviceAvailabilityNote}` : ''}
                  </span>
                </div>
              </label>
            );
          })}
        </div>

        <div className="p-4 rounded-xl bg-[#030509]/70 border border-[#00A8FF]/25 flex items-start gap-3 text-xs text-[#C8D0DB]">
          <Info className="w-4 h-4 text-[#00D5FF] shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Submitting this release creates transparent <strong className="text-white">Planned</strong> distribution records for each selected DSP. Songs are only marked <strong className="text-[#00D5FF]">Delivered</strong> or <strong className="text-emerald-400">Live</strong> after label approval and confirmed partner/aggregator delivery with reference IDs.
          </p>
        </div>

        {/* External Cloud Storage Offload Option */}
        {CLOUD_STORAGE_BUCKET && (
          <div className="p-4 rounded-xl bg-[#030509]/75 border border-[#D4AF37]/25 space-y-2.5 text-xs">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={uploadToCloudStorage}
                onChange={(e) => setUploadToCloudStorage(e.target.checked)}
                className="mt-0.5 accent-[#00A8FF]"
              />
              <span>
                <strong className="text-[#F5D58A]">
                  Offload Artwork &amp; Media Files to Firebase Storage
                </strong>{' '}
                <span className="text-[#8D9AAA]">
                  ({CLOUD_STORAGE_BUCKET}) — stores compact HTTPS cloud URLs in Firestore instead of embedding binary assets locally.
                </span>
              </span>
            </label>
            {submitting && cloudUploadStatus && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-[11px] text-[#00D5FF]">
                  <span>{cloudUploadStatus}</span>
                  <span className="font-mono">{cloudUploadPercent}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[#06152E] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#00A8FF] to-[#F5D58A] transition-all duration-200"
                    style={{ width: `${Math.max(6, cloudUploadPercent)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Submit Actions */}
        <div className="pt-4 flex flex-wrap items-center justify-end gap-3 border-t border-[#D4AF37]/20">
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleSubmit('Draft')}
            className="btn-electric inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-xl cursor-pointer whitespace-nowrap disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            Save as Draft
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleSubmit('Submitted')}
            className="btn-gold inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold rounded-xl cursor-pointer whitespace-nowrap disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {submitting ? 'Submitting Release...' : 'Submit for Label Approval'}
          </button>
        </div>
      </section>
    </div>
  );
};
