'use client';

import { Calendar, ExternalLink } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';

// Все анонсы марафона «Код Денег»
const MARATHON_DAYS = [
  {
    date: '1 февраля',
    dayNumber: 1,
    title: 'Твой Персонаж 2026',
    points: [
      'почему деньги и реализация приходят к состоянию, а не к суете',
      'кем ты являешься сейчас',
      'кем тебе важно стать в 2026',
      'как выглядит твоя новая версия',
    ],
    link: 'https://ishodniy-kod.com/pl/webinar/show?id=3243860',
  },
  {
    date: '2 февраля',
    dayNumber: 2,
    title: 'Новая версия тебя',
    points: [
      'где ты живёшь из напряжения',
      'где — из привычки',
      'а где уже готова жить иначе',
    ],
    link: 'https://ishodniy-kod.com/pl/webinar/show?id=3243861',
  },
  {
    date: '3 февраля',
    dayNumber: 3,
    title: 'Самозванец — точка роста',
    points: [
      'почему сомнения приходят перед расширением',
      'что на самом деле значит «мне страшно»',
      'как не сливаться, когда ты выходишь на новый уровень',
    ],
    link: 'https://ishodniy-kod.com/pl/webinar/show?id=3243862',
  },
  {
    date: '4 февраля',
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

  const handleLinkClick = (url: string) => {
    haptic.impact('light');
    if (webApp) {
      webApp.openLink(url);
    } else {
      window.open(url, '_blank');
    }
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
          Марафон «Код Денег» • 1–4 февраля
        </span>
      </div>

      {/* Контент */}
      <div className="p-4">
        <p
          style={{
            fontFamily: 'Gilroy, sans-serif',
            fontWeight: 500,
            fontSize: '13px',
            color: '#6b5a4a',
            marginBottom: '12px',
          }}
        >
          Эфиры с Кристиной Егиазаровой каждый день в 19:00 мск
        </p>

        {/* Список дней */}
        <div className="space-y-3">
          {MARATHON_DAYS.map((day) => (
            <div
              key={day.dayNumber}
              className="p-3 rounded-lg"
              style={{
                background: 'rgba(255, 255, 255, 0.5)',
                border: '1px solid rgba(217, 53, 71, 0.15)',
              }}
            >
              {/* Дата и тема */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <span
                    style={{
                      fontFamily: 'Gilroy, sans-serif',
                      fontWeight: 600,
                      fontSize: '11px',
                      color: '#d93547',
                      textTransform: 'uppercase',
                    }}
                  >
                    День {day.dayNumber} • {day.date}
                  </span>
                  <h4
                    style={{
                      fontFamily: 'Gilroy, sans-serif',
                      fontWeight: 700,
                      fontSize: '14px',
                      color: '#2d2620',
                      marginTop: '2px',
                    }}
                  >
                    {day.title}
                  </h4>
                </div>
                <button
                  onClick={() => handleLinkClick(day.link)}
                  className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full active:scale-95 transition-transform"
                  style={{
                    background: 'linear-gradient(243.413deg, rgb(174, 30, 43) 15.721%, rgb(156, 23, 35) 99.389%)',
                  }}
                >
                  <ExternalLink className="w-4 h-4" style={{ color: '#f7f1e8' }} />
                </button>
              </div>

              {/* Пункты */}
              <div className="space-y-1">
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
