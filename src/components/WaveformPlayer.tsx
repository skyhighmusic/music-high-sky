import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, Volume2 } from 'lucide-react';
import { formatDuration } from '../utils/mediaValidation';

interface WaveformPlayerProps {
  peaks: number[];
  audioUrl?: string;
  durationSeconds?: number;
  label?: string;
  compact?: boolean;
}

export const WaveformPlayer: React.FC<WaveformPlayerProps> = ({
  peaks,
  audioUrl,
  durationSeconds = 0,
  label,
  compact = false,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playerIdRef = useRef<string>(`mhs-wave-${Math.random().toString(36).slice(2, 10)}`);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(durationSeconds);

  useEffect(() => {
    setTotalDuration(durationSeconds);
  }, [durationSeconds]);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
  }, [audioUrl]);

  useEffect(() => {
    const handleOtherPlay = (event: Event) => {
      const custom = event as CustomEvent<{ id?: string }>;
      if (custom.detail?.id !== playerIdRef.current && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    };
    window.addEventListener('mhs-audio-play', handleOtherPlay);
    return () => window.removeEventListener('mhs-audio-play', handleOtherPlay);
  }, []);

  const progress = totalDuration > 0 ? Math.min(1, currentTime / totalDuration) : 0;
  const safePeaks =
    peaks && peaks.length > 0
      ? peaks
      : Array.from({ length: 64 }, (_, i) => 0.25 + 0.55 * Math.abs(Math.sin(i * 0.45)));

  const togglePlay = async () => {
    if (!audioRef.current || !audioUrl) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        window.dispatchEvent(new CustomEvent('mhs-audio-play', { detail: { id: playerIdRef.current } }));
        await audioRef.current.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    }
  };

  const handleSeek = (ratio: number) => {
    if (!audioRef.current || !audioUrl || !totalDuration) return;
    const next = Math.max(0, Math.min(totalDuration, ratio * totalDuration));
    audioRef.current.currentTime = next;
    setCurrentTime(next);
  };

  return (
    <div
      className={`bg-[#030509]/85 border border-[#00A8FF]/20 rounded-xl ${
        compact ? 'p-3' : 'p-4'
      } space-y-2.5`}
    >
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
          onLoadedMetadata={() => {
            if (audioRef.current?.duration && Number.isFinite(audioRef.current.duration)) {
              setTotalDuration(audioRef.current.duration);
            }
          }}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      <div className="flex items-center gap-3.5">
        <button
          type="button"
          onClick={togglePlay}
          disabled={!audioUrl}
          title={
            audioUrl
              ? isPlaying
                ? 'Pause audio preview'
                : 'Play audio preview'
              : 'Validated master audio waveform'
          }
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all ${
            audioUrl
              ? 'btn-gold cursor-pointer'
              : 'bg-[#06152E] border border-[#D4AF37]/30 text-[#D4AF37]/70 cursor-default'
          }`}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>

        <div className="flex-1 min-w-0">
          {label && (
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-xs font-semibold text-white truncate">{label}</span>
              <span className="text-[11px] font-mono tabular-nums text-[#00D5FF] shrink-0">
                {formatDuration(currentTime)} / {formatDuration(totalDuration)}
              </span>
            </div>
          )}

          <div
            role="slider"
            aria-label="Audio waveform scrubber"
            aria-valuemin={0}
            aria-valuemax={Math.round(totalDuration)}
            aria-valuenow={Math.round(currentTime)}
            tabIndex={0}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = (e.clientX - rect.left) / Math.max(1, rect.width);
              handleSeek(ratio);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') handleSeek(Math.min(1, progress + 0.05));
              if (e.key === 'ArrowLeft') handleSeek(Math.max(0, progress - 0.05));
            }}
            className={`flex items-end gap-[2px] w-full ${
              compact ? 'h-8' : 'h-12'
            } ${audioUrl ? 'cursor-pointer' : 'cursor-default'}`}
          >
            {safePeaks.map((amp, idx) => {
              const barRatio = idx / safePeaks.length;
              const active = barRatio <= progress && progress > 0;
              const heightPct = Math.max(16, Math.min(100, Math.round(amp * 100)));
              return (
                <div
                  key={idx}
                  style={{
                    height: `${heightPct}%`,
                    animationDelay: isPlaying ? `${(idx % 12) * 0.09}s` : undefined,
                  }}
                  className={`flex-1 rounded-[1px] transition-colors ${
                    active
                      ? 'bg-gradient-to-t from-[#0759C7] via-[#00A8FF] to-[#00D5FF]'
                      : 'bg-gradient-to-t from-[#0759C7]/40 to-[#00A8FF]/55 hover:to-[#00D5FF]/85'
                  } ${isPlaying ? 'animate-wave-bar' : ''}`}
                />
              );
            })}
          </div>
        </div>

        {!label && (
          <div className="flex items-center gap-1.5 text-xs font-mono tabular-nums text-[#C8D0DB] shrink-0">
            <Volume2 className="w-3.5 h-3.5 text-[#00A8FF]" />
            <span>{formatDuration(totalDuration)}</span>
          </div>
        )}
      </div>
    </div>
  );
};
