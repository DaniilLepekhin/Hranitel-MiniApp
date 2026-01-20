import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
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

  // 🔧 FIX: Flag to track if hydration from storage is complete
  _hasHydrated: boolean;

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
  setHasHydrated: (hasHydrated: boolean) => void;
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
      _hasHydrated: false,

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
      setHasHydrated: (hasHydrated) => set({ _hasHydrated: hasHydrated }),
    }),
    {
      name: 'media-player-storage',
      storage: createJSONStorage(() => localStorage), // Use localStorage для сохранения между табами
      partialize: (state) => ({
        // Persist only essential state, not transient values like seekTime
        currentMedia: state.currentMedia,
        timecodes: state.timecodes,
        isPlaying: state.isPlaying, // Сохраняем isPlaying для продолжения воспроизведения
        currentTime: state.currentTime,
        duration: state.duration,
        isMuted: state.isMuted,
        showFullPlayer: false, // НЕ сохраняем showFullPlayer - всегда начинаем с мини-плеера
        playbackRate: state.playbackRate,
      }),
      // 🔧 FIX: Set hydration flag when restore completes
      onRehydrateStorage: () => (state) => {
        if (state) {
          state._hasHydrated = true;
          // При гидратации всегда показываем мини-плеер (не full player)
          state.showFullPlayer = false;
          // isPlaying остается как было сохранено - продолжаем воспроизведение
        }
      },
    }
  )
);
