'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Search, Filter, BookOpen, Star, Lock, ChevronRight, Library, Brain, Sparkles as SparklesIcon, Wand2, Heart, Zap } from 'lucide-react';
import { coursesApi } from '@/lib/api';
import { CourseCard } from '@/components/ui/Card';
import { useTelegram } from '@/hooks/useTelegram';

type Category = 'all' | 'mindset' | 'spiritual' | 'esoteric' | 'health';

const categories: { value: Category; label: string; icon: any }[] = [
  { value: 'all', label: 'Все', icon: Library },
  { value: 'mindset', label: 'Развитие', icon: Brain },
  { value: 'spiritual', label: 'Духовность', icon: SparklesIcon },
  { value: 'esoteric', label: 'Эзотерика', icon: Wand2 },
  { value: 'health', label: 'Здоровье', icon: Heart },
];

export function CoursesTab() {
  const { haptic } = useTelegram();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category>('all');

  // 🔒 TEMPORARY: Lock entire courses section (no content yet)
  const COURSES_LOCKED = true;

  // 🚀 ОПТИМИЗАЦИЯ: placeholderData для мгновенного рендера
  const { data: coursesData, isLoading } = useQuery({
    queryKey: ['courses', selectedCategory],
    queryFn: () =>
      coursesApi.list(selectedCategory === 'all' ? undefined : selectedCategory),
    placeholderData: { success: true, courses: [] },
    enabled: !COURSES_LOCKED, // Don't fetch if locked
  });

  const courses = coursesData?.courses || [];

  // 🚀 ОПТИМИЗАЦИЯ: Мемоизация фильтрации
  const filteredCourses = useMemo(() => {
    if (!searchQuery.trim()) return courses;
    const query = searchQuery.toLowerCase();
    return courses.filter((course) =>
      course.title.toLowerCase().includes(query)
    );
  }, [courses, searchQuery]);

  // 🔒 Beautiful Lock Overlay
  if (COURSES_LOCKED) {
    return (
      <div className="relative h-[calc(100vh-80px)] px-4 pt-6 pb-24">
        {/* Blurred Background */}
        <div className="absolute inset-0 bg-[#f7f1e8] overflow-hidden">
          {/* Decorative gradient orbs */}
          <div className="absolute top-20 left-10 w-64 h-64 bg-gradient-to-br from-[#d93547]/20 to-[#9c1723]/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-20 right-10 w-80 h-80 bg-gradient-to-br from-[#9c1723]/15 to-[#d93547]/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center justify-center h-full">
          {/* Lock Icon with animation */}
          <div className="relative mb-8">
            <div className="absolute inset-0 bg-gradient-to-br from-[#d93547] to-[#9c1723] rounded-full blur-2xl opacity-30 animate-pulse" />
            <div className="relative w-24 h-24 bg-gradient-to-br from-[#d93547] to-[#9c1723] rounded-full flex items-center justify-center shadow-2xl shadow-[#d93547]/40">
              <Lock className="w-12 h-12 text-white" strokeWidth={2.5} />
            </div>
          </div>

          {/* Title */}
          <h2
            className="text-3xl font-bold mb-3 text-center"
            style={{
              fontFamily: '"TT Nooks", Georgia, serif',
              color: '#2d2620',
              background: 'linear-gradient(135deg, #d93547 0%, #9c1723 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Курсы скоро появятся
          </h2>

          {/* Description */}
          <p
            className="text-center max-w-sm mb-8 leading-relaxed"
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontSize: '16px',
              color: '#6b5a4a',
            }}
          >
            Мы готовим для вас эксклюзивные обучающие курсы.
            Совсем скоро они станут доступны!
          </p>

          {/* Features List */}
          <div className="w-full max-w-md space-y-3 mb-8">
            {[
              { icon: Brain, text: 'Глубокие знания от экспертов' },
              { icon: SparklesIcon, text: 'Практические упражнения' },
              { icon: Zap, text: 'Быстрые результаты' },
            ].map((feature, index) => (
              <div
                key={index}
                className="flex items-center gap-4 p-4 bg-white/60 backdrop-blur-sm rounded-2xl border border-[#9c1723]/10 animate-fade-in"
                style={{
                  animationDelay: `${index * 0.1}s`,
                  animationFillMode: 'backwards',
                }}
              >
                <div className="w-10 h-10 bg-gradient-to-br from-[#d93547] to-[#9c1723] rounded-xl flex items-center justify-center flex-shrink-0">
                  <feature.icon className="w-5 h-5 text-white" />
                </div>
                <span
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontSize: '15px',
                    color: '#2d2620',
                    fontWeight: 500,
                  }}
                >
                  {feature.text}
                </span>
              </div>
            ))}
          </div>

          {/* CTA Button */}
          <button
            onClick={() => {
              haptic.notification('success');
              // TODO: Open subscription modal or notify me
            }}
            className="px-8 py-4 bg-gradient-to-r from-[#d93547] to-[#9c1723] rounded-2xl shadow-lg shadow-[#d93547]/30 transition-all active:scale-95 hover:shadow-xl hover:shadow-[#d93547]/40"
          >
            <span
              style={{
                fontFamily: 'Gilroy, sans-serif',
                fontSize: '16px',
                fontWeight: 600,
                color: 'white',
              }}
            >
              Уведомить о запуске
            </span>
          </button>

          {/* Small note */}
          <p
            className="mt-6 text-center text-sm opacity-60"
            style={{
              fontFamily: 'Gilroy, sans-serif',
              color: '#6b5a4a',
            }}
          >
            В ожидании: 127 человек
          </p>
        </div>

        {/* CSS animation */}
        <style jsx>{`
          @keyframes fade-in {
            from {
              opacity: 0;
              transform: translateY(10px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          .animate-fade-in {
            animation: fade-in 0.5s ease-out;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-24">
      {/* Header */}
      <div className="mb-6">
        <h1 className="section-title">Курсы</h1>
        <p className="text-[#6b5a4a] text-sm text-center">
          Выберите курс для обучения
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#9c1723]/60" />
        <input
          type="text"
          placeholder="Поиск курсов..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-3 bg-white/80 backdrop-blur-sm rounded-2xl text-[#2b2520] placeholder-[#9c1723]/40 focus:outline-none focus:ring-2 focus:ring-[#d93547]/50 border border-[#9c1723]/10"
        />
      </div>

      {/* Categories */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
        {categories.map((category) => {
          const IconComponent = category.icon;
          return (
            <button
              key={category.value}
              onClick={() => setSelectedCategory(category.value)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap transition-all ${
                selectedCategory === category.value
                  ? 'bg-gradient-to-r from-[#d93547] to-[#9c1723] text-white shadow-lg shadow-[#d93547]/30'
                  : 'bg-white/60 backdrop-blur-sm text-[#6b5a4a] hover:bg-white/80 border border-[#9c1723]/10'
              }`}
            >
              <IconComponent className="w-4 h-4" />
              <span className="text-sm font-medium">{category.label}</span>
            </button>
          );
        })}
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
  const CategoryIcon = categories.find((c) => c.value === category)?.icon || BookOpen;

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
              <CategoryIcon className="w-4 h-4 text-gray-500" />
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
