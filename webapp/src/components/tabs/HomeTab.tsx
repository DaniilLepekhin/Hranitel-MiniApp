'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Flame, Star, Zap, BookOpen, Lock, Tv, Clock, Calendar } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { coursesApi, gamificationApi } from '@/lib/api';
import { useTelegram } from '@/hooks/useTelegram';
import { Card, FeatureCard } from '@/components/ui/Card';

// API endpoints для новых виджетов
const energiesApi = {
  getBalance: async (userId: string) => {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/energies/balance?userId=${userId}`);
    if (!response.ok) throw new Error('Failed to fetch balance');
    return response.json();
  },
};

const streamsApi = {
  getNextStream: async () => {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/streams/next`);
    if (!response.ok) throw new Error('Failed to fetch next stream');
    return response.json();
  },
};

const reportsApi = {
  getDeadline: async () => {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/reports/deadline`);
    if (!response.ok) throw new Error('Failed to fetch deadline');
    return response.json();
  },
};

export function HomeTab() {
  const { user } = useAuthStore();
  const router = useRouter();

  const { data: coursesData } = useQuery({
    queryKey: ['courses'],
    queryFn: () => coursesApi.list(),
  });

  const { data: statsData } = useQuery({
    queryKey: ['gamification-stats'],
    queryFn: () => gamificationApi.stats(),
    enabled: !!user,
  });

  // Новые запросы для КОД ДЕНЕГ 4.0
  const { data: balanceData } = useQuery({
    queryKey: ['energies', 'balance', user?.id],
    queryFn: () => energiesApi.getBalance(user!.id),
    enabled: !!user,
    refetchInterval: 30000,
  });

  const { data: nextStreamData } = useQuery({
    queryKey: ['streams', 'next'],
    queryFn: streamsApi.getNextStream,
    refetchInterval: 60000,
  });

  const { data: deadlineData } = useQuery({
    queryKey: ['reports', 'deadline'],
    queryFn: reportsApi.getDeadline,
    refetchInterval: 300000,
  });

  const stats = statsData?.stats;
  const courses = coursesData?.courses?.slice(0, 3) || [];
  const epBalance = balanceData?.balance || 0;
  const nextStream = nextStreamData?.stream;
  const deadline = deadlineData;

  return (
    <div className="px-4 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#3d2f1f]">
            Привет, {user?.firstName || 'друг'}! 👋
          </h1>
          <p className="text-[#6b5a4a] mt-1">Как ты себя чувствуешь сегодня?</p>
        </div>
        {user?.photoUrl ? (
          <img
            src={user.photoUrl}
            alt={user.firstName || 'User'}
            className="w-12 h-12 rounded-full shadow-md border-2 border-[#8b4513]/30"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#8b0000] to-[#8b4513] flex items-center justify-center text-white font-bold shadow-md">
            {user?.firstName?.[0] || '?'}
          </div>
        )}
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Card className="p-4 text-center">
            <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-gradient-to-br from-[#8b0000] to-[#8b4513] flex items-center justify-center">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <p className="text-xl font-bold text-[#3d2f1f]">{stats.streak}</p>
            <p className="text-xs text-[#6b5a4a]">Дней подряд</p>
          </Card>

          <Card className="p-4 text-center">
            <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-gradient-to-br from-[#8b4513] to-[#a0522d] flex items-center justify-center">
              <Star className="w-5 h-5 text-white" />
            </div>
            <p className="text-xl font-bold text-[#3d2f1f]">{stats.level}</p>
            <p className="text-xs text-[#6b5a4a]">Уровень</p>
          </Card>

          <Card className="p-4 text-center">
            <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-gradient-to-br from-[#8b0000] to-[#a00000] flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <p className="text-xl font-bold text-[#3d2f1f]">{epBalance}</p>
            <p className="text-xs text-[#6b5a4a]">EP</p>
          </Card>
        </div>
      )}

      {/* КОД ДЕНЕГ 4.0 Widgets */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {/* Next Stream Widget */}
        {nextStream && (
          <Card className="p-4 bg-gradient-to-br from-[#8b0000]/10 to-[#8b4513]/10 border-[#8b0000]/30">
            <div className="flex items-center gap-2 mb-2">
              <Tv className="w-4 h-4 text-[#8b0000]" />
              <span className="text-xs font-semibold text-[#8b0000] uppercase">Ближайший эфир</span>
            </div>
            <h3 className="text-sm font-bold text-[#3d2f1f] mb-1 line-clamp-2">
              {nextStream.title}
            </h3>
            <div className="flex items-center gap-1 text-[#6b5a4a]">
              <Clock className="w-3 h-3" />
              <span className="text-xs">
                {new Date(nextStream.scheduledAt).toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </Card>
        )}

        {/* Week Deadline Widget */}
        {deadline && (
          <Card className="p-4 bg-gradient-to-br from-[#8b4513]/10 to-[#a0522d]/10 border-[#8b4513]/30">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-[#8b4513]" />
              <span className="text-xs font-semibold text-[#8b4513] uppercase">Дедлайн отчета</span>
            </div>
            <h3 className="text-2xl font-bold text-[#3d2f1f] mb-1">
              {deadline.hoursRemaining}ч
            </h3>
            <p className="text-xs text-[#6b5a4a]">
              до воскресенья 23:59
            </p>
          </Card>
        )}
      </div>

      {/* Level Progress */}
      {stats && (
        <Card className="p-4 mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-[#3d2f1f]">
              Прогресс до уровня {stats.level + 1}
            </span>
            <span className="text-sm text-[#6b5a4a]">{stats.progressPercent}%</span>
          </div>
          <div className="h-2 bg-[#e8dcc6] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#8b0000] to-[#8b4513] rounded-full transition-all duration-500"
              style={{ width: `${stats.progressPercent}%` }}
            />
          </div>
          <p className="text-xs text-[#6b5a4a] mt-2 text-center">
            {stats.progressToNextLevel} / {stats.xpNeededForNextLevel} XP
          </p>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Card className="p-4 text-left hover:shadow-lg transition-shadow cursor-pointer">
          <span className="text-2xl mb-2 block">🧘</span>
          <h3 className="font-semibold text-[#3d2f1f]">Медитация дня</h3>
          <p className="text-sm text-[#6b5a4a]">5-10 минут</p>
        </Card>

        <Card className="p-4 text-left hover:shadow-lg transition-shadow cursor-pointer">
          <span className="text-2xl mb-2 block">📖</span>
          <h3 className="font-semibold text-[#3d2f1f]">Продолжить</h3>
          <p className="text-sm text-[#6b5a4a]">Курс обучения</p>
        </Card>
      </div>

      {/* Recommended Courses */}
      <div className="mb-6">
        <h2 className="text-lg font-bold text-[#3d2f1f] mb-3 border-b-2 border-[#8b0000] pb-2">
          Рекомендуемые курсы
        </h2>
        <div className="space-y-3">
          {courses.map((course) => (
            <CourseCardCompact
              key={course.id}
              id={course.id}
              title={course.title}
              description={course.description}
              coverUrl={course.coverUrl}
              category={course.category}
              isFavorite={course.isFavorite}
              isLocked={course.isLocked}
              progress={
                course.progress
                  ? (course.progress.completedDays.length / 10) * 100
                  : undefined
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface CourseCardCompactProps {
  id: string;
  title: string;
  description?: string | null;
  coverUrl?: string | null;
  category?: string | null;
  isFavorite?: boolean;
  isLocked?: boolean;
  progress?: number;
}

function CourseCardCompact({
  id,
  title,
  description,
  coverUrl,
  isFavorite,
  isLocked,
  progress,
}: CourseCardCompactProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { haptic } = useTelegram();

  const favoriteMutation = useMutation({
    mutationFn: () => coursesApi.toggleFavorite(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
      haptic.notification('success');
    },
  });

  const handleClick = () => {
    if (isLocked) return;
    router.push(`/course/${id}`);
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    haptic.impact('light');
    favoriteMutation.mutate();
  };

  return (
    <Card
      onClick={handleClick}
      className="overflow-hidden hover:shadow-lg transition-all duration-300 active:scale-[0.98] cursor-pointer"
    >
      <div className="flex">
        {/* Cover Image */}
        <div className="relative w-28 h-28 flex-shrink-0">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#8b0000] to-[#8b4513] flex items-center justify-center">
              <BookOpen className="w-8 h-8 text-white" />
            </div>
          )}

          {/* Lock overlay */}
          {isLocked && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Lock className="w-6 h-6 text-white" />
            </div>
          )}

          {/* Favorite button */}
          <button
            onClick={handleFavoriteClick}
            disabled={favoriteMutation.isPending}
            className="absolute top-2 left-2 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center active:scale-95 transition-all hover:bg-white shadow-md border border-[#8b4513]/20"
            aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
          >
            <Star
              className={`w-4 h-4 transition-all ${
                isFavorite ? 'text-[#8b0000] fill-[#8b0000]' : 'text-[#6b5a4a]'
              }`}
            />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
          <div>
            <h3 className="font-bold text-[#3d2f1f] text-base mb-1 line-clamp-2">
              {title}
            </h3>
            {description && (
              <p className="text-xs text-[#6b5a4a] line-clamp-2">{description}</p>
            )}
          </div>

          {/* Progress bar */}
          {progress !== undefined && progress > 0 && (
            <div className="mt-2">
              <div className="h-1.5 bg-[#e8dcc6] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#8b0000] to-[#8b4513] rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
