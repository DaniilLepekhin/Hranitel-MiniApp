'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useTelegram } from '@/hooks/useTelegram';
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
    console.log('[AuthTokenInit] Token from store:', token ? 'EXISTS' : 'NULL');
    if (token) {
      setAuthToken(token);
      console.log('[AuthTokenInit] Token set in API client');
    } else {
      console.warn('[AuthTokenInit] No token in store! User needs to re-login');
    }
  }, [token]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  // 🚀 МАКСИМАЛЬНО ОПТИМИЗИРОВАННАЯ КОНФИГУРАЦИЯ REACT QUERY
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,      // 5 минут - данные считаются свежими
            gcTime: 10 * 60 * 1000,        // 10 минут в памяти
            retry: 1,
            refetchOnWindowFocus: false,   // ⚡ ОПТИМИЗАЦИЯ: не перезапрашивать при фокусе (экономит сеть)
            refetchOnReconnect: true,      // Обновлять при восстановлении сети
            refetchOnMount: false,         // ⚡ ОПТИМИЗАЦИЯ: не перезапрашивать при монтировании если данные fresh
            refetchInterval: false,        // Не делать постоянные запросы фоном
            networkMode: 'online',         // Запросы только при онлайне
          },
          mutations: {
            retry: 2,
            networkMode: 'online',
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TelegramInit />
      <AuthTokenInit />
      {children}
    </QueryClientProvider>
  );
}
