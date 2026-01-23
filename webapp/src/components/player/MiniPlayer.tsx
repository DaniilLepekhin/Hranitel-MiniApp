'use client';

import { useRef, useEffect, useMemo } from 'react';
import { Play, Pause, X, Headphones, Radio } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { useMediaPlayerStore } from '@/store/media-player';
import { useShallow } from 'zustand/react/shallow';

export function MiniPlayer() {
  const { haptic } = useTelegram();
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // ⚡️ OPTIMIZATION 1: Selective subscriptions - only re-render when these specific values change
  const currentMedia = useMediaPlayerStore((state) => state.currentMedia);
  const isPlaying = useMediaPlayerStore((state) => state.isPlaying);
  const currentTime = useMediaPlayerStore((state) => state.currentTime);
  const duration = useMediaPlayerStore((state) => state.duration);
  const isMuted = useMediaPlayerStore((state) => state.isMuted);
  const showFullPlayer = useMediaPlayerStore((state) => state.showFullPlayer);
  const seekTime = useMediaPlayerStore((state) => state.seekTime);
  const playbackRate = useMediaPlayerStore((state) => state.playbackRate);
  const _hasHydrated = useMediaPlayerStore((state) => state._hasHydrated);

  // ⚡️ OPTIMIZATION 2: Get stable action references (don't cause re-renders)
  const actions = useMediaPlayerStore(
    useShallow((state) => ({
      setIsPlaying: state.setIsPlaying,
      setCurrentTime: state.setCurrentTime,
      setDuration: state.setDuration,
      setShowFullPlayer: state.setShowFullPlayer,
      clearSeek: state.clearSeek,
      closePlayer: state.closePlayer,
    }))
  );

  const mediaRef = currentMedia?.type === 'video' ? videoRef : audioRef;

  // ⚡️ OPTIMIZATION 3: Throttled timeupdate - max 1 update per second (not 60!)
  useEffect(() => {
    const media = mediaRef.current;
    if (!media || !currentMedia) return;

    let lastUpdateTime = 0;
    const THROTTLE_MS = 1000; // Update UI max once per second

    const handleTimeUpdate = () => {
      const now = Date.now();
      const newTime = Math.floor(media.currentTime);

      // Only update if: 1) enough time passed OR 2) second changed
      if (now - lastUpdateTime >= THROTTLE_MS || newTime !== Math.floor(lastUpdateTime / 1000)) {
        lastUpdateTime = now;
        actions.setCurrentTime(newTime);
      }
    };

    const handleLoadedMetadata = () => {
      actions.setDuration(Math.floor(media.duration));
    };

    const handleEnded = () => {
      actions.setIsPlaying(false);
    };

    // Attach listeners
    media.addEventListener('timeupdate', handleTimeUpdate);
    media.addEventListener('loadedmetadata', handleLoadedMetadata);
    media.addEventListener('ended', handleEnded);

    // If metadata is already loaded, set duration immediately
    if (media.duration && !isNaN(media.duration)) {
      actions.setDuration(Math.floor(media.duration));
    }

    return () => {
      media.removeEventListener('timeupdate', handleTimeUpdate);
      media.removeEventListener('loadedmetadata', handleLoadedMetadata);
      media.removeEventListener('ended', handleEnded);
    };
    // ⚡️ OPTIMIZATION 4: Only re-run when media changes, NOT when actions change
  }, [currentMedia]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle play/pause
  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    if (isPlaying) {
      const playPromise = media.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Playback prevented:', err.message);
          actions.setIsPlaying(false);
        });
      }
    } else {
      media.pause();
    }
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle seek
  useEffect(() => {
    const media = mediaRef.current;
    if (!media || seekTime === null) return;

    media.currentTime = seekTime;
    actions.clearSeek();
  }, [seekTime]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle mute
  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    media.muted = isMuted;
  }, [isMuted]);

  // Handle playback rate
  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    media.playbackRate = playbackRate;
  }, [playbackRate]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    actions.setIsPlaying(!isPlaying);
    haptic.impact('light');
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    actions.closePlayer();
    haptic.impact('medium');
  };

  const handleOpen = () => {
    actions.setShowFullPlayer(true);
    haptic.impact('light');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // ⚡️ OPTIMIZATION 5: Memoize progress calculation
  const progress = useMemo(() => {
    return duration > 0 ? (currentTime / duration) * 100 : 0;
  }, [currentTime, duration]);

  // ⚡️ OPTIMIZATION 6: Memoize media elements to prevent re-creation
  const mediaElements = useMemo(() => (
    <>
      {/* Audio Element - always in DOM, event handlers attached via useEffect */}
      {currentMedia && (currentMedia.type === 'audio' || currentMedia.type === 'meditation') && (
        <audio
          ref={audioRef}
          src={currentMedia.url}
          style={{ display: 'none' }}
        />
      )}

      {/* Video Element - always in DOM but hidden when mini player shown */}
      {/* z-[101] чтобы быть выше FullMediaPlayer (z-[100]) когда showFullPlayer=true */}
      {currentMedia && currentMedia.type === 'video' && (
        <video
          ref={videoRef}
          src={currentMedia.url}
          style={{ display: showFullPlayer ? 'block' : 'none' }}
          className={`fixed ${showFullPlayer ? 'top-[70px] bottom-[180px]' : 'inset-0'} left-0 right-0 w-full object-contain bg-black ${showFullPlayer ? 'z-[101]' : 'z-[95]'}`}
          playsInline
          controls={showFullPlayer}
          controlsList="nodownload"
          // @ts-ignore - webkit-specific attributes for iOS fullscreen
          webkit-playsinline="true"
          x-webkit-airplay="allow"
        />
      )}
    </>
  ), [currentMedia, showFullPlayer]);

  // Не показываем ничего если нет медиа
  if (!currentMedia) {
    return null;
  }

  return (
    <>
      {mediaElements}

      {/* Mini Player UI - only show when full player is hidden */}
      {!showFullPlayer && _hasHydrated && (
        <div
          onClick={handleOpen}
          className="fixed bottom-20 left-4 right-4 z-50 bg-gradient-to-r from-[#d93547] to-[#9c1723] rounded-2xl shadow-2xl cursor-pointer hover:shadow-[#d93547]/30 transition-all active:scale-[0.98] backdrop-blur-md"
        >
      {/* Progress bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-white/20 rounded-t-2xl overflow-hidden">
        <div
          className="h-full bg-white/60 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Mini player content */}
      <div className="flex items-center gap-3 p-3">
        {/* Cover Art */}
        <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 shadow-lg">
          {currentMedia.coverUrl || currentMedia.thumbnailUrl ? (
            <img
              src={currentMedia.coverUrl || currentMedia.thumbnailUrl}
              alt={currentMedia.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-[#2b2520] flex items-center justify-center">
              {currentMedia.type === 'audio' || currentMedia.type === 'meditation' ? (
                <Headphones className="w-6 h-6 text-white/80" />
              ) : (
                <Radio className="w-6 h-6 text-white/80" />
              )}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm truncate">{currentMedia.title}</p>
          <p className="text-white/80 text-xs">
            {formatTime(currentTime)} / {formatTime(duration)}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={togglePlay}
            className="w-10 h-10 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all backdrop-blur-sm"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 text-white" fill="currentColor" />
            ) : (
              <Play className="w-5 h-5 text-white ml-0.5" fill="currentColor" />
            )}
          </button>

          <button
            onClick={handleClose}
            className="w-10 h-10 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all backdrop-blur-sm"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>
        </div>
      )}
    </>
  );
}
