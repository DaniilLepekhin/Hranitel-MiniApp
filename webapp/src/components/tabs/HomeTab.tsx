'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Search, Copy, Megaphone } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { gamificationApi } from '@/lib/api';

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
  const epBalance = stats?.experience || 1250;
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
      {/* 1. Поиск */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск..."
            className="w-full bg-[#2d2520] text-[#f7f1e8] placeholder:text-[#f7f1e8]/70 rounded-xl px-12 py-3.5 text-sm font-semibold focus:outline-none"
          />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#f7f1e8]/70" />
        </div>
      </form>

      {/* 2. Пригласи друга - КРАСНАЯ КАРТОЧКА (СВЕРХУ!) */}
      <div className="mb-6 rounded-2xl overflow-hidden bg-gradient-to-br from-[#a52a2a] via-[#8b1a1a] to-[#6b1515] shadow-lg relative">
        <div className="p-5">
          <div className="flex items-center gap-3 mb-4">
            {/* Круглый логотип КОД */}
            <div className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-sm border-2 border-white/20 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-xs tracking-wider">КОД</span>
            </div>
            <h3 className="text-white flex-1 font-semibold text-base">
              Пригласи друга в клуб КОД ДЕНЕГ
            </h3>
          </div>

          {/* Линия разделитель */}
          <div className="w-full h-px bg-white/20 mb-4" />

          {/* Ссылка - СВЕТЛАЯ ПЛАШКА */}
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 flex items-center gap-3 border border-white/10">
            <div className="flex-1 min-w-0">
              <p className="text-white/80 text-xs font-semibold mb-1.5">
                Отправьте эту ссылку другу
              </p>
              <p className="text-white text-sm truncate font-mono font-medium">
                {referralLink}
              </p>
            </div>
            <button
              onClick={handleCopyReferralLink}
              className="flex-shrink-0 w-11 h-11 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <Copy className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. Приветствие */}
      <div className="mb-6">
        <h1
          className="text-[#3d2f1f] font-light mb-2"
          style={{
            fontFamily: 'TT Nooks, serif',
            fontSize: '48px',
            fontWeight: 300,
            lineHeight: '1.1',
            letterSpacing: '-2px',
          }}
        >
          Привет, {'{Имя}'}!
        </h1>
        <p
          className="text-[#6b5a4a] font-light"
          style={{
            fontFamily: 'TT Nooks, serif',
            fontSize: '18px',
            fontWeight: 300,
            letterSpacing: '-0.5px',
          }}
        >
          Ты в пространстве клуба «Код Денег»
        </p>
      </div>

      {/* 4. Мой баланс - КРАСНАЯ КАРТОЧКА */}
      <div className="mb-6">
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#8b3a3a] via-[#7d2828] to-[#6b1a1a] shadow-xl">
          {/* Картинка телефона слева внизу */}
          <div className="absolute left-2 bottom-2 w-48 h-28 opacity-40">
            <img
              src="https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&h=250&fit=crop&q=80"
              alt="phone"
              className="w-full h-full object-cover rounded-lg"
              style={{ mixBlendMode: 'overlay' }}
            />
          </div>

          <div className="relative z-10 p-6">
            <h2
              className="text-white font-light mb-3"
              style={{
                fontFamily: 'TT Nooks, serif',
                fontSize: '26px',
                fontWeight: 300,
              }}
            >
              Мой баланс
            </h2>

            <div className="flex items-end justify-end">
              <div className="text-right">
                <div
                  className="text-white font-bold leading-none"
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontSize: '72px',
                    fontWeight: 700,
                  }}
                >
                  {epBalance}
                </div>
                <div
                  className="text-white/90 font-normal mt-1"
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontSize: '22px',
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

      {/* 5. Анонсы */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <h2
            className="text-[#3d2f1f] font-light"
            style={{
              fontFamily: 'TT Nooks, serif',
              fontSize: '24px',
              fontWeight: 300,
            }}
          >
            Анонсы
          </h2>
          <Megaphone className="w-5 h-5 text-[#a01f23]" />
        </div>
      </div>
    </div>
  );
}
