'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Users, MessageCircle, HeadphonesIcon, MapPin, Globe } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { useAuthStore } from '@/store/auth';
import { Card } from '@/components/ui/Card';
import { cityChatsApi } from '@/lib/api';

// API endpoints
const teamsApi = {
  getUserTeam: async (userId: string) => {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/teams/my?userId=${userId}`);
    if (!response.ok) throw new Error('Failed to fetch team');
    return response.json();
  },
};

// Каналы клуба (статические ссылки)
const clubChannels = [
  {
    id: 'main',
    title: 'КОД ДЕНЕГ',
    description: 'Основной канал клуба с важными объявлениями',
    icon: '💰',
    url: 'https://t.me/kod_deneg_club',
    members: '15K+',
  },
  {
    id: 'support',
    title: 'Служба заботы',
    description: 'Помощь и поддержка участников клуба',
    icon: '🆘',
    url: 'https://t.me/kod_deneg_support',
    members: 'support',
  },
];

export function ChatsTab() {
  const { haptic, webApp } = useTelegram();
  const { user } = useAuthStore();

  // City chat selection state
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('');

  // Fetch user team
  const { data: teamData, isLoading } = useQuery({
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
    // Use openLink for regular URLs or window.open as fallback
    if (webApp?.openLink) {
      webApp.openLink(url);
    } else {
      window.open(url, '_blank');
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

  const handleJoinChat = () => {
    if (chatLinkData?.chatLink) {
      haptic.impact('medium');
      // Use Telegram WebApp method to open link
      if (webApp?.openTelegramLink) {
        webApp.openTelegramLink(chatLinkData.chatLink);
      } else {
        openLink(chatLinkData.chatLink);
      }
    }
  };

  return (
    <div className="px-4 pt-6 pb-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="section-title">Чаты</h1>
        <p className="text-[#6b5a4a] text-sm text-center">
          Общайся с единомышленниками
        </p>
      </div>

      {/* Club Channels */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-[#3d2f1f] mb-3 flex items-center gap-2 border-b-2 border-[#8b0000] pb-2">
          <MessageCircle className="w-5 h-5 text-[#8b0000]" />
          Каналы клуба
        </h2>

        <div className="grid gap-3">
          {clubChannels.map((channel) => (
            <Card
              key={channel.id}
              className="p-4 cursor-pointer hover:scale-[1.02] transition-all"
              onClick={() => openLink(channel.url)}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#8b0000] to-[#8b4513] flex items-center justify-center text-2xl shadow-md">
                  {channel.icon}
                </div>

                <div className="flex-1">
                  <h3 className="font-semibold text-[#3d2f1f] mb-0.5">{channel.title}</h3>
                  <p className="text-[#6b5a4a] text-xs mb-1">{channel.description}</p>
                  {channel.members !== 'support' && (
                    <div className="flex items-center gap-1 text-[#8b4513] text-xs">
                      <Users className="w-3 h-3" />
                      <span>{channel.members} участников</span>
                    </div>
                  )}
                </div>

                <ExternalLink className="w-5 h-5 text-[#8b4513]" />
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* City Chats (Городские чаты) */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-[#3d2f1f] mb-3 flex items-center gap-2 border-b-2 border-[#8b0000] pb-2">
          <MapPin className="w-5 h-5 text-[#8b0000]" />
          Городские чаты
        </h2>

        <Card className="p-4">
          {/* Country Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-[#3d2f1f] mb-2 flex items-center gap-2">
              <Globe className="w-4 h-4 text-[#8b0000]" />
              Выберите страну
            </label>

            {isLoadingCountries ? (
              <div className="p-3 bg-[#e8dcc6]/50 rounded-lg text-center text-[#6b5a4a] text-sm">
                Загрузка стран...
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                {countries.map((country) => (
                  <button
                    key={country}
                    onClick={() => handleCountrySelect(country)}
                    className={`p-3 rounded-lg border-2 transition-all text-sm font-medium ${
                      selectedCountry === country
                        ? 'bg-[#8b0000] text-white border-[#8b0000] shadow-md scale-105'
                        : 'bg-white text-[#3d2f1f] border-[#8b4513]/30 hover:border-[#8b0000] hover:bg-[#8b0000]/5'
                    }`}
                  >
                    {country}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* City Selection */}
          {selectedCountry && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-[#3d2f1f] mb-2 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#8b0000]" />
                Выберите город
              </label>

              {isLoadingCities ? (
                <div className="p-3 bg-[#e8dcc6]/50 rounded-lg text-center text-[#6b5a4a] text-sm">
                  Загрузка городов...
                </div>
              ) : cities.length === 0 ? (
                <div className="p-3 bg-[#e8dcc6]/50 rounded-lg text-center text-[#6b5a4a] text-sm">
                  Нет доступных городов
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto">
                  {cities.map((city) => (
                    <button
                      key={city.name}
                      onClick={() => handleCitySelect(city.name)}
                      className={`p-3 rounded-lg border-2 transition-all text-sm font-medium text-left ${
                        selectedCity === city.name
                          ? 'bg-[#8b0000] text-white border-[#8b0000] shadow-md'
                          : 'bg-white text-[#3d2f1f] border-[#8b4513]/30 hover:border-[#8b0000] hover:bg-[#8b0000]/5'
                      }`}
                    >
                      <div className="font-semibold">{city.name}</div>
                      {city.chatName && (
                        <div className="text-xs opacity-80 mt-1">{city.chatName}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Join Chat Button */}
          {selectedCity && chatLinkData?.chatLink && (
            <button
              onClick={handleJoinChat}
              className="w-full px-4 py-3 rounded-lg bg-gradient-to-r from-[#8b0000] to-[#8b4513] text-white font-semibold flex items-center justify-center gap-2 hover:shadow-lg transition-all active:scale-95"
            >
              <MessageCircle className="w-5 h-5" />
              Вступить в чат {selectedCity}
            </button>
          )}

          {!selectedCountry && (
            <div className="p-3 bg-gradient-to-br from-[#8b0000]/5 to-[#8b4513]/5 rounded-lg border border-[#8b4513]/20 text-center">
              <p className="text-[#6b5a4a] text-sm">
                Выберите страну, чтобы увидеть доступные городские чаты
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* User Team (Десятка) */}
      <div>
        <h2 className="text-lg font-semibold text-[#3d2f1f] mb-3 flex items-center gap-2 border-b-2 border-[#8b0000] pb-2">
          <Users className="w-5 h-5 text-[#8b0000]" />
          Моя Десятка
        </h2>

        {isLoading ? (
          <Card className="p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gradient-to-br from-[#8b0000] to-[#8b4513] animate-pulse" />
            <p className="text-[#6b5a4a]">Загрузка...</p>
          </Card>
        ) : !team ? (
          <Card className="p-6 text-center">
            <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-[#8b0000]/20 to-[#8b4513]/20 flex items-center justify-center border border-[#8b4513]/30">
              <Users className="w-8 h-8 text-[#8b0000]" />
            </div>
            <h3 className="font-semibold text-[#3d2f1f] mb-2">Десятка формируется</h3>
            <p className="text-[#6b5a4a] text-sm mb-4">
              Скоро мы распределим тебя в команду с единомышленниками
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#8b0000]/10 rounded-lg border border-[#8b4513]/30">
              <div className="w-2 h-2 bg-[#8b0000] rounded-full animate-pulse" />
              <span className="text-[#8b0000] text-sm font-medium">Ожидание</span>
            </div>
          </Card>
        ) : (
          <Card className="p-4 bg-gradient-to-br from-[#8b0000]/10 to-[#8b4513]/10 border-[#8b4513]/30">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold text-[#3d2f1f] text-lg mb-1">{team.name}</h3>
                {team.metka && (
                  <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-[#8b0000]/20 rounded-lg border border-[#8b4513]/30">
                    <span className="text-[#8b0000] text-xs font-semibold uppercase">{team.metka}</span>
                  </div>
                )}
              </div>

              <div className="text-right">
                <div className="text-2xl font-bold text-[#3d2f1f]">{team.memberCount}</div>
                <div className="text-xs text-[#6b5a4a]">из {team.maxMembers}</div>
              </div>
            </div>

            {team.cityChat && (
              <button
                onClick={() => openLink(team.cityChat)}
                className="w-full px-4 py-3 rounded-lg bg-gradient-to-r from-[#8b0000] to-[#8b4513] text-white font-semibold flex items-center justify-center gap-2 hover:shadow-lg transition-all active:scale-95"
              >
                <MessageCircle className="w-5 h-5" />
                Открыть чат города
              </button>
            )}

            {!team.cityChat && (
              <div className="w-full px-4 py-3 rounded-lg bg-[#e8dcc6] text-[#6b5a4a] text-sm text-center border border-[#8b4513]/20">
                Чат скоро будет создан
              </div>
            )}

            <div className="mt-3 pt-3 border-t border-[#8b4513]/20">
              <p className="text-[#6b5a4a] text-xs">
                Твоя роль: <span className="text-[#3d2f1f] font-semibold">
                  {team.userRole === 'leader' ? '👑 Лидер' : '👤 Участник'}
                </span>
              </p>
              <p className="text-[#8b4513] text-xs mt-1">
                Вступил: {new Date(team.joinedAt).toLocaleDateString('ru-RU')}
              </p>
            </div>
          </Card>
        )}
      </div>

      {/* Info Block */}
      <div className="mt-6 p-4 bg-gradient-to-br from-[#8b0000]/5 to-[#8b4513]/5 rounded-xl border border-[#8b4513]/20">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#8b0000]/20 flex items-center justify-center flex-shrink-0">
            <HeadphonesIcon className="w-4 h-4 text-[#8b0000]" />
          </div>
          <div>
            <h4 className="text-[#3d2f1f] font-semibold text-sm mb-1">Десятки - это</h4>
            <p className="text-[#6b5a4a] text-xs leading-relaxed">
              Небольшие группы участников (6-12 человек) для совместного прохождения программы,
              поддержки и обмена опытом. Ты автоматически распределен в команду по твоим интересам.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
