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
  MessageSquare,
  Camera,
  Video,
  Sparkles,
  Star,
  Crown,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { energiesApi, gamificationApi, teamsApi } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { FullscreenButton } from '@/components/ui/FullscreenButton';

export default function RatingsPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  // Fetch user's energy balance
  const { data: epData } = useQuery({
    queryKey: ['energies', 'balance', user?.id],
    queryFn: () => energiesApi.getBalance(),
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

  // Fetch weekly hashtag progress
  const { data: progressData } = useQuery({
    queryKey: ['weekly-progress', user?.id],
    queryFn: () => energiesApi.getWeeklyProgress(),
    enabled: !!user,
  });

  const epBalance = epData?.balance || 0;
  const leaderboard = leaderboardData?.leaderboard || [];
  const userTeam = teamData?.team;
  const weeklyProgress = progressData?.progress;
  const isLeader = progressData?.isLeader || false;

  return (
    <>
      <FullscreenButton />
      <div className="px-4 pt-6 pb-24 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-xl bg-white/60 flex items-center justify-center hover:bg-white/80 transition-all border border-[#9c1723]/30"
        >
          <ArrowLeft className="w-5 h-5 text-[#2b2520]" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-[#2b2520]">Рейтинги</h1>
        </div>
      </div>

      {/* Description */}
      <div className="mb-6 p-4 rounded-xl bg-gradient-to-br from-[#d93547]/10 to-[#9c1723]/10">
        <p className="text-sm text-[#2b2520]">
          Здесь ты видишь свой прогресс в клубе: баллы за активность, участие и рост. Баллы можно копить, использовать и отслеживать своё движение вместе с другими участниками
        </p>
      </div>

      {/* Current Balance Card */}
      <Card className="p-6 mb-6 bg-gradient-to-br from-[#d93547] to-[#9c1723] text-white">
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
        <div className="p-4 border-b border-[#9c1723]/10">
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="w-5 h-5 text-[#d93547]" />
            <h2 className="text-lg font-bold text-[#2b2520]">Общий рейтинг</h2>
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
        <div className="p-4 border-b border-[#9c1723]/10">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-5 h-5 text-[#d93547]" />
            <h2 className="text-lg font-bold text-[#2b2520]">Рейтинг города и десяток</h2>
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
              <p className="text-sm font-semibold text-[#2b2520]">{userTeam.name}</p>
            </div>
          )}
        </div>
      </Card>

      {/* Shop Link */}
      <Card className="mb-6 overflow-hidden">
        <button
          onClick={() => router.push('/?tab=shop')}
          className="w-full p-5 flex items-center gap-4 hover:bg-[#f8f6f0] transition-colors"
        >
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#d93547] to-[#9c1723] flex items-center justify-center flex-shrink-0">
            <Zap className="w-7 h-7 text-white" />
          </div>
          <div className="flex-1 text-left">
            <h3 className="font-bold text-[#2b2520] mb-1">Магазин энергии</h3>
            <p className="text-sm text-[#6b5a4a]">
              Здесь ты можешь обменивать баллы на бонусы, подарки и возможности клуба
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-[#9c1723] flex-shrink-0" />
        </button>
      </Card>

      {/* How to Earn Points — Inline Rules + Weekly Progress */}
      <Card className="mb-6 overflow-hidden">
        <div className="p-4 border-b border-[#9c1723]/10">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-[#d93547]" />
            <h2 className="text-lg font-bold text-[#2b2520]">Как начисляются баллы</h2>
          </div>
          <p className="text-xs text-[#6b5a4a]">
            Выполняй действия в чатах и получай Энергию. Неделя считается с Пн по Вс (МСК)
          </p>
          {isLeader && (
            <div className="mt-2 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r from-[#d93547]/10 to-[#9c1723]/10 w-fit">
              <Crown className="w-3.5 h-3.5 text-[#d93547]" />
              <span className="text-xs font-semibold text-[#d93547]">x2 бонус лидера</span>
            </div>
          )}
        </div>

        <div className="p-4 space-y-3">
          {/* Десятка section */}
          <div className="mb-1">
            <p className="text-[10px] uppercase tracking-wider font-bold text-[#6b5a4a]/60 mb-2">Чат десятки</p>
          </div>

          <HashtagRuleCard
            icon={<MessageSquare className="w-4 h-4" />}
            hashtags="#отчет / #дз"
            reward={50}
            periodLabel="1 раз в день"
            used={weeklyProgress?.otchet?.used}
            max={1}
            period="daily"
            isLeader={isLeader}
          />

          {/* Город section */}
          <div className="mt-4 mb-1">
            <p className="text-[10px] uppercase tracking-wider font-bold text-[#6b5a4a]/60 mb-2">Чат города</p>
          </div>

          <HashtagRuleCard
            icon={<Star className="w-4 h-4" />}
            hashtags="#практика"
            reward={50}
            periodLabel="1 раз в неделю, Сб/Вс"
            used={weeklyProgress?.praktika?.used}
            max={1}
            period="weekly"
            note="С фото/видео"
            isLeader={isLeader}
          />

          <HashtagRuleCard
            icon={<Sparkles className="w-4 h-4" />}
            hashtags="#инсайт"
            reward={40}
            periodLabel="макс. 3 в неделю"
            used={weeklyProgress?.insight?.used}
            max={3}
            period="weekly"
            isLeader={isLeader}
          />

          <HashtagRuleCard
            icon={<Video className="w-4 h-4" />}
            hashtags="#созвон"
            reward={100}
            periodLabel="макс. 3 в неделю"
            used={weeklyProgress?.sozvon?.used}
            max={3}
            period="weekly"
            note="С фото/видео"
            isLeader={isLeader}
          />

          <HashtagRuleCard
            icon={<Camera className="w-4 h-4" />}
            hashtags="#сторис"
            reward={200}
            periodLabel="макс. 3 в неделю"
            used={weeklyProgress?.storis?.used}
            max={3}
            period="weekly"
            note="С фото/видео"
            isLeader={isLeader}
          />

          <HashtagRuleCard
            icon={<Zap className="w-4 h-4" />}
            hashtags="#созвон + #сторис"
            reward={300}
            periodLabel="макс. 3 в неделю"
            used={weeklyProgress?.combo?.used}
            max={3}
            period="weekly"
            note="Комбо! С фото/видео"
            isLeader={isLeader}
            isCombo
          />
        </div>
      </Card>
      </div>
    </>
  );
}

// --- HashtagRuleCard component ---

interface HashtagRuleCardProps {
  icon: React.ReactNode;
  hashtags: string;
  reward: number;
  periodLabel: string;
  used?: number;
  max: number;
  period: 'daily' | 'weekly';
  note?: string;
  isLeader: boolean;
  isCombo?: boolean;
}

function HashtagRuleCard({
  icon,
  hashtags,
  reward,
  periodLabel,
  used,
  max,
  period,
  note,
  isLeader,
  isCombo,
}: HashtagRuleCardProps) {
  const actualUsed = used ?? 0;
  const isFull = actualUsed >= max;
  const displayReward = isLeader ? reward * 2 : reward;

  return (
    <div
      className={`rounded-xl p-3 border transition-all ${
        isCombo
          ? 'bg-gradient-to-r from-[#d93547]/5 to-[#9c1723]/10 border-[#d93547]/20'
          : isFull
            ? 'bg-[#f0ede8] border-[#d4cfc6]'
            : 'bg-white border-[#9c1723]/10'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
            isCombo
              ? 'bg-gradient-to-br from-[#d93547] to-[#9c1723] text-white'
              : isFull
                ? 'bg-[#d4cfc6] text-white'
                : 'bg-[#d93547]/10 text-[#d93547]'
          }`}
        >
          {icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-sm font-bold ${isFull ? 'text-[#9a958d]' : 'text-[#2b2520]'}`}>
              {hashtags}
            </span>
            <span
              className={`text-sm font-bold whitespace-nowrap ${
                isCombo ? 'text-[#d93547]' : isFull ? 'text-[#9a958d]' : 'text-[#d93547]'
              }`}
            >
              +{displayReward}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[11px] ${isFull ? 'text-[#b0aaa2]' : 'text-[#6b5a4a]'}`}>
              {periodLabel}
            </span>
            {note && (
              <>
                <span className="text-[#d4cfc6]">·</span>
                <span className={`text-[11px] ${isCombo ? 'text-[#d93547] font-medium' : isFull ? 'text-[#b0aaa2]' : 'text-[#6b5a4a]'}`}>
                  {note}
                </span>
              </>
            )}
          </div>

          {/* Progress bar */}
          {used !== undefined && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-0.5">
                <span className={`text-[10px] font-medium ${isFull ? 'text-[#9a958d]' : 'text-[#6b5a4a]'}`}>
                  {period === 'daily' ? 'Сегодня' : 'На этой неделе'}
                </span>
                <span className={`text-[10px] font-bold ${isFull ? 'text-[#9a958d]' : 'text-[#d93547]'}`}>
                  {actualUsed} / {max}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[#e8e4de] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    isFull
                      ? 'bg-[#b0aaa2]'
                      : isCombo
                        ? 'bg-gradient-to-r from-[#d93547] to-[#9c1723]'
                        : 'bg-[#d93547]'
                  }`}
                  style={{ width: `${Math.min((actualUsed / max) * 100, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- LeaderboardEntry component ---

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
      className={`flex items-center gap-3 p-4 border-b border-[#9c1723]/10 last:border-b-0 ${
        isCurrentUser ? 'bg-gradient-to-r from-[#d93547]/10 to-[#9c1723]/10' : ''
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
            className="w-12 h-12 rounded-full border-2 border-[#9c1723]/20"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#d93547] to-[#9c1723] flex items-center justify-center text-white font-bold border-2 border-[#9c1723]/20">
            {name[0]?.toUpperCase()}
          </div>
        )}
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <p className={`font-semibold truncate ${isCurrentUser ? 'text-[#d93547]' : 'text-[#2b2520]'}`}>
          {name}
          {isCurrentUser && <span className="text-xs ml-2">(Вы)</span>}
        </p>
      </div>

      {/* Energies */}
      <div className="flex items-center gap-1 text-[#d93547] font-bold">
        <span>{energies}</span>
        <Zap className="w-4 h-4" />
      </div>
    </div>
  );
}
