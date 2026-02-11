'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTelegram } from '@/hooks/useTelegram';
import { useAuthStore } from '@/store/auth';
import { gamificationApi, energiesApi, ratingsApi } from '@/lib/api';
import { OptimizedBackground } from '@/components/ui/OptimizedBackground';
import { Clock } from 'lucide-react';

interface RatingsTabProps {
  onShopClick?: () => void;
}

export function RatingsTab({ onShopClick }: RatingsTabProps) {
  const { haptic, webApp } = useTelegram();
  const { user, token } = useAuthStore();
  const [showFullLeaderboard, setShowFullLeaderboard] = useState(false);
  const [showFullCityRatings, setShowFullCityRatings] = useState(false);
  const [showFullTeamRatings, setShowFullTeamRatings] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

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

  // 🚀 МГНОВЕННЫЙ РЕНДЕР: Получаем баланс энергий пользователя
  const { data: balanceData } = useQuery({
    queryKey: ['energies-balance', user?.id],
    queryFn: () => energiesApi.getBalance(),
    enabled: !!user && !!token,
    retry: 2,
    staleTime: getStaleTimeUntilMidnight(),
    gcTime: 24 * 60 * 60 * 1000, // 24 часа в кэше
    placeholderData: { success: true, balance: 0 }, // Показываем 0 сразу
  });

  // 🚀 Получаем историю начислений энергий (загружаем заранее для мгновенного открытия)
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['energies-history', user?.id],
    queryFn: () => energiesApi.getHistory(20), // Последние 20 транзакций
    enabled: !!user && !!token, // Загружаем сразу, не ждём открытия модального окна
    retry: 2,
    staleTime: 60 * 1000, // 1 минута
    gcTime: 5 * 60 * 1000, // 5 минут в кэше
  });

  // 🚀 МГНОВЕННЫЙ РЕНДЕР: Получаем общий рейтинг
  const { data: leaderboardData } = useQuery({
    queryKey: ['leaderboard', showFullLeaderboard ? 50 : 10],
    queryFn: () => gamificationApi.leaderboard(showFullLeaderboard ? 50 : 10),
    enabled: !!user && !!token,
    retry: 2,
    staleTime: getStaleTimeUntilMidnight(),
    gcTime: 24 * 60 * 60 * 1000, // 24 часа в кэше
    placeholderData: { success: true, leaderboard: [] }, // Показываем пустой массив сразу
  });

  // 🚀 МГНОВЕННЫЙ РЕНДЕР: Получаем рейтинг городов
  const { data: cityRatingsData } = useQuery({
    queryKey: ['city-ratings', showFullCityRatings ? 50 : 5],
    queryFn: () => ratingsApi.getCityRatings(showFullCityRatings ? 50 : 5),
    enabled: !!user && !!token,
    retry: 2,
    staleTime: getStaleTimeUntilMidnight(),
    gcTime: 24 * 60 * 60 * 1000, // 24 часа в кэше
    placeholderData: { success: true, ratings: [] }, // Показываем пустой массив сразу
  });

  // 🚀 МГНОВЕННЫЙ РЕНДЕР: Получаем рейтинг команд
  const { data: teamRatingsData } = useQuery({
    queryKey: ['team-ratings', showFullTeamRatings ? 50 : 5],
    queryFn: () => ratingsApi.getTeamRatings(showFullTeamRatings ? 50 : 5),
    enabled: !!user && !!token,
    retry: 2,
    staleTime: getStaleTimeUntilMidnight(),
    gcTime: 24 * 60 * 60 * 1000, // 24 часа в кэше
    placeholderData: { success: true, ratings: [] }, // Показываем пустой массив сразу
  });

  // 🚀 МГНОВЕННЫЙ РЕНДЕР: Получаем позицию пользователя
  const { data: userPositionData } = useQuery({
    queryKey: ['user-position', user?.id],
    queryFn: () => ratingsApi.getUserPosition(user!.id),
    enabled: !!user && !!token,
    retry: 2,
    staleTime: getStaleTimeUntilMidnight(),
    gcTime: 24 * 60 * 60 * 1000, // 24 часа в кэше
    placeholderData: { success: true, position: undefined as any }, // Показываем undefined сразу
  });

  const userBalance = balanceData?.balance || 0;
  const leaderboard = leaderboardData?.leaderboard || [];
  const cityRatings = cityRatingsData?.ratings || [];
  const teamRatings = teamRatingsData?.ratings || [];
  const userPosition = userPositionData?.position;

  // Находим позицию пользователя в рейтинге
  const userRank = userPosition?.globalRank || 0;
  const userCityRank = userPosition?.cityRank || null;
  const userTeamRank = userPosition?.teamRank || null;

  // 🚀 МЕМОИЗАЦИЯ: Функция не пересоздаётся при рендерах
  const openLink = useCallback((url: string) => {
    haptic.impact('light');
    if (webApp?.openLink) {
      webApp.openLink(url);
    } else {
      window.open(url, '_blank');
    }
  }, [haptic, webApp]);

  const displayedLeaderboard = leaderboard;

  return (
    <div className="min-h-screen w-full bg-[#f7f1e8] relative" style={{ WebkitOverflowScrolling: 'touch' }}>
      {/* 🚀 ОПТИМИЗИРОВАННЫЙ ФОН */}
      <OptimizedBackground variant="ratings" />

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
            minHeight: '115px',
          }}
        >
          <div className="flex items-center justify-between h-full px-4 py-3">
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
                  marginBottom: '8px',
                }}
              >
                Твой личный счёт в клубе.{' '}
                <span style={{ fontWeight: 400 }}>
                  Энергии (баллы) отражают твою активность и движение вперёд
                </span>
              </p>
              
              {/* Кнопка истории */}
              <button
                onClick={() => {
                  haptic.impact('light');
                  setShowHistoryModal(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[5.73px] active:scale-[0.98] transition-transform"
                style={{
                  background: 'rgba(247, 241, 232, 0.15)',
                  border: '1px solid rgba(247, 241, 232, 0.3)',
                }}
              >
                <Clock className="w-3.5 h-3.5" style={{ color: '#f7f1e8' }} />
                <span
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontWeight: 600,
                    fontSize: '10px',
                    color: '#f7f1e8',
                  }}
                >
                  История начислений
                </span>
              </button>
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
                  {cityRatings.slice(0, showFullCityRatings ? 50 : 5).map((item, index) => (
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
                      <span className="truncate">{item.city}</span>
                      <span className="ml-1">{index + 1}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Кнопки */}
              <div className="absolute bottom-2 left-2 right-2 flex gap-1">
                {userCityRank && (
                  <div
                    className="flex-1 py-1 rounded-[5.73px] text-center"
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
                      Ваш город: {userCityRank}
                    </p>
                  </div>
                )}
                {cityRatings.length > 5 && (
                  <button
                    onClick={() => {
                      haptic.selection();
                      setShowFullCityRatings(!showFullCityRatings);
                    }}
                    className="px-2 py-1 rounded-[5.73px]"
                    style={{
                      background: '#f7f1e8',
                      border: '0.955px solid #d93547',
                      fontFamily: 'Gilroy, sans-serif',
                      fontWeight: 400,
                      fontSize: '8px',
                      color: '#b82131',
                    }}
                  >
                    {showFullCityRatings ? '↑' : '↓'}
                  </button>
                )}
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
                  {teamRatings.slice(0, showFullTeamRatings ? 50 : 5).map((item, index) => (
                    <div
                      key={item.teamId}
                      className="flex items-center justify-between"
                      style={{
                        fontFamily: 'Gilroy, sans-serif',
                        fontWeight: 400,
                        fontSize: '10px',
                        color: '#f7f1e8',
                      }}
                    >
                      <span className="truncate">{item.teamName}</span>
                      <span className="ml-1">{index + 1}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Кнопки */}
              <div className="absolute bottom-2 left-2 right-2 flex gap-1">
                {userTeamRank && (
                  <div
                    className="flex-1 py-1 rounded-[5.73px] text-center"
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
                      Ваша десятка: {userTeamRank}
                    </p>
                  </div>
                )}
                {teamRatings.length > 5 && (
                  <button
                    onClick={() => {
                      haptic.selection();
                      setShowFullTeamRatings(!showFullTeamRatings);
                    }}
                    className="px-2 py-1 rounded-[5.73px]"
                    style={{
                      background: '#f7f1e8',
                      border: '0.955px solid #d93547',
                      fontFamily: 'Gilroy, sans-serif',
                      fontWeight: 400,
                      fontSize: '8px',
                      color: '#b82131',
                    }}
                  >
                    {showFullTeamRatings ? '↑' : '↓'}
                  </button>
                )}
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
            minHeight: '180px',
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

      {/* ===== МОДАЛЬНОЕ ОКНО ИСТОРИЯ НАЧИСЛЕНИЙ ===== */}
      {showHistoryModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{
            background: 'rgba(45, 38, 32, 0.8)',
            backdropFilter: 'blur(8px)',
          }}
          onClick={() => {
            haptic.impact('light');
            setShowHistoryModal(false);
          }}
        >
          <div
            className="w-full max-w-md max-h-[80vh] overflow-hidden"
            style={{
              borderRadius: '12px',
              background: '#f7f1e8',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Заголовок */}
            <div
              className="px-5 py-4"
              style={{
                background: 'linear-gradient(256.35deg, rgb(174, 30, 43) 15.72%, rgb(156, 23, 35) 99.39%)',
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5" style={{ color: '#f7f1e8' }} />
                  <h3
                    style={{
                      fontFamily: '"TT Nooks", Georgia, serif',
                      fontWeight: 300,
                      fontSize: '21px',
                      color: '#f7f1e8',
                    }}
                  >
                    История начислений
                  </h3>
                </div>
                <button
                  onClick={() => {
                    haptic.impact('light');
                    setShowHistoryModal(false);
                  }}
                  className="w-8 h-8 rounded-full flex items-center justify-center active:scale-95 transition-transform"
                  style={{
                    background: 'rgba(247, 241, 232, 0.2)',
                  }}
                >
                  <span style={{ color: '#f7f1e8', fontSize: '20px' }}>×</span>
                </button>
              </div>
            </div>

            {/* Список транзакций */}
            <div className="overflow-y-auto max-h-[calc(80vh-80px)] p-4">
              {historyLoading ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 mx-auto mb-3 relative">
                    <div
                      className="w-full h-full rounded-full border-4 border-[#2d2620]/10"
                      style={{
                        borderTopColor: '#9c1723',
                        animation: 'spin 1s linear infinite',
                      }}
                    />
                  </div>
                  <p
                    style={{
                      fontFamily: 'Gilroy, sans-serif',
                      fontWeight: 400,
                      fontSize: '14px',
                      color: '#2d2620',
                      opacity: 0.7,
                    }}
                  >
                    Загрузка истории...
                  </p>
                </div>
              ) : !historyData || !historyData.transactions || historyData.transactions.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" style={{ color: '#2d2620' }} />
                  <p
                    style={{
                      fontFamily: 'Gilroy, sans-serif',
                      fontWeight: 400,
                      fontSize: '14px',
                      color: '#2d2620',
                      opacity: 0.7,
                    }}
                  >
                    История начислений пока пуста
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {historyData.transactions.map((transaction: any) => {
                    const isPositive = transaction.amount > 0;
                    const date = new Date(transaction.createdAt);
                    const formattedDate = date.toLocaleDateString('ru-RU', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    });
                    const formattedTime = date.toLocaleTimeString('ru-RU', {
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <div
                        key={transaction.id}
                        className="p-3 rounded-lg"
                        style={{
                          background: isPositive ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                          border: `1px solid ${isPositive ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p
                              style={{
                                fontFamily: 'Gilroy, sans-serif',
                                fontWeight: 600,
                                fontSize: '13px',
                                color: '#2d2620',
                                marginBottom: '4px',
                              }}
                            >
                              {transaction.description || 'Начисление энергий'}
                            </p>
                            <p
                              style={{
                                fontFamily: 'Gilroy, sans-serif',
                                fontWeight: 400,
                                fontSize: '11px',
                                color: '#6b5a4a',
                              }}
                            >
                              {formattedDate} в {formattedTime}
                            </p>
                            {transaction.metadata?.lessonId && (
                              <p
                                style={{
                                  fontFamily: 'Gilroy, sans-serif',
                                  fontWeight: 400,
                                  fontSize: '10px',
                                  color: '#6b5a4a',
                                  marginTop: '2px',
                                }}
                              >
                                Урок #{transaction.metadata.lessonId}
                              </p>
                            )}
                          </div>
                          <div
                            className="flex-shrink-0"
                            style={{
                              fontFamily: 'Gilroy, sans-serif',
                              fontWeight: 700,
                              fontSize: '16px',
                              color: isPositive ? '#22c55e' : '#ef4444',
                            }}
                          >
                            {isPositive ? '+' : ''}{transaction.amount} ⚡
                          </div>
                        </div>

                        {transaction.expiresAt && !transaction.isExpired && (
                          <div
                            className="mt-2 pt-2"
                            style={{
                              borderTop: '1px solid rgba(45, 38, 32, 0.1)',
                            }}
                          >
                            <p
                              style={{
                                fontFamily: 'Gilroy, sans-serif',
                                fontWeight: 400,
                                fontSize: '10px',
                                color: '#9c1723',
                              }}
                            >
                              Истекает: {new Date(transaction.expiresAt).toLocaleDateString('ru-RU', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
