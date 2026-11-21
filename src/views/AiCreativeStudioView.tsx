import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Music2,
  Image as ImageIcon,
  Film,
  Mic,
  Square,
  Upload,
  Sparkles,
  Download,
  Copy,
  Check,
  Trash2,
  BookmarkPlus,
  Loader2,
  Wand2,
  X,
} from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { apiFetchJson } from '../utils/apiClient';

type StudioTab = 'music' | 'image' | 'video' | 'transcribe';

interface SavedCreation {
  id: number;
  kind: string;
  model: string;
  title: string;
  prompt: string;
  outputText?: string | null;
  mimeType?: string | null;
  createdAt: string;
}

function readFileAsBase64(file: File): Promise<{ base64: string; dataUrl: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const commaIdx = dataUrl.indexOf(',');
      const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
      resolve({
        base64,
        dataUrl,
        mimeType: file.type || 'application/octet-stream',
      });
    };
    reader.onerror = () => reject(new Error('Failed to read selected file.'));
    reader.readAsDataURL(file);
  });
}

export const AiCreativeStudioView: React.FC = () => {
  const { pushToast } = usePlatform();
  const [activeTab, setActiveTab] = useState<StudioTab>('music');

  // Vault history (PostgreSQL)
  const [vaultItems, setVaultItems] = useState<SavedCreation[]>([]);
  const [vaultLoading, setVaultLoading] = useState(false);

  const loadVault = useCallback(async () => {
    setVaultLoading(true);
    try {
      const data = await apiFetchJson<{ creations: SavedCreation[] }>('/api/sql/creations');
      setVaultItems(data.creations ?? []);
    } catch {
      // Silent graceful degradation if unauthenticated or offline
    } finally {
      setVaultLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVault();
  }, [loadVault]);

  const saveToVault = async (payload: {
    kind: StudioTab;
    model: string;
    title: string;
    prompt: string;
    outputText?: string;
    mimeType?: string;
  }) => {
    try {
      const res = await apiFetchJson<{ creation: SavedCreation }>('/api/sql/creations', {
        method: 'POST',
        body: payload,
      });
      setVaultItems((prev) => [res.creation, ...prev]);
      pushToast('Saved to Studio Vault.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to save record.', 'error');
    }
  };

  const removeVaultItem = async (id: number) => {
    try {
      await apiFetchJson(`/api/sql/creations/${id}`, { method: 'DELETE' });
      setVaultItems((prev) => prev.filter((item) => item.id !== id));
      pushToast('Removed from Studio Vault.', 'info');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to delete record.', 'error');
    }
  };

  // =========================================================================
  // 1. MUSIC LAB (LYRIA 3 CLIP & PRO)
  // =========================================================================
  const [musicPrompt, setMusicPrompt] = useState(
    'Modern Indian cinematic romantic anthem with warm solo violin, lush orchestral strings, subtle tabla percussion, and heartfelt Hindi ballad groove, 92 BPM.'
  );
  const [musicMode, setMusicMode] = useState<'clip' | 'pro'>('clip');
  const [musicRefImage, setMusicRefImage] = useState<{
    name: string;
    base64: string;
    dataUrl: string;
    mimeType: string;
  } | null>(null);
  const [musicBusy, setMusicBusy] = useState(false);
  const [musicResult, setMusicResult] = useState<{
    audioDataUrl: string;
    mimeType: string;
    lyrics: string;
    model: string;
  } | null>(null);

  const handleMusicImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await readFileAsBase64(file);
      setMusicRefImage({ name: file.name, ...parsed });
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Image upload failed.', 'error');
    }
  };

  const handleGenerateMusic = async () => {
    if (!musicPrompt.trim()) {
      pushToast('Enter a musical direction prompt first.', 'error');
      return;
    }
    setMusicBusy(true);
    setMusicResult(null);
    try {
      const res = await apiFetchJson<{
        audioDataUrl: string;
        mimeType: string;
        lyrics: string;
        model: string;
      }>('/api/ai/music', {
        method: 'POST',
        body: {
          prompt: musicPrompt,
          mode: musicMode,
          imageBase64: musicRefImage?.base64,
          imageMimeType: musicRefImage?.mimeType,
        },
      });
      setMusicResult(res);
      pushToast('Original music composition generated.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Music generation failed.', 'error');
    } finally {
      setMusicBusy(false);
    }
  };

  // =========================================================================
  // 2. ARTWORK STUDIO (GEMINI NANO BANANA 2.1)
  // =========================================================================
  const [imagePrompt, setImagePrompt] = useState(
    'Luxury midnight navy and metallic gold album cover artwork featuring an acoustic violin illuminated by electric cyan soundwaves, dramatic studio lighting, ultra-sharp editorial photography, no text.'
  );
  const [imageAspect, setImageAspect] = useState('1:1');
  const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [editSourceImage, setEditSourceImage] = useState<{
    name: string;
    base64: string;
    dataUrl: string;
    mimeType: string;
  } | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageResult, setImageResult] = useState<{
    imageDataUrl: string;
    mimeType: string;
    caption: string;
    model: string;
  } | null>(null);

  const handleEditImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await readFileAsBase64(file);
      setEditSourceImage({ name: file.name, ...parsed });
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to read image.', 'error');
    }
  };

  const handleGenerateImage = async () => {
    if (!imagePrompt.trim()) {
      pushToast('Enter a cover art or edit prompt first.', 'error');
      return;
    }
    setImageBusy(true);
    setImageResult(null);
    try {
      const res = await apiFetchJson<{
        imageDataUrl: string;
        mimeType: string;
        caption: string;
        model: string;
      }>('/api/ai/image', {
        method: 'POST',
        body: {
          prompt: imagePrompt,
          aspectRatio: imageAspect,
          imageSize,
          sourceImageBase64: editSourceImage?.base64,
          sourceImageMimeType: editSourceImage?.mimeType,
        },
      });
      setImageResult(res);
      pushToast(
        editSourceImage ? 'Edited visual rendered successfully.' : 'Artwork generated successfully.',
        'success'
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Image generation failed.', 'error');
    } finally {
      setImageBusy(false);
    }
  };

  // =========================================================================
  // 3. VIDEO STUDIO (GEMINI OMNI 1.2 FLASH — TEXT-TO-VIDEO & IMAGE-TO-VIDEO)
  // =========================================================================
  const [videoMode, setVideoMode] = useState<'text' | 'image'>('text');
  const [videoPrompt, setVideoPrompt] = useState(
    'Slow cinematic camera push through a luxury midnight-blue recording studio bathed in warm golden spotlights and electric blue acoustic light ribbons, shallow depth of field, atmospheric dust motes.'
  );
  const [videoAspect, setVideoAspect] = useState<'16:9' | '9:16'>('16:9');
  const [videoDuration, setVideoDuration] = useState<'5s' | '10s'>('5s');
  const [videoSourceImage, setVideoSourceImage] = useState<{
    name: string;
    base64: string;
    dataUrl: string;
    mimeType: string;
  } | null>(null);
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoResult, setVideoResult] = useState<{
    videoDataUrl: string;
    mimeType: string;
    model: string;
    aspectRatio: string;
    duration: string;
  } | null>(null);

  const handleVideoImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await readFileAsBase64(file);
      setVideoSourceImage({ name: file.name, ...parsed });
      setVideoMode('image');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to read reference frame.', 'error');
    }
  };

  const handleGenerateVideo = async () => {
    if (!videoPrompt.trim()) {
      pushToast('Enter a video direction prompt first.', 'error');
      return;
    }
    if (videoMode === 'image' && !videoSourceImage) {
      pushToast('Upload an image frame to animate, or switch to Text-to-Video.', 'error');
      return;
    }
    setVideoBusy(true);
    setVideoResult(null);
    try {
      const res = await apiFetchJson<{
        videoDataUrl: string;
        mimeType: string;
        model: string;
        aspectRatio: string;
        duration: string;
      }>('/api/ai/video', {
        method: 'POST',
        body: {
          prompt: videoPrompt,
          aspectRatio: videoAspect,
          duration: videoDuration,
          imageBase64: videoMode === 'image' ? videoSourceImage?.base64 : undefined,
          imageMimeType: videoMode === 'image' ? videoSourceImage?.mimeType : undefined,
        },
      });
      setVideoResult(res);
      pushToast('Music teaser video rendered successfully.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Video generation failed.', 'error');
    } finally {
      setVideoBusy(false);
    }
  };

  // =========================================================================
  // 4. AUDIO TRANSCRIPTION (GEMINI 3.5 TRANSCRIBE)
  // =========================================================================
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const [audioDraft, setAudioDraft] = useState<{
    name: string;
    base64: string;
    dataUrl: string;
    mimeType: string;
  } | null>(null);
  const [transcribePrompt, setTranscribePrompt] = useState(
    'Transcribe lyrics or studio voice notes accurately, preserving Hindi, Haryanvi, and English phrasing.'
  );
  const [transcribeBusy, setTranscribeBusy] = useState(false);
  const [transcriptText, setTranscriptText] = useState('');
  const [copiedTranscript, setCopiedTranscript] = useState(false);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        const blobMime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: blobMime });
        const file = new File([blob], `studio-recording-${Date.now()}.webm`, { type: blobMime });
        try {
          const parsed = await readFileAsBase64(file);
          setAudioDraft({ name: file.name, ...parsed });
          pushToast('Microphone recording ready for transcription.', 'success');
        } catch {
          pushToast('Could not encode recorded audio.', 'error');
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch {
      pushToast('Microphone access denied or unavailable.', 'error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleAudioFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await readFileAsBase64(file);
      setAudioDraft({ name: file.name, ...parsed });
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to read audio file.', 'error');
    }
  };

  const handleTranscribe = async () => {
    if (!audioDraft) {
      pushToast('Record or upload an audio clip first.', 'error');
      return;
    }
    setTranscribeBusy(true);
    setTranscriptText('');
    try {
      const res = await apiFetchJson<{ transcript: string; model: string }>('/api/ai/transcribe', {
        method: 'POST',
        body: {
          audioBase64: audioDraft.base64,
          mimeType: audioDraft.mimeType.split(';')[0] || 'audio/webm',
          prompt: transcribePrompt,
        },
      });
      setTranscriptText(res.transcript);
      pushToast('Audio transcribed successfully.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Transcription failed.', 'error');
    } finally {
      setTranscribeBusy(false);
    }
  };

  const handleCopyTranscript = async () => {
    if (!transcriptText) return;
    try {
      await navigator.clipboard.writeText(transcriptText);
      setCopiedTranscript(true);
      window.setTimeout(() => setCopiedTranscript(false), 1800);
    } catch {
      pushToast('Clipboard copy failed.', 'error');
    }
  };

  const tabs: { id: StudioTab; label: string; sub: string; icon: React.FC<{ className?: string }> }[] =
    [
      { id: 'music', label: 'Music Lab', sub: 'Lyria 3 Clip & Pro', icon: Music2 },
      { id: 'image', label: 'Artwork Studio', sub: 'Create & Edit Art', icon: ImageIcon },
      { id: 'video', label: 'Video Teasers', sub: 'Text & Image to Video', icon: Film },
      { id: 'transcribe', label: 'Lyric Transcriber', sub: 'Mic & Audio Upload', icon: Mic },
    ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#00D5FF]">
            Music High Sky · Production Suite
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-gold-gradient mt-1">
            AI Creative Studio
          </h1>
          <p className="text-sm text-[#C8D0DB] mt-1 max-w-2xl">
            Compose reference tracks, design or retouch release artwork, animate official visual teasers, and transcribe studio vocal takes for Sunil Kumar.
          </p>
        </div>
      </div>

      {/* Studio Mode Selector */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`text-left p-4 rounded-xl transition-all cursor-pointer border ${
                active
                  ? 'bg-gradient-to-br from-[#D4AF37]/20 via-[#06152E] to-[#030509] border-[#F5D58A]/65 shadow-[0_0_24px_-10px_rgba(212,175,55,0.45)]'
                  : 'luxury-card border-[#D4AF37]/20 hover:border-[#00A8FF]/45'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <Icon className={`w-5 h-5 ${active ? 'text-[#F5D58A]' : 'text-[#00D5FF]'}`} />
                {active && (
                  <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#F5D58A]">
                    Active
                  </span>
                )}
              </div>
              <p className="font-display text-sm font-bold text-white mt-2.5">{tab.label}</p>
              <p className="text-xs text-[#8D9AAA] mt-0.5">{tab.sub}</p>
            </button>
          );
        })}
      </div>

      {/* Main Studio Workspace + Saved Vault */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-8 space-y-6">
          {/* ================= MUSIC LAB ================= */}
          {activeTab === 'music' && (
            <section className="luxury-card rounded-2xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-bold text-[#F5D58A]">
                    Lyria Music Composition Lab
                  </h2>
                  <p className="text-xs text-[#8D9AAA] mt-0.5">
                    Generate 30-second musical sketches or full-length compositions from text or moodboard artwork.
                  </p>
                </div>
                <div className="flex rounded-lg bg-[#030509] p-1 border border-[#D4AF37]/25">
                  <button
                    type="button"
                    onClick={() => setMusicMode('clip')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                      musicMode === 'clip'
                        ? 'bg-[#D4AF37] text-[#030509]'
                        : 'text-[#C8D0DB] hover:text-white'
                    }`}
                  >
                    30s Clip (Lyria Clip)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMusicMode('pro')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                      musicMode === 'pro'
                        ? 'bg-[#D4AF37] text-[#030509]'
                        : 'text-[#C8D0DB] hover:text-white'
                    }`}
                  >
                    Full Track (Lyria Pro)
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[#C8D0DB]">
                  Musical Direction, Instrumentation &amp; Mood
                </label>
                <textarea
                  rows={4}
                  value={musicPrompt}
                  onChange={(e) => setMusicPrompt(e.target.value)}
                  placeholder="Describe tempo, instruments, genre (Hindi Romantic, Haryanvi Folk-Pop, Cinematic Rap), vocal mood..."
                  className="w-full rounded-xl luxury-input px-4 py-3 text-sm leading-relaxed"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                <div className="flex items-center gap-3">
                  <label className="btn-electric inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{musicRefImage ? 'Replace Mood Image' : 'Optional Moodboard Image'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleMusicImagePick}
                      className="hidden"
                    />
                  </label>
                  {musicRefImage && (
                    <div className="flex items-center gap-2 bg-[#030509] border border-[#00A8FF]/30 rounded-lg px-2.5 py-1.5">
                      <img
                        src={musicRefImage.dataUrl}
                        alt="Reference mood"
                        className="w-7 h-7 rounded object-cover"
                      />
                      <span className="text-xs text-[#C8D0DB] max-w-[140px] truncate">
                        {musicRefImage.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => setMusicRefImage(null)}
                        aria-label="Remove mood image"
                        className="text-[#8D9AAA] hover:text-rose-300 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={musicBusy}
                  onClick={handleGenerateMusic}
                  className="btn-gold inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs uppercase tracking-[0.12em] cursor-pointer disabled:opacity-60"
                >
                  {musicBusy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Composing Audio...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Generate Music
                    </>
                  )}
                </button>
              </div>

              {musicResult && (
                <div className="mt-4 rounded-xl bg-[#030509]/90 border border-[#D4AF37]/35 p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-[#F5D58A]">Generated Master Preview</p>
                      <p className="text-[11px] text-[#8D9AAA]">{musicResult.model}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={musicResult.audioDataUrl}
                        download={`music-high-sky-${Date.now()}.mp3`}
                        className="btn-electric inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download Audio
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          saveToVault({
                            kind: 'music',
                            model: musicResult.model,
                            title: musicPrompt.slice(0, 64),
                            prompt: musicPrompt,
                            outputText: musicResult.lyrics || 'Generated audio composition',
                            mimeType: musicResult.mimeType,
                          })
                        }
                        className="btn-gold inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer"
                      >
                        <BookmarkPlus className="w-3.5 h-3.5" />
                        Save Log
                      </button>
                    </div>
                  </div>
                  <audio controls src={musicResult.audioDataUrl} className="w-full" />
                  {musicResult.lyrics && (
                    <div className="rounded-lg bg-[#06152E]/60 border border-[#00A8FF]/20 p-4">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-[#00D5FF] font-semibold mb-2">
                        Generated Lyrics &amp; Structure
                      </p>
                      <pre className="text-xs text-[#C8D0DB] whitespace-pre-wrap font-sans leading-relaxed">
                        {musicResult.lyrics}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* ================= ARTWORK STUDIO ================= */}
          {activeTab === 'image' && (
            <section className="luxury-card rounded-2xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-bold text-[#F5D58A]">
                    Cover Artwork &amp; Visual Editor
                  </h2>
                  <p className="text-xs text-[#8D9AAA] mt-0.5">
                    Generate original release covers or upload an image to retouch lighting, style, and atmosphere.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[#C8D0DB]">
                    Aspect Ratio
                  </label>
                  <select
                    value={imageAspect}
                    onChange={(e) => setImageAspect(e.target.value)}
                    className="w-full rounded-xl luxury-input px-3.5 py-2.5 text-sm"
                  >
                    <option value="1:1">1:1 — Official Cover Art</option>
                    <option value="16:9">16:9 — YouTube Thumbnail / Banner</option>
                    <option value="9:16">9:16 — Reels / Shorts Poster</option>
                    <option value="4:3">4:3 — Press Kit Frame</option>
                    <option value="3:4">3:4 — Concert Poster</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[#C8D0DB]">
                    Output Resolution
                  </label>
                  <select
                    value={imageSize}
                    onChange={(e) => setImageSize(e.target.value as '1K' | '2K' | '4K')}
                    className="w-full rounded-xl luxury-input px-3.5 py-2.5 text-sm"
                  >
                    <option value="1K">1K — Fast Concept Preview</option>
                    <option value="2K">2K — High-Definition Promo</option>
                    <option value="4K">4K — Print &amp; Mastering Detail</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[#C8D0DB]">
                  {editSourceImage ? 'Image Edit Instructions' : 'Artwork Concept Prompt'}
                </label>
                <textarea
                  rows={4}
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  placeholder="Describe the cover art scene, or describe the edits you want applied to your uploaded image..."
                  className="w-full rounded-xl luxury-input px-4 py-3 text-sm leading-relaxed"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <label className="btn-electric inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{editSourceImage ? 'Change Source Photo' : 'Upload Image to Edit'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleEditImagePick}
                      className="hidden"
                    />
                  </label>
                  {editSourceImage && (
                    <div className="flex items-center gap-2 bg-[#030509] border border-[#D4AF37]/35 rounded-lg px-2.5 py-1.5">
                      <img
                        src={editSourceImage.dataUrl}
                        alt="Edit source"
                        className="w-8 h-8 rounded object-cover"
                      />
                      <span className="text-xs text-[#F5D58A] max-w-[150px] truncate">
                        Editing: {editSourceImage.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditSourceImage(null)}
                        aria-label="Clear source image"
                        className="text-[#8D9AAA] hover:text-rose-300 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={imageBusy}
                  onClick={handleGenerateImage}
                  className="btn-gold inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs uppercase tracking-[0.12em] cursor-pointer disabled:opacity-60"
                >
                  {imageBusy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Rendering Visual...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4" />
                      {editSourceImage ? 'Apply Image Edit' : 'Generate Artwork'}
                    </>
                  )}
                </button>
              </div>

              {imageResult && (
                <div className="mt-4 rounded-xl bg-[#030509]/90 border border-[#D4AF37]/35 p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-[#F5D58A]">Rendered Visual Output</p>
                      <p className="text-[11px] text-[#8D9AAA]">
                        {imageResult.model} · {imageAspect} · {imageSize}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={imageResult.imageDataUrl}
                        download={`music-high-sky-art-${Date.now()}.png`}
                        className="btn-electric inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download PNG
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          saveToVault({
                            kind: 'image',
                            model: imageResult.model,
                            title: `${editSourceImage ? 'Edit' : 'Artwork'} (${imageAspect} ${imageSize})`,
                            prompt: imagePrompt,
                            outputText: imageResult.caption || `Generated ${imageAspect} visual`,
                            mimeType: imageResult.mimeType,
                          })
                        }
                        className="btn-gold inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer"
                      >
                        <BookmarkPlus className="w-3.5 h-3.5" />
                        Save Log
                      </button>
                    </div>
                  </div>
                  <div className="rounded-xl overflow-hidden border border-[#D4AF37]/20 bg-[#020817] flex justify-center">
                    <img
                      src={imageResult.imageDataUrl}
                      alt="Generated music artwork"
                      className="max-h-[520px] w-auto object-contain"
                    />
                  </div>
                  {imageResult.caption && (
                    <p className="text-xs text-[#C8D0DB] leading-relaxed">{imageResult.caption}</p>
                  )}
                </div>
              )}
            </section>
          )}

          {/* ================= VIDEO STUDIO ================= */}
          {activeTab === 'video' && (
            <section className="luxury-card rounded-2xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-bold text-[#F5D58A]">
                    Official Teaser &amp; Image-to-Video Studio
                  </h2>
                  <p className="text-xs text-[#8D9AAA] mt-0.5">
                    Render cinematic video teasers from text prompts or animate uploaded cover artwork into motion.
                  </p>
                </div>
                <div className="flex rounded-lg bg-[#030509] p-1 border border-[#D4AF37]/25">
                  <button
                    type="button"
                    onClick={() => setVideoMode('text')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                      videoMode === 'text'
                        ? 'bg-[#D4AF37] text-[#030509]'
                        : 'text-[#C8D0DB] hover:text-white'
                    }`}
                  >
                    Text to Video
                  </button>
                  <button
                    type="button"
                    onClick={() => setVideoMode('image')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                      videoMode === 'image'
                        ? 'bg-[#D4AF37] text-[#030509]'
                        : 'text-[#C8D0DB] hover:text-white'
                    }`}
                  >
                    Animate Image
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[#C8D0DB]">
                    Video Format
                  </label>
                  <select
                    value={videoAspect}
                    onChange={(e) => setVideoAspect(e.target.value as '16:9' | '9:16')}
                    className="w-full rounded-xl luxury-input px-3.5 py-2.5 text-sm"
                  >
                    <option value="16:9">16:9 — Landscape (YouTube / Widescreen)</option>
                    <option value="9:16">9:16 — Portrait (Reels / YouTube Shorts)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[#C8D0DB]">
                    Clip Duration
                  </label>
                  <select
                    value={videoDuration}
                    onChange={(e) => setVideoDuration(e.target.value as '5s' | '10s')}
                    className="w-full rounded-xl luxury-input px-3.5 py-2.5 text-sm"
                  >
                    <option value="5s">5 Seconds — Quick Canvas Loop</option>
                    <option value="10s">10 Seconds — Extended Promo Teaser</option>
                  </select>
                </div>
              </div>

              {videoMode === 'image' && (
                <div className="rounded-xl bg-[#030509]/80 border border-dashed border-[#00A8FF]/40 p-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {videoSourceImage ? (
                      <img
                        src={videoSourceImage.dataUrl}
                        alt="Starting frame"
                        className="w-16 h-16 rounded-lg object-cover ring-1 ring-[#D4AF37]/50"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-[#06152E] flex items-center justify-center border border-[#D4AF37]/25">
                        <ImageIcon className="w-6 h-6 text-[#8D9AAA]" />
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold text-white">
                        {videoSourceImage ? videoSourceImage.name : 'Upload Starting Cover Art or Portrait'}
                      </p>
                      <p className="text-[11px] text-[#8D9AAA]">
                        PNG or JPG frame that will be animated smoothly into a motion clip.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="btn-electric inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{videoSourceImage ? 'Change Image' : 'Select Image'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleVideoImagePick}
                        className="hidden"
                      />
                    </label>
                    {videoSourceImage && (
                      <button
                        type="button"
                        onClick={() => setVideoSourceImage(null)}
                        className="p-2 text-[#8D9AAA] hover:text-rose-300 cursor-pointer"
                        aria-label="Remove frame"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[#C8D0DB]">
                  {videoMode === 'image' ? 'Motion & Camera Direction' : 'Cinematic Video Prompt'}
                </label>
                <textarea
                  rows={4}
                  value={videoPrompt}
                  onChange={(e) => setVideoPrompt(e.target.value)}
                  placeholder="Describe camera movement, lighting shifts, atmospheric motion, and mood..."
                  className="w-full rounded-xl luxury-input px-4 py-3 text-sm leading-relaxed"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={videoBusy}
                  onClick={handleGenerateVideo}
                  className="btn-gold inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs uppercase tracking-[0.12em] cursor-pointer disabled:opacity-60"
                >
                  {videoBusy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Rendering Video (may take 30-90s)...
                    </>
                  ) : (
                    <>
                      <Film className="w-4 h-4" />
                      {videoMode === 'image' ? 'Animate Image to Video' : 'Generate Video'}
                    </>
                  )}
                </button>
              </div>

              {videoResult && (
                <div className="mt-4 rounded-xl bg-[#030509]/90 border border-[#D4AF37]/35 p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-[#F5D58A]">Rendered Motion Teaser</p>
                      <p className="text-[11px] text-[#8D9AAA]">
                        {videoResult.model} · {videoResult.aspectRatio} · {videoResult.duration}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={videoResult.videoDataUrl}
                        download={`music-high-sky-teaser-${Date.now()}.mp4`}
                        className="btn-electric inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download MP4
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          saveToVault({
                            kind: 'video',
                            model: videoResult.model,
                            title: `${videoMode === 'image' ? 'Image Animation' : 'Text Video'} (${videoResult.aspectRatio})`,
                            prompt: videoPrompt,
                            outputText: `Rendered ${videoResult.duration} ${videoResult.aspectRatio} teaser`,
                            mimeType: videoResult.mimeType,
                          })
                        }
                        className="btn-gold inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer"
                      >
                        <BookmarkPlus className="w-3.5 h-3.5" />
                        Save Log
                      </button>
                    </div>
                  </div>
                  <div className="rounded-xl overflow-hidden border border-[#D4AF37]/20 bg-black flex justify-center">
                    <video
                      controls
                      playsInline
                      src={videoResult.videoDataUrl}
                      className="max-h-[480px] w-full object-contain"
                    />
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ================= AUDIO TRANSCRIPTION ================= */}
          {activeTab === 'transcribe' && (
            <section className="luxury-card rounded-2xl p-6 space-y-5">
              <div>
                <h2 className="font-display text-lg font-bold text-[#F5D58A]">
                  Vocal &amp; Lyric Audio Transcriber
                </h2>
                <p className="text-xs text-[#8D9AAA] mt-0.5">
                  Record live songwriting ideas, vocal hooks, or upload studio voice memos to transcribe Hindi, Haryanvi, and English lyrics.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl bg-[#030509]/85 border border-[#D4AF37]/25 p-5 flex flex-col items-center justify-center text-center gap-3">
                  <button
                    type="button"
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`w-16 h-16 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                      isRecording
                        ? 'bg-rose-600 text-white shadow-[0_0_28px_rgba(225,29,72,0.55)]'
                        : 'btn-gold'
                    }`}
                    aria-label={isRecording ? 'Stop recording' : 'Start microphone recording'}
                  >
                    {isRecording ? <Square className="w-6 h-6" /> : <Mic className="w-7 h-7" />}
                  </button>
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {isRecording ? `Recording · ${recordSeconds}s` : 'Record with Microphone'}
                    </p>
                    <p className="text-xs text-[#8D9AAA] mt-0.5">
                      {isRecording ? 'Click stop when finished speaking or singing' : 'Capture live vocal memos directly'}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl bg-[#030509]/85 border border-dashed border-[#00A8FF]/35 p-5 flex flex-col items-center justify-center text-center gap-3">
                  <Upload className="w-7 h-7 text-[#00D5FF]" />
                  <div>
                    <p className="text-sm font-semibold text-white">Upload Audio File</p>
                    <p className="text-xs text-[#8D9AAA] mt-0.5">MP3, WAV, M4A, OGG, or WEBM</p>
                  </div>
                  <label className="btn-electric inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer">
                    <span>Choose Audio</span>
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={handleAudioFilePick}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {audioDraft && (
                <div className="rounded-xl bg-[#06152E]/65 border border-[#00A8FF]/30 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-[#00D5FF] truncate">{audioDraft.name}</p>
                    <button
                      type="button"
                      onClick={() => setAudioDraft(null)}
                      className="text-[#8D9AAA] hover:text-rose-300 cursor-pointer"
                      aria-label="Remove audio clip"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <audio controls src={audioDraft.dataUrl} className="w-full" />
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[#C8D0DB]">
                  Transcription Instructions
                </label>
                <input
                  type="text"
                  value={transcribePrompt}
                  onChange={(e) => setTranscribePrompt(e.target.value)}
                  className="w-full rounded-xl luxury-input px-4 py-2.5 text-sm"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={transcribeBusy || !audioDraft}
                  onClick={handleTranscribe}
                  className="btn-gold inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs uppercase tracking-[0.12em] cursor-pointer disabled:opacity-50"
                >
                  {transcribeBusy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Transcribing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Transcribe Audio
                    </>
                  )}
                </button>
              </div>

              {transcriptText && (
                <div className="rounded-xl bg-[#030509]/90 border border-[#D4AF37]/35 p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#F5D58A]">
                      Transcript Output
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCopyTranscript}
                        className="btn-electric inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        {copiedTranscript ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedTranscript ? 'Copied' : 'Copy Text'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          saveToVault({
                            kind: 'transcribe',
                            model: 'gemini-3.5-transcribe',
                            title: audioDraft?.name || 'Studio Vocal Transcript',
                            prompt: transcribePrompt,
                            outputText: transcriptText,
                            mimeType: audioDraft?.mimeType,
                          })
                        }
                        className="btn-gold inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer"
                      >
                        <BookmarkPlus className="w-3.5 h-3.5" />
                        Save to Vault
                      </button>
                    </div>
                  </div>
                  <div className="rounded-lg bg-[#06152E]/55 border border-[#D4AF37]/15 p-4 text-sm text-white whitespace-pre-wrap leading-relaxed">
                    {transcriptText}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        {/* ================= SAVED STUDIO VAULT (PERSISTENT LOG) ================= */}
        <aside className="xl:col-span-4 luxury-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-base font-bold text-[#F5D58A]">Studio Vault</h3>
              <p className="text-xs text-[#8D9AAA]">Saved prompts, lyrics &amp; transcripts</p>
            </div>
            <span className="text-xs font-mono text-[#00D5FF] tabular-nums">
              {vaultItems.length} saved
            </span>
          </div>

          <div className="gold-divider" />

          {vaultLoading ? (
            <div className="py-10 flex items-center justify-center text-xs text-[#8D9AAA] gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#00D5FF]" />
              Loading studio vault...
            </div>
          ) : vaultItems.length === 0 ? (
            <div className="py-10 text-center space-y-1.5">
              <p className="text-xs font-semibold text-[#C8D0DB]">No saved studio logs yet</p>
              <p className="text-[11px] text-[#8D9AAA] leading-relaxed">
                Generate tracks, cover art, video teasers, or transcripts and save them here for your Music High Sky release archive.
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
              {vaultItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl bg-[#030509]/85 border border-[#D4AF37]/20 p-3.5 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#00D5FF]">
                        {item.kind} · {item.model}
                      </span>
                      <p className="text-xs font-semibold text-white truncate mt-0.5">{item.title}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeVaultItem(item.id)}
                      aria-label="Delete saved item"
                      className="p-1 text-[#8D9AAA] hover:text-rose-300 shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {item.outputText && (
                    <p className="text-[11px] text-[#C8D0DB] line-clamp-4 whitespace-pre-wrap leading-relaxed">
                      {item.outputText}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
