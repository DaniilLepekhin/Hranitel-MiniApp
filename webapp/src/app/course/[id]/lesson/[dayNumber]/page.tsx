'use client';

import { use } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle, Play, Pause, Volume2, FileText, Video } from 'lucide-react';
import { coursesApi } from '@/lib/api';
import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import { replaceContentPlaceholders } from '@/lib/content';

export default function LessonPage({
  params,
}: {
  params: Promise<{ id: string; dayNumber: string }>;
}) {
  const router = useRouter();
  const { id, dayNumber } = use(params);
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['course', id],
    queryFn: () => coursesApi.get(id),
  });

  const updateProgressMutation = useMutation({
    mutationFn: (data: { currentDay?: number; completedDay?: number }) =>
      coursesApi.updateProgress(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course', id] });
    },
  });

  const course = data?.course;
  const lesson = course?.days?.find((d) => d.dayNumber === parseInt(dayNumber));

  useEffect(() => {
    if (lesson && course) {
      // Update current day
      updateProgressMutation.mutate({ currentDay: lesson.dayNumber });
    }
  }, [lesson?.id]);

  const handleComplete = () => {
    if (lesson) {
      updateProgressMutation.mutate({ completedDay: lesson.dayNumber });
    }
  };

  const togglePlayPause = () => {
    const media = audioRef.current || videoRef.current;
    if (!media) return;

    if (isPlaying) {
      media.pause();
    } else {
      media.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    const media = audioRef.current || videoRef.current;
    if (media) {
      setCurrentTime(media.currentTime);
      setDuration(media.duration || 0);
    }
  };

  const handleSeek = (value: number) => {
    const media = audioRef.current || videoRef.current;
    if (media) {
      media.currentTime = value;
      setCurrentTime(value);
    }
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isCompleted = course?.progress?.completedDays?.includes(lesson?.dayNumber || 0);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (!course || !lesson) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Урок не найден</h2>
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
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="sticky top-0 z-50 glass">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center active:scale-95 transition-transform"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400">Урок {lesson.dayNumber}</p>
            <h1 className="text-sm font-bold text-white truncate">{lesson.title}</h1>
          </div>
          {isCompleted && (
            <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-5 h-5 text-white" />
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pt-4">
        {/* Video Player */}
        {lesson.videoUrl && (
          <div className="mb-6">
            <div className="glass rounded-3xl overflow-hidden">
              <video
                ref={videoRef}
                src={lesson.videoUrl}
                className="w-full aspect-video bg-black"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleTimeUpdate}
                onEnded={() => setIsPlaying(false)}
                controls
              />
            </div>
          </div>
        )}

        {/* Audio Player */}
        {lesson.audioUrl && !lesson.videoUrl && (
          <div className="mb-6">
            <div className="glass rounded-3xl p-6">
              <div className="flex items-center gap-4 mb-4">
                <button
                  onClick={togglePlayPause}
                  className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center active:scale-95 transition-transform shadow-lg"
                >
                  {isPlaying ? (
                    <Pause className="w-6 h-6 text-white" />
                  ) : (
                    <Play className="w-6 h-6 text-white ml-1" />
                  )}
                </button>

                <div className="flex-1">
                  <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={duration || 0}
                    value={currentTime}
                    onChange={(e) => handleSeek(parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                </div>

                <Volume2 className="w-5 h-5 text-gray-400" />
              </div>

              <audio
                ref={audioRef}
                src={lesson.audioUrl}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleTimeUpdate}
                onEnded={() => setIsPlaying(false)}
                className="hidden"
              />
            </div>
          </div>
        )}

        {/* Lesson Title */}
        <h2 className="text-2xl font-bold text-white mb-4">{lesson.title}</h2>

        {/* Main Content */}
        {lesson.content && (
          <div className="card rounded-3xl p-6 mb-4">
            <div className="prose prose-sm max-w-none">
              <div className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                {replaceContentPlaceholders(lesson.content, user || undefined)}
              </div>
            </div>
          </div>
        )}

        {/* Welcome Content */}
        {lesson.welcomeContent && (
          <div className="card rounded-3xl p-6 mb-4 bg-gradient-to-br from-purple-50 to-indigo-50">
            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <span className="text-xl">👋</span>
              Добро пожаловать
            </h3>
            <div className="text-gray-700 whitespace-pre-wrap leading-relaxed">
              {replaceContentPlaceholders(lesson.welcomeContent, user || undefined)}
            </div>
          </div>
        )}

        {/* Course Info */}
        {lesson.courseInfo && (
          <div className="card rounded-3xl p-6 mb-4">
            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <FileText className="w-5 h-5 text-purple-500" />
              О курсе
            </h3>
            <div className="text-gray-700 whitespace-pre-wrap leading-relaxed">
              {replaceContentPlaceholders(lesson.courseInfo, user || undefined)}
            </div>
          </div>
        )}

        {/* Meditation Guide */}
        {lesson.meditationGuide && (
          <div className="card rounded-3xl p-6 mb-4 bg-gradient-to-br from-indigo-50 to-purple-50">
            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <span className="text-xl">🧘</span>
              Гид по медитации
            </h3>
            <div className="text-gray-700 whitespace-pre-wrap leading-relaxed">
              {replaceContentPlaceholders(lesson.meditationGuide, user || undefined)}
            </div>
          </div>
        )}

        {/* Additional Content */}
        {lesson.additionalContent && (
          <div className="card rounded-3xl p-6 mb-4">
            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <span className="text-xl">✨</span>
              Дополнительно
            </h3>
            <div className="text-gray-700 whitespace-pre-wrap leading-relaxed">
              {replaceContentPlaceholders(lesson.additionalContent, user || undefined)}
            </div>
          </div>
        )}

        {/* Gift Content */}
        {lesson.giftContent && (
          <div className="card rounded-3xl p-6 mb-4 bg-gradient-to-br from-pink-50 to-purple-50">
            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <span className="text-xl">🎁</span>
              Подарок
            </h3>
            <div className="text-gray-700 whitespace-pre-wrap leading-relaxed">
              {replaceContentPlaceholders(lesson.giftContent, user || undefined)}
            </div>
          </div>
        )}

        {/* Stream Link */}
        {lesson.streamLink && (
          <div className="card rounded-3xl p-6 mb-4">
            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Video className="w-5 h-5 text-purple-500" />
              Трансляция
            </h3>
            <a
              href={lesson.streamLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-xl font-semibold active:scale-95 transition-transform"
            >
              <Play className="w-4 h-4" />
              Открыть трансляцию
            </a>
          </div>
        )}

        {/* PDF Download */}
        {lesson.pdfUrl && (
          <div className="card rounded-3xl p-6 mb-4">
            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <FileText className="w-5 h-5 text-purple-500" />
              Материалы
            </h3>
            <a
              href={lesson.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white border-2 border-purple-500 text-purple-600 rounded-xl font-semibold active:scale-95 transition-transform"
            >
              <FileText className="w-4 h-4" />
              Скачать PDF
            </a>
          </div>
        )}
      </div>

      {/* Bottom Action */}
      <div className="fixed bottom-0 left-0 right-0 p-4 glass">
        {!isCompleted ? (
          <button
            onClick={handleComplete}
            disabled={updateProgressMutation.isPending}
            className="w-full py-4 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-2xl font-bold active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            {updateProgressMutation.isPending ? 'Сохранение...' : 'Завершить урок'}
          </button>
        ) : (
          <div className="flex items-center justify-center gap-2 py-4 text-green-600 font-semibold">
            <CheckCircle className="w-5 h-5" />
            Урок завершён
          </div>
        )}
      </div>
    </div>
  );
}
