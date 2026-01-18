'use client';

import { useEffect, useRef } from 'react';
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
} from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { useMediaPlayerStore } from '@/store/media-player';

export function FullMediaPlayer() {
  const { haptic } = useTelegram();
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const {
    currentMedia,
    timecodes,
    isPlaying,
    currentTime,
    duration,
    isMuted,
    showFullPlayer,
    seekTime,
    setIsPlaying,
    setCurrentTime,
    setDuration,
    setIsMuted,
    seekTo,
    clearSeek,
    minimizePlayer,
    closePlayer,
  } = useMediaPlayerStore();

  const mediaRef = currentMedia?.type === 'video' ? videoRef : audioRef;

  // Handle play/pause
  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    if (isPlaying) {
      const playPromise = media.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          // Auto-play was prevented - user needs to interact first
          console.warn('Playback prevented - user interaction required:', err.message);
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

  if (!showFullPlayer || !currentMedia) return null;

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

      {/* Audio/Video Element */}
      {currentMedia.type === 'audio' || currentMedia.type === 'meditation' ? (
        <audio
          ref={audioRef}
          src={currentMedia.url}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setIsPlaying(false)}
        />
      ) : (
        <video
          ref={videoRef}
          src={currentMedia.url}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setIsPlaying(false)}
          className="hidden"
        />
      )}

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
      <div className="relative z-10 flex-1 flex flex-col overflow-y-auto px-4 pb-32">
        {/* Cover Art */}
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
        <div className="flex items-center justify-center gap-4">
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

          <button
            onClick={() => skip(-15)}
            className="w-14 h-14 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all"
          >
            <SkipBack className="w-6 h-6 text-white" />
          </button>

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

          <button
            onClick={() => skip(15)}
            className="w-14 h-14 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all"
          >
            <SkipForward className="w-6 h-6 text-white" />
          </button>

          <button
            onClick={toggleMute}
            className="w-12 h-12 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all opacity-0"
            disabled
          >
            <Volume2 className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
