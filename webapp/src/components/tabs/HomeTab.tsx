'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Copy, Megaphone, Lock, Star, Crown, Check, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { energiesApi, feedbackSurveyApi } from '@/lib/api';
import { OptimizedBackground } from '@/components/ui/OptimizedBackground';
import { LeaderSurvey } from '@/components/LeaderSurvey';
import { FeedbackSurveyBanner } from '@/components/FeedbackSurveyBanner';
import { GeographySurveyBanner } from '@/components/GeographySurveyBanner';

import { useTelegram } from '@/hooks/useTelegram';

// Динамически определяем API URL на основе текущего домена
const getApiUrl = (): string => {
  if (typeof window === 'undefined') {
    return process.env.NEXT_PUBLIC_API_URL || 'https://app.successkod.com';
  }
  const hostname = window.location.hostname;
  if (hostname.includes('successkod.com')) {
    return `https://${hostname}`;
  }
  return process.env.NEXT_PUBLIC_API_URL || 'https://app.successkod.com';
};
const API_URL = getApiUrl();

interface HomeTabProps {
  onProfileClick?: () => void;
}

export function HomeTab({ onProfileClick }: HomeTabProps) {
  const { user, token } = useAuthStore();
  const { webApp, haptic } = useTelegram();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCopyToast, setShowCopyToast] = useState(false);

  // 🚀 Баланс энергий из API
  const { data: balanceData } = useQuery({
    queryKey: ['energies-balance', user?.id],
    queryFn: () => energiesApi.getBalance(),
    enabled: !!user && !!token,
    retry: 2,
    staleTime: 0, // Всегда актуальные данные
    gcTime: 5 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  // Проверка, проходил ли пользователь тест на Лидера + квоты города + доступ по подписке
  const [leaderTestStatus, setLeaderTestStatus] = useState<{
    hasCompleted: boolean;
    hasPassed: boolean;
    quotaExceeded: boolean;
    quotaReason?: string;
    hasAccess: boolean;
  } | null>(null);

  useEffect(() => {
    const checkLeaderTestCompletion = async () => {
      const initData = typeof window !== 'undefined'
        ? window.Telegram?.WebApp?.initData
        : null;

      if (!initData) return;

      try {
        const response = await fetch(`${API_URL}/api/v1/leader-test/check-completed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setLeaderTestStatus({
              hasCompleted: data.hasCompleted,
              hasPassed: data.hasPassed,
              quotaExceeded: data.quotaExceeded || false,
              quotaReason: data.quotaReason,
              hasAccess: data.hasAccess || false,
            });
          }
        }
      } catch (error) {
        console.error('Failed to check leader test completion:', error);
      }
    };

    checkLeaderTestCompletion();
  }, [user?.telegramId]);

  // Тест недоступен если уже пройден ИЛИ квота города исчерпана
  const isTestLocked = leaderTestStatus?.hasCompleted || leaderTestStatus?.quotaExceeded;

  // Баланс: из API, fallback на user.energies из store
  const epBalance = useMemo(() => balanceData?.balance ?? user?.energies ?? 0, [balanceData?.balance, user?.energies]);
  const referralLink = useMemo(
    () => user ? `https://t.me/SuccessKODBot?start=ref_${user.telegramId}` : 'https://t.me/SuccessKODBot?start=ref_...',
    [user?.telegramId]
  );
  const userName = useMemo(() => user?.firstName || '{Имя}', [user?.firstName]);

  // 🚀 МЕМОИЗАЦИЯ: Функции не пересоздаются при каждом рендере
  const handleCopyReferralLink = useCallback(async () => {
    if (referralLink) {
      try {
        await navigator.clipboard.writeText(referralLink);
        // Haptic feedback
        haptic.notification('success');
        // Показываем красивый toast
        setShowCopyToast(true);
        setTimeout(() => setShowCopyToast(false), 2000);
      } catch (error) {
        console.error('Failed to copy:', error);
        haptic.notification('error');
      }
    }
  }, [referralLink, haptic]);

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  }, [searchQuery, router]);

  return (
    <div className="min-h-screen w-full bg-[#f0ece8] relative" style={{ WebkitOverflowScrolling: 'touch' }}>
      {/* 🚀 ОПТИМИЗИРОВАННЫЙ ФОН - используем мемоизированный компонент */}
      <OptimizedBackground variant="home" />

      {/* ===== КОНТЕНТ - адаптивный ===== */}
      <div className="relative z-10 px-4 sm:px-6 lg:px-8 pt-4 pb-24 max-w-2xl mx-auto">

        {/* 1. Поиск - адаптивная ширина */}
        <form onSubmit={handleSearch} className="mb-5">
          <div
            className="w-full h-[40px] sm:h-[44px] bg-[#2d2620] flex items-center rounded-lg"
          >
            <Search
              className="ml-3 sm:ml-4 opacity-70 flex-shrink-0"
              style={{ width: '18px', height: '18px', color: '#f7f1e8' }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск..."
              className="flex-1 bg-transparent placeholder:opacity-70 px-3 focus:outline-none"
              style={{
                fontFamily: 'Gilroy, sans-serif',
                fontWeight: 600,
                fontSize: '14px',
                color: '#f7f1e8',
              }}
            />
          </div>
        </form>

        {/* 2. Пригласи друга */}
        <div
          className="w-full mb-6 relative overflow-hidden cursor-pointer active:opacity-80 transition-opacity"
          style={{
            borderRadius: '8px',
            border: '1px solid #d93547',
            background: 'linear-gradient(243.413deg, rgb(174, 30, 43) 15.721%, rgb(156, 23, 35) 99.389%)',
          }}
          onClick={() => router.push('/referral')}
        >
          <div className="p-4 sm:p-5">
            {/* Заголовок с логотипом КОД */}
            <div className="flex items-center gap-3 mb-3">
              {/* Круг КОД */}
              <div className="relative flex-shrink-0" style={{ width: '44px', height: '44px' }}>
                <div
                  className="absolute inset-0 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.1)', mixBlendMode: 'soft-light' }}
                />
                <div
                  className="absolute rounded-full flex items-center justify-center"
                  style={{
                    inset: '4px',
                    border: '1px solid rgba(255,255,255,0.3)',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'Gilroy, sans-serif',
                      fontWeight: 700,
                      fontSize: '9px',
                      color: 'white',
                      letterSpacing: '0.5px',
                    }}
                  >
                    КОД
                  </span>
                </div>
              </div>
              <div className="flex-1">
                <p
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontWeight: 600,
                    fontSize: '14px',
                    color: '#f7f1e8',
                  }}
                >
                  Пригласи друга в клуб КОД ДЕНЕГ
                </p>
                <p
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontWeight: 400,
                    fontSize: '11px',
                    color: 'rgba(255,255,255,0.6)',
                    marginTop: '2px',
                  }}
                >
                   скидки 500–1500 руб · 4 друга = месяц бесплатно
                </p>
              </div>
              {/* Стрелка - кликабельность */}
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                <ChevronRight style={{ width: '14px', height: '14px', color: 'white' }} />
              </div>
            </div>

            {/* Линия */}
            <div className="w-full h-[1px] bg-white/20 mb-4" />

            {/* Белая плашка со ссылкой */}
            <div
              className="w-full flex items-center px-4 py-3"
              style={{
                borderRadius: '8px',
                border: '1px solid white',
                background: 'rgb(247, 241, 232)',
              }}
            >
              <div className="flex-1 min-w-0">
                <p
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontWeight: 600,
                    fontSize: '11px',
                    color: '#2d2620',
                    marginBottom: '4px',
                  }}
                >
                  Отправьте эту ссылку другу
                </p>
                <p
                  className="truncate"
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    color: '#2d2620',
                  }}
                >
                  {referralLink}
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleCopyReferralLink(); }}
                className="flex-shrink-0 flex items-center justify-center ml-3 p-2 rounded-lg active:opacity-60 transition-opacity"
              >
                <Copy style={{ width: '18px', height: '18px', color: '#2d2620' }} />
              </button>
            </div>
          </div>
        </div>

        {/* 3. Приветствие */}
        <div className="text-center mb-6">
          <p
            style={{
              fontFamily: '"TT Nooks", Georgia, serif',
              fontWeight: 300,
              fontSize: 'clamp(40px, 10vw, 54px)',
              lineHeight: 0.95,
              letterSpacing: '-0.06em',
              color: '#2d2620',
              marginBottom: '8px',
            }}
          >
            Привет, {userName}!
          </p>
          <p
            style={{
              fontFamily: '"TT Nooks", Georgia, serif',
              fontWeight: 300,
              fontSize: 'clamp(16px, 4vw, 21px)',
              lineHeight: 0.95,
              letterSpacing: '-0.06em',
              color: '#2d2620',
            }}
          >
            Ты в пространстве клуба «Код Успеха»
          </p>
        </div>

        {/* 4. Мой баланс - адаптивная ширина */}
        <div
          className="w-full mb-6 relative overflow-hidden"
          style={{
            borderRadius: '8px',
            background: 'linear-gradient(243.413deg, rgb(174, 30, 43) 15.721%, rgb(156, 23, 35) 99.389%)',
            minHeight: '100px',
          }}
        >
          {/* Картинка молотка/денег */}
          <div
            className="absolute overflow-hidden"
            style={{
              left: '16px',
              bottom: '12px',
              width: 'min(50%, 200px)',
              height: '45px',
              borderRadius: '6px',
              border: '1px solid rgba(244, 214, 182, 0.4)',
            }}
          >
            <img
              src="/assets/balance-image.jpg"
              alt=""
              className="w-full h-full object-cover"
            />
          </div>

          {/* Контент */}
          <div className="relative z-10 h-full flex justify-between p-4">
            <p
              style={{
                fontFamily: '"TT Nooks", Georgia, serif',
                fontWeight: 300,
                fontSize: 'clamp(20px, 5vw, 24px)',
                color: '#f7f1e8',
              }}
            >
              Мой баланс
            </p>

            <div className="text-right">
              <p
                style={{
                  fontFamily: 'Gilroy, sans-serif',
                  fontWeight: 600,
                  fontSize: 'clamp(40px, 10vw, 48px)',
                  color: '#f7f1e8',
                  lineHeight: 1,
                }}
              >
                {epBalance}
              </p>
              <p
                style={{
                  fontFamily: 'Gilroy, sans-serif',
                  fontWeight: 400,
                  fontSize: 'clamp(16px, 4vw, 19px)',
                  color: '#f7f1e8',
                }}
              >
                энергий
              </p>
            </div>
          </div>
        </div>

        {/* 5. Анонсы */}
        <div className="w-full">
          <div className="flex items-center gap-2 mb-3">
            <p
              style={{
                fontFamily: '"TT Nooks", Georgia, serif',
                fontWeight: 300,
                fontSize: 'clamp(18px, 4vw, 21px)',
                lineHeight: 0.95,
                letterSpacing: '-0.06em',
                color: '#2d2620',
              }}
            >
              Анонсы
            </p>
            <Megaphone
              style={{
                width: '20px',
                height: '20px',
                color: 'rgb(174, 30, 43)',
              }}
            />
          </div>
          {/* Линия */}
          <div className="w-full h-[1px] bg-[#2d2620]/20 mb-4" />

          {/* Кнопка "Стать амбассадором" — скрыта */}
          {/* <div ... /> */}

          {/* 🗺️ Анкета "География клуба" */}
          <GeographySurveyBanner />

          {/* 🚦 Светофор — еженедельный опрос для лидеров десяток */}
          <LeaderSurvey />

          {/* 📋 Анкета обратной связи */}
          <FeedbackSurveyBanner />

          {/* Кнопка "Тест на Лидера десятки" - для пользователей с подпиской >= 3 месяцев */}
          {leaderTestStatus?.hasAccess && (
            <div
              className={`w-full mt-3 relative overflow-hidden ${isTestLocked ? '' : 'cursor-pointer active:scale-[0.99]'} transition-transform`}
              onClick={() => {
                if (isTestLocked) {
                  haptic.notification('warning');
                  return;
                }
                haptic.impact('light');
                router.push('/buddy-test');
              }}
              style={{
                borderRadius: '8px',
                border: '1px solid #d93547',
                background: 'linear-gradient(243.413deg, rgb(174, 30, 43) 15.721%, rgb(156, 23, 35) 99.389%)',
                padding: '16px',
              }}
            >
              {/* Индикатор статуса теста в правом верхнем углу */}
              {isTestLocked && (
                <div
                  className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                  style={{
                    background: leaderTestStatus?.hasPassed
                      ? 'rgba(34, 197, 94, 0.9)'
                      : 'rgba(0, 0, 0, 0.5)',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  {leaderTestStatus?.hasPassed ? (
                    <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                  ) : (
                    <Lock className="w-3.5 h-3.5 text-white" />
                  )}
                  <span
                    style={{
                      fontFamily: 'Gilroy, sans-serif',
                      fontWeight: 600,
                      fontSize: '11px',
                      color: 'white',
                    }}
                  >
                    {leaderTestStatus?.hasPassed
                      ? 'Пройден'
                      : leaderTestStatus?.quotaExceeded
                        ? 'Закрыт'
                        : 'Завершён'}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-3">
                {/* Иконка лидера */}
                <div
                  className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                  style={{
                    background: 'rgba(255,255,255,0.15)',
                    border: '1px solid rgba(255,255,255,0.3)',
                  }}
                >
                  <Crown className="w-5 h-5" style={{ color: '#f7f1e8' }} />
                </div>
                <div className="flex-1">
                  <p
                    style={{
                      fontFamily: 'Gilroy, sans-serif',
                      fontWeight: 700,
                      fontSize: '15px',
                      color: '#f7f1e8',
                      marginBottom: '2px',
                    }}
                  >
                    Тест на Лидера десятки
                  </p>
                  <p
                    style={{
                      fontFamily: 'Gilroy, sans-serif',
                      fontWeight: 400,
                      fontSize: '12px',
                      color: 'rgba(247, 241, 232, 0.8)',
                    }}
                  >
                    Пройди тест и стань лидером группы
                  </p>
                </div>
                {/* Стрелка */}
                <div
                  className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                  style={{
                    background: '#f7f1e8',
                  }}
                >
                  <span style={{ color: '#9c1723', fontSize: '14px' }}>→</span>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* 🎨 Красивый Toast для копирования */}
      {showCopyToast && (
        <div
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-2xl animate-fade-in"
          style={{
            background: 'rgba(45, 38, 32, 0.95)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(247, 241, 232, 0.1)',
          }}
        >
          <p
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontWeight: 500,
              fontSize: '14px',
              color: '#f7f1e8',
              textAlign: 'center',
              letterSpacing: '-0.01em',
            }}
          >
            Ссылка скопирована
          </p>
        </div>
      )}
    </div>
  );
}
