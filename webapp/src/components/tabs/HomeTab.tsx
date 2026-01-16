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
          <div className="bg-white/95 rounded-xl p-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[#6b5a4a] text-xs font-semibold mb-1.5">
                Отправьте эту ссылку другу
              </p>
              <p className="text-[#3d2f1f] text-sm truncate font-mono font-medium">
                {referralLink}
              </p>
            </div>
            <button
              onClick={handleCopyReferralLink}
              className="flex-shrink-0 w-11 h-11 rounded-xl bg-[#3d2f1f]/10 hover:bg-[#3d2f1f]/20 flex items-center justify-center transition-colors"
            >
              <Copy className="w-5 h-5 text-[#3d2f1f]" />
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

      {/* 4. Мой баланс - КРАСНАЯ КАРТОЧКА С ЗУБЧАТЫМ КРАЕМ */}
      <div className="mb-6 relative">
        {/* Основная карточка */}
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-[#a52a2a] via-[#8b1a1a] to-[#7a1717] shadow-xl">
          {/* Картинка монет слева внизу */}
          <div className="absolute left-4 bottom-4 w-40 h-20 opacity-50">
            <img
              src="https://images.unsplash.com/photo-1621761191319-c6fb62004040?w=300&h=150&fit=crop&q=80"
              alt="coins"
              className="w-full h-full object-cover rounded-lg"
              style={{ mixBlendMode: 'overlay' }}
            />
          </div>

          <div className="relative z-10 p-6 flex items-start justify-between min-h-[140px]">
            {/* Левая часть */}
            <div className="flex-1">
              <h2
                className="text-white font-light mb-3"
                style={{
                  fontFamily: 'TT Nooks, serif',
                  fontSize: '24px',
                  fontWeight: 300,
                }}
              >
                Мой баланс
              </h2>
            </div>

            {/* Правая часть с зубчатым краем */}
            <div className="relative">
              {/* Пунктирная линия */}
              <div className="absolute left-[-24px] top-0 bottom-0 w-px border-l-2 border-dashed border-white/30" />

              {/* Зубчатый край (круглые вырезы) */}
              <div className="absolute left-[-32px] top-0 bottom-0 w-4 flex flex-col justify-around">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="w-3 h-3 rounded-full bg-[#f7f1e8]" />
                ))}
              </div>

              {/* Число */}
              <div className="text-right pl-10 pr-2">
                <div
                  className="text-white font-bold leading-none"
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontSize: '68px',
                    fontWeight: 700,
                  }}
                >
                  {epBalance}
                </div>
                <div
                  className="text-white font-normal mt-1"
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontSize: '20px',
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
