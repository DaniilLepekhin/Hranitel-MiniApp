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
    <nav className="fixed bottom-0 left-0 right-0 bg-[#f7f1e8] border-t border-[#3d2f1f]/10 safe-area-inset-bottom z-50">
      <div className="flex items-center justify-around px-2 pt-2 pb-safe">
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
                'flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all active:scale-95',
                isActive
                  ? 'bg-gradient-to-br from-[#8b0000]/10 to-[#8b4513]/10'
                  : 'hover:bg-[#3d2f1f]/5'
              )}
            >
              <Icon
                className={clsx(
                  'w-5 h-5',
                  isActive ? 'text-[#8b0000]' : 'text-[#6b5a4a]'
                )}
              />
              <span
                className={clsx(
                  'text-[10px] font-semibold',
                  isActive ? 'text-[#8b0000]' : 'text-[#6b5a4a]'
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
