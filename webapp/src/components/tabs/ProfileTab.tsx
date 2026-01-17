'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTelegram } from '@/hooks/useTelegram';
import { useAuthStore } from '@/store/auth';
import { energiesApi } from '@/lib/api';

export function ProfileTab() {
  const { haptic, webApp } = useTelegram();
  const { user, token } = useAuthStore();

  // Получаем баланс энергий пользователя
  const { data: balanceData } = useQuery({
    queryKey: ['energies-balance', user?.id],
    queryFn: () => energiesApi.getBalance(user!.id),
    enabled: !!user && !!token,
    retry: false,
  });

  const userBalance = balanceData?.balance || 0;
  const displayName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : user?.firstName || user?.username || 'Пользователь';

  const openLink = (url: string) => {
    haptic.impact('light');
    if (webApp?.openLink) {
      webApp.openLink(url);
    } else {
      window.open(url, '_blank');
    }
  };

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

        {/* Иконка чата - бордовый цвет */}
        <div className="flex justify-center mb-4">
          <div
            style={{
              width: '37px',
              height: '37px',
              backgroundColor: '#9c1723',
              WebkitMaskImage: 'url(/assets/profile-icon.png)',
              WebkitMaskSize: 'contain',
              WebkitMaskRepeat: 'no-repeat',
              WebkitMaskPosition: 'center',
              maskImage: 'url(/assets/profile-icon.png)',
              maskSize: 'contain',
              maskRepeat: 'no-repeat',
              maskPosition: 'center',
            }}
          />
        </div>

        {/* Заголовок */}
        <h1
          className="text-center mb-4"
          style={{
            fontFamily: '"TT Nooks", Georgia, serif',
            fontWeight: 300,
            fontSize: '42.9px',
            lineHeight: 0.95,
            letterSpacing: '-2.58px',
            color: '#2d2620',
          }}
        >
          Это твой личный кабинет в клубе.
        </h1>

        {/* Описание */}
        <p
          className="text-center mb-6"
          style={{
            fontFamily: 'Gilroy, sans-serif',
            fontWeight: 400,
            fontSize: '13px',
            lineHeight: 1.45,
            letterSpacing: '-0.26px',
            color: '#2d2620',
            maxWidth: '269px',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          <span style={{ fontWeight: 700 }}>Здесь собрана вся информация</span>
          {' о тебе, твоём статусе, активности и прогрессе'}
        </p>

        {/* ===== КАРТОЧКА ПРОФИЛЯ ===== */}
        <div
          className="relative mb-6"
          style={{
            border: '1px solid #2d2620',
            borderRadius: '20px',
            padding: '24px',
            minHeight: '252px',
          }}
        >
          {/* Аватар */}
          <div className="flex justify-center mb-4">
            {user?.photoUrl ? (
              <img
                src={user.photoUrl}
                alt={displayName}
                className="rounded-full"
                style={{
                  width: '93px',
                  height: '93px',
                  objectFit: 'cover',
                }}
              />
            ) : (
              <div
                className="rounded-full flex items-center justify-center text-white text-3xl font-bold"
                style={{
                  width: '93px',
                  height: '93px',
                  background: 'linear-gradient(135deg, #9c1723 0%, #ae1e2b 100%)',
                }}
              >
                {user?.firstName?.[0] || '?'}
              </div>
            )}
          </div>

          {/* Имя */}
          <p
            className="text-center mb-2"
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontWeight: 400,
              fontSize: '21.17px',
              lineHeight: 1.45,
              letterSpacing: '-0.42px',
              color: '#2d2620',
            }}
          >
            {displayName}
          </p>

          {/* Город */}
          <p
            className="text-center mb-4"
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontWeight: 400,
              fontSize: '16px',
              lineHeight: 1.45,
              letterSpacing: '-0.32px',
              color: '#2d2620',
            }}
          >
            {user?.city || 'Город не указан'}
          </p>

          {/* Бейдж статуса */}
          <div className="flex justify-center mb-6">
            <div
              className="px-4 py-2"
              style={{
                border: '0.955px solid #d93547',
                borderRadius: '5.73px',
                background: 'linear-gradient(242.8deg, rgb(174, 30, 43) 15.72%, rgb(156, 23, 35) 99.39%)',
              }}
            >
              <p
                style={{
                  fontFamily: 'Gilroy, sans-serif',
                  fontWeight: 700,
                  fontSize: '14px',
                  lineHeight: 1.45,
                  letterSpacing: '-0.28px',
                  color: 'white',
                }}
              >
                {user?.isPro ? 'Участник' : 'Новичек'}
              </p>
            </div>
          </div>

          {/* ===== БЛОК БАЛАНСА ===== */}
          <div
            className="relative overflow-hidden"
            style={{
              borderRadius: '10px',
              height: '79px',
            }}
          >
            {/* Фоновое изображение */}
            <div className="absolute inset-0" style={{ opacity: 0.3 }}>
              <img
                src="/assets/balance-bg.jpg"
                alt=""
                className="w-full h-full object-cover"
                style={{ filter: 'blur(21px)' }}
              />
            </div>

            {/* Градиент фона */}
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(256deg, rgb(174, 30, 43) 15.72%, rgb(156, 23, 35) 99.39%)',
              }}
            />

            {/* Контент */}
            <div className="relative z-10 h-full flex items-center justify-between px-4">
              <p
                style={{
                  fontFamily: '"TT Nooks", Georgia, serif',
                  fontWeight: 300,
                  fontSize: '20px',
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
                    fontSize: '39.6px',
                    lineHeight: 1,
                    color: '#f7f1e8',
                  }}
                >
                  {userBalance}
                </p>
                <p
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontWeight: 400,
                    fontSize: '15.85px',
                    color: '#f7f1e8',
                  }}
                >
                  энергий
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ===== ССЫЛКИ ===== */}
        <div className="space-y-4">
          <button
            onClick={() => openLink('https://storage.daniillepekhin.com/IK%2Fclub_miniapp%2F%D0%9F%D1%80%D0%B0%D0%B2%D0%B8%D0%BB%D0%B0%20%D0%BA%D0%BB%D1%83%D0%B1%D0%B0.pdf')}
            className="w-full text-center"
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontWeight: 400,
              fontSize: '18.52px',
              lineHeight: 1.45,
              letterSpacing: '-0.37px',
              color: '#2d2620',
              textDecoration: 'underline',
            }}
          >
            Правила клуба
          </button>

          <button
            onClick={() => openLink('https://ishodnyi-kod.com/clubofert')}
            className="w-full text-center"
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontWeight: 400,
              fontSize: '18.52px',
              lineHeight: 1.45,
              letterSpacing: '-0.37px',
              color: '#2d2620',
              textDecoration: 'underline',
            }}
          >
            Оферта
          </button>

          <button
            onClick={() => openLink('https://t.me/Egiazarova_support_bot')}
            className="w-full text-center"
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontWeight: 400,
              fontSize: '18.52px',
              lineHeight: 1.45,
              letterSpacing: '-0.37px',
              color: '#2d2620',
              textDecoration: 'underline',
            }}
          >
            Служба заботы
          </button>
        </div>

      </div>
    </div>
  );
}
