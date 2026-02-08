'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { useAuthStore } from '@/store/auth';
import { DualVideoPlayer } from '@/components/video/DualVideoPlayer';

export default function PurchasedItemPage() {
  const router = useRouter();
  const params = useParams();
  const { haptic, webApp } = useTelegram();
  const { user, token } = useAuthStore();
  const itemId = params.itemId as string;

  // Fetch purchased item details
  const { data: itemData, isLoading, error } = useQuery({
    queryKey: ['shop', 'purchased', itemId],
    queryFn: async () => {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/shop/purchased/${itemId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch purchased item');
      }
      return response.json();
    },
    enabled: !!itemId && !!token,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f7f1e8] px-4 pt-6 pb-24">
        <div className="space-y-4">
          <div className="w-full aspect-video rounded-2xl bg-[#e8dcc6] animate-pulse" />
          <div className="h-8 w-3/4 rounded-lg bg-[#e8dcc6] animate-pulse" />
          <div className="h-32 rounded-xl bg-[#e8dcc6] animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !itemData?.item) {
    return (
      <div className="min-h-screen bg-[#f7f1e8] px-4 pt-6 pb-24">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-xl bg-white/60 flex items-center justify-center hover:bg-white/80 transition-all border border-[#9c1723]/30"
          >
            <ArrowLeft className="w-5 h-5 text-[#2b2520]" />
          </button>
        </div>
        <div className="text-center py-12">
          <p className="text-[#6b5a4a] mb-4">
            {error instanceof Error ? error.message : 'Товар не найден или не был куплен'}
          </p>
          <button
            onClick={() => router.push('/?tab=shop')}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#d93547] to-[#9c1723] text-white font-semibold"
          >
            Вернуться в магазин
          </button>
        </div>
      </div>
    );
  }

  const { item } = itemData;
  const videoUrls = item.item_data?.video_urls || [];

  // Разделяем на YouTube и RuTube
  const youtubeUrl = videoUrls.find((url: string) => url.includes('youtube') || url.includes('youtu.be'));
  const rutubeUrl = videoUrls.find((url: string) => url.includes('rutube'));

  return (
    <div className="min-h-screen bg-[#f7f1e8] px-4 pt-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-xl bg-white/60 flex items-center justify-center hover:bg-white/80 transition-all border border-[#9c1723]/30"
        >
          <ArrowLeft className="w-5 h-5 text-[#2b2520]" />
        </button>
        <h1 className="flex-1 text-xl font-bold text-[#2b2520] line-clamp-2">{item.title}</h1>
      </div>

      {/* Dual Video Player если есть оба источника */}
      {youtubeUrl && rutubeUrl ? (
        <DualVideoPlayer
          youtubeUrl={youtubeUrl}
          rutubeUrl={rutubeUrl}
          title={item.title}
          description={item.description || undefined}
        />
      ) : youtubeUrl ? (
        // Только YouTube
        <div className="w-full">
          <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-lg mb-4">
            <iframe
              src={youtubeUrl.replace('youtu.be/', 'youtube.com/embed/').replace('watch?v=', 'embed/')}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              title={item.title}
            />
          </div>
          <div className="mt-4 p-4 rounded-xl bg-gradient-to-br from-[#d93547]/5 to-[#9c1723]/5">
            <h2 className="font-bold text-[#2b2520] mb-2">{item.title}</h2>
            {item.description && (
              <p className="text-[#6b5a4a] leading-relaxed text-sm whitespace-pre-wrap">{item.description}</p>
            )}
          </div>
        </div>
      ) : rutubeUrl ? (
        // Только RuTube
        <div className="w-full">
          <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-lg mb-4">
            <iframe
              src={rutubeUrl}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              title={item.title}
            />
          </div>
          <div className="mt-4 p-4 rounded-xl bg-gradient-to-br from-[#d93547]/5 to-[#9c1723]/5">
            <h2 className="font-bold text-[#2b2520] mb-2">{item.title}</h2>
            {item.description && (
              <p className="text-[#6b5a4a] leading-relaxed text-sm whitespace-pre-wrap">{item.description}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-[#6b5a4a]">Видео недоступно</p>
        </div>
      )}

      {/* Note about unlimited access */}
      <div className="mt-6 p-4 rounded-xl bg-gradient-to-r from-[#d93547]/10 to-[#9c1723]/10 border border-[#9c1723]/30">
        <p className="text-[#2b2520] font-semibold mb-1">🔐 Тайная комната</p>
        <p className="text-[#6b5a4a] text-sm">
          Этот материал куплен навсегда. Вы можете возвращаться к нему в любое время.
        </p>
      </div>
    </div>
  );
}
