'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, BookOpen, Headphones, Radio, Sparkles, ChevronRight } from 'lucide-react';
import { contentApi, type ContentItem } from '@/lib/api';
import { useTelegram } from '@/hooks/useTelegram';
import { Card } from '@/components/ui/Card';
import { MonthCalendar } from '@/components/MonthCalendar';
import { FullscreenButton } from '@/components/ui/FullscreenButton';

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
  const currentDate = new Date();
  const currentMonth = currentDate.toLocaleDateString('ru-RU', { month: 'long' });
  const currentYear = currentDate.getFullYear();
  const currentDay = currentDate.getDate();
  const daysInMonth = new Date(currentYear, currentDate.getMonth() + 1, 0).getDate();

  // Selected day state (по умолчанию текущий день)
  const [selectedDay, setSelectedDay] = useState<number>(currentDay);

  // Get item for selected day
  const selectedDayItem = items[selectedDay - 1] || null;

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
            <Calendar className="w-4 h-4 text-[#d93547]" />
            <span className="text-xs text-[#d93547] font-semibold uppercase">Программа месяца</span>
          </div>
          <h1 className="text-xl font-bold text-[#2b2520] capitalize">{currentMonth} {currentYear}</h1>
        </div>
      </div>

      {/* Hero Card with Calendar */}
      <Card className="p-6 mb-6 bg-gradient-to-br from-[#d93547]/20 to-[#9c1723]/20 border-2 border-[#d93547]">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#d93547] to-[#9c1723] flex items-center justify-center shadow-lg">
            <div className="text-center">
              <div className="text-white text-2xl font-bold leading-none">{selectedDay}</div>
              <div className="text-white/80 text-xs uppercase">{currentMonth.slice(0, 3)}</div>
            </div>
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-[#2b2520] mb-1">Программа месяца</h2>
            <p className="text-[#6b5a4a] text-sm">{items.length} материалов на месяц</p>
          </div>
        </div>
        <p className="text-[#6b5a4a] leading-relaxed text-sm">
          Структурированный план обучения. Выберите день в календаре, чтобы увидеть материал.
        </p>
      </Card>

      {/* Empty State */}
      {items.length === 0 ? (
        <Card className="p-8 text-center">
          <Calendar className="w-16 h-16 mx-auto text-[#d93547]/50 mb-4" />
          <h3 className="text-lg font-semibold text-[#2b2520] mb-2">
            Программа месяца готовится
          </h3>
          <p className="text-[#6b5a4a]">
            Скоро здесь появятся материалы для этого месяца
          </p>
        </Card>
      ) : (
        <>
          {/* Calendar */}
          <MonthCalendar
            items={items}
            onDayClick={(day) => {
              haptic.impact('light');
              setSelectedDay(day);
            }}
          />

          {/* Selected Day Content */}
          {selectedDayItem ? (
            <Card className="p-5 bg-gradient-to-br from-[#d93547]/10 to-[#9c1723]/10 border-2 border-[#d93547]">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#d93547] to-[#9c1723] flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm font-bold">{selectedDay}</span>
                </div>
                <div>
                  <p className="text-xs text-[#d93547] font-semibold uppercase">{getTypeLabel(selectedDayItem.type)}</p>
                  <p className="text-sm text-[#6b5a4a]">{selectedDay} {currentMonth}</p>
                </div>
              </div>

              <div
                className="flex items-center gap-3 p-4 rounded-xl bg-white cursor-pointer hover:bg-white/90 transition-all"
                onClick={() => handleItemClick(selectedDayItem.id)}
              >
                {/* Icon */}
                <div className="w-12 h-12 rounded-lg bg-[#d93547]/20 flex items-center justify-center flex-shrink-0">
                  {(() => {
                    const IconComponent = getIcon(selectedDayItem.type);
                    return <IconComponent className="w-6 h-6 text-[#d93547]" />;
                  })()}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-[#2b2520] mb-1 line-clamp-2">
                    {selectedDayItem.title}
                  </h4>
                  {selectedDayItem.description && (
                    <p className="text-sm text-[#6b5a4a] line-clamp-2">
                      {selectedDayItem.description}
                    </p>
                  )}
                </div>

                {/* Arrow */}
                <ChevronRight className="w-5 h-5 text-[#d93547] flex-shrink-0" />
              </div>
            </Card>
          ) : (
            <Card className="p-8 text-center">
              <Calendar className="w-16 h-16 mx-auto text-[#d93547]/50 mb-4" />
              <h3 className="text-lg font-semibold text-[#2b2520] mb-2">
                Нет материала на {selectedDay} {currentMonth}
              </h3>
              <p className="text-[#6b5a4a]">
                Выберите другой день с отмеченным материалом
              </p>
            </Card>
          )}
        </>
      )}

      {/* Info Card */}
      <Card className="mt-6 p-4 bg-gradient-to-r from-[#d93547]/10 to-[#9c1723]/10 border-[#d93547]/30">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-[#d93547] flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-[#2b2520] mb-1">💎 Системный подход к развитию</p>
            <p className="text-[#6b5a4a] text-sm leading-relaxed">
              Следуйте программе последовательно, неделя за неделей. Каждый материал подобран для максимального эффекта и синергии с другими элементами программы.
            </p>
          </div>
        </div>
      </Card>
      </div>
    </>
  );
}
