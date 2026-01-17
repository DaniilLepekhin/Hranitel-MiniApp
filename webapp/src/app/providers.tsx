'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useTelegram } from '@/hooks/useTelegram';
import { FullMediaPlayer } from '@/components/player/FullMediaPlayer';
import { MiniPlayer } from '@/components/player/MiniPlayer';
import { useAuthStore } from '@/store/auth';
import { setAuthToken } from '@/lib/api';

function TelegramInit() {
  const { webApp, ready } = useTelegram();

  useEffect(() => {
    if (webApp) {
      ready();
      webApp.expand();
      webApp.setHeaderColor('#f0ece8');
      webApp.setBackgroundColor('#f0ece8');

      // Enable closing confirmation
      webApp.enableClosingConfirmation();
    }
  }, [webApp, ready]);

  return null;
}

// Инициализация токена из persisted storage
function AuthTokenInit() {
  const { token } = useAuthStore();

  useEffect(() => {
    if (token) {
      setAuthToken(token);
    }
  }, [token]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            gcTime: 5 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TelegramInit />
      <AuthTokenInit />
      {children}
      <FullMediaPlayer />
      <MiniPlayer />
    </QueryClientProvider>
  );
}
