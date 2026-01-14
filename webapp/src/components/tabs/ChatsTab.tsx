'use client';

import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Users, MessageCircle, HeadphonesIcon } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { useAuthStore } from '@/store/auth';
import { Card } from '@/components/ui/Card';

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
    gradient: 'from-orange-400 to-pink-500',
    members: '15K+',
  },
  {
    id: 'support',
    title: 'Служба заботы',
    description: 'Помощь и поддержка участников клуба',
    icon: '🆘',
    url: 'https://t.me/kod_deneg_support',
    gradient: 'from-blue-400 to-cyan-500',
    members: 'support',
  },
];

export function ChatsTab() {
  const { haptic, webApp } = useTelegram();
  const { user } = useAuthStore();

  // Fetch user team
  const { data: teamData, isLoading } = useQuery({
    queryKey: ['teams', 'my', user?.id],
    queryFn: () => teamsApi.getUserTeam(user!.id),
    enabled: !!user,
  });

  const team = teamData?.team;

  const openLink = (url: string) => {
    haptic.impact('light');
    webApp?.openTelegramLink(url);
  };

  return (
    <div className="px-4 pt-6 pb-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-500 bg-clip-text text-transparent mb-2">
          💬 Чаты
        </h1>
        <p className="text-gray-400 text-sm">
          Общайся с единомышленниками
        </p>
      </div>

      {/* Club Channels */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-orange-400" />
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
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${channel.gradient} flex items-center justify-center text-2xl`}>
                  {channel.icon}
                </div>

                <div className="flex-1">
                  <h3 className="font-semibold text-white mb-0.5">{channel.title}</h3>
                  <p className="text-gray-400 text-xs mb-1">{channel.description}</p>
                  {channel.members !== 'support' && (
                    <div className="flex items-center gap-1 text-gray-500 text-xs">
                      <Users className="w-3 h-3" />
                      <span>{channel.members} участников</span>
                    </div>
                  )}
                </div>

                <ExternalLink className="w-5 h-5 text-gray-500" />
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* User Team (Десятка) */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <Users className="w-5 h-5 text-purple-400" />
          Моя Десятка
        </h2>

        {isLoading ? (
          <Card className="p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gradient-to-br from-purple-400 to-pink-500 animate-pulse" />
            <p className="text-gray-400">Загрузка...</p>
          </Card>
        ) : !team ? (
          <Card className="p-6 text-center">
            <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-purple-400/20 to-pink-500/20 flex items-center justify-center border border-purple-500/30">
              <Users className="w-8 h-8 text-purple-400" />
            </div>
            <h3 className="font-semibold text-white mb-2">Десятка формируется</h3>
            <p className="text-gray-400 text-sm mb-4">
              Скоро мы распределим тебя в команду с единомышленниками
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/10 rounded-lg border border-purple-500/30">
              <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
              <span className="text-purple-400 text-sm font-medium">Ожидание</span>
            </div>
          </Card>
        ) : (
          <Card className="p-4 bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold text-white text-lg mb-1">{team.name}</h3>
                {team.metka && (
                  <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-purple-500/20 rounded-lg border border-purple-500/30">
                    <span className="text-purple-400 text-xs font-semibold uppercase">{team.metka}</span>
                  </div>
                )}
              </div>

              <div className="text-right">
                <div className="text-2xl font-bold text-white">{team.memberCount}</div>
                <div className="text-xs text-gray-400">из {team.maxMembers}</div>
              </div>
            </div>

            {team.cityChat && (
              <button
                onClick={() => openLink(team.cityChat)}
                className="w-full px-4 py-3 rounded-lg bg-gradient-to-r from-purple-400 to-pink-500 text-white font-semibold flex items-center justify-center gap-2 hover:shadow-lg transition-all active:scale-95"
              >
                <MessageCircle className="w-5 h-5" />
                Открыть чат города
              </button>
            )}

            {!team.cityChat && (
              <div className="w-full px-4 py-3 rounded-lg bg-gray-800/50 text-gray-400 text-sm text-center border border-gray-700/30">
                Чат скоро будет создан
              </div>
            )}

            <div className="mt-3 pt-3 border-t border-gray-700/30">
              <p className="text-gray-400 text-xs">
                Твоя роль: <span className="text-white font-semibold">
                  {team.userRole === 'leader' ? '👑 Лидер' : '👤 Участник'}
                </span>
              </p>
              <p className="text-gray-500 text-xs mt-1">
                Вступил: {new Date(team.joinedAt).toLocaleDateString('ru-RU')}
              </p>
            </div>
          </Card>
        )}
      </div>

      {/* Info Block */}
      <div className="mt-6 p-4 bg-gradient-to-br from-blue-500/5 to-cyan-500/5 rounded-xl border border-blue-500/10">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
            <HeadphonesIcon className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm mb-1">Десятки - это</h4>
            <p className="text-gray-400 text-xs leading-relaxed">
              Небольшие группы участников (6-12 человек) для совместного прохождения программы,
              поддержки и обмена опытом. Ты автоматически распределен в команду по твоим интересам.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
