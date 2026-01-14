'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Trophy,
  Zap,
  MapPin,
  Users,
  ChevronRight,
  FileText,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { energiesApi, gamificationApi, teamsApi } from '@/lib/api';
import { Card } from '@/components/ui/Card';

export default function RatingsPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  // Fetch user's energy balance
  const { data: epData } = useQuery({
    queryKey: ['energies', 'balance', user?.id],
    queryFn: () => energiesApi.getBalance(user!.id),
    enabled: !!user,
  });

  // Fetch global leaderboard
  const { data: leaderboardData } = useQuery({
    queryKey: ['leaderboard', 50],
    queryFn: () => gamificationApi.leaderboard(50),
    enabled: !!user,
  });

  // Fetch user's team
  const { data: teamData } = useQuery({
    queryKey: ['user-team', user?.id],
    queryFn: () => teamsApi.getUserTeam(user!.id),
    enabled: !!user,
  });

  const epBalance = epData?.balance || 0;
  const leaderboard = leaderboardData?.leaderboard || [];
  const userTeam = teamData?.team;

  const openUrl = (url: string) => {
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      window.Telegram.WebApp.openLink(url);
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="px-4 pt-6 pb-24 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-xl bg-white/60 flex items-center justify-center hover:bg-white/80 transition-all border border-[#8b4513]/30"
        >
          <ArrowLeft className="w-5 h-5 text-[#3d2f1f]" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-[#3d2f1f]">Рейтинги</h1>
        </div>
      </div>

      {/* Description */}
      <div className="mb-6 p-4 rounded-xl bg-gradient-to-br from-[#8b0000]/10 to-[#8b4513]/10">
        <p className="text-sm text-[#3d2f1f]">
          Здесь ты видишь свой прогресс в клубе: баллы за активность, участие и рост. Баллы можно копить, использовать и отслеживать своё движение вместе с другими участниками
        </p>
      </div>

      {/* Current Balance Card */}
      <Card className="p-6 mb-6 bg-gradient-to-br from-[#8b0000] to-[#8b4513] text-white">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            <h3 className="font-semibold text-sm opacity-90">Текущий баланс</h3>
          </div>
        </div>
        <p className="text-xs opacity-90 mb-2">
          Твой личный счёт в клубе. Энергии (баллы) отражают твою активность и движение вперёд
        </p>
        <div className="flex items-end gap-2">
          <p className="text-4xl font-bold">{epBalance}</p>
          <p className="text-sm opacity-90 pb-1.5">энергий ⚡️</p>
        </div>
      </Card>

      {/* General Leaderboard */}
      <Card className="mb-6 overflow-hidden">
        <div className="p-4 border-b border-[#8b4513]/10">
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="w-5 h-5 text-[#8b0000]" />
            <h2 className="text-lg font-bold text-[#3d2f1f]">Общий рейтинг</h2>
          </div>
          <p className="text-xs text-[#6b5a4a]">
            Общий рейтинг участников клуба — твой прогресс в общем движении
          </p>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {leaderboard.length === 0 ? (
            <div className="p-6 text-center text-[#6b5a4a]">
              <Trophy className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Рейтинг пока пуст</p>
            </div>
          ) : (
            leaderboard.map((entry, index) => (
              <LeaderboardEntry
                key={entry.id}
                rank={entry.rank}
                name={entry.firstName || entry.username || 'Участник'}
                energies={entry.experience}
                photoUrl={entry.photoUrl}
                isCurrentUser={entry.id === user?.id}
                isTop3={index < 3}
              />
            ))
          )}
        </div>
      </Card>

      {/* City & Teams Ratings */}
      <Card className="mb-6 overflow-hidden">
        <div className="p-4 border-b border-[#8b4513]/10">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-5 h-5 text-[#8b0000]" />
            <h2 className="text-lg font-bold text-[#3d2f1f]">Рейтинг города и десяток</h2>
          </div>
          <p className="text-xs text-[#6b5a4a]">
            Рейтинг внутри твоего города или десятки. Малые шаги, которые дают большой рост
          </p>
        </div>

        <div className="p-4 text-center text-[#6b5a4a]">
          <Users className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Скоро здесь появятся рейтинги городов и десяток</p>
          {userTeam && (
            <div className="mt-3 p-3 rounded-lg bg-[#f8f6f0]">
              <p className="text-xs text-[#6b5a4a] mb-1">Твоя десятка</p>
              <p className="text-sm font-semibold text-[#3d2f1f]">{userTeam.name}</p>
            </div>
          )}
        </div>
      </Card>

      {/* Shop Link */}
      <Card className="mb-6 overflow-hidden">
        <button
          onClick={() => router.push('/shop')}
          className="w-full p-5 flex items-center gap-4 hover:bg-[#f8f6f0] transition-colors"
        >
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#8b0000] to-[#8b4513] flex items-center justify-center flex-shrink-0">
            <Zap className="w-7 h-7 text-white" />
          </div>
          <div className="flex-1 text-left">
            <h3 className="font-bold text-[#3d2f1f] mb-1">Магазин энергий</h3>
            <p className="text-sm text-[#6b5a4a]">
              Здесь ты можешь обменивать баллы на бонусы, подарки и возможности клуба
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-[#8b4513] flex-shrink-0" />
        </button>
      </Card>

      {/* How to Earn Points */}
      <Card className="mb-6 overflow-hidden">
        <div className="p-5">
          <h3 className="font-bold text-[#3d2f1f] mb-2">Как начисляются баллы</h3>
          <p className="text-sm text-[#6b5a4a] mb-4">
            Мы подготовили документ, где описали основные правила и возможности получения баллов
          </p>
          <button
            onClick={() => openUrl('https://storage.daniillepekhin.com/IK%2Fclub_miniapp%2F%D0%9F%D1%80%D0%B0%D0%B2%D0%B8%D0%BB%D0%B0%20%D0%BA%D0%BB%D1%83%D0%B1%D0%B0.pdf')}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#8b0000] text-white font-medium hover:bg-[#a00000] transition-colors"
          >
            <FileText className="w-5 h-5" />
            Ознакомиться
          </button>
        </div>
      </Card>
    </div>
  );
}

interface LeaderboardEntryProps {
  rank: number;
  name: string;
  energies: number;
  photoUrl?: string | null;
  isCurrentUser: boolean;
  isTop3: boolean;
}

function LeaderboardEntry({
  rank,
  name,
  energies,
  photoUrl,
  isCurrentUser,
  isTop3,
}: LeaderboardEntryProps) {
  const getRankIcon = () => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return null;
  };

  return (
    <div
      className={`flex items-center gap-3 p-4 border-b border-[#8b4513]/10 last:border-b-0 ${
        isCurrentUser ? 'bg-gradient-to-r from-[#8b0000]/10 to-[#8b4513]/10' : ''
      } ${isTop3 ? 'bg-[#f8f6f0]' : ''}`}
    >
      {/* Rank */}
      <div className="w-10 text-center">
        {getRankIcon() ? (
          <span className="text-2xl">{getRankIcon()}</span>
        ) : (
          <span className="text-lg font-bold text-[#6b5a4a]">#{rank}</span>
        )}
      </div>

      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={name}
            className="w-12 h-12 rounded-full border-2 border-[#8b4513]/20"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#8b0000] to-[#8b4513] flex items-center justify-center text-white font-bold border-2 border-[#8b4513]/20">
            {name[0]?.toUpperCase()}
          </div>
        )}
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <p className={`font-semibold truncate ${isCurrentUser ? 'text-[#8b0000]' : 'text-[#3d2f1f]'}`}>
          {name}
          {isCurrentUser && <span className="text-xs ml-2">(Вы)</span>}
        </p>
      </div>

      {/* Energies */}
      <div className="flex items-center gap-1 text-[#8b0000] font-bold">
        <span>{energies}</span>
        <Zap className="w-4 h-4" />
      </div>
    </div>
  );
}
