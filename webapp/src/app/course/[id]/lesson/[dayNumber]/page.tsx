'use client';

import { use } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import { coursesApi } from '@/lib/api';
import { LessonRenderer, type LessonData } from '@/components/lessons';
import { useTelegram } from '@/hooks/useTelegram';

export default function LessonPage({
  params,
}: {
  params: Promise<{ id: string; dayNumber: string }>;
}) {
  const router = useRouter();
  const { id, dayNumber } = use(params);
  const queryClient = useQueryClient();
  const { haptic } = useTelegram();

  const { data, isLoading } = useQuery({
    queryKey: ['course', id],
    queryFn: () => coursesApi.get(id),
    refetchOnMount: 'always', // Always fetch fresh data when component mounts
    staleTime: 0, // Consider data stale immediately
  });

  const updateProgressMutation = useMutation({
    mutationFn: (data: { currentDay?: number; completedDay?: number }) => {
      // Get initData directly from Telegram WebApp
      const initData = typeof window !== 'undefined' 
        ? window.Telegram?.WebApp?.initData || ''
        : '';
      
      console.log('[LessonPage] Sending progress update with initData:', initData ? 'EXISTS' : 'NULL');
      
      return coursesApi.updateProgress(id, { ...data, initData });
    },
    onSuccess: async () => {
      console.log('[LessonPage] Progress updated successfully');
      haptic.notification('success');
      // Wait for data to be refetched before redirecting
      await queryClient.invalidateQueries({ queryKey: ['course', id] });
      console.log('[LessonPage] Queries invalidated, refetching...');
      await queryClient.refetchQueries({ queryKey: ['course', id] });
      console.log('[LessonPage] Data refetched, redirecting...');
      // Redirect back to course after data is updated
      setTimeout(() => router.push(`/course/${id}`), 500);
    },
    onError: (error) => {
      console.error('[LessonPage] Failed to update progress:', error);
      haptic.notification('error');
    },
  });

  const course = data?.course;
  const lesson = course?.days?.find((d) => d.dayNumber === parseInt(dayNumber));

  const handleComplete = () => {
    if (lesson) {
      updateProgressMutation.mutate({ completedDay: lesson.dayNumber });
    }
  };

  const isCompleted = course?.progress?.completedDays?.includes(lesson?.dayNumber || 0);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f7f1e8] flex items-center justify-center">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#d93547] to-[#9c1723] animate-pulse" />
      </div>
    );
  }

  if (!course || !lesson) {
    return (
      <div className="min-h-screen bg-[#f7f1e8] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-[#2b2520] mb-2">Урок не найден</h2>
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

  const lessonData: LessonData = {
    id: lesson.id,
    title: lesson.title,
    content: lesson.content || undefined,
    lessonType: lesson.lessonType || 'text',
    videoUrl: lesson.videoUrl || undefined,
    rutubeUrl: lesson.rutubeUrl || undefined,
    audioUrl: lesson.audioUrl || undefined,
    pdfUrl: lesson.pdfUrl || undefined,
    attachments: lesson.attachments || [],
  };

  return (
    <div className="min-h-screen bg-[#f7f1e8] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-sm border-b border-[#9c1723]/10">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center active:scale-95 transition-transform"
          >
            <ArrowLeft className="w-5 h-5 text-[#2b2520]" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-[#6b5a4a]">Урок {lesson.dayNumber}</p>
            <h1 className="text-sm font-bold text-[#2b2520] truncate">{lesson.title}</h1>
          </div>
          {isCompleted && (
            <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 shadow-md">
              <CheckCircle className="w-5 h-5 text-white" />
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6">
        <LessonRenderer lesson={lessonData} onComplete={handleComplete} isCompleted={isCompleted} />
      </div>

      {/* Completion Status (if already completed) */}
      {isCompleted && (
        <div className="fixed bottom-4 left-4 right-4 p-4 rounded-xl bg-gradient-to-r from-green-500/90 to-green-600/90 backdrop-blur-sm border border-green-400/30 flex items-center gap-3 shadow-lg">
          <CheckCircle className="w-6 h-6 text-white flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-white">Урок завершён!</p>
            <p className="text-white/80 text-sm">Вы уже прошли этот урок</p>
          </div>
        </div>
      )}
    </div>
  );
}
