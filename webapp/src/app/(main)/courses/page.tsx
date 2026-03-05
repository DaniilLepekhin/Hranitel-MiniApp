'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, BookOpen, ChevronRight, Lock } from 'lucide-react';
import { coursesApi } from '@/lib/api';
import { useTelegram } from '@/hooks/useTelegram';

export default function CoursesListPage() {
  const router = useRouter();
  const { haptic } = useTelegram();

  const { data, isLoading } = useQuery({
    queryKey: ['courses'],
    queryFn: () => coursesApi.list(),
  });

  const courses = data?.courses || [];

  return (
    <div className="min-h-screen relative" style={{ backgroundColor: '#f0ece8' }}>
      {/* Фон как на главной */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0, backgroundColor: '#f0ece8', overflow: 'hidden' }}>
        {/* Газетная текстура */}
        <div className="absolute" style={{ width: '250%', height: '250%', left: '50%', top: '50%', transform: 'translate(-50%, -50%) rotate(-60.8deg)', opacity: 0.25, mixBlendMode: 'overlay' }}>
          <img src="/assets/newspaper-texture.jpg" alt="" loading="eager" className="w-full h-full object-cover" />
        </div>
        {/* Монеты слева */}
        <div className="absolute" style={{ width: '160%', height: '120%', left: '-50%', top: '-10%', mixBlendMode: 'multiply', opacity: 0.4 }}>
          <img src="/assets/bg-coins.jpg" alt="" loading="eager" className="w-full h-full object-cover object-left-top" />
        </div>
        {/* Размытое пятно 1 */}
        <div className="absolute" style={{ width: '150%', height: '130%', left: '-80%', bottom: '-30%', mixBlendMode: 'color-dodge', filter: 'blur(200px)', transform: 'rotate(-22.76deg)', opacity: 0.5 }}>
          <img src="/assets/bg-blur.jpg" alt="" loading="eager" className="w-full h-full object-cover" />
        </div>
        {/* Размытое пятно 2 */}
        <div className="absolute" style={{ width: '150%', height: '130%', right: '-80%', top: '-70%', mixBlendMode: 'color-dodge', filter: 'blur(200px)', transform: 'rotate(77.63deg) scaleY(-1)', opacity: 0.5 }}>
          <img src="/assets/bg-blur.jpg" alt="" loading="eager" className="w-full h-full object-cover" />
        </div>
      </div>

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
      <div className="relative z-10 px-4 py-6">
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
            {courses.map((course) => {
              const courseContent = (
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
              );

              return course.isLocked ? (
                <div
                  key={course.id}
                  onClick={() => haptic.notification('error')}
                  className="w-full bg-white/80 backdrop-blur-sm rounded-2xl p-4 shadow-lg transition-all opacity-70 cursor-not-allowed"
                >
                  {courseContent}
                </div>
              ) : (
                <Link
                  key={course.id}
                  href={`/course/${course.id}`}
                  prefetch={true}
                  onClick={() => haptic.impact('light')}
                  className="block w-full bg-white/80 backdrop-blur-sm rounded-2xl p-4 shadow-lg transition-all hover:shadow-xl active:scale-98"
                >
                  {courseContent}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
