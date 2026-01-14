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
    gradient: 'from-orange-400 to-pink-500',
  },
  {
    id: 'path' as TabType,
    label: 'Путь',
    icon: Key,
    emoji: '🗝️',
    gradient: 'from-purple-400 to-indigo-500',
  },
  {
    id: 'chats' as TabType,
    label: 'Чаты',
    icon: MessageCircle,
    emoji: '💬',
    gradient: 'from-blue-400 to-cyan-500',
  },
  {
    id: 'shop' as TabType,
    label: 'Магазин',
    icon: ShoppingBag,
    emoji: '🛍️',
    gradient: 'from-emerald-400 to-teal-500',
  },
  {
    id: 'profile' as TabType,
    label: 'Профиль',
    icon: User,
    emoji: '👤',
    gradient: 'from-amber-400 to-orange-400',
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
        <div className="glass rounded-2xl p-1.5 shadow-lg flex justify-between">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                className={clsx(
                  'flex-1 flex flex-col items-center py-2 px-2 rounded-xl transition-all duration-300',
                  isActive
                    ? `bg-gradient-to-r ${tab.gradient} text-white shadow-md scale-105`
                    : 'text-gray-400 hover:text-gray-300'
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
