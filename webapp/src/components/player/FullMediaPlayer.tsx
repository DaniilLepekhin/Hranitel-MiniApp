'use client';

import { useEffect, useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
  ChevronDown,
  Headphones,
  Radio,
  Maximize,
  Minimize,
} from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { useMediaPlayerStore } from '@/store/media-player';

export function FullMediaPlayer() {
  const { haptic } = useTelegram();
  const [isVideoFullscreen, setIsVideoFullscreen] = useState(false);

  const {
    currentMedia,
    timecodes,
    isPlaying,
    currentTime,
    duration,
    isMuted,
    showFullPlayer,
    playbackRate,
    setIsPlaying,
    setIsMuted,
    setPlaybackRate,
    seekTo,
    minimizePlayer,
    closePlayer,
  } = useMediaPlayerStore();

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
    haptic.impact('light');
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    haptic.impact('light');
  };

  const skip = (seconds: number) => {
    const newTime = Math.max(0, Math.min(duration, currentTime + seconds));
    seekTo(newTime);
    haptic.impact('light');
  };

  const handleSeek = (newTime: number) => {
    seekTo(newTime);
    haptic.impact('light');
  };

  const handleMinimize = () => {
    minimizePlayer();
    haptic.impact('medium');
  };

  const handleClose = () => {
    closePlayer();
    haptic.impact('medium');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleTimecodeClick = (timeSeconds: number) => {
    seekTo(timeSeconds);
    haptic.impact('light');
  };

  const toggleVideoFullscreen = () => {
    // Get video element from MiniPlayer (managed globally now)
    const video = document.querySelector('video');
    if (!video) return;

    if (!isVideoFullscreen) {
      // Enter fullscreen
      if (video.requestFullscreen) {
        video.requestFullscreen();
      } else if ((video as any).webkitRequestFullscreen) {
        (video as any).webkitRequestFullscreen();
      }
      setIsVideoFullscreen(true);
    } else {
      // Exit fullscreen
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      }
      setIsVideoFullscreen(false);
    }
    haptic.impact('medium');
  };

  // Listen to fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFullscreen = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setIsVideoFullscreen(isFullscreen);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  if (!showFullPlayer || !currentMedia) return null;

  const isVideo = currentMedia.type === 'video';

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-b from-[#2b2520] to-[#2a1f1a] flex flex-col">
      {/* Background */}
      <div className="absolute inset-0">
        {currentMedia.coverUrl && (
          <img
            src={currentMedia.coverUrl}
            alt=""
            className="w-full h-full object-cover opacity-10 blur-3xl"
          />
        )}
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between p-4">
        <button
          onClick={handleMinimize}
          className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-all"
        >
          <ChevronDown className="w-6 h-6 text-white" />
        </button>
        <span className="text-white/60 text-sm font-medium">Сейчас играет</span>
        <button
          onClick={handleClose}
          className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-all"
        >
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Content Area */}
      <div className={`relative z-10 flex-1 flex flex-col overflow-y-auto px-4 pb-32 ${isVideo ? 'hidden' : ''}`}>
        {/* Cover Art - Only for audio */}
        <div className="flex-shrink-0 flex items-center justify-center py-8">
          <div className="relative">
            {/* Animated rings */}
            <div className={`absolute inset-0 rounded-3xl ${isPlaying ? 'animate-pulse' : ''}`}>
              <div className="absolute inset-[-15px] rounded-3xl border-2 border-[#d93547]/20" />
              <div className="absolute inset-[-30px] rounded-3xl border-2 border-[#d93547]/10" />
              <div className="absolute inset-[-45px] rounded-3xl border-2 border-[#d93547]/5" />
            </div>

            {/* Cover image */}
            <div className="w-64 h-64 rounded-3xl overflow-hidden shadow-2xl">
              {currentMedia.coverUrl || currentMedia.thumbnailUrl ? (
                <img
                  src={currentMedia.coverUrl || currentMedia.thumbnailUrl}
                  alt={currentMedia.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[#d93547] to-[#9c1723] flex items-center justify-center">
                  {currentMedia.type === 'audio' || currentMedia.type === 'meditation' ? (
                    <Headphones className="w-24 h-24 text-white/80" />
                  ) : (
                    <Radio className="w-24 h-24 text-white/80" />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Title & Description */}
        <div className="flex-shrink-0 text-center mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">{currentMedia.title}</h2>
          {currentMedia.description && (
            <p className="text-white/60 text-sm line-clamp-2">{currentMedia.description}</p>
          )}
        </div>

        {/* Timecodes */}
        {timecodes.length > 0 && (
          <div className="flex-1 mb-6">
            <h3 className="text-white font-semibold mb-3 text-sm">Таймкоды</h3>
            <div className="space-y-2">
              {timecodes.map((timecode, index) => {
                const isActive =
                  currentTime >= timecode.timeSeconds &&
                  (index === timecodes.length - 1 ||
                    currentTime < timecodes[index + 1].timeSeconds);

                return (
                  <button
                    key={timecode.id}
                    onClick={() => handleTimecodeClick(timecode.timeSeconds)}
                    className={`w-full text-left p-4 rounded-xl transition-all hover:scale-[1.02] ${
                      isActive
                        ? 'bg-gradient-to-r from-[#d93547]/30 to-[#9c1723]/30 border-2 border-[#d93547]'
                        : 'bg-white/5 hover:bg-white/10 border border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`font-semibold text-sm ${
                          isActive ? 'text-[#ff6b6b]' : 'text-white/60'
                        }`}
                      >
                        {formatTime(timecode.timeSeconds)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white text-sm truncate">
                          {timecode.title}
                        </p>
                        {timecode.description && (
                          <p className="text-white/50 text-xs mt-0.5 line-clamp-1">
                            {timecode.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Player Controls (Fixed at bottom) */}
      <div className="relative z-10 px-6 pb-8 bg-gradient-to-t from-black/40 to-transparent backdrop-blur-sm">
        {/* Progress bar */}
        <div className="mb-4">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={(e) => handleSeek(Number(e.target.value))}
            className="w-full h-2 bg-white/20 rounded-full appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-4
              [&::-webkit-slider-thumb]:h-4
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-[#d93547]
              [&::-webkit-slider-thumb]:shadow-lg"
            style={{
              background: `linear-gradient(to right, #d93547 0%, #d93547 ${
                (currentTime / (duration || 1)) * 100
              }%, rgba(255,255,255,0.2) ${
                (currentTime / (duration || 1)) * 100
              }%, rgba(255,255,255,0.2) 100%)`,
            }}
          />
          <div className="flex justify-between text-white/60 text-xs mt-2">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between gap-4">
          {/* Left: Mute button */}
          <button
            onClick={toggleMute}
            className="w-12 h-12 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all"
          >
            {isMuted ? (
              <VolumeX className="w-5 h-5 text-white" />
            ) : (
              <Volume2 className="w-5 h-5 text-white" />
            )}
          </button>

          {/* Center: Play button */}
          <button
            onClick={togglePlay}
            className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#d93547] to-[#9c1723] hover:shadow-xl hover:shadow-[#d93547]/30 flex items-center justify-center transition-all shadow-lg"
          >
            {isPlaying ? (
              <Pause className="w-10 h-10 text-white" fill="currentColor" />
            ) : (
              <Play className="w-10 h-10 text-white ml-1" fill="currentColor" />
            )}
          </button>

          {/* Right: Speed/Fullscreen */}
          {isVideo ? (
            <button
              onClick={toggleVideoFullscreen}
              className="w-12 h-12 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all"
              title={isVideoFullscreen ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим'}
            >
              {isVideoFullscreen ? (
                <Minimize className="w-5 h-5 text-white" />
              ) : (
                <Maximize className="w-5 h-5 text-white" />
              )}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-white/60 text-sm">Скорость:</span>
              <button
                onClick={() => {
                  const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
                  const currentIndex = rates.indexOf(playbackRate);
                  const nextRate = rates[(currentIndex + 1) % rates.length];
                  setPlaybackRate(nextRate);
                  haptic.impact('light');
                }}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium text-sm transition-all"
              >
                {playbackRate}x
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
