'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, BookOpen, Headphones, Radio, Sparkles, ChevronRight } from 'lucide-react';
import { contentApi, type ContentItem } from '@/lib/api';
import { useTelegram } from '@/hooks/useTelegram';
import { Card } from '@/components/ui/Card';

export default function MonthProgramPage() {
  const router = useRouter();
  const { haptic } = useTelegram();

  // Fetch monthly program
  const { data: programData, isLoading } = useQuery({
    queryKey: ['content', 'month-program'],
    queryFn: () => contentApi.getMonthProgram(),
  });

  const items = programData?.items || [];

  // Get current month name
  const currentMonth = new Date().toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

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
        return 'Эфир';
      case 'practice':
        return 'Практика';
      default:
        return 'Контент';
    }
  };

  const handleItemClick = (itemId: string) => {
    haptic.impact('light');
    router.push(`/content/${itemId}`);
  };

  if (isLoading) {
    return (
      <div className="px-4 pt-6 pb-24">
        <div className="space-y-4">
          <div className="h-32 rounded-3xl bg-[#e8dcc6] animate-pulse" />
          <div className="h-24 rounded-xl bg-[#e8dcc6] animate-pulse" />
          <div className="h-24 rounded-xl bg-[#e8dcc6] animate-pulse" />
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
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-4 h-4 text-[#8b0000]" />
            <span className="text-xs text-[#8b0000] font-semibold uppercase">Программа месяца</span>
          </div>
          <h1 className="text-xl font-bold text-[#3d2f1f] capitalize">{currentMonth}</h1>
        </div>
      </div>

      {/* Hero Card */}
      <Card className="p-6 mb-6 bg-gradient-to-br from-[#8b0000]/20 to-[#8b4513]/20 border-2 border-[#8b0000]">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#8b0000] to-[#8b4513] flex items-center justify-center shadow-lg">
            <Calendar className="w-8 h-8 text-white" strokeWidth={2} />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-[#3d2f1f] mb-1">Программа этого месяца</h2>
            <p className="text-[#6b5a4a]">{items.length} материалов</p>
          </div>
        </div>
        <p className="text-[#6b5a4a] leading-relaxed">
          Специально подобранные материалы для вашего развития в этом месяце.
          Курсы, практики, эфиры и подкасты для максимального прогресса.
        </p>
      </Card>

      {/* Empty State */}
      {items.length === 0 ? (
        <Card className="p-8 text-center">
          <Calendar className="w-16 h-16 mx-auto text-[#8b4513]/50 mb-4" />
          <h3 className="text-lg font-semibold text-[#3d2f1f] mb-2">
            Программа месяца готовится
          </h3>
          <p className="text-[#6b5a4a]">
            Скоро здесь появятся материалы для этого месяца
          </p>
        </Card>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <Card className="p-4 text-center bg-gradient-to-br from-[#8b0000]/10 to-[#8b4513]/10">
              <p className="text-3xl font-bold text-[#3d2f1f] mb-1">
                {items.filter(i => i.type === 'course').length}
              </p>
              <p className="text-[#6b5a4a] text-sm">Курсов</p>
            </Card>
            <Card className="p-4 text-center bg-gradient-to-br from-[#8b0000]/10 to-[#8b4513]/10">
              <p className="text-3xl font-bold text-[#3d2f1f] mb-1">
                {items.filter(i => i.type === 'practice').length}
              </p>
              <p className="text-[#6b5a4a] text-sm">Практик</p>
            </Card>
          </div>

          {/* Content List */}
          <div className="space-y-3">
            <h3 className="font-bold text-[#3d2f1f] text-lg mb-3">Материалы месяца</h3>
            {items.map((item) => {
              const Icon = getIcon(item.type);

              return (
                <Card
                  key={item.id}
                  className="p-4 hover:scale-[1.02] transition-all cursor-pointer"
                  onClick={() => handleItemClick(item.id)}
                >
                  <div className="flex items-center gap-4">
                    {/* Icon */}
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#8b0000] to-[#8b4513] flex items-center justify-center shadow-md flex-shrink-0">
                      <Icon className="w-7 h-7 text-white" strokeWidth={2} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-[#8b0000] font-semibold uppercase">
                          {getTypeLabel(item.type)}
                        </span>
                        {item.keyNumber && (
                          <span className="px-2 py-0.5 rounded-full bg-[#8b0000]/20 text-[#8b0000] text-xs font-semibold">
                            Ключ #{item.keyNumber}
                          </span>
                        )}
                      </div>
                      <h4 className="font-semibold text-[#3d2f1f] line-clamp-1 mb-1">
                        {item.title}
                      </h4>
                      {item.description && (
                        <p className="text-sm text-[#6b5a4a] line-clamp-2">
                          {item.description}
                        </p>
                      )}
                    </div>

                    {/* Arrow */}
                    <ChevronRight className="w-5 h-5 text-[#8b4513] flex-shrink-0" />
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Info Card */}
      <Card className="mt-6 p-4 bg-gradient-to-r from-[#8b0000]/10 to-[#8b4513]/10 border-[#8b4513]/30">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-[#8b0000] flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-[#3d2f1f] mb-1">Трансформация за месяц</p>
            <p className="text-[#6b5a4a] text-sm leading-relaxed">
              Пройдите все материалы месяца для максимального эффекта.
              Каждый материал тщательно подобран для вашего роста и развития.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
