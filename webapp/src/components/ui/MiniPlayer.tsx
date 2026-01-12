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

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      // Also check duration on time update in case metadata wasn't loaded
      if (audio.duration && !isNaN(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };
    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const handleDurationChange = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const handleCanPlay = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const handleEnded = () => setIsPlaying(false);
    const handleError = (e: Event) => {
      console.error('Audio error:', e);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('canplaythrough', handleCanPlay);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('canplaythrough', handleCanPlay);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [setCurrentTime, setDuration, setIsPlaying]);

  // Load audio source when meditation changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !selectedMeditation?.audioUrl) return;

    const audioUrl = selectedMeditation.audioUrl;

    // Set source and load
    audio.src = audioUrl;
    audio.load();
  }, [selectedMeditation?.id]); // Use id instead of audioUrl for cleaner comparison

  // Control play/pause separately
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !selectedMeditation?.audioUrl) return;

    if (isPlaying) {
      audio.play().catch((err) => {
        console.error('Play error:', err);
        setIsPlaying(false);
      });
    } else {
      audio.pause();
    }
  }, [isPlaying, selectedMeditation?.audioUrl, setIsPlaying]);

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
      <audio ref={audioRef} crossOrigin="anonymous" preload="metadata" />

      {/* Mini Player UI - only show when full player is hidden */}
      {!showFullPlayer && (
        <div className="fixed bottom-[88px] left-4 right-4 z-50">
          <div
            className="bg-[#1a1a2e]/95 backdrop-blur-md rounded-2xl px-3 py-2 shadow-2xl border border-white/10"
            onClick={() => setShowFullPlayer(true)}
          >
            <div className="flex items-center gap-2">
              {/* Cover */}
              <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0">
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

              {/* Info + Progress */}
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-white truncate text-xs leading-tight">
                  {selectedMeditation.title}
                </h4>
                {/* Progress bar inline */}
                <div className="flex items-center gap-1.5 mt-1">
                  <div className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 rounded-full transition-all"
                      style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-white/50 tabular-nums w-8">
                    {formatTime(currentTime)}
                  </span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-1">
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
          </div>
        </div>
      )}
    </>
  );
}
