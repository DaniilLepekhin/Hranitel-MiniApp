'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, Search } from 'lucide-react';
import { OptimizedBackground } from '@/components/ui/OptimizedBackground';

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams.get('q') || '';

  return (
    <div className="min-h-screen w-full bg-[#f0ece8] relative">
      <OptimizedBackground variant="home" />

      <div className="relative z-10 px-4 sm:px-6 lg:px-8 pt-4 pb-24 max-w-2xl mx-auto">
        {/* Header с кнопкой назад */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#2d2620] hover:bg-[#2d2620]/90 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-[#f7f1e8]" />
          </button>
          <div className="flex-1">
            <p
              className="font-nooks color-kod-dark"
              style={{
                fontSize: 'clamp(24px, 6vw, 32px)',
                lineHeight: 0.95,
                letterSpacing: '-0.06em',
              }}
            >
              Поиск
            </p>
          </div>
        </div>

        {/* Поисковый запрос */}
        {query && (
          <div className="mb-6">
            <div className="flex items-center gap-2 p-4 rounded-lg bg-white/80 border border-[#2d2620]/10">
              <Search className="w-5 h-5 text-[#2d2620]/50 flex-shrink-0" />
              <p className="font-gilroy font-semibold text-[#2d2620]">{query}</p>
            </div>
          </div>
        )}

        {/* Результаты поиска - заглушка */}
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[#2d2620]/5 mb-4">
            <Search className="w-10 h-10 text-[#2d2620]/30" />
          </div>
          <p
            className="font-nooks color-kod-dark mb-2"
            style={{
              fontSize: 'clamp(20px, 5vw, 24px)',
              lineHeight: 0.95,
              letterSpacing: '-0.06em',
            }}
          >
            Поиск в разработке
          </p>
          <p className="font-gilroy text-[#2d2620]/60 text-sm">
            Функция поиска будет доступна в ближайшее время
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full bg-[#f0ece8] flex items-center justify-center">
          <div className="animate-pulse text-[#2d2620]">Загрузка...</div>
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
