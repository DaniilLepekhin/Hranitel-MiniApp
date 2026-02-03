'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Zap } from 'lucide-react';
import { contentApi } from '@/lib/api';
import { useTelegram } from '@/hooks/useTelegram';
import { useAuthStore } from '@/store/auth';
import { VideoPlayer } from '@/components/video/VideoPlayer';
import { DualVideoPlayer } from '@/components/video/DualVideoPlayer';
import { Card } from '@/components/ui/Card';

export default function VideoPage() {
  const router = useRouter();
  const params = useParams();
  const { haptic, webApp } = useTelegram();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const videoId = params.videoId as string;

  const [watchTime, setWatchTime] = useState(0);

  // Fetch video details with timecodes
  const { data: videoData, isLoading } = useQuery({
    queryKey: ['content', 'video', videoId],
    queryFn: () => contentApi.getVideo(videoId),
    enabled: !!videoId,
  });

  // Complete video mutation
  const completeMutation = useMutation({
    mutationFn: () => contentApi.completeVideo(user!.id, videoId, watchTime),
    onSuccess: (data) => {
      haptic.notification('success');
      queryClient.invalidateQueries({ queryKey: ['content', 'progress'] });
      queryClient.invalidateQueries({ queryKey: ['energies', 'balance'] });

      webApp?.showAlert(`Отлично! Вы получили +${data.energiesEarned} Энергии за просмотр этого видео!`);
    },
    onError: (error: Error) => {
      haptic.notification('error');
      webApp?.showAlert(`Ошибка: ${error.message}`);
    },
  });

  const handleComplete = () => {
    if (user) {
      completeMutation.mutate();
    }
  };

  const handleTimeUpdate = (seconds: number) => {
    setWatchTime(seconds);
  };

  if (isLoading) {
    return (
      <div className="px-4 pt-6 pb-24">
        <div className="space-y-4">
          <div className="w-full aspect-video rounded-2xl bg-[#e8dcc6] animate-pulse" />
          <div className="h-8 w-3/4 rounded-lg bg-[#e8dcc6] animate-pulse" />
          <div className="h-20 rounded-xl bg-[#e8dcc6] animate-pulse" />
        </div>
      </div>
    );
  }

  if (!videoData) {
    return (
      <div className="px-4 pt-6 pb-24">
        <div className="text-center py-12">
          <p className="text-[#6b5a4a]">Видео не найдено</p>
        </div>
      </div>
    );
  }

  const { video, timecodes } = videoData;

  // Если есть и YouTube и RuTube URL - показываем dual player
  const hasDualSource = video.videoUrl && video.rutubeUrl;

  return (
    <div className="px-4 pt-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-xl bg-white/60 flex items-center justify-center hover:bg-white/80 transition-all border border-[#9c1723]/30"
        >
          <ArrowLeft className="w-5 h-5 text-[#2b2520]" />
        </button>
        <h1 className="flex-1 text-xl font-bold text-[#2b2520] line-clamp-1">{video.title}</h1>
      </div>

      {/* Video Player - выбор между обычным и dual */}
      {hasDualSource ? (
        <DualVideoPlayer
          youtubeUrl={video.videoUrl}
          rutubeUrl={video.rutubeUrl!}
          title={video.title}
          description={video.description || undefined}
          pdfUrl={video.pdfUrl || undefined}
          onComplete={handleComplete}
        />
      ) : (
        <>
          <VideoPlayer
            video={video}
            timecodes={timecodes}
            onComplete={handleComplete}
            onTimeUpdate={handleTimeUpdate}
          />

          {/* Video Info */}
          <Card className="mt-6 p-4 bg-gradient-to-br from-[#d93547]/5 to-[#9c1723]/5">
            <h2 className="font-bold text-[#2b2520] mb-2">{video.title}</h2>
            {video.description && (
              <p className="text-[#6b5a4a] leading-relaxed">{video.description}</p>
            )}

            {video.durationSeconds && (
              <div className="mt-4 flex items-center gap-2 text-sm">
                <span className="text-[#6b5a4a]">Длительность:</span>
                <span className="text-[#2b2520] font-semibold">
                  {Math.floor(video.durationSeconds / 60)} мин
                </span>
              </div>
            )}
          </Card>
        </>
      )}

      {/* EP Info - показываем только для обычного плеера */}
      {!hasDualSource && (
        <Card className="mt-4 p-4 bg-gradient-to-r from-[#d93547]/10 to-[#9c1723]/10 border-[#9c1723]/30">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#d93547] to-[#9c1723] flex items-center justify-center shadow-lg flex-shrink-0">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="font-semibold text-[#2b2520]">Награда за просмотр</p>
              <p className="text-[#6b5a4a] text-sm">
                Получите Энергии за просмотр этого видео
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
