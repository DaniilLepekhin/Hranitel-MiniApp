'use client';

import React from 'react';
import { Play, Pause, X, Maximize2 } from 'lucide-react';
import { useMediaPlayer } from '@/contexts/MediaPlayerContext';
import { useRouter } from 'next/navigation';

export const FloatingPlayer: React.FC = () => {
  const { state, pause, resume, stop, maximize } = useMediaPlayer();
  const router = useRouter();

  if (!state.currentMedia || !state.isMinimized) {
    return null;
  }

  const currentMedia = state.currentMedia;
  const currentTrack = currentMedia.tracks[state.currentTrackIndex];
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleMaximize = () => {
    maximize();
    // Navigate back to the content page
    if (currentMedia.type === 'audio') {
      router.push(`/practices/${currentMedia.id}`);
    } else {
      router.push(`/video/${currentTrack.id}`);
    }
  };

  return (
    <div className="fixed bottom-16 left-0 right-0 z-50 bg-[#2A2A2A] border-t border-gray-800 px-4 py-3">
      <div className="flex items-center gap-3">
        {/* Thumbnail */}
        {currentMedia.thumbnail && (
          <img
            src={currentMedia.thumbnail}
            alt={currentTrack.title}
            className="w-12 h-12 rounded-lg object-cover"
          />
        )}

        {/* Track Info */}
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{currentTrack.title}</p>
          <p className="text-gray-400 text-xs truncate">{currentMedia.title}</p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Play/Pause */}
          <button
            onClick={state.isPlaying ? pause : resume}
            className="w-10 h-10 rounded-full bg-[#d93547] flex items-center justify-center hover:bg-[#a00000] transition-colors"
          >
            {state.isPlaying ? (
              <Pause className="w-5 h-5 text-white" />
            ) : (
              <Play className="w-5 h-5 text-white ml-0.5" />
            )}
          </button>

          {/* Maximize */}
          <button
            onClick={handleMaximize}
            className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center hover:bg-gray-600 transition-colors"
          >
            <Maximize2 className="w-5 h-5 text-white" />
          </button>

          {/* Stop */}
          <button
            onClick={stop}
            className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center hover:bg-gray-600 transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-2">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>{formatTime(state.progress)}</span>
          <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#d93547] transition-all duration-300"
              style={{
                width: `${state.duration > 0 ? (state.progress / state.duration) * 100 : 0}%`,
              }}
            />
          </div>
          <span>{formatTime(state.duration)}</span>
        </div>
      </div>
    </div>
  );
};
