'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Search, Filter, BookOpen, Star, Lock, ChevronRight } from 'lucide-react';
import { coursesApi } from '@/lib/api';
import { CourseCard } from '@/components/ui/Card';
import { useTelegram } from '@/hooks/useTelegram';

type Category = 'all' | 'mindset' | 'spiritual' | 'esoteric' | 'health';

const categories: { value: Category; label: string; emoji: string }[] = [
  { value: 'all', label: 'Все', emoji: '📚' },
  { value: 'mindset', label: 'Развитие', emoji: '🧠' },
  { value: 'spiritual', label: 'Духовность', emoji: '✨' },
  { value: 'esoteric', label: 'Эзотерика', emoji: '🔮' },
  { value: 'health', label: 'Здоровье', emoji: '💪' },
];

export function CoursesTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category>('all');

  const { data: coursesData, isLoading } = useQuery({
    queryKey: ['courses', selectedCategory],
    queryFn: () =>
      coursesApi.list(selectedCategory === 'all' ? undefined : selectedCategory),
  });

  const courses = coursesData?.courses || [];

  const filteredCourses = courses.filter((course) =>
    course.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="px-4 pt-6 pb-24">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Курсы</h1>
        <p className="text-gray-300">Выберите курс для обучения</p>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Поиск курсов..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-3 glass rounded-2xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400/50"
        />
      </div>

      {/* Categories */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
        {categories.map((category) => (
          <button
            key={category.value}
            onClick={() => setSelectedCategory(category.value)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap transition-all ${
              selectedCategory === category.value
                ? 'bg-gradient-to-r from-purple-400 to-indigo-500 text-white shadow-lg'
                : 'glass text-gray-200 hover:shadow-md'
            }`}
          >
            <span>{category.emoji}</span>
            <span className="text-sm font-medium">{category.label}</span>
          </button>
        ))}
      </div>

      {/* Courses Grid */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card rounded-3xl h-32 animate-pulse" />
          ))}
        </div>
      ) : filteredCourses.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">
            Курсы не найдены
          </h3>
          <p className="text-gray-400">
            Попробуйте изменить поисковый запрос или категорию
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCourses.map((course) => (
            <CourseCardExtended
              key={course.id}
              id={course.id}
              title={course.title}
              description={course.description}
              coverUrl={course.coverUrl}
              category={course.category}
              isFavorite={course.isFavorite}
              isLocked={course.isLocked}
              lessonsCount={undefined}
              progress={
                course.progress
                  ? (course.progress.completedDays.length / 10) * 100
                  : undefined
              }
              onFavoriteChange={() => {}}
            />
          ))}
        </div>
      )}

      {/* Pro Banner */}
      <div className="mt-6 glass rounded-3xl p-5 bg-gradient-to-r from-purple-500/10 to-indigo-500/10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center">
            <Star className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-white">Получите PRO доступ</h3>
            <p className="text-sm text-gray-300">
              Откройте все курсы и медитации
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400" />
        </div>
      </div>
    </div>
  );
}

interface CourseCardExtendedProps {
  id: string;
  title: string;
  description?: string | null;
  coverUrl?: string | null;
  category?: string | null;
  isFavorite?: boolean;
  isLocked?: boolean;
  lessonsCount?: number | null;
  progress?: number;
  onFavoriteChange?: () => void;
}

function CourseCardExtended({
  id,
  title,
  description,
  coverUrl,
  category,
  isFavorite,
  isLocked,
  lessonsCount,
  progress,
  onFavoriteChange,
}: CourseCardExtendedProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { haptic } = useTelegram();
  const categoryEmoji = categories.find((c) => c.value === category)?.emoji || '📖';

  const favoriteMutation = useMutation({
    mutationFn: () => coursesApi.toggleFavorite(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
      haptic.notification(isFavorite ? 'success' : 'success');
      onFavoriteChange?.();
    },
  });

  const handleClick = () => {
    if (isLocked) {
      // TODO: Show PRO upgrade modal
      return;
    }
    router.push(`/course/${id}`);
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    haptic.impact('light');
    favoriteMutation.mutate();
  };

  return (
    <div
      onClick={handleClick}
      className="card rounded-3xl overflow-hidden hover:shadow-xl transition-all duration-300 active:scale-[0.98] cursor-pointer"
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
            <div className="w-full h-full bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center">
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
            className="absolute top-2 left-2 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center active:scale-95 transition-all hover:bg-white shadow-md"
            aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
          >
            <Star
              className={`w-4 h-4 transition-all ${
                isFavorite ? 'text-yellow-500 fill-yellow-500' : 'text-gray-400'
              }`}
            />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm">{categoryEmoji}</span>
              <span className="text-xs text-gray-500 capitalize">
                {categories.find((c) => c.value === category)?.label || 'Курс'}
              </span>
            </div>
            <h3 className="font-semibold text-gray-900 line-clamp-1">{title}</h3>
            {description && (
              <p className="text-sm text-gray-500 line-clamp-1 mt-0.5">
                {description}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between mt-2">
            {lessonsCount && (
              <span className="text-xs text-gray-500">
                {lessonsCount} уроков
              </span>
            )}

            {progress !== undefined && progress > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-400 to-indigo-500 rounded-full"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500">{Math.round(progress)}%</span>
              </div>
            )}
          </div>
        </div>

        {/* Arrow */}
        <div className="flex items-center pr-4">
          <ChevronRight className="w-5 h-5 text-gray-400" />
        </div>
      </div>
    </div>
  );
}
