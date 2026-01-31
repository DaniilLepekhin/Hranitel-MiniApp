'use client';

import { useMemo } from 'react';
import { Calendar, ExternalLink } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';

// Анонсы по датам (формат: 'YYYY-MM-DD')
// Добавляй новые анонсы здесь
const ANNOUNCEMENTS: Record<string, {
  title: string;
  subtitle?: string;
  description: string[];
  link?: { url: string; text: string };
}> = {
  '2026-02-01': {
    title: 'Первый день марафона «Код Денег» уже сегодня в 19:00 мск',
    subtitle: 'Эфир с Кристиной Егиазаровой в 19:00 мск',
    description: [
      'Тема эфира: «Твой Персонаж 2026»',
      '',
      'Про что эфир:',
      '— почему деньги и реализация приходят к состоянию, а не к суете',
      '— кем ты являешься сейчас',
      '— кем тебе важно стать в 2026',
      '— как выглядит твоя новая версия',
    ],
    link: {
      url: 'https://ishodniy-kod.com/pl/webinar/show?id=3243860',
      text: 'Перейти на эфир',
    },
  },
  '2026-02-02': {
    title: 'Продолжение марафона сегодня в 19:00 мск',
    subtitle: 'Второй день марафона «Код Денег»',
    description: [
      'Эфир с Кристиной Егиазаровой',
      'Тема эфира: «Новая версия тебя»',
      '',
      'Про что эфир:',
      '— где ты живёшь из напряжения',
      '— где — из привычки',
      '— а где уже готова жить иначе',
    ],
    link: {
      url: 'https://ishodniy-kod.com/pl/webinar/show?id=3243861',
      text: 'Перейти на эфир',
    },
  },
  '2026-02-03': {
    title: 'Третий день марафона «Код денег» сегодня в 19:00 мск',
    subtitle: 'Эфир с Кристиной Егиазаровой',
    description: [
      'Тема эфира: «Самозванец — точка роста»',
      '',
      'Про что эфир:',
      '— почему сомнения приходят перед расширением',
      '— что на самом деле значит «мне страшно»',
      '— как не сливаться, когда ты выходишь на новый уровень',
    ],
    link: {
      url: 'https://ishodniy-kod.com/pl/webinar/show?id=3243862',
      text: 'Перейти на эфир',
    },
  },
  '2026-02-04': {
    title: 'Завершающий эфир марафона «Код денег» в 19:00 мск',
    subtitle: 'Эфир с Кристиной Егиазаровой',
    description: [
      'Тема эфира: «Как опереться на себя»',
      '',
      'Про что эфир:',
      '— почему нельзя всё время жить на силе воли',
      '— где брать устойчивость внутри',
      '— как перестать зависеть от внешних оценок',
    ],
    link: {
      url: 'https://ishodniy-kod.com/pl/webinar/show?id=3243863',
      text: 'Перейти на эфир',
    },
  },
};

/**
 * Получить текущую дату по Москве в формате YYYY-MM-DD
 */
function getMoscowDateString(): string {
  const now = new Date();
  // Московское время = UTC+3
  const moscowOffset = 3 * 60; // минуты
  const localOffset = now.getTimezoneOffset(); // минуты (отрицательное для востока от UTC)
  const moscowTime = new Date(now.getTime() + (moscowOffset + localOffset) * 60 * 1000);

  const year = moscowTime.getFullYear();
  const month = String(moscowTime.getMonth() + 1).padStart(2, '0');
  const day = String(moscowTime.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Форматировать дату для отображения
 */
function formatDateForDisplay(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];
  return `${day} ${months[month - 1]}`;
}

export function DailyAnnouncement() {
  const { haptic, webApp } = useTelegram();

  // Получаем анонс на сегодня по МСК
  const todayAnnouncement = useMemo(() => {
    const todayMsk = getMoscowDateString();
    const announcement = ANNOUNCEMENTS[todayMsk];

    if (!announcement) return null;

    return {
      ...announcement,
      date: todayMsk,
      dateFormatted: formatDateForDisplay(todayMsk),
    };
  }, []);

  // Если нет анонса на сегодня - ничего не показываем
  if (!todayAnnouncement) {
    return null;
  }

  const handleLinkClick = () => {
    if (todayAnnouncement.link) {
      haptic.impact('light');
      // Открываем ссылку
      if (webApp) {
        webApp.openLink(todayAnnouncement.link.url);
      } else {
        window.open(todayAnnouncement.link.url, '_blank');
      }
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
      {/* Заголовок с датой */}
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
          Сегодня, {todayAnnouncement.dateFormatted}
        </span>
      </div>

      {/* Контент */}
      <div className="p-4">
        {/* Заголовок */}
        <h3
          style={{
            fontFamily: 'Gilroy, sans-serif',
            fontWeight: 700,
            fontSize: '16px',
            color: '#2d2620',
            marginBottom: todayAnnouncement.subtitle ? '4px' : '12px',
            lineHeight: 1.3,
          }}
        >
          {todayAnnouncement.title}
        </h3>

        {/* Подзаголовок */}
        {todayAnnouncement.subtitle && (
          <p
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontWeight: 600,
              fontSize: '14px',
              color: '#d93547',
              marginBottom: '12px',
              fontStyle: 'italic',
            }}
          >
            {todayAnnouncement.subtitle}
          </p>
        )}

        {/* Описание */}
        <div className="space-y-1">
          {todayAnnouncement.description.map((line, index) => (
            <p
              key={index}
              style={{
                fontFamily: 'Gilroy, sans-serif',
                fontWeight: line.startsWith('—') ? 400 : 500,
                fontSize: '13px',
                color: line.startsWith('—') ? '#6b5a4a' : '#2d2620',
                lineHeight: 1.5,
                minHeight: line === '' ? '8px' : 'auto',
              }}
            >
              {line}
            </p>
          ))}
        </div>

        {/* Кнопка со ссылкой */}
        {todayAnnouncement.link && (
          <button
            onClick={handleLinkClick}
            className="mt-4 w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg active:scale-[0.98] transition-transform"
            style={{
              background: 'linear-gradient(243.413deg, rgb(174, 30, 43) 15.721%, rgb(156, 23, 35) 99.389%)',
            }}
          >
            <span
              style={{
                fontFamily: 'Gilroy, sans-serif',
                fontWeight: 600,
                fontSize: '14px',
                color: '#f7f1e8',
              }}
            >
              {todayAnnouncement.link.text}
            </span>
            <ExternalLink className="w-4 h-4" style={{ color: '#f7f1e8' }} />
          </button>
        )}
      </div>
    </div>
  );
}
