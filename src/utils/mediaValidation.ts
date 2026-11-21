export interface ValidatedAudioResult {
  file: File;
  objectUrl: string;
  fileName: string;
  format: 'WAV' | 'FLAC' | 'MP3';
  fileSizeBytes: number;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  waveformPeaks: number[];
  warnings: string[];
}

export interface ValidatedArtworkResult {
  file: File;
  fileName: string;
  format: 'JPG' | 'JPEG' | 'PNG';
  width: number;
  height: number;
  aspectRatioValid: boolean;
  meetsRecommendedResolution: boolean;
  previewDataUrl: string;
  warnings: string[];
}

export interface ValidatedVideoResult {
  file: File;
  objectUrl: string;
  fileName: string;
  format: 'MP4' | 'MOV' | 'MKV' | 'WEBM';
  fileSizeBytes: number;
  durationSeconds: number;
  resolution: string;
  warnings: string[];
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, idx);
  return `${val.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

export function formatDuration(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export async function validateAndAnalyzeAudio(file: File): Promise<ValidatedAudioResult> {
  const ext = file.name.split('.').pop()?.toUpperCase() ?? '';
  if (ext !== 'WAV' && ext !== 'FLAC' && ext !== 'MP3') {
    throw new Error('Unsupported audio format. Please upload a WAV, FLAC, or MP3 master file.');
  }

  const maxSizeBytes = 500 * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    throw new Error('Audio file exceeds the 500 MB browser validation limit.');
  }

  const warnings: string[] = [];
  if (ext === 'MP3') {
    warnings.push(
      'MP3 accepted for preview/submission; lossless 16-bit/24-bit 44.1kHz WAV or FLAC is recommended for final DSP delivery.'
    );
  }

  const objectUrl = URL.createObjectURL(file);
  let durationSeconds = 0;
  let sampleRate = 44100;
  let channels = 2;
  let waveformPeaks: number[] = [];

  try {
    // Decode audio up to 60MB directly for true waveform peaks; for very large WAVs use HTMLAudioElement duration + deterministic fallback peaks
    if (file.size <= 60 * 1024 * 1024) {
      const arrayBuffer = await file.arrayBuffer();
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      try {
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
        durationSeconds = Math.round(audioBuffer.duration * 10) / 10;
        sampleRate = audioBuffer.sampleRate;
        channels = audioBuffer.numberOfChannels;

        const rawData = audioBuffer.getChannelData(0);
        const samples = 72;
        const blockSize = Math.max(1, Math.floor(rawData.length / samples));
        const peaks: number[] = [];
        let maxPeak = 0.01;
        for (let i = 0; i < samples; i++) {
          const start = blockSize * i;
          let sum = 0;
          const step = Math.max(1, Math.floor(blockSize / 120));
          let count = 0;
          for (let j = 0; j < blockSize && start + j < rawData.length; j += step) {
            sum += Math.abs(rawData[start + j]);
            count++;
          }
          const avg = count > 0 ? sum / count : 0;
          if (avg > maxPeak) maxPeak = avg;
          peaks.push(avg);
        }
        waveformPeaks = peaks.map((p) => Math.max(0.08, Math.round((p / maxPeak) * 100) / 100));
      } finally {
        await ctx.close().catch(() => {});
      }
    }
  } catch {
    warnings.push('Could not decode raw PCM peaks in browser; HTML5 audio preview remains active.');
  }

  if (durationSeconds === 0) {
    durationSeconds = await new Promise<number>((resolve) => {
      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => resolve(Math.round((audio.duration || 0) * 10) / 10);
      audio.onerror = () => resolve(0);
      audio.src = objectUrl;
    });
  }

  if (waveformPeaks.length === 0) {
    waveformPeaks = Array.from({ length: 72 }, (_, idx) => {
      const envelope = Math.sin((idx / 71) * Math.PI);
      const detail = 0.35 + 0.5 * Math.abs(Math.sin(idx * 0.75 + file.size % 11));
      return Math.max(0.12, Math.round(envelope * detail * 100) / 100);
    });
  }

  return {
    file,
    objectUrl,
    fileName: file.name,
    format: ext as 'WAV' | 'FLAC' | 'MP3',
    fileSizeBytes: file.size,
    durationSeconds,
    sampleRate,
    channels,
    waveformPeaks,
    warnings,
  };
}

export async function validateAndCompressArtwork(
  file: File,
  kind: 'cover_art' | 'video_thumbnail' = 'cover_art'
): Promise<ValidatedArtworkResult> {
  const ext = file.name.split('.').pop()?.toUpperCase() ?? '';
  if (ext !== 'JPG' && ext !== 'JPEG' && ext !== 'PNG') {
    throw new Error('Artwork must be a JPG or PNG image file.');
  }

  if (file.size > 30 * 1024 * 1024) {
    throw new Error('Artwork file exceeds 30 MB limit.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Unable to read image dimensions.'));
      image.src = objectUrl;
    });

    const width = img.naturalWidth;
    const height = img.naturalHeight;
    const warnings: string[] = [];

    let aspectRatioValid = true;
    let meetsRecommendedResolution = true;

    if (kind === 'cover_art') {
      const ratio = width / Math.max(1, height);
      aspectRatioValid = Math.abs(ratio - 1) <= 0.02;
      if (!aspectRatioValid) {
        warnings.push(
          `Cover artwork is ${width}×${height}px. DSPs strictly require a 1:1 square aspect ratio.`
        );
      }
      if (width < 1400 || height < 1400) {
        meetsRecommendedResolution = false;
        warnings.push(
          `Minimum DSP dimension is 1400×1400px (3000×3000px recommended). Uploaded: ${width}×${height}px.`
        );
      } else if (width < 3000 || height < 3000) {
        meetsRecommendedResolution = false;
        warnings.push(`Accepted (${width}×${height}px); 3000×3000px is recommended for Apple Music & Spotify.`);
      }
    } else {
      const ratio = width / Math.max(1, height);
      aspectRatioValid = Math.abs(ratio - 16 / 9) <= 0.08;
      if (!aspectRatioValid) {
        warnings.push(`Video thumbnail is ${width}×${height}px. 16:9 widescreen (1280×720 or 1920×1080) is recommended.`);
      }
      if (width < 1280 || height < 720) {
        meetsRecommendedResolution = false;
        warnings.push(`Recommended minimum thumbnail size is 1280×720px.`);
      }
    }

    // Generate compact preview Data URL (max 480px) safe for Cloud Firestore document storage
    const maxEdge = kind === 'cover_art' ? 420 : 520;
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Browser canvas context unavailable for artwork preview generation.');
    }
    ctx.drawImage(img, 0, 0, targetW, targetH);
    const previewDataUrl = canvas.toDataURL('image/jpeg', 0.82);

    return {
      file,
      fileName: file.name,
      format: ext as 'JPG' | 'JPEG' | 'PNG',
      width,
      height,
      aspectRatioValid,
      meetsRecommendedResolution,
      previewDataUrl,
      warnings,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function validateAndAnalyzeVideo(file: File): Promise<ValidatedVideoResult> {
  const ext = file.name.split('.').pop()?.toUpperCase() ?? '';
  if (ext !== 'MP4' && ext !== 'MOV' && ext !== 'MKV' && ext !== 'WEBM') {
    throw new Error('Unsupported video format. Please upload an MP4, MOV, MKV, or WEBM file.');
  }

  const objectUrl = URL.createObjectURL(file);
  const warnings: string[] = [];

  const meta = await new Promise<{ duration: number; width: number; height: number }>((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      resolve({
        duration: Math.round((video.duration || 0) * 10) / 10,
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
      });
    };
    video.onerror = () => resolve({ duration: 0, width: 0, height: 0 });
    video.src = objectUrl;
  });

  const resolution = meta.width && meta.height ? `${meta.width}x${meta.height}` : 'Unverified container';
  if (meta.width > 0 && meta.width < 1920) {
    warnings.push(`Detected ${resolution}. Full HD (1920x1080) or 4K master is recommended for official music videos.`);
  }

  return {
    file,
    objectUrl,
    fileName: file.name,
    format: ext as 'MP4' | 'MOV' | 'MKV' | 'WEBM',
    fileSizeBytes: file.size,
    durationSeconds: meta.duration,
    resolution,
    warnings,
  };
}
