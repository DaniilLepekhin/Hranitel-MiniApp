'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, BookOpen, Headphones, Radio, Sparkles, ChevronRight, TrendingUp } from 'lucide-react';
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
  const currentDate = new Date();
  const currentMonth = currentDate.toLocaleDateString('ru-RU', { month: 'long' });
  const currentYear = currentDate.getFullYear();

  // Group items by weeks
  const getDayOfMonth = () => currentDate.getDate();
  const daysInMonth = new Date(currentYear, currentDate.getMonth() + 1, 0).getDate();
  const currentDay = getDayOfMonth();
  const weeksInMonth = Math.ceil(daysInMonth / 7);

  const getWeekLabel = (weekNum: number) => {
    const startDay = (weekNum - 1) * 7 + 1;
    const endDay = Math.min(weekNum * 7, daysInMonth);
    return `${startDay}-${endDay} ${currentMonth}`;
  };

  // Distribute items across weeks
  const itemsPerWeek = Math.ceil(items.length / weeksInMonth);
  const weeklyItems = Array.from({ length: weeksInMonth }, (_, i) => {
    const start = i * itemsPerWeek;
    const end = start + itemsPerWeek;
    return {
      weekNum: i + 1,
      label: getWeekLabel(i + 1),
      items: items.slice(start, end),
      isCurrentWeek: currentDay >= (i * 7 + 1) && currentDay <= Math.min((i + 1) * 7, daysInMonth),
    };
  });

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
          <h1 className="text-xl font-bold text-[#3d2f1f] capitalize">{currentMonth} {currentYear}</h1>
        </div>
      </div>

      {/* Hero Card with Calendar */}
      <Card className="p-6 mb-6 bg-gradient-to-br from-[#8b0000]/20 to-[#8b4513]/20 border-2 border-[#8b0000]">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#8b0000] to-[#8b4513] flex items-center justify-center shadow-lg">
            <div className="text-center">
              <div className="text-white text-2xl font-bold leading-none">{currentDay}</div>
              <div className="text-white/80 text-xs uppercase">{currentMonth.slice(0, 3)}</div>
            </div>
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-[#3d2f1f] mb-1">Программа месяца</h2>
            <p className="text-[#6b5a4a] text-sm">{items.length} материалов на {weeksInMonth} недели</p>
          </div>
        </div>
        <p className="text-[#6b5a4a] leading-relaxed text-sm">
          Структурированный план обучения. Следуйте программе неделя за неделей для последовательного развития.
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
          <div className="grid grid-cols-3 gap-3 mb-6">
            <Card className="p-4 text-center bg-gradient-to-br from-[#8b0000]/10 to-[#8b4513]/10">
              <p className="text-2xl font-bold text-[#3d2f1f] mb-1">
                {items.filter(i => i.type === 'course').length}
              </p>
              <p className="text-[#6b5a4a] text-xs">Курсов</p>
            </Card>
            <Card className="p-4 text-center bg-gradient-to-br from-[#8b0000]/10 to-[#8b4513]/10">
              <p className="text-2xl font-bold text-[#3d2f1f] mb-1">
                {items.filter(i => i.type === 'practice').length}
              </p>
              <p className="text-[#6b5a4a] text-xs">Практик</p>
            </Card>
            <Card className="p-4 text-center bg-gradient-to-br from-[#8b0000]/10 to-[#8b4513]/10">
              <p className="text-2xl font-bold text-[#3d2f1f] mb-1">
                {items.filter(i => i.type === 'podcast' || i.type === 'stream_record').length}
              </p>
              <p className="text-[#6b5a4a] text-xs">Эфиров</p>
            </Card>
          </div>

          {/* Weekly Schedule */}
          <h3 className="font-bold text-[#3d2f1f] text-lg mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[#8b0000]" />
            Расписание по неделям
          </h3>

          <div className="space-y-4">
            {weeklyItems.map((week) => (
              <Card
                key={week.weekNum}
                className={`p-5 ${
                  week.isCurrentWeek
                    ? 'bg-gradient-to-br from-[#8b0000]/20 to-[#8b4513]/20 border-2 border-[#8b0000]'
                    : 'bg-white/80'
                }`}
              >
                {/* Week Header */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-[#8b0000] font-semibold uppercase">
                        Неделя {week.weekNum}
                      </span>
                      {week.isCurrentWeek && (
                        <span className="px-2 py-0.5 rounded-full bg-[#8b0000] text-white text-xs font-semibold">
                          Текущая
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[#6b5a4a]">{week.label}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-[#3d2f1f]">{week.items.length}</p>
                    <p className="text-xs text-[#6b5a4a]">материалов</p>
                  </div>
                </div>

                {/* Week Items */}
                {week.items.length > 0 ? (
                  <div className="space-y-3">
                    {week.items.map((item, index) => {
                      const Icon = getIcon(item.type);

                      return (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 p-3 rounded-xl bg-white/60 hover:bg-white/80 transition-all cursor-pointer"
                          onClick={() => handleItemClick(item.id)}
                        >
                          {/* Day Number */}
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#8b0000] to-[#8b4513] flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-xs font-bold">
                              {(week.weekNum - 1) * 7 + index + 1}
                            </span>
                          </div>

                          {/* Icon */}
                          <div className="w-10 h-10 rounded-lg bg-[#8b4513]/20 flex items-center justify-center flex-shrink-0">
                            <Icon className="w-5 h-5 text-[#8b0000]" />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <span className="text-xs text-[#8b0000] font-semibold uppercase">
                              {getTypeLabel(item.type)}
                            </span>
                            <h4 className="font-semibold text-[#3d2f1f] text-sm line-clamp-1">
                              {item.title}
                            </h4>
                          </div>

                          {/* Arrow */}
                          <ChevronRight className="w-4 h-4 text-[#8b4513] flex-shrink-0" />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-[#6b5a4a] text-center py-2">Нет материалов на эту неделю</p>
                )}
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Info Card */}
      <Card className="mt-6 p-4 bg-gradient-to-r from-[#8b0000]/10 to-[#8b4513]/10 border-[#8b4513]/30">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-[#8b0000] flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-[#3d2f1f] mb-1">💎 Системный подход к развитию</p>
            <p className="text-[#6b5a4a] text-sm leading-relaxed">
              Следуйте программе последовательно, неделя за неделей. Каждый материал подобран для максимального эффекта и синергии с другими элементами программы.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
