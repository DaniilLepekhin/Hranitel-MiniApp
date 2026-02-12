'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BookOpen, ChevronRight, Lock } from 'lucide-react';
import { coursesApi } from '@/lib/api';
import { useTelegram } from '@/hooks/useTelegram';

export default function CoursesListPage() {
  const router = useRouter();
  const { haptic } = useTelegram();

  const { data, isLoading } = useQuery({
    queryKey: ['courses'],
    queryFn: () => coursesApi.getAll(),
  });

  const courses = data?.courses || [];

  const handleCourseClick = (courseId: string, isLocked: boolean) => {
    if (isLocked) {
      haptic.notification('error');
      return;
    }
    haptic.impact('light');
    router.push(`/course/${courseId}`);
  };

  return (
    <div className="min-h-screen bg-[#f7f1e8]">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-sm border-b border-[#9c1723]/10">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center active:scale-95 transition-transform"
          >
            <ArrowLeft className="w-5 h-5 text-[#2b2520]" />
          </button>
          <div className="flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-[#d93547]" />
            <h1 className="text-lg font-bold text-[#2b2520]">Курсы</h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-32 rounded-2xl bg-white/50 animate-pulse"
              />
            ))}
          </div>
        ) : courses.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#d93547] to-[#9c1723] flex items-center justify-center mx-auto mb-4 shadow-lg shadow-[#d93547]/30">
              <BookOpen className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-xl font-bold text-[#2b2520] mb-2">
              Курсы скоро появятся
            </h2>
            <p className="text-[#6b5a4a]">
              Мы готовим для вас интересные обучающие программы
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {courses.map((course) => (
              <button
                key={course.id}
                onClick={() => handleCourseClick(course.id, course.isLocked)}
                className={`w-full bg-white/80 backdrop-blur-sm rounded-2xl p-4 shadow-lg transition-all active:scale-98 ${
                  course.isLocked ? 'opacity-70' : 'hover:shadow-xl'
                }`}
              >
                <div className="flex items-center gap-4">
                  {/* Icon/Cover */}
                  {course.coverUrl ? (
                    <div
                      className="w-20 h-20 rounded-xl bg-cover bg-center flex-shrink-0 shadow-md"
                      style={{ backgroundImage: `url(${course.coverUrl})` }}
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-[#d93547] to-[#9c1723] flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#d93547]/30">
                      <BookOpen className="w-10 h-10 text-white" />
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 text-left">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-bold text-[#2b2520] text-lg leading-tight">
                        {course.title}
                      </h3>
                      {course.isLocked && (
                        <Lock className="w-5 h-5 text-[#6b5a4a] flex-shrink-0" />
                      )}
                    </div>
                    
                    {course.description && (
                      <p className="text-sm text-[#6b5a4a] line-clamp-2 mb-2">
                        {course.description}
                      </p>
                    )}

                    {/* Progress */}
                    {course.progress && (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-[#6b5a4a]/20 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#d93547] to-[#9c1723] transition-all"
                            style={{
                              width: `${
                                (course.progress.completedDays.length /
                                  (course.progress.currentDay || 1)) *
                                100
                              }%`,
                            }}
                          />
                        </div>
                        <span className="text-xs text-[#6b5a4a] font-medium">
                          {course.progress.completedDays.length} / {course.progress.currentDay}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Arrow */}
                  {!course.isLocked && (
                    <ChevronRight className="w-6 h-6 text-[#6b5a4a] flex-shrink-0" />
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
