import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Video, VideoTimecode } from '@/lib/api';

export type MediaType = 'video' | 'audio' | 'meditation';

export interface MediaItem {
  id: string;
  type: MediaType;
  title: string;
  description?: string;
  url: string; // videoUrl or audioUrl
  coverUrl?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
}

interface MediaPlayerState {
  // Current media
  currentMedia: MediaItem | null;
  timecodes: VideoTimecode[];
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isMuted: boolean;
  showFullPlayer: boolean;
  seekTime: number | null;
  playbackRate: number;

  // Actions
  setMedia: (media: MediaItem | null, timecodes?: VideoTimecode[]) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setIsMuted: (isMuted: boolean) => void;
  setShowFullPlayer: (show: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  seekTo: (time: number) => void;
  clearSeek: () => void;
  closePlayer: () => void;
  minimizePlayer: () => void;
}

export const useMediaPlayerStore = create<MediaPlayerState>()(
  persist(
    (set) => ({
      currentMedia: null,
      timecodes: [],
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      isMuted: false,
      showFullPlayer: false,
      seekTime: null,
      playbackRate: 1,

      setMedia: (media, timecodes = []) =>
        set({
          currentMedia: media,
          timecodes,
          currentTime: 0,
          duration: 0,
          showFullPlayer: true,
          isPlaying: false, // Don't autoplay - user must click play
        }),

      setIsPlaying: (isPlaying) => set({ isPlaying }),
      setCurrentTime: (currentTime) => set({ currentTime }),
      setDuration: (duration) => set({ duration }),
      setIsMuted: (isMuted) => set({ isMuted }),
      setShowFullPlayer: (showFullPlayer) => set({ showFullPlayer }),
      setPlaybackRate: (playbackRate) => set({ playbackRate }),
      seekTo: (time) => set({ seekTime: time, currentTime: time }),
      clearSeek: () => set({ seekTime: null }),

      closePlayer: () =>
        set({
          currentMedia: null,
          timecodes: [],
          isPlaying: false,
          currentTime: 0,
          duration: 0,
          showFullPlayer: false,
          seekTime: null,
        }),

      minimizePlayer: () => set({ showFullPlayer: false }),
    }),
    {
      name: 'media-player-storage',
      // Persist only essential state, not transient values
      partialize: (state) => ({
        currentMedia: state.currentMedia,
        isPlaying: state.isPlaying,
        currentTime: state.currentTime,
        duration: state.duration,
        showFullPlayer: state.showFullPlayer,
        playbackRate: state.playbackRate,
      }),
    }
  )
);
