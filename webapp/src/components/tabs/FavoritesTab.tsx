'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Star, BookOpen, Lock, Heart } from 'lucide-react';
import { coursesApi } from '@/lib/api';
import { useTelegram } from '@/hooks/useTelegram';

export function FavoritesTab() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { haptic } = useTelegram();

  const { data: favoritesData, isLoading } = useQuery({
    queryKey: ['favorites'],
    queryFn: () => coursesApi.favorites(),
  });

  const favorites = favoritesData?.favorites || [];

  return (
    <div className="px-4 pt-6 pb-24">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center">
            <Heart className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Избранное</h1>
        </div>
        <p className="text-gray-600">
          {favorites.length > 0
            ? `${favorites.length} ${favorites.length === 1 ? 'курс' : favorites.length < 5 ? 'курса' : 'курсов'}`
            : 'Добавьте курсы в избранное'}
        </p>
      </div>

      {/* Favorites List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass rounded-3xl h-32 animate-pulse" />
          ))}
        </div>
      ) : favorites.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-20 h-20 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-pink-100 to-rose-100 flex items-center justify-center">
            <Heart className="w-10 h-10 text-pink-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">
            Пока нет избранных курсов
          </h3>
          <p className="text-gray-500 mb-6">
            Нажмите на звёздочку на курсе, чтобы добавить его в избранное
          </p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-gradient-to-r from-pink-400 to-rose-500 text-white rounded-2xl font-semibold active:scale-95 transition-transform"
          >
            Перейти к курсам
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {favorites.map((course) => (
            <FavoriteCourseCard
              key={course.id}
              id={course.id}
              title={course.title}
              description={course.description}
              coverUrl={course.coverUrl}
              category={course.category}
              isLocked={course.isLocked}
              progress={
                course.progress
                  ? (course.progress.completedDays.length / 10) * 100
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface FavoriteCourseCardProps {
  id: string;
  title: string;
  description?: string | null;
  coverUrl?: string | null;
  category?: string | null;
  isLocked?: boolean;
  progress?: number;
}

function FavoriteCourseCard({
  id,
  title,
  description,
  coverUrl,
  isLocked,
  progress,
}: FavoriteCourseCardProps) {
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

  const handleRemoveFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    haptic.impact('medium');
    favoriteMutation.mutate();
  };

  return (
    <div
      onClick={handleClick}
      className="glass rounded-3xl overflow-hidden hover:shadow-xl transition-all duration-300 active:scale-[0.98] cursor-pointer"
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

          {/* Remove favorite button */}
          <button
            onClick={handleRemoveFavorite}
            disabled={favoriteMutation.isPending}
            className="absolute top-2 left-2 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center active:scale-95 transition-all hover:bg-white shadow-md"
            aria-label="Убрать из избранного"
          >
            <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
          <div>
            <h3 className="font-bold text-gray-900 text-base mb-1 line-clamp-2">
              {title}
            </h3>
            {description && (
              <p className="text-xs text-gray-500 line-clamp-2">{description}</p>
            )}
          </div>

          {/* Progress bar */}
          {progress !== undefined && progress > 0 && (
            <div className="mt-2">
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-400 to-indigo-500 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
