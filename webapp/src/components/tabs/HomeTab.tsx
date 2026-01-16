'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Search, Copy, Users, Megaphone } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { gamificationApi } from '@/lib/api';
import { Card } from '@/components/ui/Card';

interface HomeTabProps {
  onProfileClick?: () => void;
}

export function HomeTab({ onProfileClick }: HomeTabProps) {
  const { user } = useAuthStore();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

  // Получаем статистику пользователя
  const { data: statsData } = useQuery({
    queryKey: ['gamification-stats'],
    queryFn: () => gamificationApi.stats(),
    enabled: !!user,
  });

  const stats = statsData?.stats;
  const epBalance = stats?.experience || 0; // Используем experience как энергии

  // Генерируем реферальную ссылку
  const referralLink = user ? `https://t.me/your_bot?start=ref_${user.id}` : '';

  const handleCopyReferralLink = () => {
    if (referralLink) {
      navigator.clipboard.writeText(referralLink);
      // TODO: Добавить toast уведомление
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  return (
    <div className="px-4 pt-6 pb-24">
      {/* Поиск */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск..."
            className="w-full bg-[#2d2620] text-[#f7f1e8] placeholder:text-[#f7f1e8]/70 rounded-md px-11 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#8b4513]/50"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#f7f1e8]/70" />
        </div>
      </form>

      {/* Приветствие */}
      <div className="mb-8">
        <h1 className="text-5xl font-light text-[#3d2f1f] mb-2" style={{ fontFamily: 'TT Nooks, serif' }}>
          Привет, {user?.firstName || 'друг'}!
        </h1>
        <p className="text-xl font-light text-[#6b5a4a]" style={{ fontFamily: 'TT Nooks, serif' }}>
          Ты в пространстве клуба «Код Денег»
        </p>
      </div>

      {/* Мой баланс */}
      <Card className="mb-6 p-6 bg-gradient-to-br from-[#8b0000]/10 to-[#8b4513]/10 border-[#8b0000]/30 relative overflow-hidden">
        {/* Декоративные элементы фона */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-40 h-40 bg-[#8b0000] rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-[#8b4513] rounded-full blur-3xl" />
        </div>

        <div className="relative z-10">
          <h2 className="text-2xl font-light text-[#3d2f1f] mb-3" style={{ fontFamily: 'TT Nooks, serif' }}>
            Мой баланс
          </h2>
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-semibold text-[#3d2f1f]">{epBalance}</span>
            <span className="text-lg text-[#6b5a4a]">энергий</span>
          </div>
        </div>
      </Card>

      {/* Пригласи друга */}
      <Card className="mb-6 p-5 bg-gradient-to-br from-[#8b4513]/10 to-[#a0522d]/10 border-[#8b4513]/30 relative overflow-hidden">
        {/* Декоративные элементы */}
        <div className="absolute top-0 right-0 w-24 h-24 bg-[#8b0000] rounded-full blur-2xl opacity-10" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#8b0000] to-[#8b4513] flex items-center justify-center">
              <span className="text-white text-xs font-bold">КОД</span>
            </div>
            <h3 className="text-sm font-semibold text-[#3d2f1f] flex-1">
              Пригласи друга в клуб КОД ДЕНЕГ
            </h3>
          </div>

          <div className="bg-[#2d2620] rounded-lg p-3 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[#f7f1e8]/70 mb-1">Отправьте эту ссылку другу</p>
              <p className="text-xs text-[#f7f1e8] truncate font-mono">{referralLink}</p>
            </div>
            <button
              onClick={handleCopyReferralLink}
              className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#8b4513]/20 hover:bg-[#8b4513]/30 flex items-center justify-center transition-colors active:scale-95"
            >
              <Copy className="w-4 h-4 text-[#f7f1e8]" />
            </button>
          </div>
        </div>
      </Card>

      {/* Анонсы */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-xl font-light text-[#3d2f1f]" style={{ fontFamily: 'TT Nooks, serif' }}>
            Анонсы
          </h2>
          <Megaphone className="w-5 h-5 text-[#8b0000]" />
          <div className="flex-1 h-px bg-[#3d2f1f]/20" />
        </div>

        <div className="space-y-3">
          {/* Заглушка анонсов - данные будут с бэкенда */}
          <Card className="p-4 hover:shadow-lg transition-shadow cursor-pointer">
            <div className="flex gap-3">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#8b0000] to-[#8b4513] flex items-center justify-center flex-shrink-0">
                <Megaphone className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-[#3d2f1f] mb-1">Ближайший эфир</h3>
                <p className="text-sm text-[#6b5a4a] line-clamp-2">
                  Закрытый эфир с Кристиной: "Как удвоить доход в 2026"
                </p>
                <p className="text-xs text-[#8b0000] mt-1">Сегодня в 19:00</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 hover:shadow-lg transition-shadow cursor-pointer">
            <div className="flex gap-3">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#8b4513] to-[#a0522d] flex items-center justify-center flex-shrink-0">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-[#3d2f1f] mb-1">Дедлайн отчета</h3>
                <p className="text-sm text-[#6b5a4a]">
                  Не забудьте сдать недельный отчет
                </p>
                <p className="text-xs text-[#8b4513] mt-1">До воскресенья 23:59</p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Информационная карточка про streak/level - перенесено из удаленных виджетов */}
      {stats && (
        <Card className="p-4 mb-6 bg-gradient-to-br from-[#8b0000]/5 to-[#8b4513]/5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#8b0000] to-[#8b4513] flex items-center justify-center">
                <span className="text-white text-sm font-bold">{stats.level}</span>
              </div>
              <div>
                <p className="text-xs text-[#6b5a4a]">Уровень</p>
                <p className="text-sm font-semibold text-[#3d2f1f]">Уровень {stats.level}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-[#6b5a4a]">Серия дней</p>
              <p className="text-2xl font-bold text-[#8b0000]">{stats.streak} 🔥</p>
            </div>
          </div>

          <div className="h-2 bg-[#e8dcc6] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#8b0000] to-[#8b4513] rounded-full transition-all duration-500"
              style={{ width: `${stats.progressPercent || 0}%` }}
            />
          </div>
          <p className="text-xs text-[#6b5a4a] mt-2 text-center">
            {stats.progressToNextLevel} / {stats.xpNeededForNextLevel} XP до следующего уровня
          </p>
        </Card>
      )}
    </div>
  );
}
