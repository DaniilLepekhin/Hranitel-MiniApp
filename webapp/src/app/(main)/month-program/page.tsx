'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, BookOpen, Headphones, Radio, Sparkles, ChevronRight, ChevronLeft } from 'lucide-react';
import { contentApi, type ContentItem } from '@/lib/api';
import { useTelegram } from '@/hooks/useTelegram';
import { Card } from '@/components/ui/Card';
import { FullscreenButton } from '@/components/ui/FullscreenButton';

export default function MonthProgramPage() {
  const router = useRouter();
  const { haptic } = useTelegram();

  // State for selected month (format: 2026-02)
  const [selectedDate, setSelectedDate] = useState(new Date());
  const selectedMonth = useMemo(() => {
    const year = selectedDate.getFullYear();
    const month = (selectedDate.getMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
  }, [selectedDate]);

  // Get current day for display
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === selectedDate.getFullYear() && today.getMonth() === selectedDate.getMonth();
  const currentDay = today.getDate();

  // Selected day state (по умолчанию текущий день если мы в текущем месяце)
  const [selectedDay, setSelectedDay] = useState<number>(isCurrentMonth ? currentDay : 1);

  // Fetch monthly program for selected month
  const { data: programData, isLoading } = useQuery({
    queryKey: ['content', 'month-program', selectedMonth],
    queryFn: () => contentApi.getMonthProgram(selectedMonth),
  });

  const items = programData?.items || [];

  // Create a map of day -> item based on orderIndex
  const dayToItemMap = useMemo(() => {
    const map: Record<number, ContentItem> = {};
    items.forEach(item => {
      if (item.orderIndex && item.orderIndex >= 1 && item.orderIndex <= 31) {
        map[item.orderIndex] = item;
      }
    });
    return map;
  }, [items]);

  // Get item for selected day
  const selectedDayItem = dayToItemMap[selectedDay] || null;

  // Get current month name
  const monthName = selectedDate.toLocaleDateString('ru-RU', { month: 'long' });
  const year = selectedDate.getFullYear();
  const daysInMonth = new Date(year, selectedDate.getMonth() + 1, 0).getDate();

  // Calendar navigation
  const goToPrevMonth = useCallback(() => {
    haptic.impact('light');
    setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1));
    setSelectedDay(1);
  }, [selectedDate, haptic]);

  const goToNextMonth = useCallback(() => {
    haptic.impact('light');
    setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1));
    setSelectedDay(1);
  }, [selectedDate, haptic]);

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

  const handleItemClick = (item: ContentItem) => {
    haptic.impact('light');
    if (item.type === 'course') {
      // Для курсов переходим на страницу курсов (список, откуда можно выбрать нужный)
      router.push('/courses');
    } else {
      router.push(`/content/${item.id}`);
    }
  };

  // Calendar rendering
  const renderCalendar = () => {
    const firstDay = new Date(year, selectedDate.getMonth(), 1).getDay();
    const firstDayAdjusted = firstDay === 0 ? 6 : firstDay - 1;
    const daysInPrevMonth = new Date(year, selectedDate.getMonth(), 0).getDate();

    const calendarDays: { day: number; isCurrentMonth: boolean; isToday: boolean }[] = [];

    // Previous month days
    for (let i = firstDayAdjusted - 1; i >= 0; i--) {
      calendarDays.push({
        day: daysInPrevMonth - i,
        isCurrentMonth: false,
        isToday: false,
      });
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      calendarDays.push({
        day,
        isCurrentMonth: true,
        isToday: isCurrentMonth && day === currentDay,
      });
    }

    // Next month days
    const remainingDays = 42 - calendarDays.length;
    for (let day = 1; day <= remainingDays; day++) {
      calendarDays.push({
        day,
        isCurrentMonth: false,
        isToday: false,
      });
    }

    const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const monthNames = [
      'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ];

    return (
      <Card className="p-5 mb-6 max-w-md mx-auto">
        {/* Calendar Header */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={goToPrevMonth}
            className="w-8 h-8 rounded-lg bg-[#f8f6f0] flex items-center justify-center hover:bg-[#e8dcc6] transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-[#2b2520]" />
          </button>

          <div className="text-center">
            <h3 className="text-lg font-bold text-[#2b2520]">
              {monthNames[selectedDate.getMonth()]} {year}
            </h3>
          </div>

          <button
            onClick={goToNextMonth}
            className="w-8 h-8 rounded-lg bg-[#f8f6f0] flex items-center justify-center hover:bg-[#e8dcc6] transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-[#2b2520]" />
          </button>
        </div>

        {/* Week Days */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {weekDays.map((day) => (
            <div key={day} className="text-center text-xs font-semibold text-[#6b5a4a] py-2">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((dayInfo, index) => {
            const hasContent = dayInfo.isCurrentMonth && !!dayToItemMap[dayInfo.day];
            const isSelected = dayInfo.isCurrentMonth && dayInfo.day === selectedDay;

            return (
              <button
                key={index}
                onClick={() => {
                  if (dayInfo.isCurrentMonth) {
                    haptic.impact('light');
                    setSelectedDay(dayInfo.day);
                  }
                }}
                disabled={!dayInfo.isCurrentMonth}
                className={`
                  aspect-square rounded-lg flex items-center justify-center text-sm font-medium
                  transition-all relative
                  ${dayInfo.isToday
                    ? 'bg-gradient-to-br from-[#d93547] to-[#9c1723] text-white font-bold shadow-lg scale-110'
                    : isSelected
                      ? 'bg-[#d93547] text-white font-bold'
                      : dayInfo.isCurrentMonth
                        ? hasContent
                          ? 'bg-[#d93547]/10 text-[#2b2520] hover:bg-[#d93547]/20 border border-[#d93547]/30'
                          : 'text-[#2b2520] hover:bg-[#f8f6f0]'
                        : 'text-[#6b5a4a]/30'
                  }
                  ${dayInfo.isCurrentMonth && !dayInfo.isToday ? 'cursor-pointer' : ''}
                `}
              >
                <span className="relative z-10">{dayInfo.day}</span>

                {/* Content indicator dot */}
                {hasContent && !dayInfo.isToday && !isSelected && (
                  <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#d93547]" />
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 flex items-center justify-center gap-4 text-xs text-[#6b5a4a]">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-gradient-to-br from-[#d93547] to-[#9c1723]" />
            <span>Сегодня</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-[#d93547]/10 border border-[#d93547]/30" />
            <span>Материалы</span>
          </div>
        </div>
      </Card>
    );
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
          <h1 className="text-xl font-bold text-[#2b2520] capitalize">{monthName} {year}</h1>
        </div>
      </div>

      {/* Hero Card */}
      <Card className="p-6 mb-6 bg-gradient-to-br from-[#d93547]/20 to-[#9c1723]/20 border-2 border-[#d93547]">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#d93547] to-[#9c1723] flex items-center justify-center shadow-lg">
            <div className="text-center">
              <div className="text-white text-2xl font-bold leading-none">{selectedDay}</div>
              <div className="text-white/80 text-xs uppercase">{monthName.slice(0, 3)}</div>
            </div>
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-[#2b2520] mb-1">Программа месяца</h2>
            <p className="text-[#6b5a4a] text-sm">{items.length} материалов на {monthName.toLowerCase()}</p>
          </div>
        </div>
        <p className="text-[#6b5a4a] leading-relaxed text-sm">
          Структурированный план обучения. Выберите день в календаре, чтобы увидеть материал.
        </p>
      </Card>

      {/* Calendar */}
      {renderCalendar()}

      {/* Selected Day Content */}
      {items.length === 0 ? (
        <Card className="p-8 text-center">
          <Calendar className="w-16 h-16 mx-auto text-[#d93547]/50 mb-4" />
          <h3 className="text-lg font-semibold text-[#2b2520] mb-2">
            Программа на {monthName.toLowerCase()} готовится
          </h3>
          <p className="text-[#6b5a4a]">
            Скоро здесь появятся материалы для этого месяца
          </p>
        </Card>
      ) : selectedDayItem ? (
        <Card className="p-5 bg-gradient-to-br from-[#d93547]/10 to-[#9c1723]/10 border-2 border-[#d93547]">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#d93547] to-[#9c1723] flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm font-bold">{selectedDay}</span>
            </div>
            <div>
              <p className="text-xs text-[#d93547] font-semibold uppercase">{getTypeLabel(selectedDayItem.type)}</p>
              <p className="text-sm text-[#6b5a4a]">{selectedDay} {monthName}</p>
            </div>
          </div>

          <div
            className="flex items-center gap-3 p-4 rounded-xl bg-white cursor-pointer hover:bg-white/90 transition-all"
            onClick={() => handleItemClick(selectedDayItem)}
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
            Нет материала на {selectedDay} {monthName}
          </h3>
          <p className="text-[#6b5a4a]">
            Выберите другой день с отмеченным материалом
          </p>
        </Card>
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
