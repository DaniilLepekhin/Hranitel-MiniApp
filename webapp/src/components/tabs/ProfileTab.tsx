'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Trophy,
  Flame,
  Star,
  TrendingUp,
  Crown,
  Settings,
  ChevronRight,
  Award,
  Calendar,
  Target,
  Zap,
  LogOut,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { gamificationApi } from '@/lib/api';

const LEVEL_TITLES = [
  'Новичок',
  'Ученик',
  'Практик',
  'Адепт',
  'Мастер',
  'Гуру',
  'Просветленный',
  'Мудрец',
  'Легенда',
  'Бессмертный',
];

export function ProfileTab() {
  const { user, logout } = useAuthStore();

  const { data: statsData } = useQuery({
    queryKey: ['gamification-stats'],
    queryFn: () => gamificationApi.stats(),
    enabled: !!user,
  });

  const { data: achievementsData } = useQuery({
    queryKey: ['user-achievements'],
    queryFn: () => gamificationApi.achievements(),
    enabled: !!user,
  });

  const { data: leaderboardData } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => gamificationApi.leaderboard(10),
    enabled: !!user,
  });

  const stats = statsData?.stats;
  const achievements = achievementsData?.achievements.unlocked || [];
  const leaderboard = leaderboardData?.leaderboard || [];

  const levelTitle = LEVEL_TITLES[Math.min((stats?.level || 1) - 1, LEVEL_TITLES.length - 1)];

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="px-4 pt-6 pb-24">
      {/* Profile Header */}
      <div className="card rounded-3xl p-6 mb-6 text-center">
        {/* Avatar */}
        <div className="relative inline-block mb-4">
          {user?.photoUrl ? (
            <img
              src={user.photoUrl}
              alt={user.firstName || 'User'}
              className="w-24 h-24 rounded-full border-4 border-white shadow-lg"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-white text-3xl font-bold border-4 border-white shadow-lg">
              {user?.firstName?.[0] || '?'}
            </div>
          )}

          {/* Level badge */}
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-white text-sm font-bold shadow-lg">
            Ур. {stats?.level || 1}
          </div>
        </div>

        {/* Name */}
        <h1 className="text-xl font-bold text-gray-900 mb-1">
          {user?.firstName}
        </h1>
        <p className="text-gray-500 mb-4">@{user?.username || 'user'}</p>

        {/* Level title */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-amber-100 to-orange-100">
          <Crown className="w-4 h-4 text-amber-600" />
          <span className="text-sm font-medium text-amber-800">{levelTitle}</span>
        </div>

        {/* XP Progress */}
        {stats && (
          <div className="mt-6">
            <div className="flex justify-between text-sm text-gray-400 mb-2">
              <span>{stats.experience} XP</span>
              <span>След. уровень: {stats.xpNeededForNextLevel} XP</span>
            </div>
            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-500"
                style={{ width: `${stats.progressPercent}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Осталось {stats.progressToNextLevel} XP до уровня {stats.level + 1}
            </p>
          </div>
        )}
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <StatCard
            icon={<Flame className="w-5 h-5" />}
            value={stats.streak}
            label="Дней подряд"
            gradient="from-red-400 to-orange-500"
          />
          <StatCard
            icon={<Target className="w-5 h-5" />}
            value={stats.level}
            label="Уровень"
            gradient="from-purple-400 to-indigo-500"
          />
          <StatCard
            icon={<Zap className="w-5 h-5" />}
            value={stats.experience}
            label="Опыт"
            gradient="from-emerald-400 to-teal-500"
          />
          <StatCard
            icon={<Calendar className="w-5 h-5" />}
            value={stats.streak}
            label="Активность"
            gradient="from-blue-400 to-cyan-500"
          />
        </div>
      )}

      {/* Achievements */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-white">Достижения</h2>
          <span className="text-sm text-gray-500">
            {achievementsData?.achievements.unlockedCount || 0} / {achievementsData?.achievements.total || 0}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {achievements.slice(0, 8).map((achievement) => (
            <AchievementBadge
              key={achievement.id}
              icon={achievement.icon}
              title={achievement.title}
              isUnlocked={!!achievement.unlockedAt}
            />
          ))}
        </div>

        {achievements.length > 8 && (
          <button className="w-full mt-3 py-2 text-sm text-purple-600 font-medium">
            Показать все ({achievements.length})
          </button>
        )}
      </div>

      {/* Leaderboard - временно скрыто */}
      {/* TODO: включить когда будет больше пользователей
      {leaderboard.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Таблица лидеров</h2>

          <div className="card rounded-2xl overflow-hidden">
            {leaderboard.slice(0, 5).map((entry, index) => (
              <div
                key={entry.id}
                className={`flex items-center gap-3 p-3 ${
                  index !== leaderboard.length - 1 ? 'border-b border-gray-100' : ''
                } ${entry.id === user?.id ? 'bg-amber-50' : ''}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                    index === 0
                      ? 'bg-gradient-to-br from-yellow-400 to-amber-500 text-white'
                      : index === 1
                      ? 'bg-gradient-to-br from-gray-300 to-gray-400 text-white'
                      : index === 2
                      ? 'bg-gradient-to-br from-orange-300 to-orange-400 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {index + 1}
                </div>

                {entry.photoUrl ? (
                  <img
                    src={entry.photoUrl}
                    alt={entry.firstName || 'User'}
                    className="w-10 h-10 rounded-full"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-white font-bold">
                    {entry.firstName?.[0] || '?'}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {entry.firstName} {entry.lastName?.[0]}.
                  </p>
                  <p className="text-xs text-gray-500">Уровень {entry.level}</p>
                </div>

                <div className="text-right">
                  <p className="font-bold text-gray-900">{entry.experience}</p>
                  <p className="text-xs text-gray-500">XP</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      */}

      {/* Pro Subscription */}
      {!user?.isPro && (
        <div className="card rounded-3xl p-5 mb-6 bg-gradient-to-r from-purple-500/10 to-pink-500/10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Crown className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-gray-900">Станьте PRO</h3>
              <p className="text-sm text-gray-600">
                Полный доступ ко всем курсам и медитациям
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </div>
        </div>
      )}

      {/* Settings Menu */}
      <div className="card rounded-2xl overflow-hidden">
        <MenuItem
          icon={<Settings className="w-5 h-5" />}
          label="Настройки"
          onClick={() => {}}
        />
        <MenuItem
          icon={<Trophy className="w-5 h-5" />}
          label="Все достижения"
          onClick={() => {}}
        />
        <MenuItem
          icon={<Award className="w-5 h-5" />}
          label="История XP"
          onClick={() => {}}
        />
        <MenuItem
          icon={<LogOut className="w-5 h-5" />}
          label="Выйти"
          onClick={handleLogout}
          danger
        />
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  value: number;
  label: string;
  gradient: string;
}

function StatCard({ icon, value, label, gradient }: StatCardProps) {
  return (
    <div className="card rounded-2xl p-4">
      <div
        className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white mb-2`}
      >
        {icon}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

interface AchievementBadgeProps {
  icon?: string | null;
  title: string;
  isUnlocked: boolean;
}

function AchievementBadge({ icon, title, isUnlocked }: AchievementBadgeProps) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl ${
          isUnlocked
            ? 'bg-gradient-to-br from-amber-100 to-orange-100 shadow-md'
            : 'bg-gray-100 grayscale opacity-50'
        }`}
      >
        {icon || '🏆'}
      </div>
      <p
        className={`text-xs mt-1 text-center truncate w-full ${
          isUnlocked ? 'text-gray-700' : 'text-gray-400'
        }`}
      >
        {title}
      </p>
    </div>
  );
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

function MenuItem({ icon, label, onClick, danger }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-4 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors"
    >
      <span className={danger ? 'text-red-500' : 'text-gray-600'}>{icon}</span>
      <span className={`flex-1 text-left font-medium ${danger ? 'text-red-500' : 'text-gray-900'}`}>
        {label}
      </span>
      <ChevronRight className="w-4 h-4 text-gray-400" />
    </button>
  );
}
