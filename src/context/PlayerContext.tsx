import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

export interface PlayerTrackItem {
  releaseId: string;
  title: string;
  artistName: string;
  labelName: string;
  artworkUrl?: string;
  audioUrl: string;
  durationSeconds?: number;
  format?: string;
  language?: string;
  genre?: string;
}

export type RepeatMode = 'off' | 'all' | 'one';

interface PlayerContextValue {
  queue: PlayerTrackItem[];
  currentIndex: number;
  currentTrack: PlayerTrackItem | null;
  queueTitle: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeatMode: RepeatMode;
  queueDrawerOpen: boolean;
  setQueueDrawerOpen: (open: boolean) => void;
  playTrack: (track: PlayerTrackItem, queue?: PlayerTrackItem[], queueLabel?: string) => void;
  playPlaylist: (tracks: PlayerTrackItem[], playlistTitle: string, startIndex?: number) => void;
  togglePlayPause: () => void;
  playNext: () => void;
  playPrevious: () => void;
  seekTo: (seconds: number) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeatMode: () => void;
  jumpToIndex: (index: number) => void;
  closePlayer: () => void;
}

const PLAYER_EVENT_ID = 'mhs-persistent-global-player';

const PlayerContext = createContext<PlayerContextValue | null>(null);

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [queue, setQueue] = useState<PlayerTrackItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [queueTitle, setQueueTitle] = useState('Music High Sky Queue');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.88);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [queueDrawerOpen, setQueueDrawerOpen] = useState(false);

  const queueRef = useRef(queue);
  const currentIndexRef = useRef(currentIndex);
  const shuffleRef = useRef(shuffle);
  const repeatRef = useRef(repeatMode);

  queueRef.current = queue;
  currentIndexRef.current = currentIndex;
  shuffleRef.current = shuffle;
  repeatRef.current = repeatMode;

  const currentTrack =
    currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null;

  const loadAndStartTrack = useCallback((track: PlayerTrackItem) => {
    const audio = audioRef.current;
    if (!audio) return;
    window.dispatchEvent(new CustomEvent('mhs-audio-play', { detail: { id: PLAYER_EVENT_ID } }));
    if (audio.getAttribute('data-src') !== track.audioUrl) {
      audio.src = track.audioUrl;
      audio.setAttribute('data-src', track.audioUrl);
      audio.currentTime = 0;
      setCurrentTime(0);
      setDuration(track.durationSeconds || 0);
    }
    void audio
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => setIsPlaying(false));
  }, []);

  const advanceNext = useCallback(
    (autoTriggered: boolean) => {
      const q = queueRef.current;
      const idx = currentIndexRef.current;
      if (q.length === 0) return;

      if (autoTriggered && repeatRef.current === 'one') {
        const audio = audioRef.current;
        if (audio) {
          audio.currentTime = 0;
          void audio.play().then(() => setIsPlaying(true));
        }
        return;
      }

      let nextIdx = idx + 1;
      if (shuffleRef.current && q.length > 1) {
        do {
          nextIdx = Math.floor(Math.random() * q.length);
        } while (nextIdx === idx);
      } else if (nextIdx >= q.length) {
        if (repeatRef.current === 'all' || !autoTriggered) {
          nextIdx = 0;
        } else {
          setIsPlaying(false);
          return;
        }
      }

      setCurrentIndex(nextIdx);
      loadAndStartTrack(q[nextIdx]);
    },
    [loadAndStartTrack]
  );

  // Initialize single persistent HTMLAudioElement once
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.volume = volume;
    audioRef.current = audio;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
    const onLoadedMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => advanceNext(true);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMeta);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    const onOtherPlayerStart = (event: Event) => {
      const custom = event as CustomEvent<{ id?: string }>;
      if (custom.detail?.id !== PLAYER_EVENT_ID && !audio.paused) {
        audio.pause();
      }
    };
    window.addEventListener('mhs-audio-play', onOtherPlayerStart);

    return () => {
      window.removeEventListener('mhs-audio-play', onOtherPlayerStart);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMeta);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.pause();
    };
  }, [advanceNext]);

  const playTrack = useCallback(
    (track: PlayerTrackItem, incomingQueue?: PlayerTrackItem[], queueLabel?: string) => {
      const activeAudio = audioRef.current;
      // Toggle pause if the exact same track is currently playing
      if (
        currentTrack?.releaseId === track.releaseId &&
        activeAudio &&
        activeAudio.getAttribute('data-src') === track.audioUrl
      ) {
        if (isPlaying) {
          activeAudio.pause();
        } else {
          window.dispatchEvent(
            new CustomEvent('mhs-audio-play', { detail: { id: PLAYER_EVENT_ID } })
          );
          void activeAudio.play().then(() => setIsPlaying(true));
        }
        return;
      }

      const nextQueue =
        incomingQueue && incomingQueue.length > 0 ? incomingQueue : [track];
      const idx = Math.max(
        0,
        nextQueue.findIndex((t) => t.releaseId === track.releaseId)
      );
      setQueue(nextQueue);
      setCurrentIndex(idx);
      setQueueTitle(queueLabel || 'Sunil Kumar · Official Discography');
      loadAndStartTrack(nextQueue[idx]);
    },
    [currentTrack?.releaseId, isPlaying, loadAndStartTrack]
  );

  const playPlaylist = useCallback(
    (tracks: PlayerTrackItem[], playlistTitle: string, startIndex = 0) => {
      if (tracks.length === 0) return;
      const safeIdx = Math.max(0, Math.min(startIndex, tracks.length - 1));
      setQueue(tracks);
      setCurrentIndex(safeIdx);
      setQueueTitle(playlistTitle);
      loadAndStartTrack(tracks[safeIdx]);
    },
    [loadAndStartTrack]
  );

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    if (isPlaying) {
      audio.pause();
    } else {
      window.dispatchEvent(
        new CustomEvent('mhs-audio-play', { detail: { id: PLAYER_EVENT_ID } })
      );
      void audio.play().then(() => setIsPlaying(true));
    }
  }, [currentTrack, isPlaying]);

  const playNext = useCallback(() => {
    advanceNext(false);
  }, [advanceNext]);

  const playPrevious = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || queue.length === 0) return;
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      setCurrentTime(0);
      return;
    }
    const prevIdx = currentIndex <= 0 ? queue.length - 1 : currentIndex - 1;
    setCurrentIndex(prevIdx);
    loadAndStartTrack(queue[prevIdx]);
  }, [currentIndex, loadAndStartTrack, queue]);

  const seekTo = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const clamped = Math.max(0, Math.min(seconds, audio.duration || duration || 0));
    audio.currentTime = clamped;
    setCurrentTime(clamped);
  }, [duration]);

  const setVolume = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolumeState(clamped);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
      audioRef.current.muted = clamped === 0;
    }
    setMuted(clamped === 0);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      if (audioRef.current) {
        audioRef.current.muted = next;
      }
      return next;
    });
  }, []);

  const toggleShuffle = useCallback(() => setShuffle((v) => !v), []);

  const cycleRepeatMode = useCallback(() => {
    setRepeatMode((prev) => (prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off'));
  }, []);

  const jumpToIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= queue.length) return;
      setCurrentIndex(index);
      loadAndStartTrack(queue[index]);
    },
    [loadAndStartTrack, queue]
  );

  const closePlayer = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
    setQueue([]);
    setCurrentIndex(-1);
    setCurrentTime(0);
    setDuration(0);
    setQueueDrawerOpen(false);
  }, []);

  return (
    <PlayerContext.Provider
      value={{
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
        playTrack,
        playPlaylist,
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
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
};

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}
