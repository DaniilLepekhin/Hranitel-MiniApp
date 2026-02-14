'use client';

import { useState, useCallback, useMemo, useEffect, memo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTelegram } from '@/hooks/useTelegram';
import { useAuthStore } from '@/store/auth';
import { gamificationApi, energiesApi, ratingsApi } from '@/lib/api';
import { OptimizedBackground } from '@/components/ui/OptimizedBackground';
import { Clock } from 'lucide-react';

// 🚀 ОПТИМИЗАЦИЯ: Lazy load модального окна (экономия ~20 KB)
const EnergyHistoryModal = dynamic(
  () => import('@/components/EnergyHistoryModal').then(mod => ({ default: mod.EnergyHistoryModal })),
  { ssr: false }
);

interface RatingsTabProps {
  onShopClick?: () => void;
}

// 🚀 ОПТИМИЗАЦИЯ: Мемоизированный компонент элемента рейтинга
interface LeaderboardItemProps {
  entry: {
    id: string;
    firstName?: string;
    lastName?: string;
    username?: string;
    experience?: number;
  };
  isCurrentUser: boolean;
}

const LeaderboardItem = memo(({ entry, isCurrentUser }: LeaderboardItemProps) => {
  const displayName = entry.firstName && entry.lastName
    ? `${entry.firstName} ${entry.lastName}`
    : entry.username || 'Пользователь';
  const energies = entry.experience || 0;

  return (
    <div
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
      <span className="flex-1 truncate">{displayName}</span>
      <span style={{ fontWeight: isCurrentUser ? 700 : 400, minWidth: '80px', textAlign: 'right' }}>
        {energies.toLocaleString('ru-RU')} ⚡
      </span>
    </div>
  );
});

LeaderboardItem.displayName = 'LeaderboardItem';

// 🚀 ОПТИМИЗАЦИЯ: Мемоизированный компонент элемента города
interface CityRatingItemProps {
  item: {
    city: string;
    totalEnergies?: number;
  };
  index: number;
}

const CityRatingItem = memo(({ item, index }: CityRatingItemProps) => (
  <div className="flex items-center justify-between" style={{ fontFamily: 'Gilroy, sans-serif', fontWeight: 400, fontSize: '10px', color: '#f7f1e8' }}>
    <span className="truncate">{item.city}</span>
    <span className="ml-1">{index + 1}</span>
  </div>
));

CityRatingItem.displayName = 'CityRatingItem';

