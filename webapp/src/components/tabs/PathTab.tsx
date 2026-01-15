'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Key, Lock, CheckCircle, ChevronRight, Sparkles, Target, Palette, DollarSign, Home, Drama, HandHeart, Heart, Flame, Globe2, Briefcase, Users2, Calendar, BookOpen, Headphones, Radio } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { useAuthStore } from '@/store/auth';
import { Card } from '@/components/ui/Card';
import { contentApi } from '@/lib/api';

// 12 месяцев программы
const monthThemes = [
  { key: 1, theme: 'Идентичность', icon: Target },
  { key: 2, theme: 'Ниша и смысл', icon: Palette },
  { key: 3, theme: 'Деньги и ресурсы', icon: DollarSign },
  { key: 4, theme: 'Дом и корни', icon: Home },
  { key: 5, theme: 'Творчество', icon: Drama },
  { key: 6, theme: 'Служение', icon: HandHeart },
  { key: 7, theme: 'Отношения', icon: Heart },
  { key: 8, theme: 'Трансформация', icon: Flame },
  { key: 9, theme: 'Мировоззрение', icon: Globe2 },
  { key: 10, theme: 'Карьера', icon: Briefcase },
  { key: 11, theme: 'Сообщество', icon: Users2 },
  { key: 12, theme: 'Духовность', icon: Sparkles },
];

