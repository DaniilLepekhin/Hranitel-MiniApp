'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTelegram } from '@/hooks/useTelegram';
import { useAuthStore } from '@/store/auth';
import { cityChatsApi } from '@/lib/api';

// API endpoints
const teamsApi = {
  getUserTeam: async (userId: string) => {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/teams/my?userId=${userId}`);
    if (!response.ok) throw new Error('Failed to fetch team');
    return response.json();
  },
};

// Карточки чатов с данными
const chatCards = [
  {
    id: 'kod-app',
    title: 'Приложение KOD',
    description: 'Тебе доступна подписка на наше приложение ментального здоровья',
    buttonText: 'получить доступ',
    url: 'http://qr.numschool-web.ru/',
    image: '/assets/chat-kod-app.jpg',
  },
  {
    id: 'main-channel',
    title: 'Основной канал клуба',
    description: 'Здесь все важные новости клуба, анонсы эфиров и ключевые обновления. Рекомендуем быть здесь всегда и закрепить этот канал.',
    buttonText: 'вступить',
    url: 'https://t.me/+mwJ5e0d78GYzNDRi',
    image: '/assets/chat-main-channel.jpg',
  },
  {
    id: 'city-chat',
    title: 'Чат города',
    description: 'Пространство для общения с участниками из твоего города, встреч и живого контакта рядом.',
    buttonText: 'вступить в чат города',
    image: '/assets/chat-city.jpg',
    isCityChat: true,
  },
  {
    id: 'desyatka',
    title: 'Десятка',
    description: 'Твоя малая группа для роста, поддержки и совместной работы внутри клуба.',
    secondaryText: '*десятка формируется внутри чата города',
    buttonText: 'вступить в десятку',
    image: '/assets/chat-desyatka.jpg',
    isTeam: true,
  },
  {
    id: 'support',
    title: 'Служба заботы',
    description: 'Мы рядом, если возник вопрос или нужна помощь. Напиши — тебе обязательно ответят!',
    buttonText: 'перейти в бот',
    url: 'https://t.me/Egiazarova_support_bot',
    image: '/assets/chat-support.jpg',
  },
];

export function ChatsTab() {
  const { haptic, webApp } = useTelegram();
  const { user } = useAuthStore();

  // City chat selection state
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [showCitySelector, setShowCitySelector] = useState(false);

  // Fetch user team
  const { data: teamData } = useQuery({
    queryKey: ['teams', 'my', user?.id],
    queryFn: () => teamsApi.getUserTeam(user!.id),
    enabled: !!user,
  });

  // Fetch countries
  const { data: countriesData, isLoading: isLoadingCountries } = useQuery({
    queryKey: ['city-chats', 'countries'],
    queryFn: () => cityChatsApi.getCountries(),
  });

  // Fetch cities when country is selected
  const { data: citiesData, isLoading: isLoadingCities } = useQuery({
    queryKey: ['city-chats', 'cities', selectedCountry],
    queryFn: () => cityChatsApi.getCities(selectedCountry),
    enabled: !!selectedCountry,
  });

  // Fetch chat link when city is selected
  const { data: chatLinkData } = useQuery({
    queryKey: ['city-chats', 'link', selectedCity],
    queryFn: () => cityChatsApi.getChatLink(selectedCity),
    enabled: !!selectedCity,
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

  const handleJoinCityChat = () => {
    if (chatLinkData?.chatLink) {
      haptic.impact('medium');
      if (webApp?.openTelegramLink) {
        webApp.openTelegramLink(chatLinkData.chatLink);
      } else {
        openLink(chatLinkData.chatLink);
      }
    }
  };

  const handleCardClick = (card: typeof chatCards[0]) => {
    haptic.impact('light');

    if (card.isCityChat) {
      setShowCitySelector(!showCitySelector);
      return;
    }

    if (card.isTeam) {
      if (team?.cityChat) {
        openLink(team.cityChat);
      }
      return;
    }

    if (card.url) {
      openLink(card.url);
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
          {chatCards.map((card) => (
            <div key={card.id}>
              <ChatCard
                title={card.title}
                description={card.description}
                secondaryText={card.secondaryText}
                buttonText={card.buttonText}
                image={card.image}
                onClick={() => handleCardClick(card)}
                isExpanded={card.isCityChat && showCitySelector}
                isDisabled={card.isTeam && !team?.cityChat}
              />

              {/* Селектор города (показывается при клике на "Чат города") */}
              {card.isCityChat && showCitySelector && (
                <div
                  className="mt-2 p-4 rounded-lg"
                  style={{
                    background: 'rgba(247, 241, 232, 0.95)',
                    border: '1px solid #d93547',
                  }}
                >
                  {/* Выбор страны */}
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

                  {/* Выбор города */}
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

                  {/* Кнопка вступить */}
                  {selectedCity && chatLinkData?.chatLink && (
                    <button
                      onClick={handleJoinCityChat}
                      className="w-full py-3 rounded-lg text-center active:scale-[0.98] transition-transform"
                      style={{
                        background: 'linear-gradient(256.35deg, rgb(174, 30, 43) 15.72%, rgb(156, 23, 35) 99.39%)',
                        fontFamily: 'Gilroy, sans-serif',
                        fontWeight: 600,
                        fontSize: '14px',
                        color: '#f7f1e8',
                        textTransform: 'lowercase',
                      }}
                    >
                      вступить в чат
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Компонент карточки чата
interface ChatCardProps {
  title: string;
  description: string;
  secondaryText?: string;
  buttonText: string;
  image: string;
  onClick: () => void;
  isExpanded?: boolean;
  isDisabled?: boolean;
}

function ChatCard({
  title,
  description,
  secondaryText,
  buttonText,
  image,
  onClick,
  isExpanded,
  isDisabled
}: ChatCardProps) {
  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden cursor-pointer active:scale-[0.99] transition-transform ${isDisabled ? 'opacity-60' : ''}`}
      style={{
        borderRadius: '8px',
        border: '1px solid #d93547',
        background: 'linear-gradient(256.35deg, rgb(174, 30, 43) 15.72%, rgb(156, 23, 35) 99.39%)',
        minHeight: '140px',
      }}
    >
      {/* Изображение справа */}
      <div
        className="absolute right-0 top-0 bottom-0 overflow-hidden"
        style={{
          width: '45%',
          borderTopRightRadius: '8px',
          borderBottomRightRadius: '8px',
        }}
      >
        <img
          src={image}
          alt=""
          className="w-full h-full object-cover"
          style={{
            objectPosition: 'center',
            mixBlendMode: 'luminosity',
            opacity: 0.85,
          }}
        />
        {/* Градиент поверх изображения для плавного перехода */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to right, rgb(156, 23, 35) 0%, transparent 50%)',
          }}
        />
      </div>

      {/* Контент слева */}
      <div className="relative z-10 p-4" style={{ maxWidth: '60%' }}>
        {/* Заголовок */}
        <h3
          style={{
            fontFamily: '"TT Nooks", Georgia, serif',
            fontWeight: 300,
            fontSize: '22px',
            lineHeight: 1.1,
            color: '#f7f1e8',
            marginBottom: '8px',
          }}
        >
          {title}
        </h3>

        {/* Описание */}
        <p
          style={{
            fontFamily: 'Gilroy, sans-serif',
            fontWeight: 400,
            fontSize: '11px',
            lineHeight: 1.4,
            color: 'rgba(247, 241, 232, 0.85)',
            marginBottom: secondaryText ? '4px' : '12px',
          }}
        >
          {description}
        </p>

        {/* Дополнительный текст */}
        {secondaryText && (
          <p
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontWeight: 400,
              fontSize: '10px',
              lineHeight: 1.4,
              color: 'rgba(247, 241, 232, 0.6)',
              marginBottom: '12px',
              fontStyle: 'italic',
            }}
          >
            {secondaryText}
          </p>
        )}

        {/* Кнопка */}
        <button
          className="px-4 py-2 rounded-full active:scale-[0.98] transition-transform"
          style={{
            background: '#f7f1e8',
            fontFamily: 'Gilroy, sans-serif',
            fontWeight: 600,
            fontSize: '12px',
            color: '#9c1723',
            textTransform: 'lowercase',
            border: 'none',
          }}
        >
          {buttonText}
        </button>
      </div>
    </div>
  );
}
