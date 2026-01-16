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
      {/* ===== ФОН - точно как в Figma ===== */}

      {/* Газетная текстура - mix-blend-overlay, opacity 18%, повернута */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: '1039px',
          height: '1559px',
          left: '-725px',
          top: '-491px',
          opacity: 0.18,
          mixBlendMode: 'overlay',
          transform: 'rotate(-60.8deg)',
        }}
      >
        <img
          src="/assets/newspaper-texture.png"
          alt=""
          className="w-full h-full object-cover"
        />
      </div>

      {/* Монеты/молоток слева - mix-blend-multiply */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: '645px',
          height: '967px',
          left: '-210px',
          top: '-99px',
          mixBlendMode: 'multiply',
        }}
      >
        <img
          src="/assets/bg-coins.png"
          alt=""
          className="w-full h-full object-cover"
        />
      </div>

      {/* Размытое цветное пятно 1 - mix-blend-color-dodge */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: '1077px',
          height: '963px',
          left: '-735px',
          top: '0px',
          mixBlendMode: 'color-dodge',
          filter: 'blur(200px)',
          transform: 'rotate(-22.76deg)',
        }}
      >
        <img
          src="/assets/bg-blur.png"
          alt=""
          className="w-full h-full object-cover"
        />
      </div>

      {/* Размытое цветное пятно 2 - mix-blend-color-dodge, перевернутое */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: '1077px',
          height: '963px',
          left: '-431px',
          top: '-710px',
          mixBlendMode: 'color-dodge',
          filter: 'blur(200px)',
          transform: 'rotate(77.63deg) scaleY(-1)',
        }}
      >
        <img
          src="/assets/bg-blur.png"
          alt=""
          className="w-full h-full object-cover"
        />
      </div>

      {/* ===== КОНТЕНТ ===== */}
      <div className="relative z-10 px-[29px] pt-[17px] pb-[100px]">

        {/* 1. Поиск */}
        <form onSubmit={handleSearch} className="mb-[20px]">
          <div
            className="w-[341px] h-[36px] bg-[#2d2620] mx-auto flex items-center"
            style={{ borderRadius: '5.731px' }}
          >
            <Search
              className="ml-[10px] opacity-70"
              style={{ width: '16.238px', height: '16.238px', color: '#f7f1e8' }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск..."
              className="flex-1 bg-transparent placeholder:opacity-70 px-[10px] focus:outline-none"
              style={{
                fontFamily: 'Gilroy, sans-serif',
                fontWeight: 600,
                fontSize: '13.438px',
                color: '#f7f1e8',
              }}
            />
          </div>
        </form>

        {/* 2. Пригласи друга */}
        <div
          className="w-[341px] h-[160px] mx-auto mb-[30px] relative overflow-hidden"
          style={{
            borderRadius: '5.731px',
            border: '0.955px solid #d93547',
            background: 'linear-gradient(243.413deg, rgb(174, 30, 43) 15.721%, rgb(156, 23, 35) 99.389%)',
          }}
        >
          <div className="p-[14px]">
            {/* Заголовок с логотипом КОД */}
            <div className="flex items-center gap-[10px] mb-[12px]">
              {/* Круг КОД */}
              <div className="relative" style={{ width: '40.118px', height: '40.118px' }}>
                <div
                  className="absolute inset-0 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.1)', mixBlendMode: 'soft-light' }}
                />
                <div
                  className="absolute rounded-full flex items-center justify-center"
                  style={{
                    inset: '3.83px',
                    border: '1px solid rgba(255,255,255,0.3)',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'Gilroy, sans-serif',
                      fontWeight: 700,
                      fontSize: '7.716px',
                      color: 'white',
                      letterSpacing: '0.5px',
                    }}
                  >
                    КОД
                  </span>
                </div>
              </div>
              <p
                style={{
                  fontFamily: 'Gilroy, sans-serif',
                  fontWeight: 600,
                  fontSize: '13.438px',
                  color: '#f7f1e8',
                }}
              >
                Пригласи друга в клуб КОД ДЕНЕГ
              </p>
            </div>

            {/* Линия */}
            <div className="w-full h-[1px] bg-white/20 mb-[14px]" />

            {/* Белая плашка со ссылкой */}
            <div
              className="w-[312px] h-[63px] mx-auto flex items-center px-[14px]"
              style={{
                borderRadius: '5.731px',
                border: '0.955px solid white',
                background: 'rgb(247, 241, 232)',
              }}
            >
              <div className="flex-1 min-w-0">
                <p
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontWeight: 600,
                    fontSize: '9.619px',
                    color: '#2d2620',
                    marginBottom: '4px',
                  }}
                >
                  Отправьте эту ссылку другу
                </p>
                <p
                  className="truncate"
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    color: '#2d2620',
                  }}
                >
                  {referralLink}
                </p>
              </div>
              <button
                onClick={handleCopyReferralLink}
                className="flex-shrink-0 flex items-center justify-center ml-[10px]"
                style={{ width: '14.328px', height: '14.328px' }}
              >
                <Copy style={{ width: '14.328px', height: '14.328px', color: '#2d2620' }} />
              </button>
            </div>
          </div>
        </div>

        {/* 3. Приветствие - ШРИФТ TT Nooks LIGHT (не жирный!) */}
        <div className="text-center mb-[23px]">
          <p
            style={{
              fontFamily: '"TT Nooks", Georgia, serif',
              fontWeight: 300, // LIGHT - не жирный!
              fontSize: '53.701px',
              lineHeight: 0.95,
              letterSpacing: '-3.222px',
              color: '#2d2620',
              marginBottom: '4px',
            }}
          >
            Привет, {userName}!
          </p>
          <p
            style={{
              fontFamily: '"TT Nooks", Georgia, serif',
              fontWeight: 300, // LIGHT
              fontSize: '20.985px',
              lineHeight: 0.95,
              letterSpacing: '-1.2591px',
              color: '#2d2620',
            }}
          >
            Ты в пространстве клуба «Код Денег»
          </p>
        </div>

        {/* 4. Мой баланс */}
        <div
          className="w-[341px] h-[93px] mx-auto mb-[30px] relative overflow-hidden"
          style={{
            borderRadius: '6px',
            background: 'linear-gradient(243.413deg, rgb(174, 30, 43) 15.721%, rgb(156, 23, 35) 99.389%)',
          }}
        >
          {/* Картинка молотка/денег */}
          <div
            className="absolute overflow-hidden"
            style={{
              left: '14px',
              top: '42px',
              width: '175px',
              height: '37px',
              borderRadius: '6px',
              border: '1px solid rgba(244, 214, 182, 0.4)',
            }}
          >
            <img
              src="/assets/balance-image.png"
              alt=""
              className="w-full h-full object-cover"
            />
          </div>

          {/* Контент */}
          <div className="relative z-10 h-full flex justify-between p-[9px]">
            <p
              style={{
                fontFamily: '"TT Nooks", Georgia, serif',
                fontWeight: 300, // LIGHT
                fontSize: '23.603px',
                color: '#f7f1e8',
                width: '137px',
              }}
            >
              Мой баланс
            </p>

            <div className="text-right">
              <p
                style={{
                  fontFamily: 'Gilroy, sans-serif',
                  fontWeight: 600,
                  fontSize: '46.436px',
                  color: '#f7f1e8',
                  lineHeight: 1,
                }}
              >
                {epBalance}
              </p>
              <p
                style={{
                  fontFamily: 'Gilroy, sans-serif',
                  fontWeight: 400,
                  fontSize: '18.574px',
                  color: '#f7f1e8',
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
              style={{
                fontFamily: '"TT Nooks", Georgia, serif',
                fontWeight: 300, // LIGHT
                fontSize: '20.985px',
                lineHeight: 0.95,
                letterSpacing: '-1.2591px',
                color: '#2d2620',
              }}
            >
              Анонсы
            </p>
            <Megaphone
              style={{
                width: '19px',
                height: '19px',
                color: 'rgb(174, 30, 43)',
              }}
            />
          </div>
          {/* Линия */}
          <div className="w-full h-[1px] bg-[#2d2620]/20" />
        </div>

      </div>
    </div>
  );
}
