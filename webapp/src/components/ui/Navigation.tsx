'use client';

import { Home, TrendingUp, MessageCircle, Trophy, User } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { clsx } from 'clsx';

export type TabType = 'home' | 'path' | 'chats' | 'ratings' | 'profile' | 'shop';

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
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 safe-area-inset-bottom"
      style={{
        height: '72px',
        background: 'rgb(45, 38, 32)',
        borderRadius: '16.789px 16.789px 0 0',
      }}
    >
      <div className="flex items-center justify-around h-full px-[9px]">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;

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
                'flex flex-col items-center justify-center transition-all active:scale-95',
                isActive ? 'h-[72px] rounded-[9px]' : ''
              )}
              style={isActive ? {
                width: '77px',
                background: 'linear-gradient(261.695deg, rgb(174, 30, 43) 17.09%, rgb(156, 23, 35) 108.05%)',
                borderColor: '#d03240',
                borderWidth: '1px',
                borderStyle: 'solid',
              } : {
                width: '61px',
              }}
            >
              <Icon
                className="mb-[4px]"
                style={{
                  width: '15.326px',
                  height: '15.326px',
                  color: '#f7f1e8',
                }}
              />
              <span
                style={{
                  fontFamily: 'Gilroy, sans-serif',
                  fontSize: '11.931px',
                  fontWeight: 500,
                  lineHeight: '0.95',
                  letterSpacing: '-0.3579px',
                  color: '#f7f1e8',
                  textAlign: 'center',
                }}
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
