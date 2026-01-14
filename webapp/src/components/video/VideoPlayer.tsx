'use client';

import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Maximize2, Minimize2, Volume2, VolumeX, CheckCircle } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import type { Video, VideoTimecode } from '@/lib/api';

interface VideoPlayerProps {
  video: Video;
  timecodes?: VideoTimecode[];
  onComplete?: () => void;
  onTimeUpdate?: (seconds: number) => void;
}

export function VideoPlayer({ video, timecodes = [], onComplete, onTimeUpdate }: VideoPlayerProps) {
  const { haptic } = useTelegram();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPipSupported, setIsPipSupported] = useState(false);
  const [isInPip, setIsInPip] = useState(false);
  const [hasWatched, setHasWatched] = useState(false);

  // Check if Picture-in-Picture is supported
  useEffect(() => {
    if (document.pictureInPictureEnabled) {
      setIsPipSupported(true);
    }
  }, []);

  // Update progress
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const seconds = Math.floor(videoRef.current.currentTime);
      setCurrentTime(seconds);
      onTimeUpdate?.(seconds);

      // Auto-mark as watched when 90% complete
      if (!hasWatched && duration > 0 && seconds / duration >= 0.9) {
        setHasWatched(true);
        onComplete?.();
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(Math.floor(videoRef.current.duration));
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
      haptic.impact('light');
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
      haptic.impact('light');
    }
  };

  const toggleFullscreen = async () => {
    if (!videoRef.current) return;

    try {
      if (!isFullscreen) {
        if (videoRef.current.requestFullscreen) {
          await videoRef.current.requestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
      setIsFullscreen(!isFullscreen);
      haptic.impact('medium');
    } catch (error) {
      console.error('Fullscreen error:', error);
    }
  };

  const togglePip = async () => {
    if (!videoRef.current || !isPipSupported) return;

    try {
      if (!isInPip) {
        await videoRef.current.requestPictureInPicture();
        setIsInPip(true);
        haptic.impact('medium');
      } else {
        await document.exitPictureInPicture();
        setIsInPip(false);
      }
    } catch (error) {
      console.error('PiP error:', error);
    }
  };

  const seekTo = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      haptic.impact('light');
    }
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // Listen for PiP events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnterPip = () => setIsInPip(true);
    const handleLeavePip = () => setIsInPip(false);

    video.addEventListener('enterpictureinpicture', handleEnterPip);
    video.addEventListener('leavepictureinpicture', handleLeavePip);

    return () => {
      video.removeEventListener('enterpictureinpicture', handleEnterPip);
      video.removeEventListener('leavepictureinpicture', handleLeavePip);
    };
  }, []);

  return (
    <div className="w-full">
      {/* Video Container */}
      <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-lg">
        <video
          ref={videoRef}
          src={video.videoUrl}
          className="w-full h-full"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          playsInline
        />

        {/* Play Overlay */}
        {!isPlaying && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer"
            onClick={togglePlay}
          >
            <div className="w-20 h-20 rounded-full bg-white/90 flex items-center justify-center backdrop-blur-sm hover:scale-110 transition-transform">
              <Play className="w-10 h-10 text-[#3d2f1f] ml-1" fill="currentColor" />
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
          {/* Progress Bar */}
          <div className="mb-3">
            <div
              className="w-full h-1 bg-white/30 rounded-full cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const percent = x / rect.width;
                seekTo(Math.floor(percent * duration));
              }}
            >
              <div
                className="h-full bg-[#8b0000] rounded-full transition-all"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              />
            </div>
            <div className="flex justify-between mt-1 text-xs text-white/80">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all"
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 text-white" fill="currentColor" />
                ) : (
                  <Play className="w-5 h-5 text-white ml-0.5" fill="currentColor" />
                )}
              </button>

              <button
                onClick={toggleMute}
                className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all"
              >
                {isMuted ? (
                  <VolumeX className="w-5 h-5 text-white" />
                ) : (
                  <Volume2 className="w-5 h-5 text-white" />
                )}
              </button>
            </div>

            <div className="flex items-center gap-2">
              {/* PiP Button */}
              {isPipSupported && (
                <button
                  onClick={togglePip}
                  className={`px-3 py-2 rounded-lg font-semibold text-xs transition-all ${
                    isInPip
                      ? 'bg-[#8b0000] text-white'
                      : 'bg-white/20 text-white hover:bg-white/30'
                  }`}
                >
                  {isInPip ? 'В PiP' : 'PiP'}
                </button>
              )}

              {/* Fullscreen Button */}
              <button
                onClick={toggleFullscreen}
                className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all"
              >
                {isFullscreen ? (
                  <Minimize2 className="w-5 h-5 text-white" />
                ) : (
                  <Maximize2 className="w-5 h-5 text-white" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Timecodes */}
      {timecodes.length > 0 && (
        <div className="mt-4 space-y-2">
          <h3 className="font-semibold text-[#3d2f1f] text-sm mb-3">Таймкоды</h3>
          {timecodes.map((timecode) => (
            <button
              key={timecode.id}
              onClick={() => seekTo(timecode.timeSeconds)}
              className={`w-full text-left p-3 rounded-xl transition-all hover:scale-[1.02] ${
                currentTime >= timecode.timeSeconds &&
                (timecodes[timecodes.indexOf(timecode) + 1]?.timeSeconds === undefined ||
                  currentTime < timecodes[timecodes.indexOf(timecode) + 1].timeSeconds)
                  ? 'bg-gradient-to-r from-[#8b0000]/20 to-[#8b4513]/20 border-2 border-[#8b0000]'
                  : 'bg-white/60 border border-[#8b4513]/30'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-[#8b0000] font-semibold text-sm">
                  {formatTime(timecode.timeSeconds)}
                </span>
                <div className="flex-1">
                  <p className="font-medium text-[#3d2f1f] text-sm">{timecode.title}</p>
                  {timecode.description && (
                    <p className="text-[#6b5a4a] text-xs mt-0.5">{timecode.description}</p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Complete Button */}
      {!hasWatched && currentTime > 0 && (
        <button
          onClick={() => {
            setHasWatched(true);
            onComplete?.();
            haptic.notification('success');
          }}
          className="w-full mt-4 px-6 py-4 rounded-xl bg-gradient-to-r from-[#8b0000] to-[#8b4513] text-white font-bold shadow-lg hover:shadow-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <CheckCircle className="w-5 h-5" />
          <span>Я посмотрел(а) видео</span>
        </button>
      )}

      {hasWatched && (
        <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-[#8b0000]/10 to-[#8b4513]/10 border border-[#8b4513]/30 flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-[#8b0000] flex-shrink-0" />
          <div>
            <p className="font-semibold text-[#3d2f1f]">Видео просмотрено!</p>
            <p className="text-[#6b5a4a] text-sm">Energy Points начислены на ваш счёт</p>
          </div>
        </div>
      )}
    </div>
  );
}
