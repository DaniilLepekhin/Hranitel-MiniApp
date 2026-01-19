'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Maximize2, Minimize2 } from 'lucide-react';
import { Navigation, TabType } from '@/components/ui/Navigation';
import { MiniPlayer } from '@/components/ui/MiniPlayer';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { useTelegram } from '@/hooks/useTelegram';
import { useAuthStore } from '@/store/auth';
import { authApi, setAuthToken } from '@/lib/api';

// 🚀 КРИТИЧЕСКАЯ ОПТИМИЗАЦИЯ: Обычные импорты для мгновенного переключения
// Dynamic imports создавали задержки при быстрой навигации
import { HomeTab } from '@/components/tabs/HomeTab';
import { PathTab } from '@/components/tabs/PathTab';
import { ChatsTab } from '@/components/tabs/ChatsTab';
import { RatingsTab } from '@/components/tabs/RatingsTab';
import { ProfileTab } from '@/components/tabs/ProfileTab';
import { ShopTab } from '@/components/tabs/ShopTab';

function HomeContent() {
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const searchParams = useSearchParams();
  
  // Handle tab query parameter
  useEffect(() => {
    const tab = searchParams.get('tab') as TabType;
    if (tab && ['home', 'path', 'chats', 'ratings', 'profile', 'shop'].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);
  const { user: tgUser, isReady, initData, webApp, requestFullscreen, exitFullscreen, isFullscreen, haptic } = useTelegram();
  const { user, token, setUser, isLoading, setLoading } = useAuthStore();

  const toggleFullscreen = () => {
    haptic.impact('medium');
    if (isFullscreen) {
      exitFullscreen();
    } else {
      requestFullscreen();
    }
  };

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

      try {
        if (initData) {
          // Telegram WebApp auth
          const response = await authApi.login(initData, webApp?.initDataUnsafe);
          // IMPORTANT: Set auth token BEFORE updating user state to prevent race conditions
          // where React Query makes requests before the token is available
          setAuthToken(response.token);
          setUser(response.user, response.token);
        } else if (tgUser) {
          // Dev mode - try to get existing session
          try {
            const response = await authApi.me();
            setUser(response.user);
          } catch {
            // Create mock user for dev
            setUser({
              id: 'dev-user',
              telegramId: String(tgUser.id),
              firstName: tgUser.first_name,
              lastName: tgUser.last_name,
              username: tgUser.username,
              level: 1,
              experience: 0,
              energies: 0, // Energy Points
              streak: 0,
              isPro: false,
              createdAt: new Date().toISOString(),
            });
          }
        }
      } catch (error) {
        console.error('Auth error:', error);
      } finally {
        setLoading(false);
      }
    };

    authenticate();
  }, [isReady, initData, tgUser, webApp, setUser, setLoading]);

  // Loading state - ✨ НОВЫЙ ДИЗАЙН С "KOD"
  // Only show loading screen if user is not in store (initial load)
  if (isLoading && !user) {
    return <LoadingScreen />;
  }

  const tabComponents: Record<TabType, React.ReactNode> = {
    home: <HomeTab onProfileClick={() => setActiveTab('profile')} />,
    path: <PathTab />,
    chats: <ChatsTab />,
    ratings: <RatingsTab onShopClick={() => setActiveTab('shop')} />,
    profile: <ProfileTab />,
    shop: <ShopTab />,
  };

  return (
    <main className="page-container">
      {/* Decorative blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-orange-400 to-pink-400 rounded-full blur-3xl opacity-10 -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-br from-yellow-400 to-orange-400 rounded-full blur-3xl opacity-10 translate-y-1/2 -translate-x-1/2" />
      </div>

      {/* Fullscreen Toggle Button */}
      {webApp && (
        <button
          onClick={toggleFullscreen}
          className="fixed bottom-[140px] right-4 z-40 w-10 h-10 rounded-full bg-gray-800/90 backdrop-blur-sm shadow-lg flex items-center justify-center active:scale-95 transition-all hover:bg-gray-800 border border-white/10"
          aria-label={isFullscreen ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим'}
        >
          {isFullscreen ? (
            <Minimize2 className="w-4 h-4 text-gray-300" />
          ) : (
            <Maximize2 className="w-4 h-4 text-gray-300" />
          )}
        </button>
      )}

      {/* Content - 🚀 БЕЗ АНИМАЦИИ для мгновенного переключения */}
      <div className="relative z-10">
        {tabComponents[activeTab]}
      </div>

      {/* Mini Player - Global, persists across tabs */}
      <MiniPlayer />

      {/* Navigation */}
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
    </main>
  );
}


export default function Home() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <HomeContent />
    </Suspense>
  );
}
