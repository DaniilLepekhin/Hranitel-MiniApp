'use client';

import React, { useState } from 'react';
import { Play, Pause, SkipForward, SkipBack, Minimize2 } from 'lucide-react';
import { useMediaPlayer, MediaItem } from '@/contexts/MediaPlayerContext';
import { AudioBars } from './AudioBars';

interface AudioPlayerProps {
  media: MediaItem;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ media }) => {
  const { state, play, pause, resume, next, previous, seek, minimize } = useMediaPlayer();
  const [isDragging, setIsDragging] = useState(false);

  const isCurrentMedia = state.currentMedia?.id === media.id;
  const currentTrack = isCurrentMedia ? media.tracks[state.currentTrackIndex] : media.tracks[0];

  const handlePlay = () => {
    if (isCurrentMedia) {
      if (state.isPlaying) {
        pause();
      } else {
        resume();
      }
    } else {
      play(media);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isCurrentMedia || state.duration === 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * state.duration;
    seek(newTime);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-[#2A2A2A] rounded-2xl p-6">
      {/* Cover Image */}
      <div className="relative mx-auto mb-6" style={{ width: '192px', height: '192px' }}>
        <div className="w-full h-full rounded-full overflow-hidden bg-gradient-to-br from-[#d93547] to-[#2b2520]">
          {media.thumbnail ? (
            <img
              src={media.thumbnail}
              alt={media.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-6xl">🎵</span>
            </div>
          )}
        </div>

        {/* Audio Bars Overlay */}
        {isCurrentMedia && state.isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center">
            <AudioBars isPlaying={true} className="scale-150" />
          </div>
        )}
      </div>

      {/* Track Info */}
      <div className="text-center mb-6">
        <h3 className="text-white text-xl font-bold mb-2">{media.title}</h3>
        <p className="text-gray-400 text-sm">{currentTrack.title}</p>
      </div>

      {/* Progress Bar */}
      {isCurrentMedia && (
        <div className="mb-6">
          <div
            className="relative h-2 bg-gray-700 rounded-full cursor-pointer overflow-hidden"
            onClick={handleSeek}
          >
            <div
              className="absolute inset-y-0 left-0 bg-[#d93547] transition-all duration-300"
              style={{
                width: `${state.duration > 0 ? (state.progress / state.duration) * 100 : 0}%`,
              }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-400">
            <span>{formatTime(state.progress)}</span>
            <span>{formatTime(state.duration)}</span>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 mb-4">
        {/* Previous Track */}
        <button
          onClick={previous}
          disabled={!isCurrentMedia || state.currentTrackIndex === 0}
          className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center hover:bg-gray-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <SkipBack className="w-5 h-5 text-white" />
        </button>

        {/* Play/Pause */}
        <button
          onClick={handlePlay}
          className="w-16 h-16 rounded-full bg-[#d93547] flex items-center justify-center hover:bg-[#a00000] transition-colors shadow-lg"
        >
          {isCurrentMedia && state.isPlaying ? (
            <Pause className="w-7 h-7 text-white" />
          ) : (
            <Play className="w-7 h-7 text-white ml-1" />
          )}
        </button>

        {/* Next Track */}
        <button
          onClick={next}
          disabled={!isCurrentMedia || state.currentTrackIndex >= media.tracks.length - 1}
          className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center hover:bg-gray-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <SkipForward className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Minimize Button */}
      {isCurrentMedia && state.isPlaying && (
        <div className="flex justify-center">
          <button
            onClick={minimize}
            className="px-4 py-2 rounded-full bg-gray-700 text-white text-sm hover:bg-gray-600 transition-colors flex items-center gap-2"
          >
            <Minimize2 className="w-4 h-4" />
            Свернуть плеер
          </button>
        </div>
      )}

      {/* Track List */}
      {media.tracks.length > 1 && (
        <div className="mt-6 pt-6 border-t border-gray-700">
          <h4 className="text-white text-sm font-semibold mb-3">Треки</h4>
          <div className="space-y-2">
            {media.tracks.map((track, index) => (
              <button
                key={track.id}
                onClick={() => play(media, index)}
                className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                  isCurrentMedia && state.currentTrackIndex === index
                    ? 'bg-[#d93547]/20 border border-[#d93547]'
                    : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-gray-400 text-sm">
                      {(index + 1).toString().padStart(2, '0')}
                    </span>
                    <span className="text-white text-sm truncate">{track.title}</span>
                  </div>
                  {isCurrentMedia && state.currentTrackIndex === index && state.isPlaying && (
                    <AudioBars isPlaying={true} />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
