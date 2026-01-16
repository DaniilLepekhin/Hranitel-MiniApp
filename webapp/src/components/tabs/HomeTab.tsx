'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Search, Copy, Megaphone, Home, TrendingUp, MessageCircle, Trophy, User } from 'lucide-react';
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
  const referralLink = user ? `https://t.me/hranitelkodbot?start=ref_${user.id}` : 'https://t.me/hranitelkodbot?start=ref_...';
  const userName = user?.firstName || '{Имя}';

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
    <div className="min-h-screen bg-[#f7f1e8] relative overflow-hidden">
      {/* Контент */}
      <div className="relative z-10 px-[29px] pt-[17px] pb-[100px]">

        {/* 1. Поиск - точные размеры из Figma */}
        <form onSubmit={handleSearch} className="mb-[20px]">
          <div className="relative">
            <div
              className="w-[341px] h-[36px] bg-[#2d2620] rounded-[6px] mx-auto flex items-center"
            >
              <Search className="w-[16px] h-[16px] text-[#f7f1e8] opacity-70 ml-[10px]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск..."
                className="flex-1 bg-transparent text-[#f7f1e8] placeholder:text-[#f7f1e8]/70 px-[10px] text-[13.438px] font-semibold focus:outline-none"
                style={{ fontFamily: 'Gilroy, sans-serif' }}
              />
            </div>
          </div>
        </form>

        {/* 2. Пригласи друга - красная карточка */}
        <div
          className="w-[341px] mx-auto mb-[20px] rounded-[6px] overflow-hidden border border-[#d93547]"
          style={{
            background: 'linear-gradient(243.413deg, rgb(174, 30, 43) 15.721%, rgb(156, 23, 35) 99.389%)',
          }}
        >
          <div className="p-[14px]">
            {/* Заголовок с логотипом */}
            <div className="flex items-center gap-[10px] mb-[12px]">
              {/* Круглый логотип КОД */}
              <div className="relative w-[40px] h-[40px] flex-shrink-0">
                <div className="absolute inset-0 rounded-full bg-white/10 mix-blend-soft-light" />
                <div className="absolute inset-[4px] rounded-full border border-white/30 flex items-center justify-center">
                  <span
                    className="text-white text-[8px] font-bold tracking-wider"
                    style={{ fontFamily: 'Gilroy, sans-serif' }}
                  >
                    КОД
                  </span>
                </div>
              </div>
              <p
                className="text-[#f7f1e8] text-[13.438px] font-semibold"
                style={{ fontFamily: 'Gilroy, sans-serif' }}
              >
                Пригласи друга в клуб КОД ДЕНЕГ
              </p>
            </div>

            {/* Линия разделитель */}
            <div className="w-full h-[1px] bg-white/20 mb-[14px]" />

            {/* Белая плашка со ссылкой - ТОЧНО КАК В FIGMA */}
            <div
              className="w-[312px] h-[63px] mx-auto rounded-[6px] border border-white flex items-center px-[14px]"
              style={{ background: 'rgb(247, 241, 232)' }}
            >
              <div className="flex-1 min-w-0">
                <p
                  className="text-[#2d2620] text-[9.619px] font-semibold mb-[4px]"
                  style={{ fontFamily: 'Gilroy, sans-serif' }}
                >
                  Отправьте эту ссылку другу
                </p>
                <p
                  className="text-[#2d2620] text-[11px] truncate"
                  style={{ fontFamily: 'monospace' }}
                >
                  {referralLink}
                </p>
              </div>
              <button
                onClick={handleCopyReferralLink}
                className="flex-shrink-0 w-[28px] h-[28px] flex items-center justify-center ml-[10px]"
              >
                <Copy className="w-[14px] h-[14px] text-[#2d2620]" />
              </button>
            </div>
          </div>
        </div>

        {/* 3. Приветствие - точные размеры из Figma */}
        <div className="text-center mb-[23px]">
          <h1
            className="text-[#2d2620] mb-[4px]"
            style={{
              fontFamily: 'TT Nooks, serif',
              fontSize: '53.701px',
              fontWeight: 300,
              lineHeight: '0.95',
              letterSpacing: '-3.222px',
            }}
          >
            Привет, {userName}!
          </h1>
          <p
            className="text-[#2d2620]"
            style={{
              fontFamily: 'TT Nooks, serif',
              fontSize: '20.985px',
              fontWeight: 300,
              lineHeight: '0.95',
              letterSpacing: '-1.2591px',
            }}
          >
            Ты в пространстве клуба «Код Денег»
          </p>
        </div>

        {/* 4. Мой баланс - красная карточка с особой формой */}
        <div className="w-[341px] h-[93px] mx-auto mb-[30px] relative">
          {/* Фоновая карточка с градиентом */}
          <div
            className="absolute inset-0 rounded-[6px] overflow-hidden"
            style={{
              background: 'linear-gradient(243.413deg, rgb(174, 30, 43) 15.721%, rgb(156, 23, 35) 99.389%)',
            }}
          >
            {/* Картинка молотка/денег слева */}
            <div
              className="absolute left-[14px] top-[42px] w-[175px] h-[37px] rounded-[6px] overflow-hidden border border-[rgba(244,214,182,0.4)]"
            >
              <img
                src="/assets/balance-image.png"
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Контент */}
          <div className="relative z-10 h-full flex items-start justify-between p-[9px]">
            <p
              className="text-[#f7f1e8] w-[137px]"
              style={{
                fontFamily: 'TT Nooks, serif',
                fontSize: '23.603px',
                fontWeight: 300,
                lineHeight: 'normal',
              }}
            >
              Мой баланс
            </p>

            <div className="text-right">
              <p
                className="text-[#f7f1e8]"
                style={{
                  fontFamily: 'Gilroy, sans-serif',
                  fontSize: '46.436px',
                  fontWeight: 600,
                  lineHeight: 'normal',
                }}
              >
                {epBalance}
              </p>
              <p
                className="text-[#f7f1e8]"
                style={{
                  fontFamily: 'Gilroy, sans-serif',
                  fontSize: '18.574px',
                  fontWeight: 400,
                  lineHeight: 'normal',
                }}
              >
                энергий
              </p>
            </div>
          </div>
        </div>

        {/* 5. Анонсы */}
        <div className="w-[341px] mx-auto">
          <div className="flex items-center gap-[6px] mb-[10px]">
            <p
              className="text-[#2d2620]"
              style={{
                fontFamily: 'TT Nooks, serif',
                fontSize: '20.985px',
                fontWeight: 300,
                lineHeight: '0.95',
                letterSpacing: '-1.2591px',
              }}
            >
              Анонсы
            </p>
            <Megaphone
              className="w-[19px] h-[19px]"
              style={{
                color: 'rgb(174, 30, 43)',
              }}
            />
          </div>
          {/* Линия под анонсами */}
          <div className="w-full h-[1px] bg-[#2d2620]/20" />
        </div>

      </div>
    </div>
  );
}
