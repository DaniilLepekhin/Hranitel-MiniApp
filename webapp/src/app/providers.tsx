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
  // 🚀 ОПТИМИЗИРОВАННАЯ КОНФИГУРАЦИЯ REACT QUERY
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,  // 5 минут по умолчанию (было 1 минута - слишком агрессивно!)
            gcTime: 10 * 60 * 1000,    // 10 минут в памяти (было 5)
            retry: 1,
            refetchOnWindowFocus: true,  // ✅ Включено! Обновлять при возврате
            refetchOnReconnect: true,     // Обновлять при восстановлении сети
            refetchInterval: false,        // НЕ делать постоянные запросы фоном
          },
          mutations: {
            // Автоматически повторять мутации при ошибке сети
            retry: 2,
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