export function RatingsTab({ onShopClick }: RatingsTabProps) {
  const { haptic, webApp } = useTelegram();
  const { user, token } = useAuthStore();
  const queryClient = useQueryClient();
  const [showFullLeaderboard, setShowFullLeaderboard] = useState(false);
  const [showFullCityRatings, setShowFullCityRatings] = useState(false);
  const [showFullTeamRatings, setShowFullTeamRatings] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Инвалидируем кэш баланса при смене пользователя
  useEffect(() => {
    if (user?.id && token) {
      console.log('[RatingsTab] User loaded, invalidating balance cache');
      queryClient.invalidateQueries({ queryKey: ['energies-balance'] });
      
      // TEST: Проверяем, работает ли authMiddleware вообще
      fetch('https://app.successkod.com/users/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
        .then(r => r.json())
        .then(data => {
          console.log('[RatingsTab] TEST /users/me response:', data);
          if (!data.success) {
            console.error('[RatingsTab] /users/me failed, auth is broken!');
          }
        })
        .catch(err => console.error('[RatingsTab] /users/me error:', err));
    }
  }, [user?.id, token, queryClient]);

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

  // 🚀 ОПТИМИЗАЦИЯ: Batch API - все данные рейтингов в одном запросе
  const { data: ratingsData, isLoading: ratingsLoading, error: ratingsError } = useQuery({
    queryKey: ['ratingsAllData', user?.id],
    queryFn: async () => {
      console.log('[RatingsTab] Fetching all ratings data for user:', user?.id);
      const result = await ratingsApi.getAllData(user!.id);
      console.log('[RatingsTab] All ratings data response:', result);
      return result;
    },
    enabled: !!user && !!token,
    retry: 2,
    staleTime: 0, // ВСЕГДА обновляем баланс
    gcTime: 0, // НЕ храним в кэше
    refetchOnMount: 'always', // ВСЕГДА обновлять при монтировании
    refetchOnWindowFocus: true, // Обновлять при возврате в приложение
  });

  // Логирование для отладки
  useEffect(() => {
    if (ratingsData) {
      console.log('[RatingsTab] Ratings data updated:', ratingsData);
    }
    if (ratingsError) {
      console.error('[RatingsTab] Ratings error:', ratingsError);
    }
  }, [ratingsData, ratingsError]);

  // Извлекаем данные из batch API
  const userBalance = ratingsData?.data?.balance ?? 0;
  const historyData = { transactions: ratingsData?.data?.history ?? [] };
  const historyLoading = ratingsLoading;
  const leaderboard = ratingsData?.data?.leaderboard ?? [];
  const cityRatings = ratingsData?.data?.cityRatings ?? [];
  const teamRatings = ratingsData?.data?.teamRatings ?? [];
  const userPosition = ratingsData?.data?.userPosition;
  const balanceLoading = ratingsLoading;

  // DEBUG: Детальное логирование баланса
  console.log('[RatingsTab] DEBUG ratingsData FULL:', JSON.stringify(ratingsData, null, 2));
  console.log('[RatingsTab] DEBUG user:', user);
  console.log('[RatingsTab] DEBUG user.id:', user?.id);
  console.log('[RatingsTab] DEBUG token:', token ? 'EXISTS (length: ' + token.length + ')' : 'NULL');
  console.log('[RatingsTab] DEBUG token first 50 chars:', token ? token.substring(0, 50) + '...' : 'NULL');
  
  // Debug: показываем user ID и баланс
  console.log('[RatingsTab] Current user:', {
    userId: user?.id,
    username: user?.username,
    firstName: user?.firstName,
    balance: userBalance,
    ratingsData,
  });
  
  // Debug: показываем статус загрузки
  if (ratingsLoading) {
    console.log('[RatingsTab] Ratings are loading...');
  }
  
  // Показываем ошибку, если есть
  if (ratingsData && !ratingsData.success) {
    console.error('[RatingsTab] API returned error:', (ratingsData as any).error);
  }
  
  console.log('[RatingsTab] DEBUG userBalance (final):', userBalance);

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

  // Показываем топ-10 или весь список в зависимости от showFullLeaderboard
  const displayedLeaderboard = useMemo(() => {
    if (showFullLeaderboard) {
      return leaderboard;
    }
    return leaderboard.slice(0, 10);
  }, [leaderboard, showFullLeaderboard]);

  // 🚀 ОПТИМИЗАЦИЯ: Virtual List для рейтинга
  const parentRef = useRef<HTMLDivElement>(null);
  
  const rowVirtualizer = useVirtualizer({
    count: displayedLeaderboard.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32, // Примерная высота строки
    overscan: 5, // Рендерить 5 строк сверху/снизу для плавности
  });

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
                  fontWeight: 700,
                  fontSize: '46.4px',
                  color: '#f7f1e8',
                  lineHeight: 1,
                }}
              >
                {balanceLoading ? '...' : userBalance}
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

          {/* 🚀 ОПТИМИЗАЦИЯ: Виртуальная таблица рейтинга */}
          <div className="relative">
            <div 
              ref={parentRef}
              className="overflow-auto"
              style={{ 
                height: showFullLeaderboard ? '500px' : '320px',
                contain: 'strict',
              }}
            >
              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const entry = displayedLeaderboard[virtualRow.index];
                  return (
                    <div
                      key={virtualRow.key}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <LeaderboardItem
                        entry={entry}
                        isCurrentUser={entry.id === user?.id}
                      />
                    </div>
                  );
                })}
              </div>
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
                    <CityRatingItem key={item.city} item={item} index={index} />
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

      {/* ===== МОДАЛЬНОЕ ОКНО ИСТОРИЯ НАЧИСЛЕНИЙ (ОПТИМИЗИРОВАННОЕ) ===== */}
      <EnergyHistoryModal
        isOpen={showHistoryModal}
        onClose={() => {
          haptic.impact('light');
          setShowHistoryModal(false);
        }}
        transactions={historyData?.transactions}
        isLoading={historyLoading}
      />
    </div>
  );
}
