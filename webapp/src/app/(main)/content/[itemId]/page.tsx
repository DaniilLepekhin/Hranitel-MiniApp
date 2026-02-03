'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Play, Lock, CheckCircle, ChevronRight, BookOpen, Headphones, Radio, Sparkles, FileText, Download } from 'lucide-react';
import { contentApi, type ContentItem, type ContentSection } from '@/lib/api';
import { useTelegram } from '@/hooks/useTelegram';
import { useAuthStore } from '@/store/auth';
import { Card } from '@/components/ui/Card';
import { useMediaPlayerStore, type MediaItem } from '@/store/media-player';
import { FullscreenButton } from '@/components/ui/FullscreenButton';
import { MaterialLinks, cleanTextFromMaterialLinks } from '@/components/ui/MaterialLinks';

export default function ContentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { haptic } = useTelegram();
  const { user } = useAuthStore();
  const itemId = params.itemId as string;
  const { setMedia } = useMediaPlayerStore();

  // Fetch content item details
  const { data: itemData, isLoading: itemLoading } = useQuery({
    queryKey: ['content', 'item', itemId],
    queryFn: () => contentApi.getItem(itemId),
    enabled: !!itemId,
  });

  // Fetch sections (for courses/podcasts)
  const { data: sectionsData } = useQuery({
    queryKey: ['content', 'sections', itemId],
    queryFn: () => contentApi.getSections(itemId),
    enabled: !!itemId && (itemData?.item.type === 'course' || itemData?.item.type === 'podcast'),
  });

  // Fetch videos (for stream recordings and podcasts)
  const { data: videosData } = useQuery({
    queryKey: ['content', 'videos', itemId],
    queryFn: () => contentApi.getItemVideos(itemId),
    enabled: !!itemId && (itemData?.item.type === 'stream_record' || itemData?.item.type === 'podcast'),
  });

  // Fetch user progress
  const { data: progressData } = useQuery({
    queryKey: ['content', 'progress', user?.id],
    queryFn: () => {
      if (!user?.id) {
        throw new Error('User ID is required');
      }
      return contentApi.getUserProgress(user.id);
    },
    enabled: !!user?.id,
    retry: false,
    staleTime: 60 * 1000,
  });

  const item = itemData?.item;
  const sections = sectionsData?.sections || [];
  const videos = videosData?.videos || [];
  const progress = progressData?.progress || [];

  const getIcon = (type: ContentItem['type']) => {
    switch (type) {
      case 'course':
        return BookOpen;
      case 'podcast':
        return Headphones;
      case 'stream_record':
        return Radio;
      case 'practice':
        return Sparkles;
      default:
        return BookOpen;
    }
  };

  const getTypeLabel = (type: ContentItem['type']) => {
    switch (type) {
      case 'course':
        return 'Курс';
      case 'podcast':
        return 'Подкаст';
      case 'stream_record':
        return 'Запись эфира';
      case 'practice':
        return 'Практика';
      default:
        return 'Контент';
    }
  };

  const handleSectionClick = (sectionId: string) => {
    haptic.impact('light');
    router.push(`/content/section/${sectionId}`);
  };

  const handleVideoClick = (videoId: string) => {
    haptic.impact('light');
    router.push(`/video/${videoId}`);
  };

  const handlePracticeClick = () => {
    haptic.impact('light');
    router.push(`/practices/${itemId}`);
  };

  // Play podcast/stream with timecodes
  const handlePlayMedia = async () => {
    if (!item) return;

    haptic.impact('light');

    // For podcasts and streams, fetch first video with timecodes
    if (item.type === 'podcast' || item.type === 'stream_record') {
      try {
        // Get first video
        const firstVideo = videos[0];
        if (!firstVideo) return;

        // Fetch video with timecodes
        const videoData = await contentApi.getVideo(firstVideo.id);

        // Определяем тип медиа по расширению URL: .mp3 = аудио, .mp4/.webm/youtube/vimeo = видео
        const url = firstVideo.videoUrl?.toLowerCase() || '';
        const isAudioFile = url.endsWith('.mp3') || url.endsWith('.m4a') || url.endsWith('.wav') || url.endsWith('.ogg');
        const isVideo = !isAudioFile && !!firstVideo.videoUrl;

        const mediaItem: MediaItem = {
          id: firstVideo.id,
          type: isVideo ? 'video' : 'audio',
          title: firstVideo.title,
          description: firstVideo.description || item.description || undefined,
          url: firstVideo.videoUrl,
          coverUrl: item.coverUrl || item.thumbnailUrl || undefined,
          thumbnailUrl: firstVideo.thumbnailUrl || undefined,
          durationSeconds: firstVideo.durationSeconds || undefined,
        };

        setMedia(mediaItem, videoData.timecodes);
      } catch (error) {
        console.error('Failed to load media:', error);
      }
    }
  };

  if (itemLoading) {
    return (
      <div className="px-4 pt-6 pb-24">
        <div className="space-y-4">
          <div className="h-48 rounded-3xl bg-[#e8dcc6] animate-pulse" />
          <div className="h-8 w-3/4 rounded-lg bg-[#e8dcc6] animate-pulse" />
          <div className="h-20 rounded-xl bg-[#e8dcc6] animate-pulse" />
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="px-4 pt-6 pb-24">
        <div className="text-center py-12">
          <BookOpen className="w-16 h-16 mx-auto text-[#d93547]/50 mb-4" />
          <h3 className="text-lg font-semibold text-[#2b2520] mb-2">Контент не найден</h3>
          <p className="text-[#6b5a4a]">Попробуйте вернуться назад</p>
        </div>
      </div>
    );
  }

  const Icon = getIcon(item.type);

  return (
    <>
      <FullscreenButton />
      <div className="px-4 pt-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-xl bg-white/60 flex items-center justify-center hover:bg-white/80 transition-all border border-[#d93547]/30"
        >
          <ArrowLeft className="w-5 h-5 text-[#2b2520]" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Icon className="w-4 h-4 text-[#d93547]" />
            <span className="text-xs text-[#d93547] font-semibold">{getTypeLabel(item.type)}</span>
          </div>
          <h1 className="text-xl font-bold text-[#2b2520]">{item.title}</h1>
        </div>
      </div>

      {/* Cover Image */}
      {item.coverUrl && (
        <div className="relative w-full aspect-video rounded-3xl overflow-hidden mb-6 shadow-lg">
          <img
            src={item.coverUrl}
            alt={item.title}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Podcasts/Streams - Play button (compact version) */}
      {(item.type === 'podcast' || item.type === 'stream_record') && videos.length > 0 && (
        <button
          onClick={() => {
            haptic.impact('light');
            const firstVideo = videos[0];
            // Если есть RuTube URL - переходим на страницу видео с выбором плеера
            if (firstVideo?.rutubeUrl) {
              router.push(`/video/${firstVideo.id}`);
            } else {
              // Иначе открываем в медиаплеере
              handlePlayMedia();
            }
          }}
          className="w-full mb-4 px-4 py-3 rounded-xl bg-gradient-to-r from-[#d93547] to-[#9c1723] hover:shadow-lg transition-all flex items-center justify-center gap-3"
        >
          <Play className="w-5 h-5 text-white" fill="white" />
          <span className="text-white font-semibold">
            {item.type === 'podcast' ? 'Слушать подкаст' : 'Смотреть запись'}
          </span>
          {videos[0]?.durationSeconds && (
            <span className="text-white/80 text-sm">
              • {Math.floor(videos[0].durationSeconds / 60)} мин
            </span>
          )}
        </button>
      )}

      {/* Description */}
      {item.description && (
        <Card className="p-4 mb-6 bg-gradient-to-br from-[#d93547]/5 to-[#9c1723]/5">
          <p className="text-[#6b5a4a] leading-relaxed whitespace-pre-line">
            {cleanTextFromMaterialLinks(item.description)}
          </p>
          <MaterialLinks text={item.description} className="mt-4" />
        </Card>
      )}

      {/* Key Badge */}
      {item.keyNumber && (
        <div className="mb-6 flex items-center gap-2">
          <div className="px-4 py-2 rounded-full bg-gradient-to-r from-[#d93547] to-[#9c1723] text-white text-sm font-semibold">
            Ключ #{item.keyNumber}
          </div>
          {item.monthProgram && (
            <div className="px-4 py-2 rounded-full bg-white/60 border border-[#d93547]/30 text-[#2b2520] text-sm font-semibold">
              Программа месяца
            </div>
          )}
        </div>
      )}

      {/* Course Sections */}
      {item.type === 'course' && sections.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-bold text-[#2b2520] text-lg mb-3">Уроки</h2>
          {sections.map((section, index) => {
            const sectionProgress = progress.filter((p) => p.contentItemId === itemId);
            const isCompleted = false; // TODO: calculate based on all videos in section

            return (
              <Card
                key={section.id}
                className="p-4 hover:scale-[1.02] transition-all cursor-pointer"
                onClick={() => handleSectionClick(section.id)}
              >
                <div className="flex items-center gap-4">
                  <div className={`
                    w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg shadow-md
                    ${isCompleted
                      ? 'bg-gradient-to-br from-[#d93547] to-[#9c1723] text-white'
                      : 'bg-[#e8dcc6] text-[#6b5a4a]'
                    }
                  `}>
                    {isCompleted ? (
                      <CheckCircle className="w-6 h-6" />
                    ) : (
                      <span>{index + 1}</span>
                    )}
                  </div>

                  <div className="flex-1">
                    <h3 className="font-semibold text-[#2b2520]">{section.title}</h3>
                    {section.description && (
                      <p className="text-sm text-[#6b5a4a] line-clamp-1 mt-0.5">
                        {section.description}
                      </p>
                    )}
                  </div>

                  <ChevronRight className="w-5 h-5 text-[#d93547]" />
                </div>
              </Card>
            );
          })}
        </div>
      )}


      {/* Practice Button */}
      {item.type === 'practice' && (
        <Card
          className="p-6 hover:scale-[1.02] transition-all cursor-pointer bg-gradient-to-br from-[#d93547]/10 to-[#9c1723]/10"
          onClick={handlePracticeClick}
        >
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#d93547] to-[#9c1723] flex items-center justify-center shadow-lg">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-[#2b2520] text-lg mb-1">Начать практику</h3>
              <p className="text-[#6b5a4a] text-sm">Откройте контент практики</p>
            </div>
            <ChevronRight className="w-6 h-6 text-[#d93547]" />
          </div>
        </Card>
      )}
      </div>
    </>
  );
}
