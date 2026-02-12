'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Lock, Play, CheckCircle } from 'lucide-react';
import { coursesApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { replaceContentPlaceholders } from '@/lib/content';

export default function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const { user } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['course', id],
    queryFn: () => coursesApi.get(id),
  });

  const course = data?.course;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f0ece8] flex items-center justify-center">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#d93547] to-[#9c1723] animate-pulse" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-[#f0ece8] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-[#2b2520] mb-2">Курс не найден</h2>
          <button
            onClick={() => router.back()}
            className="text-[#d93547] hover:underline"
          >
            Вернуться назад
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0ece8]">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-sm border-b border-[#9c1723]/10">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center active:scale-95 transition-transform"
          >
            <ArrowLeft className="w-5 h-5 text-[#2b2520]" />
          </button>
          <h1 className="text-lg font-bold text-[#2b2520] truncate">{course.title}</h1>
        </div>
      </div>

      {/* Course Header */}
      <div className="px-4 pt-6 pb-4">
        {course.coverUrl ? (
          <div
            className="h-48 rounded-3xl bg-cover bg-center mb-4 shadow-lg"
            style={{ backgroundImage: `url(${course.coverUrl})` }}
          />
        ) : (
          <div className="h-48 rounded-3xl bg-gradient-to-br from-[#d93547] to-[#9c1723] mb-4 flex items-center justify-center shadow-lg shadow-[#d93547]/30">
            <span className="text-6xl">📚</span>
          </div>
        )}

        <h2 className="text-2xl font-bold text-[#2b2520] mb-2">{course.title}</h2>
        {course.description && (
          <p className="text-[#6b5a4a] mb-4">{course.description}</p>
        )}

        {course.isLocked && (
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-4 border border-[#9c1723]/20 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#d93547] to-[#9c1723] flex items-center justify-center shadow-lg shadow-[#d93547]/30">
                <Lock className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-[#2b2520]">Премиум контент</h3>
                <p className="text-sm text-[#6b5a4a]">Этот курс доступен только для PRO пользователей</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Lessons List */}
      <div className="px-4 pb-24">
        <h3 className="text-lg font-bold text-[#2b2520] mb-3">
          Уроки ({course.days?.length || 0})
        </h3>
        <div className="space-y-3">
          {course.days?.map((day, index) => {
            const isCompleted = course.progress?.completedDays?.includes(day.dayNumber);
            const isCurrent = course.progress?.currentDay === day.dayNumber;
            const isLocked = day.isLocked;

            const lessonContent = (
              <div className="flex items-center gap-4">
                {/* Lesson Number / Icon */}
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    isCompleted
                      ? 'bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/30'
                      : isCurrent
                      ? 'bg-gradient-to-br from-[#d93547] to-[#9c1723] shadow-lg shadow-[#d93547]/30'
                      : 'bg-[#e8dcc6]'
                  }`}
                >
                  {isLocked ? (
                    <Lock className="w-5 h-5 text-[#6b5a4a]" />
                  ) : isCompleted ? (
                    <CheckCircle className="w-5 h-5 text-white" />
                  ) : (
                    <span className="text-white font-bold">{day.dayNumber}</span>
                  )}
                </div>

                {/* Lesson Info */}
                <div className="flex-1">
                  <h4 className="font-semibold text-[#2b2520]">{day.title}</h4>
                  {day.content && (
                    <p className="text-sm text-[#6b5a4a] line-clamp-1 mt-0.5">
                      {replaceContentPlaceholders(day.content, user || undefined).substring(0, 50)}...
                    </p>
                  )}
                </div>

                {/* Play Button */}
                {!isLocked && (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#d93547] to-[#9c1723] shadow-lg shadow-[#d93547]/30 flex items-center justify-center">
                    <Play className="w-4 h-4 text-white ml-0.5" />
                  </div>
                )}
              </div>
            );

            return isLocked ? (
              <div
                key={day.id}
                className="w-full bg-white/70 backdrop-blur-sm rounded-2xl p-4 text-left transition-all border border-[#9c1723]/10 opacity-50 cursor-not-allowed"
              >
                {lessonContent}
              </div>
            ) : (
              <Link
                key={day.id}
                href={`/course/${id}/lesson/${day.dayNumber}`}
                prefetch={true}
                className="block w-full bg-white/70 backdrop-blur-sm rounded-2xl p-4 text-left transition-all border border-[#9c1723]/10 hover:shadow-lg active:scale-[0.98]"
              >
                {lessonContent}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
