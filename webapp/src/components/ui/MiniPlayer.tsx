'use client';

import { useRef, useEffect, useCallback } from 'react';
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

  // Handle audio element ref callback to attach events immediately
  const handleAudioRef = useCallback((audio: HTMLAudioElement | null) => {
    if (!audio) return;

    // Store ref
    (audioRef as React.MutableRefObject<HTMLAudioElement | null>).current = audio;

    // Attach event handlers directly
    audio.ontimeupdate = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration && !isNaN(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };

    audio.onloadedmetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    audio.ondurationchange = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    audio.oncanplay = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    audio.onended = () => setIsPlaying(false);

    audio.onerror = () => {
      console.error('Audio error');
    };
  }, [setCurrentTime, setDuration, setIsPlaying]);

  // Control play/pause
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
      {/* Global audio element - src set directly, events via ref callback */}
      <audio
        ref={handleAudioRef}
        src={selectedMeditation.audioUrl || ''}
        preload="auto"
      />

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
