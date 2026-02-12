'use client';

import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, CheckCircle } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';

interface AudioLessonProps {
  audioUrl: string;
  title: string;
  description?: string;
  onComplete?: () => void;
  isCompleted?: boolean;
  isPending?: boolean;
  attachments?: { title: string; url: string; type?: string }[];
}

export function AudioLesson({
  audioUrl,
  title,
  description,
  onComplete,
  isCompleted = false,
  isPending = false,
  attachments = [],
}: AudioLessonProps) {
  const { haptic } = useTelegram();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      if (!isCompleted && !isPending) {
        onComplete?.();
        haptic.notification('success');
      }
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [onComplete, haptic]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
    haptic.impact('light');
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newTime = parseFloat(e.target.value);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      {/* Audio Player Card */}
      <div className="relative w-full bg-gradient-to-br from-[#2b2520] to-[#1a1512] rounded-2xl overflow-hidden shadow-lg p-6">
        <div className="flex flex-col items-center">
          {/* Play/Pause Button */}
          <button
            onClick={togglePlay}
            className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm border-2 border-white/20 flex items-center justify-center hover:bg-white/20 transition-all active:scale-95 mb-4"
          >
            {isPlaying ? (
              <Pause className="w-10 h-10 text-white" fill="white" />
            ) : (
              <Play className="w-10 h-10 text-white ml-1" fill="white" />
            )}
          </button>

          {/* Title */}
          <h3 className="text-white font-bold text-lg text-center mb-2">{title}</h3>

          {/* Progress Bar */}
          <div className="w-full mb-2">
            <input
              type="range"
              min="0"
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
            />
          </div>

          {/* Time Display */}
          <div className="flex justify-between w-full text-white/60 text-sm">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          {/* Volume Icon */}
          <div className="mt-4 flex items-center gap-2 text-white/40">
            <Volume2 className="w-4 h-4" />
            <span className="text-xs">Аудиомедитация</span>
          </div>
        </div>
      </div>

      {/* Description */}
      {description && (
        <div className="mt-4 p-4 rounded-xl bg-gradient-to-br from-[#d93547]/5 to-[#9c1723]/5">
          <p className="text-[#6b5a4a] leading-relaxed text-sm whitespace-pre-wrap">{description}</p>
        </div>
      )}

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="mt-4 space-y-2">
          {attachments.map((attachment, index) => (
            <a
              key={index}
              href={attachment.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full px-4 py-3 rounded-xl bg-[#d93547]/10 text-[#d93547] font-semibold hover:bg-[#d93547]/20 transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {attachment.title}
            </a>
          ))}
        </div>
      )}

      {/* Completion Status */}
      {isCompleted && (
        <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-green-500/10 to-green-600/10 border border-green-500/30 flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
          <div>
            <p className="font-semibold text-[#2b2520]">Аудио прослушано!</p>
            <p className="text-[#6b5a4a] text-sm">Energy Points уже начислены</p>
          </div>
        </div>
      )}
    </div>
  );
}
