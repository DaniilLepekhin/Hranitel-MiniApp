'use client';

import React, { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';

export interface MediaTrack {
  id: string;
  title: string;
  url: string;
  duration?: number;
  thumbnail?: string;
}

export interface MediaItem {
  id: string;
  title: string;
  type: 'audio' | 'video';
  tracks: MediaTrack[];
  thumbnail?: string;
}

interface MediaPlayerState {
  currentMedia: MediaItem | null;
  currentTrackIndex: number;
  isPlaying: boolean;
  isMinimized: boolean;
  progress: number;
  duration: number;
}

interface MediaPlayerContextType {
  state: MediaPlayerState;
  play: (media: MediaItem, trackIndex?: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  next: () => void;
  previous: () => void;
  seek: (time: number) => void;
  minimize: () => void;
  maximize: () => void;
  setTrack: (index: number) => void;
}

const MediaPlayerContext = createContext<MediaPlayerContextType | undefined>(undefined);

export const useMediaPlayer = () => {
  const context = useContext(MediaPlayerContext);
  if (!context) {
    throw new Error('useMediaPlayer must be used within MediaPlayerProvider');
  }
  return context;
};

interface MediaPlayerProviderProps {
  children: ReactNode;
}

export const MediaPlayerProvider: React.FC<MediaPlayerProviderProps> = ({ children }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<MediaPlayerState>({
    currentMedia: null,
    currentTrackIndex: 0,
    isPlaying: false,
    isMinimized: false,
    progress: 0,
    duration: 0,
  });

  // Initialize audio element
  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioRef.current = new Audio();

      const audio = audioRef.current;

      audio.addEventListener('timeupdate', () => {
        setState(prev => ({
          ...prev,
          progress: audio.currentTime,
        }));
      });

      audio.addEventListener('loadedmetadata', () => {
        setState(prev => ({
          ...prev,
          duration: audio.duration,
        }));
      });

      audio.addEventListener('ended', () => {
        // Auto-play next track if available
        setState(prev => {
          if (prev.currentMedia && prev.currentTrackIndex < prev.currentMedia.tracks.length - 1) {
            const nextIndex = prev.currentTrackIndex + 1;
            audio.src = prev.currentMedia.tracks[nextIndex].url;
            audio.play();
            return {
              ...prev,
              currentTrackIndex: nextIndex,
              isPlaying: true,
            };
          } else {
            return {
              ...prev,
              isPlaying: false,
            };
          }
        });
      });

      audio.addEventListener('play', () => {
        setState(prev => ({ ...prev, isPlaying: true }));
      });

      audio.addEventListener('pause', () => {
        setState(prev => ({ ...prev, isPlaying: false }));
      });

      return () => {
        audio.pause();
        audio.src = '';
      };
    }
  }, []);

  const play = (media: MediaItem, trackIndex: number = 0) => {
    if (!audioRef.current) return;

    const audio = audioRef.current;
    const track = media.tracks[trackIndex];

    audio.src = track.url;
    audio.play();

    setState({
      currentMedia: media,
      currentTrackIndex: trackIndex,
      isPlaying: true,
      isMinimized: false,
      progress: 0,
      duration: 0,
    });
  };

  const pause = () => {
    if (!audioRef.current) return;
    audioRef.current.pause();
  };

  const resume = () => {
    if (!audioRef.current) return;
    audioRef.current.play();
  };

  const stop = () => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setState(prev => ({
      ...prev,
      isPlaying: false,
      progress: 0,
    }));
  };

  const next = () => {
    if (!state.currentMedia || state.currentTrackIndex >= state.currentMedia.tracks.length - 1) {
      return;
    }
    play(state.currentMedia, state.currentTrackIndex + 1);
  };

  const previous = () => {
    if (!state.currentMedia || state.currentTrackIndex <= 0) {
      return;
    }
    play(state.currentMedia, state.currentTrackIndex - 1);
  };

  const seek = (time: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = time;
  };

  const minimize = () => {
    setState(prev => ({ ...prev, isMinimized: true }));
  };

  const maximize = () => {
    setState(prev => ({ ...prev, isMinimized: false }));
  };

  const setTrack = (index: number) => {
    if (!state.currentMedia || index < 0 || index >= state.currentMedia.tracks.length) {
      return;
    }
    play(state.currentMedia, index);
  };

  return (
    <MediaPlayerContext.Provider
      value={{
        state,
        play,
        pause,
        resume,
        stop,
        next,
        previous,
        seek,
        minimize,
        maximize,
        setTrack,
      }}
    >
      {children}
    </MediaPlayerContext.Provider>
  );
};
