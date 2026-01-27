'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { useTelegram } from '@/hooks/useTelegram';
import { authApi, setAuthToken } from '@/lib/api';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { SubscriptionRequiredScreen } from '@/components/ui/SubscriptionRequiredScreen';

interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * Компонент-обёртка для защиты страниц
 * Проверяет авторизацию и подписку пользователя
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const { user: tgUser, isReady, initData, webApp } = useTelegram();
  const { user, token, hasInitialized, setUser, setLoading, setHasInitialized } = useAuthStore();
  const [isAuthenticating, setIsAuthenticating] = useState(true);

  // Initialize auth token from store
  useEffect(() => {
    if (token) {
      setAuthToken(token);
    }
  }, [token]);

  // Auth
  useEffect(() => {
    const authenticate = async () => {
      if (!isReady) return;

      const startTime = Date.now();

      try {
        if (initData) {
          // Telegram WebApp auth
          const response = await authApi.login(initData, webApp?.initDataUnsafe);
          setAuthToken(response.token);
          setUser(response.user, response.token);
        } else if (tgUser) {
          // Dev mode
          try {
            const response = await authApi.me();
            setUser(response.user);
          } catch {
            setUser({
              id: 'dev-user',
              telegramId: String(tgUser.id),
              firstName: tgUser.first_name,
              lastName: tgUser.last_name,
              username: tgUser.username,
              level: 1,
              experience: 0,
              energies: 0,
              streak: 0,
              isPro: false,
              createdAt: new Date().toISOString(),
            });
          }
        }
      } catch (error) {
        console.error('Auth error:', error);
      } finally {
        const elapsed = Date.now() - startTime;
        const minLoadingTime = 1500;
        const remainingTime = Math.max(0, minLoadingTime - elapsed);

        setTimeout(() => {
          setLoading(false);
          setHasInitialized(true);
          setIsAuthenticating(false);
        }, remainingTime);
      }
    };

    authenticate();
  }, [isReady, initData, tgUser, webApp, setUser, setLoading, setHasInitialized]);

  // Loading
  if (!hasInitialized || isAuthenticating) {
    return <LoadingScreen />;
  }

  // No subscription
  if (!user?.isPro) {
    return <SubscriptionRequiredScreen />;
  }

  return <>{children}</>;
}
