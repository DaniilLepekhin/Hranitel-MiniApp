'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from './ui/Card';

interface MonthCalendarProps {
  items: any[];
  onDayClick?: (day: number) => void;
}

export function MonthCalendar({ items, onDayClick }: MonthCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const todayDate = today.getDate();

  // Get first day of month (0 = Sunday, 1 = Monday, etc.)
  const firstDay = new Date(year, month, 1).getDay();
  // Adjust for Monday start (0 = Monday, 6 = Sunday)
  const firstDayAdjusted = firstDay === 0 ? 6 : firstDay - 1;

  // Get days in month
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Get days in previous month for padding
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  // Create array of days to display
  const calendarDays: { day: number; isCurrentMonth: boolean; isPast: boolean; isFuture: boolean; isToday: boolean }[] = [];

  // Previous month days
  for (let i = firstDayAdjusted - 1; i >= 0; i--) {
    calendarDays.push({
      day: daysInPrevMonth - i,
      isCurrentMonth: false,
      isPast: true,
      isFuture: false,
      isToday: false,
    });
  }

  // Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const isPast = isCurrentMonth && day < todayDate;
    const isFuture = isCurrentMonth && day > todayDate;
    const isToday = isCurrentMonth && day === todayDate;

    calendarDays.push({
      day,
      isCurrentMonth: true,
      isPast,
      isFuture,
      isToday,
    });
  }

  // Next month days to fill the grid
  const remainingDays = 42 - calendarDays.length; // 6 rows * 7 days
  for (let day = 1; day <= remainingDays; day++) {
    calendarDays.push({
      day,
      isCurrentMonth: false,
      isPast: false,
      isFuture: true,
      isToday: false,
    });
  }

  // Calculate which days have content
  const daysWithContent = new Set<number>();
  items.forEach((_, index) => {
    const dayNum = index + 1;
    if (dayNum <= daysInMonth) {
      daysWithContent.add(dayNum);
    }
  });

  const monthNames = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];

  const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  const goToPrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleDayClick = (day: number, isCurrentMonth: boolean) => {
    if (isCurrentMonth && onDayClick) {
      onDayClick(day);
    }
  };

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
            {monthNames[month]} {year}
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
          const hasContent = dayInfo.isCurrentMonth && daysWithContent.has(dayInfo.day);

          return (
            <button
              key={index}
              onClick={() => handleDayClick(dayInfo.day, dayInfo.isCurrentMonth)}
              disabled={!dayInfo.isCurrentMonth}
              className={`
                aspect-square rounded-lg flex items-center justify-center text-sm font-medium
                transition-all relative
                ${dayInfo.isToday
                  ? 'bg-gradient-to-br from-[#d93547] to-[#9c1723] text-white font-bold shadow-lg scale-110'
                  : dayInfo.isCurrentMonth
                    ? hasContent
                      ? 'bg-[#d93547]/10 text-[#2b2520] hover:bg-[#d93547]/20 border border-[#d93547]/30'
                      : dayInfo.isPast
                        ? 'text-[#6b5a4a]/50 hover:bg-[#f8f6f0]'
                        : 'text-[#2b2520] hover:bg-[#f8f6f0]'
                    : 'text-[#6b5a4a]/30'
                }
                ${dayInfo.isCurrentMonth && !dayInfo.isToday ? 'cursor-pointer' : ''}
              `}
            >
              <span className="relative z-10">{dayInfo.day}</span>

              {/* Content indicator dot */}
              {hasContent && !dayInfo.isToday && (
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
}
