'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { contentApi } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import ReactMarkdown from 'react-markdown';
import { AudioPlayer } from '@/components/media/AudioPlayer';
import type { MediaItem } from '@/contexts/MediaPlayerContext';

export default function PracticePage() {
  const router = useRouter();
  const params = useParams();
  const practiceId = params.practiceId as string;

  // Fetch practice content
  const { data: practiceData, isLoading } = useQuery({
    queryKey: ['content', 'practice', practiceId],
    queryFn: () => contentApi.getPracticeContent(practiceId),
    enabled: !!practiceId,
  });

  // Fetch practice item details
  const { data: itemData } = useQuery({
    queryKey: ['content', 'item', practiceId],
    queryFn: () => contentApi.getItem(practiceId),
    enabled: !!practiceId,
  });

  // Fetch videos/audio for practice
  const { data: videosData } = useQuery({
    queryKey: ['content', practiceId, 'videos'],
    queryFn: () => contentApi.getDirectVideos(practiceId),
    enabled: !!practiceId,
  });

  if (isLoading) {
    return (
      <div className="px-4 pt-6 pb-24">
        <div className="space-y-4">
          <div className="h-8 w-3/4 rounded-lg bg-[#e8dcc6] animate-pulse" />
          <div className="h-64 rounded-xl bg-[#e8dcc6] animate-pulse" />
        </div>
      </div>
    );
  }

  if (!practiceData) {
    return (
      <div className="px-4 pt-6 pb-24">
        <button
          onClick={() => router.back()}
          className="mb-6 w-10 h-10 rounded-xl bg-white/60 flex items-center justify-center hover:bg-white/80 transition-all border border-[#8b4513]/30"
        >
          <ArrowLeft className="w-5 h-5 text-[#3d2f1f]" />
        </button>
        <div className="text-center py-12">
          <Sparkles className="w-16 h-16 mx-auto text-[#8b4513]/50 mb-4" />
          <h3 className="text-lg font-semibold text-[#3d2f1f] mb-2">Практика не найдена</h3>
          <p className="text-[#6b5a4a]">Контент практики недоступен</p>
        </div>
      </div>
    );
  }

  const { practice } = practiceData;
  const item = itemData?.item;
  const videos = videosData?.videos || [];

  // Prepare audio media item if there are audio tracks
  const audioMedia: MediaItem | null = videos.length > 0 ? {
    id: practiceId,
    title: item?.title || 'Практика',
    type: 'audio',
    tracks: videos.map(video => ({
      id: video.id,
      title: video.title,
      url: video.url,
      duration: video.durationSeconds,
      thumbnail: video.thumbnailUrl,
    })),
    thumbnail: item?.thumbnailUrl,
  } : null;

  return (
    <div className="px-4 pt-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-xl bg-white/60 flex items-center justify-center hover:bg-white/80 transition-all border border-[#8b4513]/30"
        >
          <ArrowLeft className="w-5 h-5 text-[#3d2f1f]" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-[#8b0000]" />
            <span className="text-xs text-[#8b0000] font-semibold">ПРАКТИКА</span>
          </div>
          {item && <h1 className="text-xl font-bold text-[#3d2f1f]">{item.title}</h1>}
        </div>
      </div>

      {/* Practice Header Card */}
      {item && (
        <Card className="p-5 mb-6 bg-gradient-to-br from-[#8b0000]/10 to-[#8b4513]/10">
          <div className="flex items-center gap-4 mb-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#8b0000] to-[#8b4513] flex items-center justify-center shadow-lg flex-shrink-0">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="font-bold text-[#3d2f1f] text-lg">{item.title}</h2>
              {item.keyNumber && (
                <div className="mt-1 inline-block px-3 py-1 rounded-full bg-gradient-to-r from-[#8b0000] to-[#8b4513] text-white text-xs font-semibold">
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
      {audioMedia && (
        <div className="mb-6">
          <AudioPlayer media={audioMedia} />
        </div>
      )}

      {/* Practice Content */}
      <Card className="p-6">
        <div className="practice-content prose prose-stone max-w-none">
          {practice.contentType === 'markdown' ? (
            <ReactMarkdown
              components={{
                h1: ({ children }) => (
                  <h1 className="text-2xl font-bold text-[#3d2f1f] mb-4 mt-6">{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-xl font-bold text-[#3d2f1f] mb-3 mt-5">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-lg font-bold text-[#3d2f1f] mb-2 mt-4">{children}</h3>
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
                  <blockquote className="border-l-4 border-[#8b0000] pl-4 py-2 my-4 bg-[#8b0000]/5 rounded-r-lg">
                    {children}
                  </blockquote>
                ),
                strong: ({ children }) => (
                  <strong className="font-bold text-[#3d2f1f]">{children}</strong>
                ),
                em: ({ children }) => (
                  <em className="italic text-[#6b5a4a]">{children}</em>
                ),
                code: ({ children }) => (
                  <code className="px-2 py-1 bg-[#e8dcc6] rounded text-[#3d2f1f] text-sm font-mono">
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
      <Card className="mt-6 p-4 bg-gradient-to-r from-[#8b0000]/10 to-[#8b4513]/10 border-[#8b4513]/30">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-[#8b0000] flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-[#3d2f1f] mb-1">Выполните практику</p>
            <p className="text-[#6b5a4a] text-sm">
              {audioMedia
                ? 'Слушайте аудио-гайд и следуйте инструкциям. Можете свернуть плеер и продолжить слушать в фоне.'
                : 'Следуйте инструкциям выше и применяйте практику в своей жизни. Регулярное выполнение практик усилит трансформацию.'
              }
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
