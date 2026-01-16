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

  const { data: statsData } = useQuery({
    queryKey: ['gamification-stats'],
    queryFn: () => gamificationApi.stats(),
    enabled: !!user,
  });

  const stats = statsData?.stats;
  const epBalance = stats?.experience || 0;
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
    <div className="min-h-screen bg-[#f7f1e8] px-4 pt-6 pb-24">
      {/* Поиск */}
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
            }}
            className="w-full bg-[#3c3430] text-[#f7f1e8] placeholder:text-[#f7f1e8]/70 rounded-xl px-11 py-3.5 focus:outline-none"
          />
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[#f7f1e8]/70" />
        </div>
      </form>

      {/* Приветствие */}
      <div className="mb-8">
        <h1
          className="text-[#3d2f1f] font-light mb-2"
          style={{
            fontFamily: 'TT Nooks, serif',
            fontSize: '53.7px',
            fontWeight: 300,
            lineHeight: '51px',
            letterSpacing: '-3.22px',
          }}
        >
          Привет, {user?.firstName || 'Даниил'}!
        </h1>
        <p
          className="text-[#3d2f1f] font-light opacity-70"
          style={{
            fontFamily: 'TT Nooks, serif',
            fontSize: '20.98px',
            fontWeight: 300,
            lineHeight: '20px',
            letterSpacing: '-1.26px',
          }}
        >
          Ты в пространстве клуба «Код Денег»
        </p>
      </div>

      {/* Мой баланс - КРАСНАЯ КАРТОЧКА КАК КУПОН */}
      <div className="mb-6 relative">
        <div className="rounded-2xl overflow-hidden bg-gradient-to-r from-[#9c1f23] to-[#8b1a1e] shadow-xl relative">
          {/* Картинка монет слева - SVG */}
          <div className="absolute left-4 bottom-4 w-32 h-20 opacity-50">
            <svg viewBox="0 0 128 80" className="w-full h-full">
              <circle cx="24" cy="56" r="20" fill="#d4af37" opacity="0.7"/>
              <circle cx="40" cy="50" r="22" fill="#ffd700" opacity="0.8"/>
              <circle cx="56" cy="46" r="20" fill="#d4af37" opacity="0.7"/>
              <ellipse cx="40" cy="50" rx="22" ry="8" fill="#b8860b" opacity="0.5"/>
              <ellipse cx="24" cy="56" rx="20" ry="7" fill="#b8860b" opacity="0.5"/>
            </svg>
          </div>

          <div className="relative z-10 p-6 flex items-center justify-between min-h-[140px]">
            <div>
              <h2
                className="text-white font-light"
                style={{
                  fontFamily: 'TT Nooks, serif',
                  fontSize: '24px',
                  fontWeight: 300,
                }}
              >
                Мой баланс
              </h2>
            </div>

            {/* Правая часть - число */}
            <div className="relative">
              {/* Пунктирная линия */}
              <div className="absolute left-[-20px] top-0 bottom-0 w-px border-l-2 border-dashed border-white/25" />

              <div className="text-right pl-8 bg-gradient-to-l from-[#7a1717]/30 to-transparent pr-4 py-4 rounded-r-2xl">
                <div
                  className="text-white font-bold"
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontSize: '64px',
                    fontWeight: 700,
                    lineHeight: '0.85',
                  }}
                >
                  {epBalance}
                </div>
                <div
                  className="text-white font-normal"
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontSize: '18px',
                    fontWeight: 400,
                  }}
                >
                  энергий
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Пригласи друга - КРАСНАЯ КАРТОЧКА */}
      <div className="mb-6 rounded-2xl overflow-hidden bg-gradient-to-br from-[#9c1b1b] to-[#7a1717] shadow-lg">
        <div className="p-5">
          <div className="flex items-center gap-3 mb-4">
            {/* Круглый логотип КОД */}
            <div className="w-16 h-16 rounded-full bg-[#a01f23] flex items-center justify-center flex-shrink-0 shadow-md">
              <span
                className="text-white font-bold"
                style={{
                  fontFamily: 'Gilroy, sans-serif',
                  fontSize: '14px',
                  letterSpacing: '1px',
                }}
              >
                КОД
              </span>
            </div>
            <h3
              className="text-white flex-1"
              style={{
                fontFamily: 'Gilroy, sans-serif',
                fontSize: '16px',
                fontWeight: 600,
              }}
            >
              Пригласи друга в клуб КОД ДЕНЕГ
            </h3>
          </div>

          {/* Линия разделитель */}
          <div className="w-full h-px bg-white/20 mb-4" />

          {/* Ссылка - СВЕТЛАЯ ПЛАШКА */}
          <div className="bg-[#e8dcc6] rounded-xl p-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p
                className="text-[#3d2f1f] opacity-60 mb-1.5"
                style={{
                  fontFamily: 'Gilroy, sans-serif',
                  fontSize: '11px',
                  fontWeight: 600,
                }}
              >
                Отправьте эту ссылку другу
              </p>
              <p className="text-[#3d2f1f] text-sm truncate font-mono font-medium">
                {referralLink}
              </p>
            </div>
            <button
              onClick={handleCopyReferralLink}
              className="flex-shrink-0 w-12 h-12 rounded-xl bg-[#3d2f1f]/10 hover:bg-[#3d2f1f]/20 flex items-center justify-center transition-colors active:scale-95"
            >
              <Copy className="w-5 h-5 text-[#3d2f1f]" />
            </button>
          </div>
        </div>
      </div>

      {/* Анонсы */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <h2
            className="text-[#3d2f1f] font-light"
            style={{
              fontFamily: 'TT Nooks, serif',
              fontSize: '28px',
              fontWeight: 300,
              letterSpacing: '-1.26px',
            }}
          >
            Анонсы
          </h2>
          <Megaphone className="w-6 h-6 text-[#a01f23]" />
        </div>
      </div>
    </div>
  );
}
