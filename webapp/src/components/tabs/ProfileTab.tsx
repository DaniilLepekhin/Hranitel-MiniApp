'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Trophy,
  Flame,
  Target,
  Crown,
  Settings,
  ChevronRight,
  Calendar,
  Zap,
  LogOut,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { gamificationApi } from '@/lib/api';
import { Card } from '@/components/ui/Card';

// EP API
const epApi = {
  getBalance: async (userId: string) => {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/ep/balance?userId=${userId}`);
    if (!response.ok) throw new Error('Failed to fetch EP balance');
    return response.json();
  },
};

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

  const { data: epData } = useQuery({
    queryKey: ['ep', 'balance', user?.id],
    queryFn: () => epApi.getBalance(user!.id),
    enabled: !!user,
    refetchInterval: 30000,
  });

  const stats = statsData?.stats;
  const achievements = achievementsData?.achievements.unlocked || [];
  const epBalance = epData?.balance || 0;

  const levelTitle = LEVEL_TITLES[Math.min((stats?.level || 1) - 1, LEVEL_TITLES.length - 1)];

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="px-4 pt-6 pb-24">
      {/* Profile Header */}
      <Card className="p-6 mb-6 text-center">
        {/* Avatar */}
        <div className="relative inline-block mb-4">
          {user?.photoUrl ? (
            <img
              src={user.photoUrl}
              alt={user.firstName || 'User'}
              className="w-24 h-24 rounded-full border-4 border-white shadow-lg"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#8b0000] to-[#8b4513] flex items-center justify-center text-white text-3xl font-bold border-4 border-white shadow-lg">
              {user?.firstName?.[0] || '?'}
            </div>
          )}

          {/* Level badge */}
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-[#8b0000] to-[#8b4513] text-white text-sm font-bold shadow-lg">
            Ур. {stats?.level || 1}
          </div>
        </div>

        {/* Name */}
        <h1 className="text-xl font-bold text-[#3d2f1f] mb-1">
          {user?.firstName}
        </h1>
        <p className="text-[#6b5a4a] mb-4">@{user?.username || 'user'}</p>

        {/* Level title */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-[#8b0000]/10 to-[#8b4513]/10 border border-[#8b4513]/30">
          <Crown className="w-4 h-4 text-[#8b0000]" />
          <span className="text-sm font-medium text-[#3d2f1f]">{levelTitle}</span>
        </div>

        {/* EP Balance */}
        <div className="mt-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Zap className="w-5 h-5 text-[#8b0000]" />
            <span className="text-sm font-medium text-[#6b5a4a]">Energy Points</span>
          </div>
          <div className="text-center">
            <p className="text-4xl font-bold text-[#8b0000]">
              {epBalance}
            </p>
            <p className="text-xs text-[#6b5a4a] mt-1">EP</p>
          </div>
        </div>
      </Card>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <StatCard
            icon={<Flame className="w-5 h-5" />}
            value={stats.streak}
            label="Дней подряд"
          />
          <StatCard
            icon={<Target className="w-5 h-5" />}
            value={stats.level}
            label="Уровень"
          />
          <StatCard
            icon={<Zap className="w-5 h-5" />}
            value={epBalance}
            label="Energy Points"
          />
          <StatCard
            icon={<Calendar className="w-5 h-5" />}
            value={stats.streak}
            label="Активность"
          />
        </div>
      )}

      {/* Achievements */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-[#3d2f1f] border-b-2 border-[#8b0000] pb-1">Достижения</h2>
          <span className="text-sm text-[#6b5a4a]">
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
          <button className="w-full mt-3 py-2 text-sm text-[#8b0000] font-medium">
            Показать все ({achievements.length})
          </button>
        )}
      </div>

      {/* Pro Subscription */}
      {!user?.isPro && (
        <Card className="p-5 mb-6 bg-gradient-to-r from-[#8b0000]/10 to-[#8b4513]/10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#8b0000] to-[#8b4513] flex items-center justify-center">
              <Crown className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-[#3d2f1f]">Станьте PRO</h3>
              <p className="text-sm text-[#6b5a4a]">
                Полный доступ ко всем курсам и медитациям
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-[#8b4513]" />
          </div>
        </Card>
      )}

      {/* Settings Menu */}
      <Card className="overflow-hidden">
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
          icon={<Zap className="w-5 h-5" />}
          label="История EP"
          onClick={() => {}}
        />
        <MenuItem
          icon={<LogOut className="w-5 h-5" />}
          label="Выйти"
          onClick={handleLogout}
          danger
        />
      </Card>
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  value: number;
  label: string;
}

function StatCard({ icon, value, label }: StatCardProps) {
  return (
    <Card className="p-4">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#8b0000] to-[#8b4513] flex items-center justify-center text-white mb-2">
        {icon}
      </div>
      <p className="text-2xl font-bold text-[#3d2f1f]">{value}</p>
      <p className="text-xs text-[#6b5a4a]">{label}</p>
    </Card>
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
        className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl border ${
          isUnlocked
            ? 'bg-gradient-to-br from-[#8b0000]/10 to-[#8b4513]/10 border-[#8b4513]/30 shadow-md'
            : 'bg-[#e8dcc6] border-[#8b4513]/10 grayscale opacity-50'
        }`}
      >
        {icon || '🏆'}
      </div>
      <p
        className={`text-xs mt-1 text-center truncate w-full ${
          isUnlocked ? 'text-[#3d2f1f]' : 'text-[#6b5a4a]'
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
      className="w-full flex items-center gap-3 p-4 border-b border-[#8b4513]/10 last:border-b-0 hover:bg-[#f8f6f0] transition-colors"
    >
      <span className={danger ? 'text-[#8b0000]' : 'text-[#6b5a4a]'}>{icon}</span>
      <span className={`flex-1 text-left font-medium ${danger ? 'text-[#8b0000]' : 'text-[#3d2f1f]'}`}>
        {label}
      </span>
      <ChevronRight className="w-4 h-4 text-[#8b4513]" />
    </button>
  );
}
