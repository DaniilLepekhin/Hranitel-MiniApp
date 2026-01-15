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

      {/* 12 Keys Roadmap */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-[#e8dcc6]/50 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="relative pb-8">
          {/* Roadmap Path */}
          <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-gradient-to-b from-[#8b0000]/30 via-[#8b4513]/20 to-[#e8dcc6]/50 -translate-x-1/2" />

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
                className={`relative flex items-center mb-4 ${isLeft ? 'justify-start' : 'justify-end'}`}
              >
                {/* Connector dot on the path */}
                <div className={`absolute left-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 ${
                  isCompleted
                    ? 'bg-[#8b0000] border-[#8b0000]'
                    : isUnlocked
                      ? 'bg-[#f8f6f0] border-[#8b0000]'
                      : 'bg-[#e8dcc6] border-[#8b4513]/30'
                }`} />

                {/* Chest Card */}
                <div
                  onClick={() => handleKeyClick(month.key)}
                  className={`
                    relative w-[45%] p-3 rounded-2xl cursor-pointer transition-all duration-300
                    ${isUnlocked ? 'hover:scale-[1.03] active:scale-[0.98]' : 'opacity-60'}
                    ${isCurrent ? 'ring-2 ring-[#8b0000] ring-offset-2' : ''}
                    ${isCompleted
                      ? 'bg-gradient-to-br from-[#ffd700]/20 to-[#8b4513]/20 border border-[#ffd700]/50'
                      : isUnlocked
                        ? 'bg-gradient-to-br from-[#8b0000]/10 to-[#8b4513]/10 border border-[#8b4513]/30'
                        : 'bg-[#e8dcc6]/50 border border-[#8b4513]/20'
                    }
                  `}
                >
                  {/* Chest Icon */}
                  <div className="flex items-center gap-3">
                    <div className={`
                      relative w-14 h-14 rounded-xl flex items-center justify-center
                      ${isCompleted
                        ? 'bg-gradient-to-br from-[#ffd700] to-[#b8860b] shadow-lg shadow-[#ffd700]/30'
                        : isUnlocked
                          ? 'bg-gradient-to-br from-[#8b0000] to-[#8b4513] shadow-md'
                          : 'bg-[#8b4513]/30'
                      }
                    `}>
                      {/* Chest SVG */}
                      {isCompleted ? (
                        // Open chest
                        <svg viewBox="0 0 24 24" className="w-9 h-9" fill="none">
                          <path d="M4 14v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                          <path d="M4 14h16" stroke="white" strokeWidth="1.5"/>
                          <rect x="5" y="10" width="14" height="4" rx="1" fill="white" fillOpacity="0.3"/>
                          <path d="M3 10l3-4h12l3 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <circle cx="12" cy="16" r="1.5" fill="white"/>
                          {/* Sparkles for open chest */}
                          <path d="M12 4v2M8 5l1 1.5M16 5l-1 1.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      ) : isUnlocked ? (
                        // Closed but unlocked chest
                        <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none">
                          <rect x="4" y="10" width="16" height="10" rx="2" stroke="white" strokeWidth="1.5"/>
                          <path d="M4 14h16" stroke="white" strokeWidth="1.5"/>
                          <path d="M4 12c0-1.1.9-2 2-2h12c1.1 0 2 .9 2 2" stroke="white" strokeWidth="1.5"/>
                          <circle cx="12" cy="16" r="1.5" fill="white"/>
                          <path d="M10 10V8c0-1.1.9-2 2-2s2 .9 2 2v2" stroke="white" strokeWidth="1.5"/>
                        </svg>
                      ) : (
                        // Locked chest
                        <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none">
                          <rect x="4" y="10" width="16" height="10" rx="2" stroke="#8b4513" strokeWidth="1.5" strokeOpacity="0.5"/>
                          <path d="M4 14h16" stroke="#8b4513" strokeWidth="1.5" strokeOpacity="0.5"/>
                          <circle cx="12" cy="16" r="1.5" fill="#8b4513" fillOpacity="0.5"/>
                          <Lock className="w-4 h-4 absolute text-[#8b4513]/50" style={{top: '50%', left: '50%', transform: 'translate(-50%, -50%)'}} />
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
