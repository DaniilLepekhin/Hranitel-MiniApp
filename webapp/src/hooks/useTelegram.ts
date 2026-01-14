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

  const haptic = {
    impact: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'medium') => {
      webApp?.HapticFeedback?.impactOccurred(style);
    },
    notification: (type: 'error' | 'success' | 'warning') => {
      webApp?.HapticFeedback?.notificationOccurred(type);
    },
    selection: () => {
      webApp?.HapticFeedback?.selectionChanged();
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
