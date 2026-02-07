'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { useAuthStore } from '@/store/auth';
import { cityChatsApi, decadesApi } from '@/lib/api';

// API endpoints
const teamsApi = {
  getUserTeam: async (userId: string) => {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/teams/my?userId=${userId}`);
    if (!response.ok) throw new Error('Failed to fetch team');
    return response.json();
  },
};

export function ChatsTab() {
  const { haptic, webApp, user: tgUser, initData } = useTelegram();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  // 🔒 Проверка доступа к разделу "Десятки" - только для telegram_id 389209990
  const canAccessDecades = String(user?.telegramId) === '389209990';

  // City chat selection state
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [showCitySelector, setShowCitySelector] = useState(false);

  // Decade selection state
  const [showDecadeFlow, setShowDecadeFlow] = useState(false);
  const [selectedDecadeCity, setSelectedDecadeCity] = useState<string>(user?.city || '');
  const [decadeError, setDecadeError] = useState<string>('');

  // Fetch my decade info
  const { data: myDecadeData } = useQuery({
    queryKey: ['decades', 'my', user?.id],
    queryFn: () => decadesApi.getMy(initData || ''),
    enabled: !!user && !!initData && canAccessDecades,
    placeholderData: { success: true, decade: null },
  });

  // Fetch available cities for decades
  const { data: decadeCitiesData, isLoading: isLoadingDecadeCities } = useQuery({
    queryKey: ['decades', 'cities'],
    queryFn: () => decadesApi.getCities(initData || ''),
    enabled: showDecadeFlow && canAccessDecades && !!initData,
    staleTime: 5 * 60 * 1000,
  });

  // Join decade mutation
  const joinDecadeMutation = useMutation({
    mutationFn: (city?: string) => decadesApi.join(initData || '', city),
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ['decades', 'my'] });
        setShowDecadeFlow(false);
        if (data.inviteLink && webApp?.openTelegramLink) {
          webApp.openTelegramLink(data.inviteLink);
        }
      } else {
        setDecadeError(data.message || 'Ошибка при распределении');
      }
    },
    onError: () => {
      setDecadeError('Произошла ошибка. Попробуйте снова.');
    },
  });

  // 🚀 МГНОВЕННЫЙ РЕНДЕР: Fetch user team
  const { data: teamData } = useQuery({
    queryKey: ['teams', 'my', user?.id],
    queryFn: () => teamsApi.getUserTeam(user!.id),
    enabled: !!user,
    placeholderData: { success: true, team: null },
  });

  // 🚀 Fetch countries only when selector is open
  const { data: countriesData, isLoading: isLoadingCountries } = useQuery({
    queryKey: ['city-chats', 'countries'],
    queryFn: () => cityChatsApi.getCountries(),
    enabled: showCitySelector,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // 🚀 МГНОВЕННЫЙ РЕНДЕР: Fetch cities when country is selected
  const { data: citiesData, isLoading: isLoadingCities } = useQuery({
    queryKey: ['city-chats', 'cities', selectedCountry],
    queryFn: () => cityChatsApi.getCities(selectedCountry),
    enabled: !!selectedCountry,
    placeholderData: { success: true, cities: [] },
  });

  // 🚀 МГНОВЕННЫЙ РЕНДЕР: Fetch chat link when city is selected
  const { data: chatLinkData } = useQuery({
    queryKey: ['city-chats', 'link', selectedCity],
    queryFn: () => cityChatsApi.getChatLink(selectedCity),
    enabled: !!selectedCity,
    placeholderData: { success: true, chatLink: '', chatName: '', country: '', cityChatId: 0, telegramChatId: null },
  });

  const team = teamData?.team;
  const countries = countriesData?.countries || [];
  const cities = citiesData?.cities || [];

  const openLink = (url: string) => {
    haptic.impact('light');
    if (url.includes('t.me')) {
      if (webApp?.openTelegramLink) {
        webApp.openTelegramLink(url);
      } else if (webApp?.openLink) {
        webApp.openLink(url);
      } else {
        window.open(url, '_blank');
      }
    } else {
      if (webApp?.openLink) {
        webApp.openLink(url);
      } else {
        window.open(url, '_blank');
      }
    }
  };

  const handleCountrySelect = (country: string) => {
    haptic.selection();
    setSelectedCountry(country);
    setSelectedCity('');
  };

  const handleCitySelect = (city: string) => {
    haptic.selection();
    setSelectedCity(city);
  };

  const handleJoinCityChat = async () => {
    if (chatLinkData?.chatLink && Number(chatLinkData.cityChatId) > 0 && user) {
      haptic.impact('medium');

      // Save selection and unban user before opening link
      try {
        const telegramId = parseInt(user.telegramId, 10);
        const cityChatId = Number(chatLinkData.cityChatId);
        await cityChatsApi.joinChat(telegramId, cityChatId);
      } catch (error) {
        console.error('Error saving city chat selection:', error);
        // Continue to open link even if save fails
      }

      if (webApp?.openTelegramLink) {
        webApp.openTelegramLink(chatLinkData.chatLink);
      } else {
        openLink(chatLinkData.chatLink);
      }
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#f7f1e8] relative" style={{ WebkitOverflowScrolling: 'touch' }}>
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
          zIndex: 0,
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
              WebkitMaskImage: 'url(/assets/chat-icon.png)',
              WebkitMaskSize: 'contain',
              WebkitMaskRepeat: 'no-repeat',
              WebkitMaskPosition: 'center',
              maskImage: 'url(/assets/chat-icon.png)',
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
            fontFamily: 'Gilroy, sans-serif',
            fontWeight: 400,
            fontSize: '13px',
            lineHeight: 1.45,
            letterSpacing: '-0.26px',
            color: '#2d2620',
            marginBottom: '8px',
          }}
        >
          В этом разделе собраны все чаты клуба
        </p>

        {/* Заголовок */}
        <h1
          className="text-center"
          style={{
            fontFamily: '"TT Nooks", Georgia, serif',
            fontWeight: 300,
            fontSize: '45.8px',
            lineHeight: 0.95,
            letterSpacing: '-2.75px',
            color: '#2d2620',
            marginBottom: '16px',
          }}
        >
          всё общение в одном месте
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
            maxWidth: '341px',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          Здесь ты всегда знаешь, где <span style={{ fontWeight: 700 }}>задать вопрос, получить поддержку</span> и быть на связи с сообществом.
        </p>

        {/* Карточки чатов */}
        <div className="flex flex-col gap-[10px]">

          {/* 1. Приложение KOD - картинка выступает сверху */}
          <div
            className="relative overflow-visible cursor-pointer active:scale-[0.99] transition-transform"
            onClick={() => {
              haptic.impact('light');
              openLink('http://qr.numschool-web.ru/');
            }}
            style={{
              borderRadius: '5.73px',
              border: '0.955px solid #d93547',
              background: 'linear-gradient(256.35deg, rgb(174, 30, 43) 15.72%, rgb(156, 23, 35) 99.39%)',
              minHeight: '185px',
              marginTop: '40px', // Отступ для выступающей картинки
            }}
          >
            {/* Изображение справа - выступает сверху */}
            <div
              className="absolute overflow-visible"
              style={{
                right: '0',
                top: '-40px',
                width: '45%',
                height: 'calc(100% + 40px)',
              }}
            >
              <img
                src="/assets/chat-kod-app.png"
                alt=""
                className="w-full h-full object-contain object-right-bottom"
              />
            </div>

            {/* Контент слева */}
            <div className="relative z-10 p-4 pr-2" style={{ maxWidth: '55%' }}>
              <h3
                style={{
                  fontFamily: '"TT Nooks", Georgia, serif',
                  fontWeight: 300,
                  fontSize: '19.4px',
                  lineHeight: 1.05,
                  color: '#f7f1e8',
                  marginBottom: '8px',
                }}
              >
                Приложение KOD
              </h3>

              <p
                style={{
                  fontFamily: 'Gilroy, sans-serif',
                  fontWeight: 400,
                  fontSize: '10px',
                  lineHeight: 1.4,
                  color: '#f7f1e8',
                  marginBottom: '12px',
                }}
              >
                <span style={{ fontWeight: 700 }}>Тебе доступна подписка</span> на наше приложение ментального здоровья
              </p>

              <button
                className="px-5 py-3 rounded-[5.73px] active:scale-[0.98] transition-transform"
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
                получить доступ
              </button>
            </div>
          </div>

          {/* 2. Основной канал клуба */}
          <div
            className="relative overflow-hidden cursor-pointer active:scale-[0.99] transition-transform"
            onClick={() => {
              haptic.impact('light');
              openLink('https://t.me/+mwJ5e0d78GYzNDRi');
            }}
            style={{
              borderRadius: '5.73px',
              border: '0.955px solid #d93547',
              background: 'linear-gradient(256.35deg, rgb(174, 30, 43) 15.72%, rgb(156, 23, 35) 99.39%)',
              minHeight: '230px',
            }}
          >
            {/* Изображение справа */}
            <div
              className="absolute overflow-hidden"
              style={{
                right: '-15px',
                top: '-15px',
                bottom: '-15px',
                width: '55%',
              }}
            >
              <img
                src="/assets/chat-main-channel.png"
                alt=""
                className="w-full h-full object-cover object-center"
              />
            </div>

            {/* Контент слева */}
            <div className="relative z-10 p-4 pr-2" style={{ maxWidth: '50%' }}>
              <h3
                style={{
                  fontFamily: '"TT Nooks", Georgia, serif',
                  fontWeight: 300,
                  fontSize: '19.4px',
                  lineHeight: 1.05,
                  color: '#f7f1e8',
                  marginBottom: '8px',
                }}
              >
                Основной канал клуба
              </h3>

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
                <span style={{ fontWeight: 700 }}>Здесь все важные новости клуба,</span> анонсы эфиров и ключевые обновления. <span style={{ fontWeight: 700 }}>Рекомендуем быть здесь всегда и закрепить этот канал.</span>
              </p>

              <button
                className="px-8 py-3 rounded-[5.73px] active:scale-[0.98] transition-transform"
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
                вступить
              </button>
            </div>
          </div>

          {/* 3. Чат города */}
          <div>
            <div
              className="relative overflow-hidden cursor-pointer active:scale-[0.99] transition-transform"
              onClick={() => {
                haptic.impact('light');
                setShowCitySelector(!showCitySelector);
              }}
              style={{
                borderRadius: '5.73px',
                border: '0.955px solid #d93547',
                background: 'linear-gradient(256.35deg, rgb(174, 30, 43) 15.72%, rgb(156, 23, 35) 99.39%)',
                minHeight: '190px',
              }}
            >
              {/* Изображение справа */}
              <div
                className="absolute overflow-hidden"
                style={{
                  right: '0px',
                  top: '-15px',
                  bottom: '-15px',
                  width: '55%',
                }}
              >
                <img
                  src="/assets/chat-city.png"
                  alt=""
                  className="w-full h-full object-cover object-center"
                />
              </div>

              {/* Контент слева */}
              <div className="relative z-10 p-4 pr-2" style={{ maxWidth: '50%' }}>
                <h3
                  style={{
                    fontFamily: '"TT Nooks", Georgia, serif',
                    fontWeight: 300,
                    fontSize: '19.4px',
                    lineHeight: 1.05,
                    color: '#f7f1e8',
                    marginBottom: '8px',
                  }}
                >
                  Чат города
                </h3>

                <p
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontWeight: 400,
                    fontSize: '10px',
                    lineHeight: 1.4,
                    color: '#f7f1e8',
                    marginBottom: '12px',
                  }}
                >
                  Пространство для общения с <span style={{ fontWeight: 700 }}>участниками из твоего города,</span> встреч и живого контакта рядом
                </p>

                <button
                  className="px-4 py-3 rounded-[5.73px] active:scale-[0.98] transition-transform"
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
                  вступить в чат города
                </button>
              </div>
            </div>

            {/* Селектор города */}
            {showCitySelector && (
              <div
                className="mt-2 p-4 rounded-lg"
                style={{
                  background: 'rgba(247, 241, 232, 0.95)',
                  border: '1px solid #d93547',
                }}
              >
                <div className="mb-3">
                  <label
                    className="block mb-1.5"
                    style={{
                      fontFamily: 'Gilroy, sans-serif',
                      fontWeight: 600,
                      fontSize: '12px',
                      color: '#2d2620',
                    }}
                  >
                    Страна
                  </label>
                  {isLoadingCountries ? (
                    <div className="p-3 bg-white/50 rounded-lg text-center text-[#6b5a4a] text-sm">
                      Загрузка...
                    </div>
                  ) : (
                    <select
                      value={selectedCountry}
                      onChange={(e) => handleCountrySelect(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border bg-white text-[#2d2620] font-medium text-sm focus:outline-none"
                      style={{ borderColor: '#d93547' }}
                    >
                      <option value="">Выберите страну</option>
                      {countries.map((country) => (
                        <option key={country} value={country}>
                          {country}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {selectedCountry && (
                  <div className="mb-3">
                    <label
                      className="block mb-1.5"
                      style={{
                        fontFamily: 'Gilroy, sans-serif',
                        fontWeight: 600,
                        fontSize: '12px',
                        color: '#2d2620',
                      }}
                    >
                      Город
                    </label>
                    {isLoadingCities ? (
                      <div className="p-3 bg-white/50 rounded-lg text-center text-[#6b5a4a] text-sm">
                        Загрузка городов...
                      </div>
                    ) : cities.length === 0 ? (
                      <div className="p-3 bg-white/50 rounded-lg text-center text-[#6b5a4a] text-sm">
                        Нет доступных городов
                      </div>
                    ) : (
                      <select
                        value={selectedCity}
                        onChange={(e) => handleCitySelect(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-lg border bg-white text-[#2d2620] font-medium text-sm focus:outline-none"
                        style={{ borderColor: '#d93547' }}
                      >
                        <option value="">Выберите город</option>
                        {cities.map((city) => (
                          <option key={city.name} value={city.name}>
                            {city.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {selectedCity && chatLinkData?.chatLink && Number(chatLinkData.cityChatId) > 0 && (
                  <button
                    onClick={handleJoinCityChat}
                    className="w-full py-3 rounded-lg text-center active:scale-[0.98] transition-transform"
                    style={{
                      background: 'linear-gradient(256.35deg, rgb(174, 30, 43) 15.72%, rgb(156, 23, 35) 99.39%)',
                      fontFamily: 'Gilroy, sans-serif',
                      fontWeight: 600,
                      fontSize: '14px',
                      color: '#f7f1e8',
                      textTransform: 'uppercase',
                    }}
                  >
                    вступить в чат
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 4. Десятка (🔒 ЗАБЛОКИРОВАНО для всех кроме 389209990) */}
          <div>
            <div
              className={`relative overflow-hidden ${!canAccessDecades ? 'opacity-60' : 'cursor-pointer active:scale-[0.99] transition-transform'}`}
              onClick={() => {
                if (canAccessDecades) {
                  haptic.impact('light');
                  setShowDecadeFlow(!showDecadeFlow);
                }
              }}
              style={{
                borderRadius: '5.73px',
                border: '0.955px solid #d93547',
                background: 'linear-gradient(256.35deg, rgb(174, 30, 43) 15.72%, rgb(156, 23, 35) 99.39%)',
                minHeight: '200px',
              }}
            >
              {/* 🔒 Замочек поверх - только если НЕТ доступа */}
              {!canAccessDecades && (
                <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/20 backdrop-blur-[2px]">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                      <Lock className="w-6 h-6 text-[#9c1723]" />
                    </div>
                    <p
                      style={{
                        fontFamily: 'Gilroy, sans-serif',
                        fontWeight: 600,
                        fontSize: '12px',
                        color: 'white',
                        textShadow: '0 2px 4px rgba(0,0,0,0.3)',
                      }}
                    >
                      Скоро откроется
                    </p>
                  </div>
                </div>
              )}

              {/* Изображение справа */}
              <div
                className="absolute overflow-hidden"
                style={{
                  right: '0px',
                  top: '0',
                  bottom: '0',
                  width: '55%',
                }}
              >
                <img
                  src="/assets/chat-desyatka.png"
                  alt=""
                  className="w-full h-full object-contain object-right-bottom"
                />
              </div>

              {/* Контент слева */}
              <div className="relative z-10 p-4 pr-2" style={{ maxWidth: '55%' }}>
                <h3
                  style={{
                    fontFamily: '"TT Nooks", Georgia, serif',
                    fontWeight: 300,
                    fontSize: '19.4px',
                    lineHeight: 1.05,
                    color: '#f7f1e8',
                    marginBottom: '8px',
                  }}
                >
                  Десятка
                </h3>

                <p
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontWeight: 400,
                    fontSize: '10px',
                    lineHeight: 1.4,
                    color: '#f7f1e8',
                    marginBottom: '4px',
                  }}
                >
                  <span style={{ fontWeight: 700 }}>Твоя малая группа</span> для роста, поддержки и совместной работы внутри клуба.
                </p>

                <p
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontWeight: 400,
                    fontSize: '9px',
                    lineHeight: 1.4,
                    color: '#f7f1e8',
                    marginBottom: '12px',
                  }}
                >
                  *десятка формируется внутри чата города
                </p>

                <button
                  disabled={!canAccessDecades}
                  className={`px-4 py-3 rounded-[5.73px] ${!canAccessDecades ? 'opacity-40 cursor-not-allowed' : 'active:scale-[0.98] transition-transform'}`}
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
                  вступить в десятку
                </button>
              </div>
            </div>

            {/* Селектор города для десятки - показываем только если есть доступ */}
            {showDecadeFlow && canAccessDecades && (
              <div
                className="mt-2 p-4 rounded-lg"
                style={{
                  background: 'rgba(247, 241, 232, 0.95)',
                  border: '1px solid #d93547',
                }}
              >
                <p
                  className="mb-3 text-center"
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontWeight: 500,
                    fontSize: '13px',
                    color: '#2d2620',
                  }}
                >
                  {user?.city
                    ? `Ваш город: ${user.city}. Распределение произойдет в десятку этого города.`
                    : 'Выберите город для распределения в десятку'}
                </p>

                {decadeError && (
                  <div
                    className="mb-3 p-2 rounded text-center"
                    style={{
                      background: 'rgba(156, 23, 35, 0.1)',
                      color: '#9c1723',
                      fontFamily: 'Gilroy, sans-serif',
                      fontSize: '12px',
                    }}
                  >
                    {decadeError}
                  </div>
                )}

                {user?.city ? (
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => {
                        haptic.impact('medium');
                        setDecadeError('');
                        joinDecadeMutation.mutate();
                      }}
                      disabled={joinDecadeMutation.isPending}
                      className="w-full py-3 rounded-lg text-center active:scale-[0.98] transition-transform disabled:opacity-50"
                      style={{
                        background: 'linear-gradient(256.35deg, rgb(174, 30, 43) 15.72%, rgb(156, 23, 35) 99.39%)',
                        fontFamily: 'Gilroy, sans-serif',
                        fontWeight: 600,
                        fontSize: '14px',
                        color: '#f7f1e8',
                        textTransform: 'uppercase',
                      }}
                    >
                      {joinDecadeMutation.isPending ? 'Распределение...' : 'Подтвердить и вступить'}
                    </button>
                    <button
                      onClick={() => {
                        haptic.selection();
                        setSelectedDecadeCity('');
                      }}
                      className="text-sm underline"
                      style={{
                        fontFamily: 'Gilroy, sans-serif',
                        color: '#9c1723',
                      }}
                    >
                      Выбрать другой город
                    </button>
                  </div>
                ) : (
                  <div className="mb-3">
                    <label
                      className="block mb-1.5"
                      style={{
                        fontFamily: 'Gilroy, sans-serif',
                        fontWeight: 600,
                        fontSize: '12px',
                        color: '#2d2620',
                      }}
                    >
                      Город
                    </label>
                    {isLoadingDecadeCities ? (
                      <div className="p-3 bg-white/50 rounded-lg text-center text-[#6b5a4a] text-sm">
                        Загрузка городов...
                      </div>
                    ) : (
                      <select
                        value={selectedDecadeCity}
                        onChange={(e) => {
                          haptic.selection();
                          setSelectedDecadeCity(e.target.value);
                          setDecadeError('');
                        }}
                        className="w-full px-3 py-2.5 rounded-lg border bg-white text-[#2d2620] font-medium text-sm focus:outline-none mb-3"
                        style={{ borderColor: '#d93547' }}
                      >
                        <option value="">Выберите город</option>
                        {decadeCitiesData?.cities?.map((city: string) => (
                          <option key={city} value={city}>
                            {city}
                          </option>
                        ))}
                      </select>
                    )}

                    {selectedDecadeCity && (
                      <button
                        onClick={() => {
                          haptic.impact('medium');
                          setDecadeError('');
                          joinDecadeMutation.mutate(selectedDecadeCity);
                        }}
                        disabled={joinDecadeMutation.isPending}
                        className="w-full py-3 rounded-lg text-center active:scale-[0.98] transition-transform disabled:opacity-50"
                        style={{
                          background: 'linear-gradient(256.35deg, rgb(174, 30, 43) 15.72%, rgb(156, 23, 35) 99.39%)',
                          fontFamily: 'Gilroy, sans-serif',
                          fontWeight: 600,
                          fontSize: '14px',
                          color: '#f7f1e8',
                          textTransform: 'uppercase',
                        }}
                      >
                        {joinDecadeMutation.isPending ? 'Распределение...' : 'Вступить в десятку'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 5. Служба заботы */}
          <div
            className="relative overflow-hidden cursor-pointer active:scale-[0.99] transition-transform"
            onClick={() => {
              haptic.impact('light');
              openLink('https://t.me/Egiazarova_support_bot');
            }}
            style={{
              borderRadius: '5.73px',
              border: '0.955px solid #d93547',
              background: 'linear-gradient(256.35deg, rgb(174, 30, 43) 15.72%, rgb(156, 23, 35) 99.39%)',
              minHeight: '190px',
            }}
          >
            {/* Изображение справа */}
            <div
              className="absolute overflow-hidden"
              style={{
                right: '-10px',
                top: '-15px',
                bottom: '-15px',
                width: '55%',
              }}
            >
              <img
                src="/assets/chat-support.png"
                alt=""
                className="w-full h-full object-contain object-right-bottom"
              />
            </div>

            {/* Контент слева */}
            <div className="relative z-10 p-4 pr-2" style={{ maxWidth: '50%' }}>
              <h3
                style={{
                  fontFamily: '"TT Nooks", Georgia, serif',
                  fontWeight: 300,
                  fontSize: '19.4px',
                  lineHeight: 1.05,
                  color: '#f7f1e8',
                  marginBottom: '8px',
                }}
              >
                Служба заботы
              </h3>

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
                <span style={{ fontWeight: 700 }}>Мы рядом, если возник вопрос или нужна помощь.</span> Напиши — тебе обязательно ответят
              </p>

              <button
                className="px-5 py-3 rounded-[5.73px] active:scale-[0.98] transition-transform"
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
                перейти в бот
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
