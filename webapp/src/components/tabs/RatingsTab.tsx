'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTelegram } from '@/hooks/useTelegram';
import { useAuthStore } from '@/store/auth';
import { gamificationApi, energiesApi } from '@/lib/api';

// Моки для городов и десяток (пока нет API)
const mockCityRatings = [
  { city: 'г. Москва', score: 1 },
  { city: 'г. Санкт-Петербург', score: 2 },
  { city: 'г. Казань', score: 3 },
  { city: 'г. Новосибирск', score: 4 },
  { city: 'г. Екатеринбург', score: 5 },
];

const mockTeamRatings = [
  { name: 'Десятка №1', score: 1 },
  { name: 'Десятка №2', score: 2 },
  { name: 'Десятка №3', score: 3 },
  { name: 'Десятка №4', score: 4 },
  { name: 'Десятка №5', score: 5 },
];

interface RatingsTabProps {
  onShopClick?: () => void;
}

export function RatingsTab({ onShopClick }: RatingsTabProps) {
  const { haptic, webApp } = useTelegram();
  const { user, token } = useAuthStore();
  const [showFullLeaderboard, setShowFullLeaderboard] = useState(false);
  const [showFullCityRatings, setShowFullCityRatings] = useState(false);
  const [showFullTeamRatings, setShowFullTeamRatings] = useState(false);

  // Вычисляем staleTime до следующего дня 00:01 МСК
  const getStaleTimeUntilMidnight = () => {
    const now = new Date();
    const midnight = new Date(now);
    // 00:01 МСК = 21:01 UTC (предыдущего дня)
    midnight.setUTCHours(21, 1, 0, 0);

    // Если сейчас уже после 21:01 UTC, берем следующий день
    if (now.getTime() >= midnight.getTime()) {
      midnight.setUTCDate(midnight.getUTCDate() + 1);
    }

    return midnight.getTime() - now.getTime();
  };

  // Получаем баланс энергий пользователя
  const { data: balanceData } = useQuery({
    queryKey: ['energies-balance', user?.id],
    queryFn: () => energiesApi.getBalance(user!.id),
    enabled: !!user && !!token,
    retry: false,
    staleTime: getStaleTimeUntilMidnight(),
  });

  // Получаем общий рейтинг (только пользователи с активной подпиской)
  const { data: leaderboardData } = useQuery({
    queryKey: ['leaderboard', showFullLeaderboard ? 50 : 10],
    queryFn: () => gamificationApi.leaderboard(showFullLeaderboard ? 50 : 10),
    enabled: !!user && !!token,
    retry: false,
    staleTime: getStaleTimeUntilMidnight(),
  });

  const userBalance = balanceData?.balance || 0;
  const leaderboard = leaderboardData?.leaderboard || [];

  // Находим позицию пользователя в рейтинге
  const userRank = leaderboard.findIndex(entry => entry.id === user?.id) + 1 || 32;
  const userCityRank = 10; // TODO: Подключить реальный API
  const userTeamRank = 10; // TODO: Подключить реальный API

  const openLink = (url: string) => {
    haptic.impact('light');
    if (webApp?.openLink) {
      webApp.openLink(url);
    } else {
      window.open(url, '_blank');
    }
  };

  const displayedLeaderboard = leaderboard;

  return (
    <div className="min-h-screen w-full bg-[#f7f1e8] relative">
      {/* ===== ФОН ===== */}
      <div
        className="fixed pointer-events-none overflow-hidden bg-[#f7f1e8]"
        style={{
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%',
        }}
      >
        {/* Газетная текстура */}
        <div
          className="absolute"
          style={{
            width: '250%',
            height: '250%',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%) rotate(-60.8deg)',
            opacity: 0.18,
            mixBlendMode: 'overlay',
          }}
        >
          <img
            src="/assets/newspaper-texture.jpg"
            alt=""
            className="w-full h-full object-cover"
          />
        </div>

        {/* Монеты/молоток слева */}
        <div
          className="absolute"
          style={{
            width: '160%',
            height: '120%',
            left: '-50%',
            top: '-10%',
            mixBlendMode: 'multiply',
            opacity: 0.4,
          }}
        >
          <img
            src="/assets/bg-coins.jpg"
            alt=""
            className="w-full h-full object-cover object-left-top"
          />
        </div>

        {/* Размытое цветное пятно - слева внизу */}
        <div
          className="absolute"
          style={{
            width: '150%',
            height: '130%',
            left: '-80%',
            bottom: '-30%',
            mixBlendMode: 'color-dodge',
            filter: 'blur(200px)',
            transform: 'rotate(-22.76deg)',
            opacity: 0.5,
          }}
        >
          <img
            src="/assets/bg-blur.jpg"
            alt=""
            className="w-full h-full object-cover"
          />
        </div>

        {/* Размытое цветное пятно - справа вверху */}
        <div
          className="absolute"
          style={{
            width: '150%',
            height: '130%',
            right: '-80%',
            top: '-70%',
            mixBlendMode: 'color-dodge',
            filter: 'blur(200px)',
            transform: 'rotate(77.63deg) scaleY(-1)',
            opacity: 0.5,
          }}
        >
          <img
            src="/assets/bg-blur.jpg"
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* ===== КОНТЕНТ ===== */}
      <div className="relative z-10 pt-[23px] pb-28 max-w-2xl mx-auto" style={{ paddingLeft: '29px', paddingRight: '29px' }}>

        {/* Иконка рейтинга - бордовый цвет */}
        <div className="flex justify-center mb-4">
          <div
            style={{
              width: '37px',
              height: '37px',
              backgroundColor: '#9c1723',
              WebkitMaskImage: 'url(/assets/ratings-icon.png)',
              WebkitMaskSize: 'contain',
              WebkitMaskRepeat: 'no-repeat',
              WebkitMaskPosition: 'center',
              maskImage: 'url(/assets/ratings-icon.png)',
              maskSize: 'contain',
              maskRepeat: 'no-repeat',
              maskPosition: 'center',
            }}
          />
        </div>

        {/* Подзаголовок */}
        <p
          className="text-center"
          style={{
            fontFamily: '"TT Nooks", Georgia, serif',
            fontWeight: 300,
            fontSize: '23.9px',
            lineHeight: 0.95,
            letterSpacing: '-1.43px',
            color: '#2d2620',
            marginBottom: '4px',
          }}
        >
          Здесь ты видишь свой
        </p>

        {/* Заголовок */}
        <h1
          className="text-center"
          style={{
            fontFamily: '"TT Nooks", Georgia, serif',
            fontWeight: 300,
            fontSize: '45.4px',
            lineHeight: 0.95,
            letterSpacing: '-2.73px',
            color: '#2d2620',
            marginBottom: '16px',
          }}
        >
          прогресс в клубе:
        </h1>

        {/* Описание */}
        <p
          className="text-center"
          style={{
            fontFamily: 'Gilroy, sans-serif',
            fontWeight: 400,
            fontSize: '13px',
            lineHeight: 1.45,
            letterSpacing: '-0.26px',
            color: '#2d2620',
            marginBottom: '24px',
            maxWidth: '317px',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          Баллы за активность, участие и рост.{' '}
          <span style={{ fontWeight: 700 }}>
            Баллы можно копить, использовать и отслеживать своё движение
          </span>{' '}
          вместе с другими участниками
        </p>

        {/* ===== БЛОК ТЕКУЩИЙ БАЛАНС ===== */}
        <div
          className="relative overflow-hidden mb-6"
          style={{
            borderRadius: '5.73px',
            background: 'linear-gradient(256.35deg, rgb(174, 30, 43) 15.72%, rgb(156, 23, 35) 99.39%)',
            height: '93px',
          }}
        >
          <div className="flex items-center justify-between h-full px-4">
            {/* Левая часть */}
            <div style={{ maxWidth: '50%' }}>
              <p
                style={{
                  fontFamily: '"TT Nooks", Georgia, serif',
                  fontWeight: 300,
                  fontSize: '21.6px',
                  color: '#f7f1e8',
                  marginBottom: '4px',
                }}
              >
                Текущий баланс
              </p>
              <p
                style={{
                  fontFamily: 'Gilroy, sans-serif',
                  fontWeight: 700,
                  fontSize: '10px',
                  lineHeight: 1.4,
                  color: '#f7f1e8',
                }}
              >
                Твой личный счёт в клубе.{' '}
                <span style={{ fontWeight: 400 }}>
                  Энергии (баллы) отражают твою активность и движение вперёд
                </span>
              </p>
            </div>

            {/* Правая часть - баланс */}
            <div className="text-right">
              <p
                style={{
                  fontFamily: 'Gilroy, sans-serif',
                  fontWeight: 600,
                  fontSize: '46.4px',
                  color: '#f7f1e8',
                  lineHeight: 1,
                }}
              >
                {userBalance}
              </p>
              <p
                style={{
                  fontFamily: 'Gilroy, sans-serif',
                  fontWeight: 400,
                  fontSize: '18.6px',
                  color: '#f7f1e8',
                }}
              >
                энергий
              </p>
            </div>
          </div>
        </div>

        {/* ===== СЕКЦИЯ ОБЩИЙ РЕЙТИНГ ===== */}
        <div className="mb-6">
          {/* Заголовок секции */}
          <div className="flex items-center gap-2 mb-2">
            <div
              style={{
                width: '17px',
                height: '17px',
                background: 'linear-gradient(262.23deg, rgb(174, 30, 43) 17.09%, rgb(156, 23, 35) 108.05%)',
                WebkitMaskImage: 'url(/assets/ratings-star-icon.png)',
                WebkitMaskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center',
                maskImage: 'url(/assets/ratings-star-icon.png)',
                maskSize: 'contain',
                maskRepeat: 'no-repeat',
                maskPosition: 'center',
              }}
            />
            <p
              style={{
                fontFamily: '"TT Nooks", Georgia, serif',
                fontWeight: 300,
                fontSize: '21px',
                lineHeight: 0.95,
                letterSpacing: '-1.26px',
                color: '#2d2620',
                textTransform: 'uppercase',
              }}
            >
              Общий рейтинг
            </p>
          </div>

          {/* Описание */}
          <p
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontWeight: 400,
              fontSize: '10px',
              lineHeight: 1.45,
              letterSpacing: '-0.2px',
              color: '#2d2620',
              marginBottom: '12px',
            }}
          >
            Общий рейтинг участников клуба — твой прогресс в общем движении.
          </p>

          {/* Разделитель */}
          <div className="w-full h-[1px] bg-[#2d2620]/20 mb-4" />

          {/* Таблица рейтинга */}
          <div className="relative">
            <div className="space-y-1">
              {displayedLeaderboard.map((entry, index) => {
                const displayName = entry.firstName && entry.lastName
                  ? `${entry.firstName} ${entry.lastName}`
                  : entry.username || 'Пользователь';
                const isCurrentUser = entry.id === user?.id;
                const energies = entry.experience || 0; // experience хранит энергии

                return (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-2"
                    style={{
                      fontFamily: 'Gilroy, sans-serif',
                      fontWeight: isCurrentUser ? 700 : 400,
                      fontSize: '14px',
                      lineHeight: 1.45,
                      letterSpacing: '-0.28px',
                      color: isCurrentUser ? '#9c1723' : '#2d2620',
                    }}
                  >
                    <span className="flex-1 truncate">
                      {displayName}
                    </span>
                    <span style={{ fontWeight: isCurrentUser ? 700 : 400, minWidth: '80px', textAlign: 'right' }}>
                      {energies.toLocaleString('ru-RU')} ⚡
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Градиент для fade эффекта если не развернуто */}
            {!showFullLeaderboard && (
              <div
                className="absolute bottom-0 left-0 right-0 pointer-events-none"
                style={{
                  height: '100px',
                  background: 'linear-gradient(to bottom, rgba(247,241,232,0) 0%, #f7f1e8 100%)',
                }}
              />
            )}
          </div>

          {/* Кнопка Ваше место и Развернуть */}
          <div className="flex items-center gap-4 mt-4">
            <button
              className="px-4 py-2 rounded-[5.73px]"
              style={{
                background: 'linear-gradient(230.38deg, rgb(174, 30, 43) 15.72%, rgb(156, 23, 35) 99.39%)',
                border: '0.955px solid #d93547',
                fontFamily: 'Gilroy, sans-serif',
                fontWeight: 700,
                fontSize: '14px',
                color: 'white',
              }}
            >
              Ваше место: {userRank}
            </button>
            <button
              onClick={() => {
                haptic.selection();
                setShowFullLeaderboard(!showFullLeaderboard);
              }}
              style={{
                fontFamily: 'Gilroy, sans-serif',
                fontWeight: 400,
                fontSize: '11px',
                color: '#2d2620',
                textDecoration: 'underline',
              }}
            >
              {showFullLeaderboard ? 'Свернуть таблицу' : 'Развернуть таблицу'}
            </button>
          </div>
        </div>

        {/* ===== СЕКЦИЯ РЕЙТИНГ ГОРОДА И ДЕСЯТОК ===== */}
        <div className="mb-6">
          {/* Заголовок секции */}
          <div className="flex items-center gap-2 mb-2">
            <div
              style={{
                width: '17px',
                height: '17px',
                background: 'linear-gradient(262.23deg, rgb(174, 30, 43) 17.09%, rgb(156, 23, 35) 108.05%)',
                WebkitMaskImage: 'url(/assets/ratings-star-icon.png)',
                WebkitMaskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center',
                maskImage: 'url(/assets/ratings-star-icon.png)',
                maskSize: 'contain',
                maskRepeat: 'no-repeat',
                maskPosition: 'center',
              }}
            />
            <p
              style={{
                fontFamily: '"TT Nooks", Georgia, serif',
                fontWeight: 300,
                fontSize: '21px',
                lineHeight: 0.95,
                letterSpacing: '-1.26px',
                color: '#2d2620',
              }}
            >
              Рейтинг города и десяток
            </p>
          </div>

          {/* Описание */}
          <p
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontWeight: 400,
              fontSize: '10px',
              lineHeight: 1.45,
              letterSpacing: '-0.2px',
              color: '#2d2620',
              marginBottom: '12px',
              maxWidth: '217px',
            }}
          >
            Рейтинг внутри твоего города или десятки. Малые шаги, которые дают большой рост.
          </p>

          {/* Разделитель */}
          <div className="w-full h-[1px] bg-[#2d2620]/20 mb-4" />

          {/* Две карточки рядом */}
          <div className="grid grid-cols-2 gap-[10px]">
            {/* Рейтинг городов */}
            <div
              className="relative overflow-hidden"
              style={{
                borderRadius: '5.73px',
                border: '0.955px solid #d93547',
                background: 'linear-gradient(256.06deg, rgb(174, 30, 43) 15.72%, rgb(156, 23, 35) 99.39%)',
                height: '157px',
              }}
            >
              <div className="p-3">
                <p
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontWeight: 700,
                    fontSize: '14px',
                    color: '#f7f1e8',
                    marginBottom: '8px',
                  }}
                >
                  Рейтинг городов
                </p>

                {/* Разделитель */}
                <div className="w-full h-[1px] bg-white/20 mb-2" />

                {/* Список городов */}
                <div className="space-y-0.5">
                  {mockCityRatings.map((item) => (
                    <div
                      key={item.city}
                      className="flex items-center justify-between"
                      style={{
                        fontFamily: 'Gilroy, sans-serif',
                        fontWeight: 400,
                        fontSize: '10px',
                        color: '#f7f1e8',
                      }}
                    >
                      <span>{item.city} {'....................................'.slice(0, 20)}</span>
                      <span>{String(item.score).padStart(2, '0')}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Кнопка места города */}
              <div
                className="absolute bottom-2 left-2 right-2 py-1 rounded-[5.73px] text-center"
                style={{
                  background: '#f7f1e8',
                  border: '0.955px solid #d93547',
                }}
              >
                <p
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontWeight: 700,
                    fontSize: '10.6px',
                    color: '#b82131',
                  }}
                >
                  Место вашего города: {userCityRank}
                </p>
              </div>
            </div>

            {/* Рейтинг десяток */}
            <div
              className="relative overflow-hidden"
              style={{
                borderRadius: '5.73px',
                border: '0.955px solid #d93547',
                background: 'linear-gradient(256.06deg, rgb(174, 30, 43) 15.72%, rgb(156, 23, 35) 99.39%)',
                height: '157px',
              }}
            >
              <div className="p-3">
                <p
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontWeight: 700,
                    fontSize: '14px',
                    color: '#f7f1e8',
                    marginBottom: '8px',
                  }}
                >
                  Рейтинг десяток
                </p>

                {/* Разделитель */}
                <div className="w-full h-[1px] bg-white/20 mb-2" />

                {/* Список десяток */}
                <div className="space-y-0.5">
                  {mockTeamRatings.map((item) => (
                    <div
                      key={item.name}
                      className="flex items-center justify-between"
                      style={{
                        fontFamily: 'Gilroy, sans-serif',
                        fontWeight: 400,
                        fontSize: '10px',
                        color: '#f7f1e8',
                      }}
                    >
                      <span>{item.name} {'..................................'.slice(0, 18)}</span>
                      <span>{String(item.score).padStart(2, '0')}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Кнопка места десятки */}
              <div
                className="absolute bottom-2 left-2 right-2 py-1 rounded-[5.73px] text-center"
                style={{
                  background: '#f7f1e8',
                  border: '0.955px solid #d93547',
                }}
              >
                <p
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontWeight: 700,
                    fontSize: '10.6px',
                    color: '#b82131',
                  }}
                >
                  Место вашей десятки: {userTeamRank}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ===== БЛОК МАГАЗИН ЭНЕРГИЙ ===== */}
        <div
          className="relative overflow-hidden mb-6"
          style={{
            borderRadius: '5.73px',
            border: '0.955px solid #d93547',
            background: 'linear-gradient(242.61deg, rgb(174, 30, 43) 15.72%, rgb(156, 23, 35) 99.39%)',
            height: '155px',
          }}
        >
          {/* Фоновое изображение справа */}
          <div
            className="absolute"
            style={{
              right: '0',
              top: '0',
              bottom: '0',
              width: '117px',
              borderRadius: '10px',
              overflow: 'hidden',
            }}
          >
            <img
              src="/assets/ratings-shop-bg.jpg"
              alt=""
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          </div>

          {/* Контент слева */}
          <div className="relative z-10 p-4" style={{ maxWidth: '55%' }}>
            <p
              style={{
                fontFamily: '"TT Nooks", Georgia, serif',
                fontWeight: 300,
                fontSize: '19.4px',
                lineHeight: 1.05,
                color: '#f7f1e8',
                marginBottom: '4px',
              }}
            >
              Магазин энергий
            </p>

            <p
              style={{
                fontFamily: 'Gilroy, sans-serif',
                fontWeight: 400,
                fontSize: '10px',
                lineHeight: 1.4,
                color: '#f7f1e8',
                marginBottom: '16px',
              }}
            >
              Здесь ты можешь обменивать баллы{' '}
              <span style={{ fontWeight: 700 }}>на бонусы, подарки и возможности клуба</span>
            </p>

            <button
              onClick={() => {
                haptic.impact('light');
                onShopClick?.();
              }}
              className="px-6 py-3 rounded-[5.73px] active:scale-[0.98] transition-transform"
              style={{
                background: '#f7f1e8',
                fontFamily: 'Gilroy, sans-serif',
                fontWeight: 700,
                fontSize: '11.14px',
                color: '#a81b28',
                textTransform: 'uppercase',
                border: 'none',
                boxShadow: '0 4px 12px rgba(33, 23, 10, 0.3)',
              }}
            >
              перейти в магазин
            </button>
          </div>
        </div>

        {/* ===== СЕКЦИЯ КАК НАЧИСЛЯЮТСЯ БАЛЛЫ ===== */}
        <div className="mb-6">
          {/* Разделитель */}
          <div className="w-full h-[1px] bg-[#2d2620]/20 mb-4" />

          {/* Иконка по центру */}
          <div className="flex justify-center mb-2">
            <div
              style={{
                width: '17px',
                height: '17px',
                background: 'linear-gradient(262.23deg, rgb(174, 30, 43) 17.09%, rgb(156, 23, 35) 108.05%)',
                WebkitMaskImage: 'url(/assets/ratings-info-icon.png)',
                WebkitMaskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center',
                maskImage: 'url(/assets/ratings-info-icon.png)',
                maskSize: 'contain',
                maskRepeat: 'no-repeat',
                maskPosition: 'center',
              }}
            />
          </div>

          {/* Заголовок */}
          <p
            className="text-center"
            style={{
              fontFamily: '"TT Nooks", Georgia, serif',
              fontWeight: 300,
              fontSize: '21px',
              lineHeight: 0.95,
              letterSpacing: '-1.26px',
              color: '#2d2620',
              marginBottom: '8px',
            }}
          >
            Как начисляются баллы
          </p>

          {/* Описание */}
          <p
            className="text-center"
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontWeight: 400,
              fontSize: '10px',
              lineHeight: 1.45,
              letterSpacing: '-0.2px',
              color: '#2d2620',
              marginBottom: '16px',
              maxWidth: '269px',
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            мы подготовили документ, где описали основные правила и возможности получений баллов
          </p>

          {/* Кнопка */}
          <div className="flex justify-center">
            <button
              onClick={() => {
                haptic.impact('light');
                // TODO: открыть документ
              }}
              className="px-8 py-3 rounded-[5.73px] active:scale-[0.98] transition-transform"
              style={{
                background: 'linear-gradient(256.35deg, rgb(174, 30, 43) 15.72%, rgb(156, 23, 35) 99.39%)',
                fontFamily: 'Gilroy, sans-serif',
                fontWeight: 700,
                fontSize: '11.14px',
                color: '#f7f1e8',
                textTransform: 'uppercase',
                border: 'none',
                boxShadow: '0 4px 12px rgba(33, 23, 10, 0.3)',
              }}
            >
              ознакомиться
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
