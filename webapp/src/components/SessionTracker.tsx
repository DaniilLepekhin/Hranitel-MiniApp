'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/store/auth';
import { sessionsApi } from '@/lib/api';

/**
 * SessionTracker — невидимый компонент для трекинга времени в приложении.
 * 
 * Логика:
 * 1. При монтировании (пользователь авторизован) — отправляет /sessions/start
 * 2. Каждые 30 секунд шлёт /sessions/heartbeat
 * 3. При уходе из приложения (visibilitychange hidden, beforeunload) — шлёт /sessions/end
 * 4. При возврате (visibilitychange visible) — начинает новую сессию
 */
export function SessionTracker() {
  const { user, token } = useAuthStore();
  const sessionIdRef = useRef<string | null>(null);
  const startTimeRef = useRef<number>(0);
  const pagesRef = useRef<number>(0);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isActiveRef = useRef(false);

  const generateSessionId = () => {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  };

  const startSession = useCallback(async () => {
    if (!user || !token || isActiveRef.current) return;

    const sessionId = generateSessionId();
    sessionIdRef.current = sessionId;
    startTimeRef.current = Date.now();
    pagesRef.current = 1;
    isActiveRef.current = true;

    try {
      await sessionsApi.start(sessionId);
    } catch (e) {
      // Не критично — сессия создастся при heartbeat
    }

    // Heartbeat каждые 30 секунд
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }
    heartbeatIntervalRef.current = setInterval(async () => {
      if (!sessionIdRef.current || !isActiveRef.current) return;
      try {
        await sessionsApi.heartbeat(sessionIdRef.current, pagesRef.current);
      } catch {
        // Ignore heartbeat errors
      }
    }, 30_000);
  }, [user, token]);

  const endSession = useCallback(async () => {
    if (!sessionIdRef.current || !isActiveRef.current) return;

    isActiveRef.current = false;

    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
    const sid = sessionIdRef.current;
    const pages = pagesRef.current;
    sessionIdRef.current = null;

    // Используем sendBeacon для гарантированной доставки при закрытии
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const apiUrl = typeof window !== 'undefined' && window.location.hostname.includes('successkod.com')
        ? `https://${window.location.hostname}`
        : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001');

      const payload = JSON.stringify({
        session_id: sid,
        duration_seconds: duration,
        pages_visited: pages,
      });

      const headers = new Blob([payload], { type: 'application/json' });
      // sendBeacon не поддерживает custom headers, поэтому fallback на fetch с keepalive
      try {
        await fetch(`${apiUrl}/api/v1/sessions/end`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: payload,
          keepalive: true,
          credentials: 'include',
        });
      } catch {
        // Last resort — ignore
      }
    } else {
      try {
        await sessionsApi.end(sid, duration, pages);
      } catch {
        // Ignore
      }
    }
  }, [token]);

  // Трекинг навигации (подсчёт просмотренных страниц)
  useEffect(() => {
    if (!user || !token) return;

    const handlePopState = () => {
      pagesRef.current += 1;
    };

    // Перехватываем pushState и replaceState
    const origPushState = history.pushState;
    const origReplaceState = history.replaceState;

    history.pushState = function (...args) {
      pagesRef.current += 1;
      return origPushState.apply(this, args);
    };

    history.replaceState = function (...args) {
      // replaceState не считаем за новую страницу
      return origReplaceState.apply(this, args);
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      history.pushState = origPushState;
      history.replaceState = origReplaceState;
    };
  }, [user, token]);

  // Основная логика — start/end по видимости
  useEffect(() => {
    if (!user || !token) return;

    // Старт сессии
    startSession();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        endSession();
      } else if (document.visibilityState === 'visible') {
        startSession();
      }
    };

    const handleBeforeUnload = () => {
      endSession();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    // Telegram Mini App может закрываться через кнопку "Назад"
    window.addEventListener('pagehide', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
      endSession();
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [user, token, startSession, endSession]);

  // Компонент невидимый
  return null;
}
