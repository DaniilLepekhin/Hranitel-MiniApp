'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Lock, Play, CheckCircle } from 'lucide-react';
import { coursesApi } from '@/lib/api';

export default function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);

  const { data, isLoading } = useQuery({
    queryKey: ['course', id],
    queryFn: () => coursesApi.get(id),
  });

  const course = data?.course;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Курс не найден</h2>
          <button
            onClick={() => router.back()}
            className="text-purple-600 hover:underline"
          >
            Вернуться назад
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-50 glass">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center active:scale-95 transition-transform"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-900 truncate">{course.title}</h1>
        </div>
      </div>

      {/* Course Header */}
      <div className="px-4 pt-6 pb-4">
        {course.coverUrl ? (
          <div
            className="h-48 rounded-3xl bg-cover bg-center mb-4"
            style={{ backgroundImage: `url(${course.coverUrl})` }}
          />
        ) : (
          <div className="h-48 rounded-3xl bg-gradient-to-br from-purple-500 to-indigo-600 mb-4 flex items-center justify-center">
            <span className="text-6xl">📚</span>
          </div>
        )}

        <h2 className="text-2xl font-bold text-gray-900 mb-2">{course.title}</h2>
        {course.description && (
          <p className="text-gray-600 mb-4">{course.description}</p>
        )}

        {course.isLocked && (
          <div className="glass rounded-2xl p-4 bg-gradient-to-r from-purple-500/10 to-indigo-500/10 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center">
                <Lock className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-gray-900">Премиум контент</h3>
                <p className="text-sm text-gray-600">Этот курс доступен только для PRO пользователей</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Lessons List */}
      <div className="px-4 pb-6">
        <h3 className="text-lg font-bold text-gray-900 mb-3">
          Уроки ({course.days?.length || 0})
        </h3>
        <div className="space-y-3">
          {course.days?.map((day, index) => {
            const isCompleted = course.progress?.completedDays?.includes(day.dayNumber);
            const isCurrent = course.progress?.currentDay === day.dayNumber;
            const isLocked = day.isLocked;

            return (
              <button
                key={day.id}
                onClick={() => {
                  if (!isLocked) {
                    // TODO: Navigate to lesson page
                    console.log('Open lesson', day.id);
                  }
                }}
                disabled={isLocked}
                className={`w-full glass rounded-2xl p-4 text-left transition-all ${
                  isLocked
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:shadow-lg active:scale-[0.98] cursor-pointer'
                }`}
              >
                <div className="flex items-center gap-4">
                  {/* Lesson Number / Icon */}
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      isCompleted
                        ? 'bg-green-500'
                        : isCurrent
                        ? 'bg-gradient-to-br from-purple-400 to-indigo-500'
                        : 'bg-gray-200'
                    }`}
                  >
                    {isLocked ? (
                      <Lock className="w-5 h-5 text-gray-500" />
                    ) : isCompleted ? (
                      <CheckCircle className="w-5 h-5 text-white" />
                    ) : (
                      <span className="text-white font-bold">{day.dayNumber}</span>
                    )}
                  </div>

                  {/* Lesson Info */}
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900">{day.title}</h4>
                    {day.content && (
                      <p className="text-sm text-gray-500 line-clamp-1 mt-0.5">
                        {day.content.substring(0, 50)}...
                      </p>
                    )}
                  </div>

                  {/* Play Button */}
                  {!isLocked && (
                    <div className="w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center">
                      <Play className="w-4 h-4 text-gray-700 ml-0.5" />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
