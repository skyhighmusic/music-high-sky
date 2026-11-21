import React from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Shuffle,
  Repeat,
  Repeat1,
  ListMusic,
  X,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { usePlatform } from '../context/PlatformContext';
import { formatDuration } from '../utils/mediaValidation';

export const PersistentMusicPlayer: React.FC = () => {
  const { brandLogoUrl } = usePlatform();
  const {
    queue,
    currentIndex,
    currentTrack,
    queueTitle,
    isPlaying,
    currentTime,
    duration,
    volume,
    muted,
    shuffle,
    repeatMode,
    queueDrawerOpen,
    setQueueDrawerOpen,
    togglePlayPause,
    playNext,
    playPrevious,
    seekTo,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeatMode,
    jumpToIndex,
    closePlayer,
  } = usePlayer();

  if (!currentTrack) return null;

  const totalDuration = duration || currentTrack.durationSeconds || 0;
  const progressPct = totalDuration > 0 ? Math.min(100, (currentTime / totalDuration) * 100) : 0;

  return (
    <>
      {/* Up Next / Active Playlist Queue Drawer */}
      {queueDrawerOpen && (
        <div className="fixed bottom-[88px] right-4 sm:right-6 z-50 w-[min(calc(100vw-2rem),380px)] max-h-[60vh] luxury-card border border-[#D4AF37]/40 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-[#D4AF37]/20 flex items-center justify-between gap-2 bg-[#040D22]/95">
            <div className="min-w-0">
              <p className="text-[10px] font-mono uppercase tracking-wider text-[#00D5FF]">
                Active Playback Queue ({queue.length})
              </p>
              <p className="text-xs font-display font-bold text-[#F5D58A] truncate">
                {queueTitle}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setQueueDrawerOpen(false)}
              aria-label="Close playback queue"
              className="p-1 text-[#8D9AAA] hover:text-white rounded cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto divide-y divide-[#D4AF37]/10 p-1.5">
            {queue.map((item, idx) => {
              const active = idx === currentIndex;
              return (
                <button
                  key={`${item.releaseId}-${idx}`}
                  type="button"
                  onClick={() => jumpToIndex(idx)}
                  className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#D4AF37]/15 border border-[#D4AF37]/35'
                      : 'hover:bg-[#06152E]/85'
                  }`}
                >
                  <span className="text-[11px] font-mono text-[#8D9AAA] w-5 text-right shrink-0">
                    {idx + 1}
                  </span>
                  {item.artworkUrl ? (
                    <img
                      src={item.artworkUrl}
                      alt={item.title}
                      className="w-9 h-9 rounded-md object-cover border border-[#D4AF37]/30 shrink-0"
                    />
                  ) : (
                    <img
                      src={brandLogoUrl}
                      alt="Music High Sky"
                      className="w-9 h-9 rounded-md object-contain bg-[#020817] border border-[#D4AF37]/30 shrink-0 p-1"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-xs font-semibold truncate ${
                        active ? 'text-[#F5D58A]' : 'text-white'
                      }`}
                    >
                      {item.title}
                    </p>
                    <p className="text-[11px] text-[#8D9AAA] truncate">
                      {item.artistName}
                      {item.format ? ` · ${item.format}` : ''}
                    </p>
                  </div>
                  {item.durationSeconds ? (
                    <span className="text-[11px] font-mono text-[#8D9AAA] tabular-nums shrink-0">
                      {formatDuration(item.durationSeconds)}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Persistent Global Luxury Bottom Streaming Bar */}
      <div
        role="region"
        aria-label="Music High Sky Persistent Audio Player"
        className="fixed bottom-0 inset-x-0 z-40 bg-[#03091A]/96 backdrop-blur-xl border-t border-[#D4AF37]/35 shadow-[0_-14px_40px_-10px_rgba(0,0,0,0.85)]"
      >
        {/* Top Interactive Electric-Blue/Gold Progress Scrubber */}
        <div className="relative h-1.5 bg-[#06152E] w-full group">
          <div
            className="h-full bg-gradient-to-r from-[#0759C7] via-[#00A8FF] to-[#F5D58A] transition-[width] duration-150"
            style={{ width: `${progressPct}%` }}
          />
          <input
            type="range"
            min={0}
            max={totalDuration || 100}
            step={0.5}
            value={Math.min(currentTime, totalDuration || 100)}
            onChange={(e) => seekTo(Number(e.target.value))}
            aria-label="Seek audio position"
            className="absolute inset-0 w-full h-3 -top-1 opacity-0 cursor-pointer"
          />
        </div>

        <div className="max-w-[1440px] mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3 sm:gap-5">
          {/* Left: Track Artwork, Title, Artist & Official Label */}
          <div className="flex items-center gap-3 min-w-0 flex-1 max-w-[36%] sm:max-w-[32%]">
            <div className="relative shrink-0">
              {currentTrack.artworkUrl ? (
                <img
                  src={currentTrack.artworkUrl}
                  alt={currentTrack.title}
                  className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg object-cover border border-[#D4AF37]/50 bg-[#020817]"
                />
              ) : (
                <img
                  src={brandLogoUrl}
                  alt="Music High Sky"
                  className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg object-contain border border-[#D4AF37]/50 bg-[#020817] p-1"
                />
              )}
              <img
                src={brandLogoUrl}
                alt="Music High Sky"
                className="w-4 h-4 rounded-full object-contain bg-[#020817] ring-1 ring-[#D4AF37]/60 absolute -bottom-1 -right-1"
              />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-display font-bold text-white truncate">
                {currentTrack.title}
              </p>
              <p className="text-[11px] text-[#F5D58A] truncate">
                {currentTrack.artistName}{' '}
                <span className="text-[#8D9AAA]">· {currentTrack.labelName}</span>
              </p>
              <p className="hidden md:block text-[10px] font-mono text-[#00D5FF]/85 truncate">
                {queueTitle}
              </p>
            </div>
          </div>

          {/* Center: Transport Controls + Time Readout */}
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className="flex items-center gap-1.5 sm:gap-3">
              <button
                type="button"
                onClick={toggleShuffle}
                aria-label="Toggle shuffle"
                title="Shuffle"
                className={`hidden sm:inline-flex p-1.5 rounded-lg transition-colors cursor-pointer ${
                  shuffle
                    ? 'text-[#00D5FF] bg-[#00A8FF]/15'
                    : 'text-[#8D9AAA] hover:text-white'
                }`}
              >
                <Shuffle className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={playPrevious}
                aria-label="Previous song"
                className="p-1.5 text-[#C8D0DB] hover:text-white rounded-lg cursor-pointer"
              >
                <SkipBack className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              <button
                type="button"
                onClick={togglePlayPause}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="w-10 h-10 rounded-full btn-gold flex items-center justify-center shadow-[0_0_24px_-4px_rgba(212,175,55,0.6)] cursor-pointer"
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 ml-0.5 fill-current" />
                )}
              </button>

              <button
                type="button"
                onClick={playNext}
                aria-label="Next song"
                className="p-1.5 text-[#C8D0DB] hover:text-white rounded-lg cursor-pointer"
              >
                <SkipForward className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              <button
                type="button"
                onClick={cycleRepeatMode}
                aria-label={`Repeat mode: ${repeatMode}`}
                title={`Repeat: ${repeatMode}`}
                className={`hidden sm:inline-flex p-1.5 rounded-lg transition-colors cursor-pointer ${
                  repeatMode !== 'off'
                    ? 'text-[#F5D58A] bg-[#D4AF37]/15'
                    : 'text-[#8D9AAA] hover:text-white'
                }`}
              >
                {repeatMode === 'one' ? (
                  <Repeat1 className="w-4 h-4" />
                ) : (
                  <Repeat className="w-4 h-4" />
                )}
              </button>
            </div>

            <div className="flex items-center gap-2 text-[10px] font-mono tabular-nums text-[#8D9AAA]">
              <span className="text-[#00D5FF]">{formatDuration(currentTime)}</span>
              <span>/</span>
              <span>{formatDuration(totalDuration)}</span>
            </div>
          </div>

          {/* Right: Volume, Queue Toggle & Close */}
          <div className="flex items-center justify-end gap-2 sm:gap-3 flex-1 max-w-[30%]">
            <div className="hidden md:flex items-center gap-2">
              <button
                type="button"
                onClick={toggleMute}
                aria-label={muted ? 'Unmute' : 'Mute'}
                className="p-1.5 text-[#C8D0DB] hover:text-white cursor-pointer"
              >
                {muted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-rose-300" />
                ) : (
                  <Volume2 className="w-4 h-4 text-[#F5D58A]" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={muted ? 0 : volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                aria-label="Volume"
                className="w-20 accent-[#D4AF37] cursor-pointer"
              />
            </div>

            <button
              type="button"
              onClick={() => setQueueDrawerOpen(!queueDrawerOpen)}
              aria-label="Toggle playback queue"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                queueDrawerOpen
                  ? 'bg-[#00A8FF]/20 border-[#00D5FF]/60 text-[#00D5FF]'
                  : 'bg-[#06152E] border-[#D4AF37]/25 text-[#C8D0DB] hover:text-white'
              }`}
            >
              <ListMusic className="w-3.5 h-3.5" />
              <span className="hidden sm:inline font-mono">{queue.length}</span>
            </button>

            <button
              type="button"
              onClick={closePlayer}
              aria-label="Close music player"
              className="p-1.5 text-[#8D9AAA] hover:text-rose-300 rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
