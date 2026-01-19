'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Sparkles, Play } from 'lucide-react';
import dynamic from 'next/dynamic';
import { contentApi } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { useMediaPlayerStore, type MediaItem } from '@/store/media-player';
import { useTelegram } from '@/hooks/useTelegram';
import { MiniPlayer } from '@/components/ui/MiniPlayer';
import { FullMediaPlayer } from '@/components/player/FullMediaPlayer';

// 🚀 ОПТИМИЗАЦИЯ: Dynamic import для ReactMarkdown (экономия ~150KB gzipped)
const ReactMarkdown = dynamic(() => import('react-markdown'), {
  loading: () => <div className="animate-pulse bg-gray-200 h-40 rounded" />,
});

export default function PracticePage() {
  const router = useRouter();
  const params = useParams();
  const practiceId = params.practiceId as string;
  const { haptic } = useTelegram();
  const { setMedia } = useMediaPlayerStore();

  // Fetch practice content
  const { data: practiceData, isLoading, error: practiceError } = useQuery({
    queryKey: ['content', 'practice', practiceId],
    queryFn: () => contentApi.getPracticeContent(practiceId),
    enabled: !!practiceId,
    retry: 2,
  });

  // Fetch practice item details
  const { data: itemData, error: itemError } = useQuery({
    queryKey: ['content', 'item', practiceId],
    queryFn: () => contentApi.getItem(practiceId),
    enabled: !!practiceId,
    retry: 2,
  });

  // Fetch videos/audio for practice
  const { data: videosData, error: videosError } = useQuery({
    queryKey: ['content', practiceId, 'videos'],
    queryFn: () => contentApi.getItemVideos(practiceId),
    enabled: !!practiceId,
    retry: 2,
  });

  // Log errors for debugging
  if (practiceError) {
    console.error('Practice content error:', practiceError);
  }
  if (itemError) {
    console.error('Practice item error:', itemError);
  }
  if (videosError) {
    console.error('Practice videos error:', videosError);
  }

  if (isLoading) {
    return (
      <div className="px-4 safe-top pb-24">
        <div className="space-y-4">
          <div className="h-8 w-3/4 rounded-lg bg-[#e8dcc6] animate-pulse" />
          <div className="h-64 rounded-xl bg-[#e8dcc6] animate-pulse" />
        </div>
      </div>
    );
  }

  if (practiceError || !practiceData) {
    return (
      <div className="px-4 safe-top pb-24">
        <button
          onClick={() => router.back()}
          className="mb-6 w-10 h-10 rounded-xl bg-white/60 flex items-center justify-center hover:bg-white/80 transition-all border border-[#9c1723]/30"
        >
          <ArrowLeft className="w-5 h-5 text-[#2b2520]" />
        </button>
        <Card className="p-6 text-center">
          <Sparkles className="w-16 h-16 mx-auto text-[#9c1723]/50 mb-4" />
          <h3 className="text-lg font-semibold text-[#2b2520] mb-2">
            {practiceError ? 'Ошибка загрузки практики' : 'Практика не найдена'}
          </h3>
          <p className="text-[#6b5a4a] mb-4">
            {practiceError
              ? 'Не удалось загрузить контент практики. Попробуйте обновить страницу.'
              : 'Контент практики недоступен'}
          </p>
          {practiceError && (
            <p className="text-xs text-red-600 font-mono bg-red-50 p-2 rounded">
              {practiceError instanceof Error ? practiceError.message : 'Unknown error'}
            </p>
          )}
        </Card>
      </div>
    );
  }

  const { practice } = practiceData;
  const item = itemData?.item;
  const videos = videosData?.videos || [];

  // Play audio practice
  const handlePlayAudio = async () => {
    if (videos.length === 0 || !item) return;

    haptic.impact('light');

    const firstVideo = videos[0];

    // Fetch video with timecodes if needed
    try {
      const videoData = await contentApi.getVideo(firstVideo.id);

      const mediaItem: MediaItem = {
        id: firstVideo.id,
        type: 'audio',
        title: item.title,
        description: item.description || undefined,
        url: firstVideo.videoUrl,
        coverUrl: item.coverUrl || item.thumbnailUrl || undefined,
        thumbnailUrl: firstVideo.thumbnailUrl || undefined,
        durationSeconds: firstVideo.durationSeconds || undefined,
      };

      setMedia(mediaItem, videoData.timecodes);
    } catch (error) {
      console.error('Failed to load audio:', error);
    }
  };

  return (
    <>
      {/* Global Media Players */}
      <MiniPlayer />
      <FullMediaPlayer />

      <div className="px-4 safe-top pb-24">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-xl bg-white/60 flex items-center justify-center hover:bg-white/80 transition-all border border-[#9c1723]/30"
        >
          <ArrowLeft className="w-5 h-5 text-[#2b2520]" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-[#d93547]" />
            <span className="text-xs text-[#d93547] font-semibold">ПРАКТИКА</span>
          </div>
          {item && <h1 className="text-xl font-bold text-[#2b2520]">{item.title}</h1>}
        </div>
      </div>

      {/* Practice Header Card */}
      {item && (
        <Card className="p-5 mb-6 bg-gradient-to-br from-[#d93547]/10 to-[#9c1723]/10">
          <div className="flex items-center gap-4 mb-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#d93547] to-[#9c1723] flex items-center justify-center shadow-lg flex-shrink-0">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="font-bold text-[#2b2520] text-lg">{item.title}</h2>
              {item.keyNumber && (
                <div className="mt-1 inline-block px-3 py-1 rounded-full bg-gradient-to-r from-[#d93547] to-[#9c1723] text-white text-xs font-semibold">
                  Ключ #{item.keyNumber}
                </div>
              )}
            </div>
          </div>
          {item.description && (
            <p className="text-[#6b5a4a] leading-relaxed">{item.description}</p>
          )}
        </Card>
      )}

      {/* Audio Player */}
      {videos.length > 0 && (
        <Card
          className="mb-6 p-5 hover:scale-[1.02] transition-all cursor-pointer bg-gradient-to-br from-[#d93547]/10 to-[#9c1723]/10 border-2 border-[#d93547]"
          onClick={handlePlayAudio}
        >
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#d93547] to-[#9c1723] flex items-center justify-center shadow-lg flex-shrink-0">
              <Play className="w-8 h-8 text-white ml-1" fill="white" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-[#2b2520] mb-1">Слушать аудио-гайд</h3>
              <p className="text-[#6b5a4a] text-sm">
                {videos[0]?.durationSeconds
                  ? `${Math.floor(videos[0].durationSeconds / 60)} мин • Практика с аудио сопровождением`
                  : 'Практика с аудио сопровождением'}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Practice Content */}
      <Card className="p-6">
        <div className="practice-content prose prose-stone max-w-none">
          {practice.contentType === 'markdown' ? (
            <ReactMarkdown
              components={{
                h1: ({ children }) => (
                  <h1 className="text-2xl font-bold text-[#2b2520] mb-4 mt-6">{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-xl font-bold text-[#2b2520] mb-3 mt-5">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-lg font-bold text-[#2b2520] mb-2 mt-4">{children}</h3>
                ),
                p: ({ children }) => (
                  <p className="text-[#6b5a4a] leading-relaxed mb-4">{children}</p>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc list-inside text-[#6b5a4a] space-y-2 mb-4 ml-4">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal list-inside text-[#6b5a4a] space-y-2 mb-4 ml-4">
                    {children}
                  </ol>
                ),
                li: ({ children }) => (
                  <li className="text-[#6b5a4a]">{children}</li>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-[#d93547] pl-4 py-2 my-4 bg-[#d93547]/5 rounded-r-lg">
                    {children}
                  </blockquote>
                ),
                strong: ({ children }) => (
                  <strong className="font-bold text-[#2b2520]">{children}</strong>
                ),
                em: ({ children }) => (
                  <em className="italic text-[#6b5a4a]">{children}</em>
                ),
                code: ({ children }) => (
                  <code className="px-2 py-1 bg-[#e8dcc6] rounded text-[#2b2520] text-sm font-mono">
                    {children}
                  </code>
                ),
                pre: ({ children }) => (
                  <pre className="bg-[#e8dcc6] p-4 rounded-xl overflow-x-auto mb-4">
                    {children}
                  </pre>
                ),
              }}
            >
              {practice.content}
            </ReactMarkdown>
          ) : (
            <div
              className="html-content"
              dangerouslySetInnerHTML={{ __html: practice.content }}
            />
          )}
        </div>
      </Card>

      {/* Completion Note */}
      <Card className="mt-6 p-4 bg-gradient-to-r from-[#d93547]/10 to-[#9c1723]/10 border-[#9c1723]/30">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-[#d93547] flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-[#2b2520] mb-1">Выполните практику</p>
            <p className="text-[#6b5a4a] text-sm">
              {videos.length > 0
                ? 'Слушайте аудио-гайд и следуйте инструкциям. Можете свернуть плеер и продолжить слушать в фоне.'
                : 'Следуйте инструкциям выше и применяйте практику в своей жизни. Регулярное выполнение практик усилит трансформацию.'
              }
            </p>
          </div>
        </div>
      </Card>
      </div>
    </>
  );
}
