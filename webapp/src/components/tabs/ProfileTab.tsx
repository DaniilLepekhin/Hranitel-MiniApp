'use client';

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
      <div className="relative z-10 pt-[23px] pb-28">
        {/* Иконка профиля - бордовый цвет */}
        <div className="flex justify-center mb-[17px]">
          <div
            style={{
              width: '37.326px',
              height: '37.326px',
              backgroundColor: '#9c1723',
              WebkitMaskImage: 'url(/assets/profile-icon.svg)',
              WebkitMaskSize: 'contain',
              WebkitMaskRepeat: 'no-repeat',
              WebkitMaskPosition: 'center',
              maskImage: 'url(/assets/profile-icon.svg)',
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
            fontSize: '42.949px',
            lineHeight: 0.95,
            letterSpacing: '-2.5769px',
            color: '#2d2620',
            maxWidth: '340px',
            marginLeft: 'auto',
            marginRight: 'auto',
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
          className="relative mx-[30px]"
          style={{
            border: '1px solid #2d2620',
            borderRadius: '20px',
            minHeight: '280px',
            marginBottom: '24px',
          }}
        >
          {/* Контент карточки - центрированный flex контейнер */}
          <div className="absolute inset-0 flex flex-col items-center justify-start pt-[24px] px-[24px]">

            {/* Верхняя часть - Аватар и текст */}
            <div className="flex items-start justify-center mb-6" style={{ width: '100%' }}>
              {/* Аватар слева */}
              <div style={{ flexShrink: 0 }}>
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
                    className="rounded-full flex items-center justify-center"
                    style={{
                      width: '93px',
                      height: '93px',
                      background: '#d9d9d9',
                    }}
                  />
                )}
              </div>

              {/* Текстовая часть справа от аватара */}
              <div className="flex-1 flex flex-col items-center justify-start ml-4">
                {/* Имя */}
                <p
                  className="text-center mb-[8px]"
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontWeight: 400,
                    fontSize: '21.167px',
                    lineHeight: 1.45,
                    letterSpacing: '-0.4233px',
                    color: '#2d2620',
                  }}
                >
                  {displayName}
                </p>

                {/* Город */}
                <p
                  className="text-center mb-[16px]"
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontWeight: 400,
                    fontSize: '15.993px',
                    lineHeight: 1.45,
                    letterSpacing: '-0.3199px',
                    color: '#2d2620',
                  }}
                >
                  {user?.city ? `г. ${user.city}` : 'Город не указан'}
                </p>

                {/* Бейдж статуса */}
                <div
                  style={{
                    border: '0.955px solid #d93547',
                    borderRadius: '5.731px',
                    background: 'linear-gradient(242.804deg, rgb(174, 30, 43) 15.721%, rgb(156, 23, 35) 99.389%)',
                    paddingLeft: '16px',
                    paddingRight: '16px',
                    height: '33px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
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
            </div>

            {/* ===== БЛОК БАЛАНСА ===== */}
            <div
              className="w-full relative overflow-hidden"
              style={{
                borderRadius: '8px',
                background: 'linear-gradient(243.413deg, rgb(174, 30, 43) 15.721%, rgb(156, 23, 35) 99.389%)',
                minHeight: '100px',
              }}
            >
              {/* Декоративная картинка */}
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
                  alt=""
                  className="w-full h-full object-cover"
                  src="/assets/balance-image.jpg"
                />
              </div>

              {/* Контент */}
              <div className="relative z-10 h-full flex justify-between p-4">
                <p
                  style={{
                    fontFamily: '"TT Nooks", Georgia, serif',
                    fontWeight: 300,
                    fontSize: 'clamp(20px, 5vw, 24px)',
                    color: 'rgb(247, 241, 232)',
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
                      color: 'rgb(247, 241, 232)',
                      lineHeight: 1,
                    }}
                  >
                    {userBalance}
                  </p>
                  <p
                    style={{
                      fontFamily: 'Gilroy, sans-serif',
                      fontWeight: 400,
                      fontSize: 'clamp(16px, 4vw, 19px)',
                      color: 'rgb(247, 241, 232)',
                    }}
                  >
                    энергий
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* ===== ССЫЛКИ ===== */}
        <div className="space-y-[20px] px-[30px]">
          <button
            onClick={() => openLink('https://storage.daniillepekhin.com/IK%2Fclub_miniapp%2F%D0%9F%D1%80%D0%B0%D0%B2%D0%B8%D0%BB%D0%B0%20%D0%BA%D0%BB%D1%83%D0%B1%D0%B0.pdf')}
            className="w-full text-center"
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontWeight: 400,
              fontSize: '18.517px',
              lineHeight: 1.45,
              letterSpacing: '-0.3703px',
              color: '#2d2620',
              textDecoration: 'underline',
              textDecorationColor: '#2d2620',
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
              fontSize: '18.517px',
              lineHeight: 1.45,
              letterSpacing: '-0.3703px',
              color: '#2d2620',
              textDecoration: 'underline',
              textDecorationColor: '#2d2620',
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
              fontSize: '18.517px',
              lineHeight: 1.45,
              letterSpacing: '-0.3703px',
              color: '#2d2620',
              textDecoration: 'underline',
              textDecorationColor: '#2d2620',
            }}
          >
            Служба заботы
          </button>
        </div>
      </div>
    </div>
  );
}
