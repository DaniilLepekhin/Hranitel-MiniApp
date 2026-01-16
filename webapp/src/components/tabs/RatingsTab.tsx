'use client';

import { useQuery } from '@tanstack/react-query';
import { Trophy, TrendingUp, Star, Medal, Crown } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { gamificationApi } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { motion } from 'framer-motion';

interface LeaderboardEntry {
  rank: number;
  user: {
    id: string;
    firstName: string;
    lastName?: string;
    username?: string;
  };
  score: number;
  level: number;
}

export function RatingsTab() {
  const { user } = useAuthStore();

  // Получаем статистику пользователя
  const { data: statsData } = useQuery({
    queryKey: ['gamification-stats'],
    queryFn: () => gamificationApi.stats(),
    enabled: !!user,
  });

  const stats = statsData?.stats;

  // Мокап данных для лидерборда (позже заменить на реальный API)
  const mockLeaderboard: LeaderboardEntry[] = [
    { rank: 1, user: { id: '1', firstName: 'Анна', lastName: 'К.' }, score: 15420, level: 24 },
    { rank: 2, user: { id: '2', firstName: 'Михаил', username: '@mikhail' }, score: 14280, level: 23 },
    { rank: 3, user: { id: '3', firstName: 'Елена', lastName: 'С.' }, score: 12950, level: 21 },
    { rank: 4, user: { id: '4', firstName: 'Дмитрий' }, score: 11840, level: 20 },
    { rank: 5, user: { id: '5', firstName: 'Ольга', lastName: 'П.' }, score: 10720, level: 19 },
  ];

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="w-5 h-5 text-yellow-500" />;
      case 2:
        return <Medal className="w-5 h-5 text-gray-400" />;
      case 3:
        return <Medal className="w-5 h-5 text-amber-600" />;
      default:
        return <span className="text-sm font-bold text-[#6b5a4a]">#{rank}</span>;
    }
  };

  const getUserDisplayName = (user: LeaderboardEntry['user']) => {
    const name = user.lastName ? `${user.firstName} ${user.lastName}` : user.firstName;
    return user.username ? `${name} ${user.username}` : name;
  };

  return (
    <div className="px-4 pt-6 pb-24">
      {/* Заголовок */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Trophy className="w-8 h-8 text-[#8b0000]" />
          <h1 className="text-4xl font-light text-[#3d2f1f]" style={{ fontFamily: 'TT Nooks, serif' }}>
            Рейтинги
          </h1>
        </div>
        <p className="text-lg text-[#6b5a4a]" style={{ fontFamily: 'TT Nooks, serif' }}>
          Твои достижения и место в общем рейтинге
        </p>
      </div>

      {/* Твоя статистика */}
      <Card className="mb-6 p-5 bg-gradient-to-br from-[#8b0000]/5 to-[#8b4513]/5">
        <h2 className="text-xl font-semibold text-[#3d2f1f] mb-4">Твоя статистика</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-3xl font-bold text-[#8b0000] mb-1">
              {stats?.level || 1}
            </div>
            <div className="text-xs text-[#6b5a4a] font-medium">Уровень</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-[#8b4513] mb-1">
              {stats?.experience || 0}
            </div>
            <div className="text-xs text-[#6b5a4a] font-medium">Опыт</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-[#3d2f1f] mb-1">
              {stats?.streak || 0}
            </div>
            <div className="text-xs text-[#6b5a4a] font-medium">Дни подряд</div>
          </div>
        </div>
      </Card>

      {/* Топ участников */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-[#8b0000]" />
          <h2 className="text-xl font-semibold text-[#3d2f1f]">Топ участников</h2>
        </div>

        <div className="space-y-3">
          {mockLeaderboard.map((entry, index) => (
            <motion.div
              key={entry.user.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className={`p-4 ${entry.user.id === user?.id ? 'bg-[#8b0000]/10 border-2 border-[#8b0000]/30' : ''}`}>
                <div className="flex items-center gap-4">
                  {/* Rank */}
                  <div className="flex-shrink-0 w-10 flex justify-center">
                    {getRankIcon(entry.rank)}
                  </div>

                  {/* User info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[#3d2f1f] truncate">
                      {getUserDisplayName(entry.user)}
                      {entry.user.id === user?.id && (
                        <span className="ml-2 text-xs text-[#8b0000]">(Ты)</span>
                      )}
                    </div>
                    <div className="text-xs text-[#6b5a4a]">Уровень {entry.level}</div>
                  </div>

                  {/* Score */}
                  <div className="text-right">
                    <div className="font-bold text-[#8b0000]">{entry.score.toLocaleString()}</div>
                    <div className="text-xs text-[#6b5a4a]">очков</div>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Информация о системе баллов */}
      <Card className="p-5 bg-gradient-to-br from-[#8b4513]/5 to-[#3d2f1f]/5">
        <div className="flex items-start gap-3">
          <Star className="w-5 h-5 text-[#8b4513] flex-shrink-0 mt-1" />
          <div>
            <h3 className="font-semibold text-[#3d2f1f] mb-2">Как зарабатывать баллы?</h3>
            <ul className="text-sm text-[#6b5a4a] space-y-1">
              <li>• Прохождение медитаций и практик</li>
              <li>• Выполнение заданий и челленджей</li>
              <li>• Участие в эфирах и мероприятиях</li>
              <li>• Ежедневная активность (streak)</li>
              <li>• Приглашение друзей в клуб</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
