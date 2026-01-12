import { create } from 'zustand';
import type { Meditation } from '@/lib/api';

interface PlayerState {
  // Current meditation
  selectedMeditation: Meditation | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isMuted: boolean;
  showFullPlayer: boolean;
  seekTime: number | null; // Used to signal seek to audio element

  // Actions
  setMeditation: (meditation: Meditation | null) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setIsMuted: (isMuted: boolean) => void;
  setShowFullPlayer: (show: boolean) => void;
  seekTo: (time: number) => void;
  clearSeek: () => void;
  closePlayer: () => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  selectedMeditation: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  isMuted: false,
  showFullPlayer: false,
  seekTime: null,

  setMeditation: (meditation) => set({ selectedMeditation: meditation }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setIsMuted: (isMuted) => set({ isMuted }),
  setShowFullPlayer: (showFullPlayer) => set({ showFullPlayer }),
  seekTo: (time) => set({ seekTime: time, currentTime: time }),
  clearSeek: () => set({ seekTime: null }),
  closePlayer: () => set({
    selectedMeditation: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    showFullPlayer: false,
    seekTime: null
  }),
}));
