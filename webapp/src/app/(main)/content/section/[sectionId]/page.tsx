'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Play, CheckCircle, Lock } from 'lucide-react';
import { contentApi } from '@/lib/api';
import { useTelegram } from '@/hooks/useTelegram';
import { useAuthStore } from '@/store/auth';
import { Card } from '@/components/ui/Card';

export default function SectionPage() {
  const router = useRouter();
  const params = useParams();
  const { haptic } = useTelegram();
  const { user } = useAuthStore();
  const sectionId = params.sectionId as string;

  // Fetch videos in this section
  const { data: videosData, isLoading } = useQuery({
    queryKey: ['content', 'section-videos', sectionId],
    queryFn: () => contentApi.getSectionVideos(sectionId),
    enabled: !!sectionId,
  });

  // Fetch user progress
  const { data: progressData } = useQuery({
    queryKey: ['content', 'progress', user?.id],
    queryFn: () => contentApi.getUserProgress(user!.id),
    enabled: !!user,
  });

  const videos = videosData?.videos || [];
  const progress = progressData?.progress || [];

  const handleVideoClick = (videoId: string) => {
    haptic.impact('light');
    router.push(`/video/${videoId}`);
  };

  if (isLoading) {
    return (
      <div className="px-4 pt-6 pb-24">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-[#e8dcc6] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="px-4 pt-6 pb-24">
        <button
          onClick={() => router.back()}
          className="mb-6 w-10 h-10 rounded-xl bg-white/60 flex items-center justify-center hover:bg-white/80 transition-all border border-[#8b4513]/30"
        >
          <ArrowLeft className="w-5 h-5 text-[#3d2f1f]" />
        </button>
        <div className="text-center py-12">
          <Play className="w-16 h-16 mx-auto text-[#8b4513]/50 mb-4" />
          <h3 className="text-lg font-semibold text-[#3d2f1f] mb-2">Видео не найдены</h3>
          <p className="text-[#6b5a4a]">В этом разделе пока нет видео</p>
        </div>
      </div>
    );
  }

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
          <h1 className="text-xl font-bold text-[#3d2f1f]">Видео урока</h1>
          <p className="text-sm text-[#6b5a4a]">{videos.length} видео</p>
        </div>
      </div>

      {/* Progress Card */}
      <Card className="p-4 mb-6 bg-gradient-to-br from-[#8b0000]/10 to-[#8b4513]/10">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[#6b5a4a] text-sm mb-1">Прогресс раздела</p>
            <p className="text-2xl font-bold text-[#3d2f1f]">
              {progress.filter(p => videos.some(v => v.id === p.videoId && p.watched)).length} / {videos.length}
            </p>
          </div>
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#8b0000] to-[#8b4513] flex items-center justify-center shadow-lg">
            <Play className="w-8 h-8 text-white" />
          </div>
        </div>
        {/* Progress Bar */}
        <div className="mt-4 h-2 bg-[#e8dcc6] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#8b0000] to-[#8b4513] transition-all duration-500"
            style={{
              width: `${videos.length > 0 ? (progress.filter(p => videos.some(v => v.id === p.videoId && p.watched)).length / videos.length) * 100 : 0}%`
            }}
          />
        </div>
      </Card>

      {/* Videos List */}
      <div className="space-y-3">
        {videos.map((video, index) => {
          const videoProgress = progress.find(p => p.videoId === video.id);
          const isWatched = videoProgress?.watched || false;

          return (
            <Card
              key={video.id}
              className="p-4 hover:scale-[1.02] transition-all cursor-pointer"
              onClick={() => handleVideoClick(video.id)}
            >
              <div className="flex gap-4">
                {/* Thumbnail or Number */}
                <div className="relative flex-shrink-0">
                  {video.thumbnailUrl ? (
                    <div className="w-24 h-24 rounded-xl overflow-hidden">
                      <img
                        src={video.thumbnailUrl}
                        alt={video.title}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                        <Play className="w-8 h-8 text-white" fill="white" />
                      </div>
                    </div>
                  ) : (
                    <div className={`
                      w-24 h-24 rounded-xl flex items-center justify-center font-bold text-2xl shadow-md
                      ${isWatched
                        ? 'bg-gradient-to-br from-[#8b0000] to-[#8b4513] text-white'
                        : 'bg-[#e8dcc6] text-[#6b5a4a]'
                      }
                    `}>
                      {isWatched ? (
                        <CheckCircle className="w-10 h-10" />
                      ) : (
                        <span>{index + 1}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-semibold text-[#3d2f1f] line-clamp-2 flex-1">
                      {video.title}
                    </h3>
                    {isWatched && (
                      <CheckCircle className="w-5 h-5 text-[#8b0000] flex-shrink-0" />
                    )}
                  </div>

                  {video.description && (
                    <p className="text-sm text-[#6b5a4a] line-clamp-2 mb-2">
                      {video.description}
                    </p>
                  )}

                  <div className="flex items-center gap-3 text-xs">
                    {video.durationSeconds && (
                      <span className="text-[#8b0000] font-semibold">
                        {Math.floor(video.durationSeconds / 60)} мин
                      </span>
                    )}
                    {videoProgress && videoProgress.energiesEarned > 0 && (
                      <span className="px-2 py-1 rounded-full bg-[#8b0000]/10 text-[#8b0000] font-semibold">
                        +{videoProgress.energiesEarned} Энергии
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
