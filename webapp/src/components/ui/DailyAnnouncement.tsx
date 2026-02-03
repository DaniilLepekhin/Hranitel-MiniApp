'use client';

import { useState } from 'react';
import { Calendar, ExternalLink, ChevronDown } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';

// Анонс марафона «Код Денег» (только день 4, дни 1-3 уже в записях эфиров)
const MARATHON_DAYS = [
  {
    date: '4 февраля',
    time: '19:00',
    dayNumber: 4,
    title: 'Как опереться на себя',
    points: [
      'почему нельзя всё время жить на силе воли',
      'где брать устойчивость внутри',
      'как перестать зависеть от внешних оценок',
    ],
    link: 'https://ishodniy-kod.com/pl/webinar/show?id=3243863',
  },
];

export function DailyAnnouncement() {
  const { haptic, webApp } = useTelegram();
  const [expandedDay, setExpandedDay] = useState<number | null>(null);

  const handleLinkClick = (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    haptic.impact('light');
    if (webApp) {
      webApp.openLink(url);
    } else {
      window.open(url, '_blank');
    }
  };

  const toggleDay = (dayNumber: number) => {
    haptic.impact('light');
    setExpandedDay(expandedDay === dayNumber ? null : dayNumber);
  };

  return (
    <div
      className="w-full mb-6"
      style={{
        borderRadius: '12px',
        border: '2px solid #d93547',
        background: 'linear-gradient(135deg, rgba(217, 53, 71, 0.08) 0%, rgba(156, 23, 35, 0.12) 100%)',
        overflow: 'hidden',
      }}
    >
      {/* Заголовок */}
      <div
        className="px-4 py-3 flex items-center gap-2"
        style={{
          background: 'linear-gradient(243.413deg, rgb(174, 30, 43) 15.721%, rgb(156, 23, 35) 99.389%)',
        }}
      >
        <Calendar className="w-4 h-4 text-white/80" />
        <span
          style={{
            fontFamily: 'Gilroy, sans-serif',
            fontWeight: 600,
            fontSize: '12px',
            color: 'rgba(255,255,255,0.8)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Марафон «Код Денег» • 4 февраля
        </span>
      </div>

      {/* Контент */}
      <div className="p-3">
        {/* Список дней - аккордеон */}
        <div className="space-y-2">
          {MARATHON_DAYS.map((day) => {
            const isExpanded = expandedDay === day.dayNumber;

            return (
              <div
                key={day.dayNumber}
                className="rounded-lg overflow-hidden"
                style={{
                  background: 'rgba(255, 255, 255, 0.6)',
                  border: isExpanded ? '1px solid rgba(217, 53, 71, 0.3)' : '1px solid rgba(217, 53, 71, 0.1)',
                }}
              >
                {/* Заголовок дня - кликабельный */}
                <div
                  className="flex items-center justify-between gap-2 p-3 cursor-pointer active:bg-white/50 transition-colors"
                  onClick={() => toggleDay(day.dayNumber)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Номер дня */}
                    <div
                      className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
                      style={{
                        background: 'linear-gradient(243.413deg, rgb(174, 30, 43) 15.721%, rgb(156, 23, 35) 99.389%)',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'Gilroy, sans-serif',
                          fontWeight: 700,
                          fontSize: '12px',
                          color: '#fff',
                        }}
                      >
                        {day.dayNumber}
                      </span>
                    </div>

                    {/* Название */}
                    <div className="min-w-0 flex-1">
                      <h4
                        style={{
                          fontFamily: 'Gilroy, sans-serif',
                          fontWeight: 600,
                          fontSize: '13px',
                          color: '#2d2620',
                          lineHeight: 1.3,
                        }}
                      >
                        {day.title}
                      </h4>
                      <span
                        style={{
                          fontFamily: 'Gilroy, sans-serif',
                          fontWeight: 500,
                          fontSize: '11px',
                          color: '#9c8b7a',
                        }}
                      >
                        {day.date} в {day.time} мск
                      </span>
                    </div>
                  </div>

                  {/* Стрелка */}
                  <ChevronDown
                    className="w-5 h-5 flex-shrink-0 transition-transform duration-200"
                    style={{
                      color: '#d93547',
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                  />
                </div>

                {/* Раскрывающийся контент */}
                <div
                  className="overflow-hidden transition-all duration-200"
                  style={{
                    maxHeight: isExpanded ? '300px' : '0px',
                    opacity: isExpanded ? 1 : 0,
                  }}
                >
                  <div className="px-3 pb-3 pt-0">
                    {/* Разделитель */}
                    <div className="h-[1px] bg-[#d93547]/10 mb-3" />

                    {/* Пункты */}
                    <div className="space-y-1 mb-3">
                      {day.points.map((point, idx) => (
                        <p
                          key={idx}
                          style={{
                            fontFamily: 'Gilroy, sans-serif',
                            fontWeight: 400,
                            fontSize: '12px',
                            color: '#6b5a4a',
                            lineHeight: 1.4,
                            paddingLeft: '12px',
                            position: 'relative',
                          }}
                        >
                          <span style={{ position: 'absolute', left: 0 }}>—</span>
                          {point}
                        </p>
                      ))}
                    </div>

                    {/* Кнопка перехода */}
                    <button
                      onClick={(e) => handleLinkClick(e, day.link)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg active:scale-[0.98] transition-transform"
                      style={{
                        background: 'linear-gradient(243.413deg, rgb(174, 30, 43) 15.721%, rgb(156, 23, 35) 99.389%)',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'Gilroy, sans-serif',
                          fontWeight: 600,
                          fontSize: '13px',
                          color: '#f7f1e8',
                        }}
                      >
                        Перейти на эфир
                      </span>
                      <ExternalLink className="w-4 h-4" style={{ color: '#f7f1e8' }} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
