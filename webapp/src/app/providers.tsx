'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useTelegram } from '@/hooks/useTelegram';
import { FullMediaPlayer } from '@/components/player/FullMediaPlayer';
import { MiniPlayer } from '@/components/player/MiniPlayer';

function TelegramInit() {
  const { webApp, ready } = useTelegram();

  useEffect(() => {
    if (webApp) {
      ready();
      webApp.expand();
      webApp.setHeaderColor('#F7E9DA');
      webApp.setBackgroundColor('#F7E9DA');

      // Enable closing confirmation
      webApp.enableClosingConfirmation();
    }
  }, [webApp, ready]);

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
      {children}
      <FullMediaPlayer />
      <MiniPlayer />
    </QueryClientProvider>
  );
}
