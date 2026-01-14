'use client';

import { Play, Pause, X, Headphones, Radio } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { useMediaPlayerStore } from '@/store/media-player';

export function MiniPlayer() {
  const { haptic } = useTelegram();

  const {
    currentMedia,
    isPlaying,
    currentTime,
    duration,
    showFullPlayer,
    setIsPlaying,
    setShowFullPlayer,
    closePlayer,
  } = useMediaPlayerStore();

  if (!currentMedia || showFullPlayer) return null;

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
    <div
      onClick={handleOpen}
      className="fixed bottom-20 left-4 right-4 z-50 bg-gradient-to-r from-[#8b0000] to-[#8b4513] rounded-2xl shadow-2xl cursor-pointer hover:shadow-[#8b0000]/30 transition-all active:scale-[0.98] backdrop-blur-md"
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
            <div className="w-full h-full bg-[#3d2f1f] flex items-center justify-center">
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
  );
}
