'use client';

import { useRef, useEffect } from 'react';
import { Play, Pause, X, Headphones, Radio } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { useMediaPlayerStore } from '@/store/media-player';

export function MiniPlayer() {
  const { haptic } = useTelegram();
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const {
    currentMedia,
    isPlaying,
    currentTime,
    duration,
    isMuted,
    showFullPlayer,
    seekTime,
    playbackRate,
    _hasHydrated,
    setIsPlaying,
    setCurrentTime,
    setDuration,
    setShowFullPlayer,
    clearSeek,
    closePlayer,
  } = useMediaPlayerStore();

  const mediaRef = currentMedia?.type === 'video' ? videoRef : audioRef;

  // 🔧 FIX: Don't render until hydration is complete
  // This prevents the "flash of no content" during restore from sessionStorage
  if (!_hasHydrated) {
    return null;
  }

  // Handle play/pause
  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    if (isPlaying) {
      const playPromise = media.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Playback prevented:', err.message);
          setIsPlaying(false);
        });
      }
    } else {
      media.pause();
    }
  }, [isPlaying, mediaRef, setIsPlaying]);

  // Handle seek
  useEffect(() => {
    const media = mediaRef.current;
    if (!media || seekTime === null) return;

    media.currentTime = seekTime;
    clearSeek();
  }, [seekTime, mediaRef, clearSeek]);

  // Handle mute
  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    media.muted = isMuted;
  }, [isMuted, mediaRef]);

  // Handle playback rate
  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    media.playbackRate = playbackRate;
  }, [playbackRate, mediaRef]);

  // Update time
  const handleTimeUpdate = () => {
    const media = mediaRef.current;
    if (!media) return;

    setCurrentTime(Math.floor(media.currentTime));
  };

  const handleLoadedMetadata = () => {
    const media = mediaRef.current;
    if (!media) return;

    setDuration(Math.floor(media.duration));
  };

  if (!currentMedia) return null;

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPlaying(!isPlaying);
    haptic.impact('light');
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    closePlayer();
    haptic.impact('medium');
  };

  const handleOpen = () => {
    setShowFullPlayer(true);
    haptic.impact('light');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <>
      {/* Audio Element - always in DOM */}
      {(currentMedia.type === 'audio' || currentMedia.type === 'meditation') && (
        <audio
          ref={audioRef}
          src={currentMedia.url}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setIsPlaying(false)}
          style={{ display: 'none' }}
        />
      )}

      {/* Video Element - always in DOM but hidden when mini player shown */}
      {currentMedia.type === 'video' && (
        <video
          ref={videoRef}
          src={currentMedia.url}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setIsPlaying(false)}
          style={{ display: showFullPlayer ? 'block' : 'none' }}
          className="fixed inset-0 w-full h-full object-contain bg-black z-[95]"
          playsInline
          controls={false}
        />
      )}

      {/* Mini Player UI - only show when full player is hidden */}
      {!showFullPlayer && (
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
