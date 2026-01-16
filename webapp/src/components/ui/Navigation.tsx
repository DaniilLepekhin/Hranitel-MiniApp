'use client';

import { Home, TrendingUp, MessageCircle, Trophy, User } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { clsx } from 'clsx';

export type TabType = 'home' | 'path' | 'chats' | 'ratings' | 'profile';

interface NavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const tabs = [
  {
    id: 'home' as TabType,
    label: 'Главная',
    icon: Home,
  },
  {
    id: 'path' as TabType,
    label: 'Путь',
    icon: TrendingUp,
  },
  {
    id: 'chats' as TabType,
    label: 'Чаты',
    icon: MessageCircle,
  },
  {
    id: 'ratings' as TabType,
    label: 'Рейтинги / баллы',
    icon: Trophy,
  },
  {
    id: 'profile' as TabType,
    label: 'Профиль',
    icon: User,
  },
];

export function Navigation({ activeTab, onTabChange }: NavigationProps) {
  const { haptic } = useTelegram();

  const handleTabClick = (tab: TabType) => {
    if (tab !== activeTab) {
      haptic.selection();
      onTabChange(tab);
    }
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#2d2520] safe-area-inset-bottom z-50">
      <div className="flex items-center justify-around px-2 py-3">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;

          // Safety check for icon
          if (!tab.icon) {
            console.error('Missing icon for tab:', tab.id);
            return null;
          }

          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={clsx(
                'flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all active:scale-95 min-w-[70px]',
                isActive
                  ? 'bg-[#a52a2a]'
                  : ''
              )}
            >
              <Icon
                className={clsx(
                  'w-6 h-6',
                  isActive ? 'text-white' : 'text-[#a8998a]'
                )}
              />
              <span
                className={clsx(
                  'text-[10px] font-medium',
                  isActive ? 'text-white' : 'text-[#a8998a]'
                )}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
