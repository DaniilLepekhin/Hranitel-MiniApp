'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { useAuthStore } from '@/store/auth';
import { cityChatsApi, decadesApi } from '@/lib/api';
import { COUNTRIES, getCitiesCached } from '@/lib/staticData';

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
  const { user, token, hasInitialized, setUser } = useAuthStore();
  const queryClient = useQueryClient();

  // 🔄 Обновляем user при каждом открытии вкладки (для актуального города)
  const { data: freshUserData } = useQuery({
    queryKey: ['user', 'profile', user?.id],
    queryFn: async () => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/me`, {
        headers: {
          'Authorization': `Bearer ${useAuthStore.getState().token}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch user');
      const data = await response.json();
      return data;
    },
    enabled: !!user?.id && !!token && hasInitialized,
    staleTime: 0, // Всегда обновляем при открытии вкладки
    refetchOnMount: 'always', // Перезапрашивать при каждом монтировании
  });

  // Обновляем user в store когда получены свежие данные
  useEffect(() => {
    if (freshUserData?.user && user) {
      setUser({ ...user, ...freshUserData.user });
    }
  }, [freshUserData, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 🔒 Проверка доступа к разделу "Десятки" - доступ для всех пользователей
  const canAccessDecades = !!user;

  // City chat selection state
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [showCitySelector, setShowCitySelector] = useState(false);

  // Decade selection state
  const [showDecadeFlow, setShowDecadeFlow] = useState(false);
  const [selectedDecadeCity, setSelectedDecadeCity] = useState<string>('');
  const [decadeError, setDecadeError] = useState<string>('');
  const [myDecadeLink, setMyDecadeLink] = useState<string | null>(null); // Ссылка на мою десятку после успешного join
  const [showCityConfirmation, setShowCityConfirmation] = useState(false); // Подтверждение города перед вступлением

  // Fetch my decade info - запрашиваем при загрузке чтобы показать ссылку если уже в десятке
  const { data: myDecadeData } = useQuery<{ success: boolean; decade: any | null }>({
    queryKey: ['decades', 'my', user?.id],
    queryFn: () => decadesApi.getMy(initData || ''),
    enabled: !!canAccessDecades && !!initData,
    staleTime: 30 * 1000, // 30 секунд кеш
  });

  // Инициализировать ссылку на десятку из данных запроса
  useEffect(() => {
    if (myDecadeData?.decade?.inviteLink && !myDecadeLink) {
      setMyDecadeLink(myDecadeData.decade.inviteLink);
    }
  }, [myDecadeData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Пользователь уже в десятке?
  const isAlreadyInDecade = !!(myDecadeLink || myDecadeData?.decade);

  // Fetch available cities for decades - всегда запрашиваем для проверки доступности
  const { data: decadeCitiesData, isLoading: isLoadingDecadeCities } = useQuery<{ success: boolean; cities: string[] }>({
    queryKey: ['decades', 'cities'],
    queryFn: () => decadesApi.getCities(initData || ''),
    enabled: !!canAccessDecades && !!initData,
    staleTime: 5 * 60 * 1000,
    placeholderData: { success: true, cities: [] },
  });

  // Проверка доступности десяток в городе пользователя
  // Если уже в десятке — всегда разрешаем (чтобы мог открыть чат)
  const hasDecadesInUserCity = isAlreadyInDecade || !user?.city || (decadeCitiesData?.cities || []).includes(user.city);
  const canJoinDecade = canAccessDecades && hasDecadesInUserCity;

  // Join decade mutation
  const joinDecadeMutation = useMutation({
    mutationFn: (city?: string) => decadesApi.join(initData || '', city),
    onSuccess: (data: any) => {
      if (data.success) {
        // Сохранить ссылку на мою десятку
        if (data.inviteLink) {
          setMyDecadeLink(data.inviteLink);
        }

        // Обновить кеш о моей десятке
        queryClient.invalidateQueries({ queryKey: ['decades', 'my'] });

        // Открыть чат десятки
        if (data.inviteLink && webApp?.openTelegramLink) {
          webApp.openTelegramLink(data.inviteLink);
        }

        // Закрыть форму если была открыта
        setShowDecadeFlow(false);
        setDecadeError('');
      } else {
        // Проверяем тип ошибки
        const errorMessage = data.error || data.message || 'Ошибка при распределении';

        // Если пользователь уже в десятке - сохраняем ссылку и открываем чат
        if (data.error === 'already_in_decade' && data.inviteLink) {
          setMyDecadeLink(data.inviteLink);
          if (webApp?.openTelegramLink) {
            webApp.openTelegramLink(data.inviteLink);
          }
          setShowDecadeFlow(false);
          return;
        }

        // Если нет доступных десяток - показываем красивое уведомление
        if (errorMessage.includes('нет доступных десяток') || errorMessage.includes('пока нет мест')) {
          haptic.notification('warning');
          webApp?.showAlert(
            `В городе ${user?.city || 'вашем городе'} пока нет доступных десяток.\n\nДесятки появятся когда лидеры создадут чаты и откроют набор участников.`
          );
          setShowDecadeFlow(false);
        } else {
          // Остальные ошибки показываем в форме
          setDecadeError(errorMessage);
        }
      }
    },
    onError: () => {
      haptic.notification('error');
      webApp?.showAlert('Произошла ошибка при распределении. Попробуйте снова.');
    },
  });

  // 🚀 МГНОВЕННЫЙ РЕНДЕР: Fetch user team
  const { data: teamData } = useQuery({
    queryKey: ['teams', 'my', user?.id],
    queryFn: () => teamsApi.getUserTeam(user!.id),
    enabled: !!user,
    placeholderData: { success: true, team: null },
  });

  // 🚀 ОПТИМИЗАЦИЯ: Используем статические данные стран
  const countries = COUNTRIES;
  const isLoadingCountries = false;

  // 🚀 ОПТИМИЗАЦИЯ: Fetch cities with cache when country is selected
  const { data: citiesData, isLoading: isLoadingCities } = useQuery({
    queryKey: ['city-chats', 'cities', selectedCountry],
    queryFn: () => cityChatsApi.getCities(selectedCountry),
    enabled: !!selectedCountry,
    staleTime: 24 * 60 * 60 * 1000, // Кешируем 24 часа
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

          {/* 4. Десятка (🔒 Контроль доступа: время + наличие мест в городе) */}
          <div>
            <div
              className={`relative overflow-hidden ${!canJoinDecade ? 'opacity-60' : 'cursor-pointer active:scale-[0.99] transition-transform'}`}
              onClick={() => {
                if (!canJoinDecade) return;

                haptic.impact('medium');

                // Сценарий 1: Пользователь уже в десятке (есть сохраненная ссылка) → открыть чат
                if (myDecadeLink) {
                  webApp?.openTelegramLink(myDecadeLink);
                  return;
                }

                // Сценарий 2: У пользователя есть город → показать подтверждение
                if (user?.city) {
                  setShowCityConfirmation(true);
                  return;
                }

                // Сценарий 3: Нет города → показать/скрыть селектор
                const newShowState = !showDecadeFlow;
                setShowDecadeFlow(newShowState);
                if (!newShowState) {
                  setDecadeError('');
                  setSelectedDecadeCity('');
                }
              }}
              style={{
                borderRadius: '5.73px',
                border: '0.955px solid #d93547',
                background: 'linear-gradient(256.35deg, rgb(174, 30, 43) 15.72%, rgb(156, 23, 35) 99.39%)',
                minHeight: '200px',
              }}
            >
              {/* 🔒 Замочек поверх - если нет доступа по времени */}
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

              {/* 🔒 Замочек поверх - если есть доступ по времени, но нет мест в городе */}
              {canAccessDecades && !hasDecadesInUserCity && user?.city && !myDecadeLink && (
                <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/20 backdrop-blur-[2px]">
                  <div className="flex flex-col items-center gap-2 px-4">
                    <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                      <Lock className="w-6 h-6 text-[#9c1723]" />
                    </div>
                    <p
                      style={{
                        fontFamily: 'Gilroy, sans-serif',
                        fontWeight: 600,
                        fontSize: '11px',
                        color: 'white',
                        textShadow: '0 2px 4px rgba(0,0,0,0.3)',
                        textAlign: 'center',
                      }}
                    >
                      Пока нет мест в городе {user.city}
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
                  disabled={!canJoinDecade}
                  className={`px-4 py-3 rounded-[5.73px] ${!canJoinDecade ? 'opacity-40 cursor-not-allowed' : 'active:scale-[0.98] transition-transform'}`}
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

            {/* Селектор города - показываем только если НЕТ города */}
            {showDecadeFlow && canAccessDecades && !user?.city && (
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
                  Выберите город для распределения в десятку
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

                <div>
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
              </div>
            )}

            {/* Модальное окно подтверждения города */}
            {showCityConfirmation && user?.city && (
              <div
                className="mt-2 p-4 rounded-lg"
                style={{
                  background: 'rgba(247, 241, 232, 0.95)',
                  border: '1px solid #d93547',
                }}
              >
                {/* Заголовок */}
                <h4
                  style={{
                    fontFamily: '"TT Nooks", Georgia, serif',
                    fontSize: '18px',
                    color: '#2d2620',
                    marginBottom: '12px',
                    textAlign: 'center',
                  }}
                >
                  Подтвердите город
                </h4>

                {/* Текст */}
                <p
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontSize: '13px',
                    color: '#2d2620',
                    marginBottom: '8px',
                    textAlign: 'center',
                  }}
                >
                  Вы вступите в десятку города:
                </p>

                {/* Город крупно */}
                <p
                  style={{
                    fontFamily: '"TT Nooks", Georgia, serif',
                    fontSize: '24px',
                    color: '#9c1723',
                    fontWeight: 600,
                    marginBottom: '12px',
                    textAlign: 'center',
                  }}
                >
                  {user.city}
                </p>

                {/* Подсказка */}
                <p
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontSize: '11px',
                    color: '#6b5a4a',
                    marginBottom: '16px',
                    textAlign: 'center',
                  }}
                >
                  (согласно вашему профилю)
                </p>

                {/* Предупреждение */}
                <div
                  style={{
                    background: 'rgba(217, 53, 71, 0.1)',
                    padding: '12px',
                    borderRadius: '8px',
                    marginBottom: '16px',
                  }}
                >
                  <p
                    style={{
                      fontFamily: 'Gilroy, sans-serif',
                      fontSize: '12px',
                      color: '#9c1723',
                      textAlign: 'center',
                    }}
                  >
                    Если это не ваш город, измените его в Профиле перед вступлением
                  </p>
                </div>

                {/* Кнопки */}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      haptic.impact('light');
                      setShowCityConfirmation(false);
                      // TODO: Переключение на вкладку "Профиль" (требует передачи функции из родительского компонента)
                    }}
                    className="flex-1 py-3 rounded-lg active:scale-[0.98] transition-transform"
                    style={{
                      background: 'white',
                      border: '1px solid #d93547',
                      fontFamily: 'Gilroy, sans-serif',
                      fontSize: '13px',
                      color: '#9c1723',
                      fontWeight: 600,
                    }}
                  >
                    Изменить город
                  </button>

                  <button
                    onClick={() => {
                      haptic.impact('medium');
                      setShowCityConfirmation(false);
                      setDecadeError('');
                      joinDecadeMutation.mutate(undefined);
                    }}
                    disabled={joinDecadeMutation.isPending}
                    className="flex-1 py-3 rounded-lg active:scale-[0.98] transition-transform disabled:opacity-50"
                    style={{
                      background: 'linear-gradient(256.35deg, rgb(174, 30, 43) 15.72%, rgb(156, 23, 35) 99.39%)',
                      fontFamily: 'Gilroy, sans-serif',
                      fontSize: '13px',
                      color: '#f7f1e8',
                      fontWeight: 600,
                    }}
                  >
                    {joinDecadeMutation.isPending ? 'Распределение...' : 'Продолжить'}
                  </button>
                </div>
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
