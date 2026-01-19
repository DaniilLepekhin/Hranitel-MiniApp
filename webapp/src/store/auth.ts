import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/lib/api';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasInitialized: boolean;
  setUser: (user: User | null, token?: string | null) => void;
  setLoading: (loading: boolean) => void;
  setHasInitialized: (initialized: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,
      hasInitialized: false,

      setUser: (user, token) =>
        set((state) => ({
          user,
          token: token !== undefined ? token : state.token,
          isAuthenticated: !!user,
          isLoading: false,
        })),

      setLoading: (loading) =>
        set({ isLoading: loading }),

      setHasInitialized: (initialized) =>
        set({ hasInitialized: initialized }),

      logout: () =>
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
          hasInitialized: false,
        }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        // НЕ персистим isLoading и hasInitialized - LoadingScreen должен показываться при каждом открытии
      }),
    }
  )
);