export function PathTab() {
  const router = useRouter();
  const { haptic } = useTelegram();
  const { user } = useAuthStore();

  // Fetch all content items
  const { data: contentData, isLoading } = useQuery({
    queryKey: ['content', 'all'],
    queryFn: () => contentApi.getItems(),
    enabled: !!user,
  });

  // Fetch user progress
  const { data: progressData } = useQuery({
    queryKey: ['content', 'progress', user?.id],
    queryFn: () => {
      if (!user?.id) {
        throw new Error('User ID is required');
      }
      return contentApi.getUserProgress(user.id);
    },
    enabled: !!user?.id,
  });

  const items = contentData?.items || [];
  const progress = progressData?.progress || [];

  // Group content items by keyNumber
  const itemsByKey = items.reduce((acc: any, item: any) => {
    const keyNum = item.keyNumber || 0;
    if (!acc[keyNum]) acc[keyNum] = [];
    acc[keyNum].push(item);
    return acc;
  }, {});

  // Calculate completed keys based on progress
  const completedKeys: number[] = [];
  for (let i = 1; i <= 12; i++) {
    const keyItems = itemsByKey[i] || [];
    if (keyItems.length > 0) {
      // Check if all content in this key is completed
      const allCompleted = keyItems.every((item: any) => {
        return progress.some((p) => p.contentItemId === item.id && p.watched);
      });
      if (allCompleted) {
        completedKeys.push(i);
      }
    }
  }

  // Current key is the first incomplete key
  let currentKey = 1;
  for (let i = 1; i <= 12; i++) {
    if (!completedKeys.includes(i)) {
      currentKey = i;
      break;
    }
  }

  const handleKeyClick = (keyNumber: number) => {
    const isUnlocked = keyNumber <= currentKey;
    if (!isUnlocked) {
      haptic.notification('error');
      return;
    }

    haptic.impact('light');

    // Переход к первому контенту этого ключа
    const keyItems = itemsByKey[keyNumber] || [];
    if (keyItems.length > 0) {
      router.push(`/content/${keyItems[0].id}`);
    }
  };

  const handleNavigate = (path: string) => {
    haptic.impact('light');
    router.push(path);
  };

  return (
    <div className="px-4 pt-6 pb-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="section-title">Путь 12 Ключей</h1>
        <p className="text-[#6b5a4a] text-sm text-center">
          Год трансформации через 12 посвящений
        </p>
      </div>

      {/* Progress Stats */}
      <Card className="p-4 mb-6 bg-gradient-to-br from-[#8b0000]/10 to-[#8b4513]/10 border-[#8b4513]/30">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[#6b5a4a] text-sm mb-1">Твой прогресс</p>
            <div className="flex items-center gap-3">
              <p className="text-4xl font-bold text-[#3d2f1f]">{completedKeys.length}</p>
              <div>
                <p className="text-sm text-[#8b0000] font-semibold">из 12 ключей</p>
                <p className="text-xs text-[#6b5a4a]">пройдено</p>
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#8b0000] to-[#8b4513] flex items-center justify-center shadow-lg">
              <Key className="w-8 h-8 text-white" strokeWidth={2} />
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4 h-2 bg-[#e8dcc6] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#8b0000] to-[#8b4513] transition-all duration-500"
            style={{ width: `${(completedKeys.length / 12) * 100}%` }}
          />
        </div>
      </Card>

      {/* Quick Access Section */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-[#3d2f1f] mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#8b0000]" />
          Быстрый доступ
        </h3>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <Card
            className="p-4 hover:scale-[1.02] transition-all cursor-pointer bg-gradient-to-br from-[#8b0000]/10 to-[#8b4513]/10"
            onClick={() => handleNavigate('/month-program')}
          >
            <Calendar className="w-8 h-8 text-[#8b0000] mb-2" />
            <p className="font-semibold text-[#3d2f1f] text-sm">Программа месяца</p>
          </Card>

          <Card
            className="p-4 hover:scale-[1.02] transition-all cursor-pointer bg-gradient-to-br from-[#8b4513]/10 to-[#6b3410]/10"
            onClick={() => handleNavigate('/content-list/practice')}
          >
            <Sparkles className="w-8 h-8 text-[#8b0000] mb-2" />
            <p className="font-semibold text-[#3d2f1f] text-sm">Практики</p>
          </Card>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Card
            className="p-3 hover:scale-[1.02] transition-all cursor-pointer bg-white/80"
            onClick={() => handleNavigate('/content-list/course')}
          >
            <BookOpen className="w-6 h-6 text-[#8b0000] mb-1 mx-auto" />
            <p className="font-semibold text-[#3d2f1f] text-xs text-center">Курсы</p>
          </Card>

          <Card
            className="p-3 hover:scale-[1.02] transition-all cursor-pointer bg-white/80"
            onClick={() => handleNavigate('/content-list/podcast')}
          >
            <Headphones className="w-6 h-6 text-[#8b0000] mb-1 mx-auto" />
            <p className="font-semibold text-[#3d2f1f] text-xs text-center">Подкасты</p>
          </Card>

          <Card
            className="p-3 hover:scale-[1.02] transition-all cursor-pointer bg-white/80"
            onClick={() => handleNavigate('/content-list/stream_record')}
          >
            <Radio className="w-6 h-6 text-[#8b0000] mb-1 mx-auto" />
            <p className="font-semibold text-[#3d2f1f] text-xs text-center">Эфиры</p>
          </Card>
        </div>
      </div>

      {/* Info Block */}
      <div className="mb-6 p-4 bg-gradient-to-br from-[#8b0000]/5 to-[#8b4513]/5 rounded-xl border border-[#8b4513]/20">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#8b0000]/20 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4 text-[#8b0000]" />
          </div>
          <div>
            <h4 className="text-[#3d2f1f] font-semibold text-sm mb-1">Последовательное обучение</h4>
            <p className="text-[#6b5a4a] text-xs leading-relaxed">
              Каждый ключ открывается после завершения предыдущего.
              Пройди весь путь за 12 месяцев трансформации.
            </p>
          </div>
        </div>
      </div>

      {/* 12 Keys Roadmap - Snake Style */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-[#e8dcc6]/50 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="relative">
          {/* SVG Road Path - Connecting all chests in snake pattern */}
          <svg
            className="absolute inset-0 w-full pointer-events-none"
            style={{ height: `${monthThemes.length * 100}px` }}
            viewBox={`0 0 340 ${monthThemes.length * 100}`}
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              {/* Road gradient for completed sections */}
              <linearGradient id="roadGradientCompleted" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#d4a574" />
                <stop offset="100%" stopColor="#c4956a" />
              </linearGradient>
              {/* Road gradient for locked sections */}
              <linearGradient id="roadGradientLocked" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#e8dcc6" />
                <stop offset="100%" stopColor="#d8cbb6" />
              </linearGradient>
            </defs>

            {/* Generate the snake road path */}
            {monthThemes.map((month, index) => {
              if (index >= monthThemes.length - 1) return null;

              const isCompleted = completedKeys.includes(month.key);
              const isUnlocked = month.key <= currentKey;
              const isLeft = index % 2 === 0;
              const nextIsLeft = (index + 1) % 2 === 0;

              // Card dimensions in viewBox (340px width)
              // Left card center X ~95 (55% width / 2)
              // Right card center X ~245 (340 - 55% width / 2)
              const leftCardCenterX = 95;
              const rightCardCenterX = 245;

              // Y positions: each row is 100px, card center at 50px within row
              const currentCardBottomY = index * 100 + 75; // bottom of current card
              const nextCardSideY = (index + 1) * 100 + 50; // center height of next card

              // Current card center X (where road exits from bottom)
              const currentCenterX = isLeft ? leftCardCenterX : rightCardCenterX;
              // Next card edge X (where road enters from side)
              const nextEdgeX = nextIsLeft ? 0 : 340; // enters from left edge or right edge
              const nextCenterX = nextIsLeft ? leftCardCenterX : rightCardCenterX;

              // Path: exit bottom of current card → curve → enter side of next card → go to center
              // We draw from bottom of card to the side edge of next card
              const pathD = `M ${currentCenterX} ${currentCardBottomY}
                             C ${currentCenterX} ${currentCardBottomY + 30},
                               ${nextEdgeX + (nextIsLeft ? 50 : -50)} ${nextCardSideY},
                               ${nextEdgeX + (nextIsLeft ? 15 : -15)} ${nextCardSideY}`;

              return (
                <g key={`road-${month.key}`}>
                  {/* Road background */}
                  <path
                    d={pathD}
                    stroke={isCompleted || isUnlocked ? "url(#roadGradientCompleted)" : "url(#roadGradientLocked)"}
                    strokeWidth="22"
                    fill="none"
                    strokeLinecap="round"
                    strokeOpacity="0.6"
                  />
                  {/* Road edges - subtle */}
                  <path
                    d={pathD}
                    stroke="#8b4513"
                    strokeWidth="24"
                    fill="none"
                    strokeLinecap="round"
                    strokeOpacity="0.1"
                  />
                  {/* Road inner highlight - dashed line */}
                  <path
                    d={pathD}
                    stroke={isCompleted ? "#ffd700" : "#ffffff"}
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray="8 6"
                    strokeOpacity={isCompleted ? 0.6 : isUnlocked ? 0.4 : 0.15}
                  />
                </g>
              );
            })}
          </svg>

          {/* Chest Cards */}
          {monthThemes.map((month, index) => {
            const isCompleted = completedKeys.includes(month.key);
            const isUnlocked = month.key <= currentKey;
            const isCurrent = month.key === currentKey;
            const keyItems = itemsByKey[month.key] || [];
            const IconComponent = month.icon;
            const isLeft = index % 2 === 0;

            return (
              <div
                key={month.key}
                className={`relative flex items-center ${isLeft ? 'justify-start' : 'justify-end'}`}
                style={{ height: '100px' }}
              >
                {/* Chest Card */}
                <div
                  onClick={() => handleKeyClick(month.key)}
                  className={`
                    relative w-[55%] p-3 rounded-2xl cursor-pointer transition-all duration-300 z-10
                    ${isUnlocked ? 'hover:scale-[1.03] active:scale-[0.98]' : 'opacity-70'}
                    ${isCurrent ? 'ring-2 ring-[#8b0000] ring-offset-2' : ''}
                    ${isCompleted
                      ? 'bg-gradient-to-br from-[#ffd700]/20 to-[#8b4513]/20 border-2 border-[#ffd700]/50 shadow-lg shadow-[#ffd700]/20'
                      : isUnlocked
                        ? 'bg-gradient-to-br from-[#8b0000]/10 to-[#8b4513]/10 border border-[#8b4513]/30 shadow-md'
                        : 'bg-[#e8dcc6]/70 border border-[#8b4513]/20'
                    }
                  `}
                >
                  {/* Chest Icon */}
                  <div className="flex items-center gap-3">
                    <div className={`
                      relative w-14 h-14 rounded-xl flex items-center justify-center overflow-visible flex-shrink-0
                      ${isCompleted
                        ? 'bg-gradient-to-br from-[#ffd700] to-[#b8860b] shadow-lg shadow-[#ffd700]/30'
                        : isUnlocked
                          ? 'bg-gradient-to-br from-[#8b0000] to-[#8b4513] shadow-md'
                          : 'bg-[#8b4513]/30'
                      }
                    `}>
                      {/* Beautiful Chest SVGs */}
                      {isCompleted ? (
                        // Open treasure chest with sparkles
                        <svg viewBox="0 0 32 32" className="w-10 h-10" fill="none">
                          {/* Sparkles */}
                          <path d="M16 2l1 3-1 3-1-3 1-3z" fill="white" opacity="0.9"/>
                          <path d="M8 5l2 2-1 2-2-2 1-2z" fill="white" opacity="0.7"/>
                          <path d="M24 5l-2 2 1 2 2-2-1-2z" fill="white" opacity="0.7"/>
                          <circle cx="6" cy="10" r="1" fill="white" opacity="0.6"/>
                          <circle cx="26" cy="10" r="1" fill="white" opacity="0.6"/>
                          {/* Open lid */}
                          <path d="M5 11h22l-2-4H7l-2 4z" fill="white" fillOpacity="0.3" stroke="white" strokeWidth="1"/>
                          <path d="M7 7h18" stroke="white" strokeWidth="1" strokeLinecap="round"/>
                          {/* Chest body */}
                          <rect x="4" y="13" width="24" height="14" rx="2" fill="white" fillOpacity="0.2" stroke="white" strokeWidth="1.2"/>
                          {/* Metal bands */}
                          <path d="M4 17h24" stroke="white" strokeWidth="1"/>
                          <path d="M4 23h24" stroke="white" strokeWidth="1"/>
                          {/* Gold lock plate */}
                          <rect x="13" y="15" width="6" height="6" rx="1" fill="white" fillOpacity="0.4"/>
                          <circle cx="16" cy="18" r="1.5" fill="white"/>
                          {/* Corner rivets */}
                          <circle cx="6" cy="15" r="0.8" fill="white"/>
                          <circle cx="26" cy="15" r="0.8" fill="white"/>
                          <circle cx="6" cy="25" r="0.8" fill="white"/>
                          <circle cx="26" cy="25" r="0.8" fill="white"/>
                        </svg>
                      ) : isUnlocked ? (
                        // Closed chest (unlocked, ready to open)
                        <svg viewBox="0 0 32 32" className="w-9 h-9" fill="none">
                          {/* Chest lid */}
                          <path d="M4 12h24l-2-4H6l-2 4z" fill="white" fillOpacity="0.2" stroke="white" strokeWidth="1.2"/>
                          <path d="M6 8h20" stroke="white" strokeWidth="1" strokeLinecap="round"/>
                          {/* Chest body */}
                          <rect x="4" y="12" width="24" height="14" rx="2" fill="white" fillOpacity="0.15" stroke="white" strokeWidth="1.2"/>
                          {/* Metal bands */}
                          <path d="M4 16h24" stroke="white" strokeWidth="1"/>
                          <path d="M4 22h24" stroke="white" strokeWidth="1"/>
                          {/* Lock plate */}
                          <rect x="13" y="14" width="6" height="6" rx="1" fill="white" fillOpacity="0.3"/>
                          <circle cx="16" cy="17" r="1.2" fill="white"/>
                          {/* Corner rivets */}
                          <circle cx="6" cy="14" r="0.7" fill="white"/>
                          <circle cx="26" cy="14" r="0.7" fill="white"/>
                          <circle cx="6" cy="24" r="0.7" fill="white"/>
                          <circle cx="26" cy="24" r="0.7" fill="white"/>
                        </svg>
                      ) : (
                        // Locked chest with padlock
                        <svg viewBox="0 0 32 32" className="w-8 h-8" fill="none">
                          {/* Chest lid */}
                          <path d="M4 14h24l-2-4H6l-2 4z" fill="#8b4513" fillOpacity="0.2" stroke="#8b4513" strokeWidth="1.2" strokeOpacity="0.5"/>
                          {/* Chest body */}
                          <rect x="4" y="14" width="24" height="12" rx="2" fill="#8b4513" fillOpacity="0.1" stroke="#8b4513" strokeWidth="1.2" strokeOpacity="0.5"/>
                          {/* Metal bands */}
                          <path d="M4 18h24" stroke="#8b4513" strokeWidth="1" strokeOpacity="0.4"/>
                          <path d="M4 22h24" stroke="#8b4513" strokeWidth="1" strokeOpacity="0.4"/>
                          {/* Padlock */}
                          <rect x="12" y="16" width="8" height="6" rx="1" fill="#8b4513" fillOpacity="0.3" stroke="#8b4513" strokeWidth="1" strokeOpacity="0.5"/>
                          <path d="M14 16v-2a2 2 0 0 1 4 0v2" stroke="#8b4513" strokeWidth="1.2" strokeOpacity="0.5"/>
                          <circle cx="16" cy="19" r="1" fill="#8b4513" fillOpacity="0.5"/>
                        </svg>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={`text-[10px] font-bold ${isCompleted ? 'text-[#b8860b]' : isUnlocked ? 'text-[#8b0000]' : 'text-[#8b4513]/50'}`}>
                          #{month.key}
                        </span>
                        {isCurrent && (
                          <span className="px-1.5 py-0.5 bg-[#8b0000] rounded text-[8px] text-white font-bold animate-pulse">
                            СЕЙЧАС
                          </span>
                        )}
                      </div>
                      <h3 className={`font-bold text-sm truncate ${
                        isCompleted ? 'text-[#3d2f1f]' : isUnlocked ? 'text-[#3d2f1f]' : 'text-[#8b4513]/50'
                      }`}>
                        {month.theme}
                      </h3>
                      <div className="flex items-center gap-1 mt-0.5">
                        <IconComponent className={`w-3 h-3 ${isUnlocked ? 'text-[#8b0000]' : 'text-[#8b4513]/40'}`} />
                        <span className={`text-[10px] ${isUnlocked ? 'text-[#6b5a4a]' : 'text-[#8b4513]/40'}`}>
                          {keyItems.length} материалов
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Progress bar for current */}
                  {isCurrent && keyItems.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-[#8b4513]/20">
                      <div className="h-1 bg-[#e8dcc6] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#8b0000] to-[#ffd700]"
                          style={{
                            width: `${keyItems.length > 0 ? (progress.filter(p => keyItems.some((item: any) => item.id === p.contentItemId && p.watched)).length / keyItems.length) * 100 : 0}%`
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Completed badge */}
                  {isCompleted && (
                    <div className="absolute -top-1 -right-1 w-6 h-6 bg-[#ffd700] rounded-full flex items-center justify-center shadow-md">
                      <CheckCircle className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
