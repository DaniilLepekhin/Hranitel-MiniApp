'use client';

import { Home, Key, MessageCircle, ShoppingBag, User } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { clsx } from 'clsx';

export type TabType = 'home' | 'path' | 'chats' | 'shop' | 'profile';

interface NavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const tabs = [
  {
    id: 'home' as TabType,
    label: 'Главная',
    icon: Home,
    emoji: '🏠',
  },
  {
    id: 'path' as TabType,
    label: 'Путь',
    icon: Key,
    emoji: '🗝️',
  },
  {
    id: 'chats' as TabType,
    label: 'Чаты',
    icon: MessageCircle,
    emoji: '💬',
  },
  {
    id: 'shop' as TabType,
    label: 'Магазин',
    icon: ShoppingBag,
    emoji: '🛍️',
  },
  {
    id: 'profile' as TabType,
    label: 'Профиль',
    icon: User,
    emoji: '👤',
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
    <nav className="fixed bottom-0 left-0 right-0 z-30 safe-bottom">
      <div className="mx-4 mb-2">
        <div className="glass rounded-2xl p-1.5 shadow-lg flex justify-between border-2 border-[#8b4513]/30">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                className={clsx(
                  'flex-1 flex flex-col items-center py-2 px-2 rounded-xl transition-all duration-300',
                  isActive
                    ? 'bg-[#8b0000] text-white shadow-md scale-105'
                    : 'text-[#6b5a4a] hover:text-[#3d2f1f]'
                )}
              >
                <span
                  className={clsx(
                    'w-6 h-6 flex items-center justify-center rounded-full text-sm',
                    isActive && 'bg-white/20'
                  )}
                >
                  {tab.emoji}
                </span>
                <span className="text-[10px] font-medium mt-0.5">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
