'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Key, Lock, CheckCircle, ChevronRight, Sparkles } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { useAuthStore } from '@/store/auth';
import { Card } from '@/components/ui/Card';

// API endpoints
const coursesApi = {
  list: async (category?: string) => {
    const url = category
      ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1/courses?category=${category}`
      : `${process.env.NEXT_PUBLIC_API_URL}/api/v1/courses`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch courses');
    return response.json();
  },
};

// 12 месяцев программы
const monthThemes = [
  { key: 1, theme: 'Идентичность', emoji: '🎯', color: 'from-red-400 to-pink-500' },
  { key: 2, theme: 'Ниша и смысл', emoji: '🎨', color: 'from-orange-400 to-amber-500' },
  { key: 3, theme: 'Деньги и ресурсы', emoji: '💰', color: 'from-yellow-400 to-orange-500' },
  { key: 4, theme: 'Дом и корни', emoji: '🏡', color: 'from-green-400 to-emerald-500' },
  { key: 5, theme: 'Творчество', emoji: '🎭', color: 'from-teal-400 to-cyan-500' },
  { key: 6, theme: 'Служение', emoji: '🙏', color: 'from-blue-400 to-indigo-500' },
  { key: 7, theme: 'Отношения', emoji: '💝', color: 'from-purple-400 to-pink-500' },
  { key: 8, theme: 'Трансформация', emoji: '🔥', color: 'from-pink-400 to-rose-500' },
  { key: 9, theme: 'Мировоззрение', emoji: '🌍', color: 'from-indigo-400 to-purple-500' },
  { key: 10, theme: 'Карьера', emoji: '👔', color: 'from-violet-400 to-fuchsia-500' },
  { key: 11, theme: 'Сообщество', emoji: '👥', color: 'from-cyan-400 to-blue-500' },
  { key: 12, theme: 'Духовность', emoji: '✨', color: 'from-amber-400 to-yellow-500' },
];

export function PathTab() {
  const router = useRouter();
  const { haptic } = useTelegram();
  const { user } = useAuthStore();

  // Fetch all courses (sorted by keyNumber)
  const { data: coursesData, isLoading } = useQuery({
    queryKey: ['courses', 'all'],
    queryFn: () => coursesApi.list(),
    enabled: !!user,
  });

  const courses = coursesData?.courses || [];

  // Group courses by keyNumber
  const coursesByKey = courses.reduce((acc: any, course: any) => {
    const keyNum = course.keyNumber || 0;
    if (!acc[keyNum]) acc[keyNum] = [];
    acc[keyNum].push(course);
    return acc;
  }, {});

  // Mock progress (в реальности будет из API)
  const completedKeys = [1]; // Пример: завершен только ключ #1
  const currentKey = 2; // Текущий активный ключ

  const handleKeyClick = (keyNumber: number) => {
    const isUnlocked = keyNumber <= currentKey;
    if (!isUnlocked) {
      haptic.notification('error');
      return;
    }

    haptic.impact('light');

    // Переход к первому курсу этого ключа
    const keyCourses = coursesByKey[keyNumber] || [];
    if (keyCourses.length > 0) {
      router.push(`/course/${keyCourses[0].id}`);
    }
  };

  return (
    <div className="px-4 pt-6 pb-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent mb-2">
          🗝️ Путь 12 Ключей
        </h1>
        <p className="text-gray-400 text-sm">
          Год трансформации через 12 посвящений
        </p>
      </div>

      {/* Progress Stats */}
      <Card className="mb-6 bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-sm mb-1">Твой прогресс</p>
            <div className="flex items-center gap-3">
              <p className="text-4xl font-bold text-white">{completedKeys.length}</p>
              <div>
                <p className="text-sm text-purple-400 font-semibold">из 12 ключей</p>
                <p className="text-xs text-gray-500">пройдено</p>
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center">
              <span className="text-2xl">🔑</span>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4 h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-purple-400 to-pink-500 transition-all duration-500"
            style={{ width: `${(completedKeys.length / 12) * 100}%` }}
          />
        </div>
      </Card>

      {/* Info Block */}
      <div className="mb-6 p-4 bg-gradient-to-br from-purple-500/5 to-pink-500/5 rounded-xl border border-purple-500/10">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm mb-1">Последовательное обучение</h4>
            <p className="text-gray-400 text-xs leading-relaxed">
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
            <div key={i} className="h-24 rounded-2xl bg-gray-800/30 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {monthThemes.map((month) => {
            const isCompleted = completedKeys.includes(month.key);
            const isUnlocked = month.key <= currentKey;
            const isCurrent = month.key === currentKey;
            const keyCourses = coursesByKey[month.key] || [];

            return (
              <Card
                key={month.key}
                className={`
                  p-4 transition-all duration-300 cursor-pointer
                  ${isUnlocked ? 'hover:scale-[1.02]' : 'opacity-50'}
                  ${isCurrent && 'ring-2 ring-purple-400/50'}
                `}
                onClick={() => handleKeyClick(month.key)}
              >
                <div className="flex items-center gap-4">
                  {/* Key Icon */}
                  <div className={`
                    w-14 h-14 rounded-xl flex items-center justify-center text-2xl
                    ${isUnlocked
                      ? `bg-gradient-to-br ${month.color}`
                      : 'bg-gray-800'
                    }
                  `}>
                    {isCompleted ? (
                      <CheckCircle className="w-8 h-8 text-white" />
                    ) : isUnlocked ? (
                      <span>{month.emoji}</span>
                    ) : (
                      <Lock className="w-6 h-6 text-gray-600" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-purple-400">
                        КЛЮЧ #{month.key}
                      </span>
                      {isCurrent && (
                        <span className="px-2 py-0.5 bg-purple-500/20 rounded-full text-xs text-purple-400 font-semibold">
                          Текущий
                        </span>
                      )}
                    </div>

                    <h3 className={`font-bold text-lg mb-0.5 ${isUnlocked ? 'text-white' : 'text-gray-600'}`}>
                      {month.theme}
                    </h3>

                    {keyCourses.length > 0 && (
                      <p className="text-gray-400 text-xs">
                        {keyCourses.length} {keyCourses.length === 1 ? 'урок' : 'уроков'}
                      </p>
                    )}
                  </div>

                  {/* Status Icon */}
                  {isCompleted ? (
                    <CheckCircle className="w-6 h-6 text-emerald-400" />
                  ) : isUnlocked ? (
                    <ChevronRight className="w-6 h-6 text-gray-400" />
                  ) : (
                    <Lock className="w-6 h-6 text-gray-600" />
                  )}
                </div>

                {/* Progress for current key */}
                {isCurrent && keyCourses.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-700/30">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-gray-400">Прогресс</span>
                      <span className="text-xs text-purple-400 font-semibold">0/{keyCourses.length}</span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-purple-400 to-pink-500"
                        style={{ width: '0%' }}
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
