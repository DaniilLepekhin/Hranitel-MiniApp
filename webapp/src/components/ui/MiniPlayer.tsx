'use client';

import { useRef, useEffect } from 'react';
import { Play, Pause, X, Headphones } from 'lucide-react';
import { usePlayerStore } from '@/store/player';

export function MiniPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const {
    selectedMeditation,
    isPlaying,
    currentTime,
    duration,
    isMuted,
    showFullPlayer,
    seekTime,
    setIsPlaying,
    setCurrentTime,
    setDuration,
    setShowFullPlayer,
    clearSeek,
    closePlayer,
  } = usePlayerStore();

  // Audio event handlers - always active when meditation is selected
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [setCurrentTime, setDuration, setIsPlaying]);

  // Sync audio with state - always active
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !selectedMeditation) return;

    if (audio.src !== selectedMeditation.audioUrl) {
      audio.src = selectedMeditation.audioUrl || '';
    }

    if (isPlaying) {
      audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  }, [isPlaying, selectedMeditation, setIsPlaying]);

  // Sync mute state
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Handle seek requests from store
  useEffect(() => {
    if (audioRef.current && seekTime !== null) {
      audioRef.current.currentTime = seekTime;
      clearSeek();
    }
  }, [seekTime, clearSeek]);

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const handleClose = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    closePlayer();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Always render audio element when meditation is selected
  // Only hide UI when full player is shown
  if (!selectedMeditation) return null;

  return (
    <>
      {/* Global audio element - always mounted when meditation selected */}
      <audio ref={audioRef} />

      {/* Mini Player UI - only show when full player is hidden */}
      {!showFullPlayer && (
        <div className="fixed bottom-[88px] left-3 right-3 z-50">
        <div
          className="bg-[#1a1a2e] rounded-xl p-2.5 shadow-2xl border border-white/10"
          onClick={() => setShowFullPlayer(true)}
        >
          <div className="flex items-center gap-2.5">
            {/* Cover */}
            <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
              {selectedMeditation.coverUrl ? (
                <img
                  src={selectedMeditation.coverUrl}
                  alt={selectedMeditation.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
                  <Headphones className="w-4 h-4 text-white" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-white truncate text-xs">
                {selectedMeditation.title}
              </h4>
              <p className="text-[10px] text-white/60">
                {formatTime(currentTime)} / {formatTime(duration)}
              </p>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center"
              >
                {isPlaying ? (
                  <Pause className="w-3.5 h-3.5 text-white" />
                ) : (
                  <Play className="w-3.5 h-3.5 text-white ml-0.5" />
                )}
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleClose();
                }}
                className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          </div>

          {/* Mini progress bar */}
          <div className="mt-2 h-0.5 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-400 rounded-full transition-all"
              style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
            />
          </div>
        </div>
      </div>
      )}
    </>
  );
}
