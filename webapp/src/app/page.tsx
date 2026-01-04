'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Navigation, TabType } from '@/components/ui/Navigation';
import { useTelegram } from '@/hooks/useTelegram';
import { useAuthStore } from '@/store/auth';
import { authApi, coursesApi, meditationsApi, gamificationApi, setAuthToken } from '@/lib/api';

// Tab Components
import { HomeTab } from '@/components/tabs/HomeTab';
import { CoursesTab } from '@/components/tabs/CoursesTab';
import { MeditationsTab } from '@/components/tabs/MeditationsTab';
import { ChatTab } from '@/components/tabs/ChatTab';
import { ProfileTab } from '@/components/tabs/ProfileTab';

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const { user: tgUser, isReady, initData, webApp } = useTelegram();
  const { user, token, setUser, isLoading, setLoading } = useAuthStore();

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
          setUser(response.user, response.token);
          setAuthToken(response.token);
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

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center animate-pulse">
            <span className="text-3xl">🎯</span>
          </div>
          <p className="text-gray-600">Загрузка...</p>
        </div>
      </div>
    );
  }

  const tabComponents: Record<TabType, React.ReactNode> = {
    home: <HomeTab />,
    courses: <CoursesTab />,
    meditations: <MeditationsTab />,
    chat: <ChatTab />,
    profile: <ProfileTab />,
  };

  return (
    <main className="min-h-screen pb-24">
      {/* Decorative blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-orange-400 to-pink-400 rounded-full blur-3xl opacity-20 -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-br from-yellow-400 to-orange-400 rounded-full blur-3xl opacity-20 translate-y-1/2 -translate-x-1/2" />
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="relative z-10"
        >
          {tabComponents[activeTab]}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
    </main>
  );
}
