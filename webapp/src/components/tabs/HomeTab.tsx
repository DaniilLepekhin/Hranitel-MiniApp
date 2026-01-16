'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Search, Copy, Megaphone } from 'lucide-react';
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
  const epBalance = stats?.experience || 0;

  // Генерируем реферальную ссылку
  const referralLink = user ? `https://t.me/hranitelkodbot?start=ref_${user.id}` : '';

  const handleCopyReferralLink = () => {
    if (referralLink) {
      navigator.clipboard.writeText(referralLink);
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
      {/* Поиск - точно по Figma */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск..."
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontSize: '13.44px',
              fontWeight: 600,
              lineHeight: '16.46px',
            }}
            className="w-full bg-[#2d2520] text-[#f7f1e8] placeholder:text-[#f7f1e8] placeholder:opacity-70 rounded-lg px-11 py-3 focus:outline-none focus:ring-2 focus:ring-[#a01f23]/30"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#f7f1e8] opacity-70" />
        </div>
      </form>

      {/* Приветствие - точно по Figma */}
      <div className="mb-6">
        <h1
          className="text-[#463631] font-light mb-1"
          style={{
            fontFamily: 'TT Nooks, serif',
            fontSize: '53.7px',
            fontWeight: 300,
            lineHeight: '51.02px',
            letterSpacing: '-3.22px',
          }}
        >
          Привет, {user?.firstName || 'Даниил'}!
        </h1>
        <p
          className="text-[#463631] font-light"
          style={{
            fontFamily: 'TT Nooks, serif',
            fontSize: '20.98px',
            fontWeight: 300,
            lineHeight: '19.94px',
            letterSpacing: '-1.26px',
          }}
        >
          Ты в пространстве клуба «Код Денег»
        </p>
      </div>

      {/* Мой баланс - точно по Figma */}
      <Card className="mb-6 p-6 bg-white border border-[#e5e5e5] shadow-sm">
        <h2
          className="text-[#463631] font-light mb-3"
          style={{
            fontFamily: 'TT Nooks, serif',
            fontSize: '23.6px',
            fontWeight: 300,
            lineHeight: '30.57px',
          }}
        >
          Мой баланс
        </h2>
        <div className="flex items-baseline gap-2">
          <span
            className="text-[#463631]"
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontSize: '46.44px',
              fontWeight: 600,
              lineHeight: '56.88px',
            }}
          >
            {epBalance}
          </span>
          <span
            className="text-[#463631]"
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontSize: '18.57px',
              fontWeight: 400,
              lineHeight: '22.29px',
            }}
          >
            энергий
          </span>
        </div>
      </Card>

      {/* Пригласи друга - точно по Figma с красной плашкой */}
      <Card className="mb-6 p-0 bg-white border border-[#e5e5e5] shadow-sm overflow-hidden relative">
        {/* Красная декоративная плашка */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#9c1723] opacity-20 rounded-full blur-2xl" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-[#9c1723] opacity-10 rounded-full blur-xl" />

        <div className="relative z-10 p-5">
          <div className="flex items-center gap-3 mb-4">
            {/* Логотип КОД */}
            <div className="w-12 h-12 rounded-full bg-[#a0111f] flex items-center justify-center flex-shrink-0">
              <span
                className="text-[#f7f1e8] font-bold"
                style={{
                  fontFamily: 'Gilroy, sans-serif',
                  fontSize: '10px',
                }}
              >
                КОД
              </span>
            </div>
            <h3
              className="text-[#463631] flex-1"
              style={{
                fontFamily: 'Gilroy, sans-serif',
                fontSize: '13.44px',
                fontWeight: 600,
                lineHeight: '16.46px',
              }}
            >
              Пригласи друга в клуб КОД ДЕНЕГ
            </h3>
          </div>

          {/* Ссылка */}
          <div className="bg-[#2d2620] rounded-lg p-3 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p
                className="text-[#2d2620] mb-1"
                style={{
                  fontFamily: 'Gilroy, sans-serif',
                  fontSize: '9.62px',
                  fontWeight: 600,
                  lineHeight: '11.78px',
                  color: '#f7f1e8',
                  opacity: 0.7,
                }}
              >
                Отправьте эту ссылку другу
              </p>
              <p className="text-[#f7f1e8] text-xs truncate font-mono">{referralLink}</p>
            </div>
            <button
              onClick={handleCopyReferralLink}
              className="flex-shrink-0 w-10 h-10 rounded-lg bg-[#f7f1e8]/10 hover:bg-[#f7f1e8]/20 flex items-center justify-center transition-colors active:scale-95"
            >
              <Copy className="w-4 h-4 text-[#f7f1e8]" />
            </button>
          </div>
        </div>
      </Card>

      {/* Анонсы - точно по Figma */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <h2
            className="text-[#463631] font-light"
            style={{
              fontFamily: 'TT Nooks, serif',
              fontSize: '20.98px',
              fontWeight: 300,
              lineHeight: '19.94px',
              letterSpacing: '-1.26px',
            }}
          >
            Анонсы
          </h2>
          <Megaphone className="w-5 h-5 text-[#a01f23]" />
        </div>

        <div className="space-y-3">
          {/* Placeholder для анонсов */}
          <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex gap-3">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#a01f23] to-[#9c1723] flex items-center justify-center flex-shrink-0">
                <Megaphone className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-[#463631] mb-1 text-sm">Ближайший эфир</h3>
                <p className="text-xs text-[#463631] opacity-70 line-clamp-2">
                  Закрытый эфир с Кристиной: "Как удвоить доход в 2026"
                </p>
                <p className="text-xs text-[#a01f23] mt-1 font-medium">Сегодня в 19:00</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
