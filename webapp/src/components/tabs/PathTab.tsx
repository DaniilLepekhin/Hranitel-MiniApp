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

      {/* 12 Keys Grid */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-[#e8dcc6]/50 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {monthThemes.map((month) => {
            const isCompleted = completedKeys.includes(month.key);
            const isUnlocked = month.key <= currentKey;
            const isCurrent = month.key === currentKey;
            const keyItems = itemsByKey[month.key] || [];
            const IconComponent = month.icon;

            return (
              <Card
                key={month.key}
                className={`
                  p-4 transition-all duration-300 cursor-pointer
                  ${isUnlocked ? 'hover:scale-[1.02]' : 'opacity-50'}
                  ${isCurrent && 'ring-2 ring-[#8b0000]/50'}
                `}
                onClick={() => handleKeyClick(month.key)}
              >
                <div className="flex items-center gap-4">
                  {/* Key Icon */}
                  <div className={`
                    w-14 h-14 rounded-xl flex items-center justify-center shadow-md
                    ${isUnlocked
                      ? 'bg-gradient-to-br from-[#8b0000] to-[#8b4513]'
                      : 'bg-[#e8dcc6]'
                    }
                  `}>
                    {isCompleted ? (
                      <CheckCircle className="w-8 h-8 text-white" />
                    ) : isUnlocked ? (
                      <IconComponent className="w-7 h-7 text-white" strokeWidth={2} />
                    ) : (
                      <Lock className="w-6 h-6 text-[#8b4513]/50" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-[#8b0000]">
                        КЛЮЧ #{month.key}
                      </span>
                      {isCurrent && (
                        <span className="px-2 py-0.5 bg-[#8b0000]/20 rounded-full text-xs text-[#8b0000] font-semibold border border-[#8b4513]/30">
                          Текущий
                        </span>
                      )}
                    </div>

                    <h3 className={`font-bold text-lg mb-0.5 ${isUnlocked ? 'text-[#3d2f1f]' : 'text-[#8b4513]/50'}`}>
                      {month.theme}
                    </h3>

                    {keyItems.length > 0 && (
                      <p className="text-[#6b5a4a] text-xs">
                        {keyItems.length} {keyItems.length === 1 ? 'материал' : 'материалов'}
                      </p>
                    )}
                  </div>

                  {/* Status Icon */}
                  {isCompleted ? (
                    <CheckCircle className="w-6 h-6 text-[#8b4513]" />
                  ) : isUnlocked ? (
                    <ChevronRight className="w-6 h-6 text-[#8b4513]" />
                  ) : (
                    <Lock className="w-6 h-6 text-[#8b4513]/30" />
                  )}
                </div>

                {/* Progress for current key */}
                {isCurrent && keyItems.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-[#8b4513]/20">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-[#6b5a4a]">Прогресс</span>
                      <span className="text-xs text-[#8b0000] font-semibold">
                        {progress.filter(p => keyItems.some((item: any) => item.id === p.contentItemId && p.watched)).length}/{keyItems.length}
                      </span>
                    </div>
                    <div className="h-1.5 bg-[#e8dcc6] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#8b0000] to-[#8b4513]"
                        style={{
                          width: `${keyItems.length > 0 ? (progress.filter(p => keyItems.some((item: any) => item.id === p.contentItemId && p.watched)).length / keyItems.length) * 100 : 0}%`
                        }}
                      />
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
