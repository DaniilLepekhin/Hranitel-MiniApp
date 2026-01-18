'use client';

import { useEffect, useState, useCallback } from 'react';

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
  is_premium?: boolean;
}

interface WebApp {
  ready: () => void;
  expand: () => void;
  close: () => void;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  enableClosingConfirmation: () => void;
  disableClosingConfirmation: () => void;
  requestFullscreen: () => void;
  exitFullscreen: () => void;
  isFullscreen: boolean;
  initData: string;
  initDataUnsafe: {
    user?: TelegramUser;
    query_id?: string;
    auth_date?: number;
    hash?: string;
  };
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    setText: (text: string) => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
  };
  BackButton: {
    isVisible: boolean;
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
  };
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
  onEvent: (eventType: string, callback: () => void) => void;
  offEvent: (eventType: string, callback: () => void) => void;
  openLink: (url: string, options?: { try_instant_view?: boolean }) => void;
  openTelegramLink: (url: string) => void;
  showAlert: (message: string, callback?: () => void) => void;
  showConfirm: (message: string, callback?: (confirmed: boolean) => void) => void;
  showPopup: (params: { title?: string; message: string; buttons?: Array<{ id?: string; type?: string; text: string }> }, callback?: (buttonId: string) => void) => void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: WebApp;
    };
  }
}

export function useTelegram() {
  const [webApp, setWebApp] = useState<WebApp | null>(null);
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;

    if (tg) {
      setWebApp(tg);
      setUser(tg.initDataUnsafe?.user || null);
      setIsFullscreen(tg.isFullscreen || false);
      setIsReady(true);

      // Listen for fullscreen changes
      const handleFullscreenChange = () => {
        setIsFullscreen(tg.isFullscreen || false);
      };

      tg.onEvent('fullscreenChanged', handleFullscreenChange);

      return () => {
        tg.offEvent('fullscreenChanged', handleFullscreenChange);
      };
    } else {
      // Development fallback
      setUser({
        id: 123456789,
        first_name: 'Test',
        last_name: 'User',
        username: 'testuser',
      });
      setIsReady(true);
    }
  }, []);

  const ready = useCallback(() => {
    webApp?.ready();
  }, [webApp]);

  const expand = useCallback(() => {
    webApp?.expand();
  }, [webApp]);

  const close = useCallback(() => {
    webApp?.close();
  }, [webApp]);

  // 🚀 КРИТИЧЕСКАЯ ОПТИМИЗАЦИЯ: Throttling для haptic feedback (предотвращает блокировку UI)
  const lastHapticTime = { current: 0 };
  const HAPTIC_THROTTLE_MS = 50; // Минимальный интервал между вызовами

  const haptic = {
    impact: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'medium') => {
      const now = Date.now();
      if (now - lastHapticTime.current < HAPTIC_THROTTLE_MS) return;
      lastHapticTime.current = now;

      // Асинхронный вызов для не блокирования UI
      requestAnimationFrame(() => {
        webApp?.HapticFeedback?.impactOccurred(style);
      });
    },
    notification: (type: 'error' | 'success' | 'warning') => {
      const now = Date.now();
      if (now - lastHapticTime.current < HAPTIC_THROTTLE_MS) return;
      lastHapticTime.current = now;

      requestAnimationFrame(() => {
        webApp?.HapticFeedback?.notificationOccurred(type);
      });
    },
    selection: () => {
      const now = Date.now();
      if (now - lastHapticTime.current < HAPTIC_THROTTLE_MS) return;
      lastHapticTime.current = now;

      requestAnimationFrame(() => {
        webApp?.HapticFeedback?.selectionChanged();
      });
    },
  };

  const requestFullscreen = useCallback(() => {
    webApp?.requestFullscreen?.();
  }, [webApp]);

  const exitFullscreen = useCallback(() => {
    webApp?.exitFullscreen?.();
  }, [webApp]);

  return {
    webApp,
    user,
    isReady,
    ready,
    expand,
    close,
    haptic,
    requestFullscreen,
    exitFullscreen,
    isFullscreen,
    initData: webApp?.initData || '',
    MainButton: webApp?.MainButton,
    BackButton: webApp?.BackButton,
  };
}
