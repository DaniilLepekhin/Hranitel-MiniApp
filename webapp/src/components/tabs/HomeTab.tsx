'use client';

import { useQuery } from '@tanstack/react-query';
import { Flame, Star, TrendingUp } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { coursesApi, gamificationApi } from '@/lib/api';
import { CourseCard } from '@/components/ui/Card';

export function HomeTab() {
  const { user } = useAuthStore();

  const { data: coursesData } = useQuery({
    queryKey: ['courses'],
    queryFn: () => coursesApi.list(),
  });

  const { data: statsData } = useQuery({
    queryKey: ['gamification-stats'],
    queryFn: () => gamificationApi.stats(),
    enabled: !!user,
  });

  const stats = statsData?.stats;
  const courses = coursesData?.courses?.slice(0, 3) || [];

  return (
    <div className="px-4 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Привет, {user?.firstName || 'друг'}! 👋
          </h1>
          <p className="text-gray-600 mt-1">Как ты себя чувствуешь сегодня?</p>
        </div>
        {user?.photoUrl ? (
          <img
            src={user.photoUrl}
            alt={user.firstName || 'User'}
            className="w-12 h-12 rounded-full shadow-md"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-white font-bold shadow-md">
            {user?.firstName?.[0] || '?'}
          </div>
        )}
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="glass rounded-2xl p-4 text-center">
            <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <p className="text-xl font-bold text-gray-900">{stats.streak}</p>
            <p className="text-xs text-gray-500">Дней подряд</p>
          </div>

          <div className="glass rounded-2xl p-4 text-center">
            <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
              <Star className="w-5 h-5 text-white" />
            </div>
            <p className="text-xl font-bold text-gray-900">{stats.level}</p>
            <p className="text-xs text-gray-500">Уровень</p>
          </div>

          <div className="glass rounded-2xl p-4 text-center">
            <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <p className="text-xl font-bold text-gray-900">{stats.experience}</p>
            <p className="text-xs text-gray-500">XP</p>
          </div>
        </div>
      )}

      {/* XP Progress */}
      {stats && (
        <div className="glass rounded-2xl p-4 mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">
              Прогресс до уровня {stats.level + 1}
            </span>
            <span className="text-sm text-gray-500">{stats.progressPercent}%</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-orange-400 to-pink-500 rounded-full transition-all duration-500"
              style={{ width: `${stats.progressPercent}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-2 text-center">
            {stats.progressToNextLevel} / {stats.xpNeededForNextLevel} XP
          </p>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <button className="glass rounded-2xl p-4 text-left hover:shadow-lg transition-shadow">
          <span className="text-2xl mb-2 block">🧘</span>
          <h3 className="font-semibold text-gray-900">Медитация дня</h3>
          <p className="text-sm text-gray-500">5-10 минут</p>
        </button>

        <button className="glass rounded-2xl p-4 text-left hover:shadow-lg transition-shadow">
          <span className="text-2xl mb-2 block">📖</span>
          <h3 className="font-semibold text-gray-900">Продолжить</h3>
          <p className="text-sm text-gray-500">Курс обучения</p>
        </button>
      </div>

      {/* Recommended Courses */}
      <div className="mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-3">Рекомендуемые курсы</h2>
        <div className="space-y-3">
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              title={course.title}
              description={course.description}
              coverUrl={course.coverUrl}
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
