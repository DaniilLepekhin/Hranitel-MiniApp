'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Search, Copy, Megaphone } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { gamificationApi } from '@/lib/api';

// Предзагрузка изображений фона для моментального отображения
const preloadImages = () => {
  const images = [
    '/assets/newspaper-texture.png',
    '/assets/bg-coins.png',
    '/assets/bg-blur.png',
  ];
  images.forEach((src) => {
    const img = new Image();
    img.src = src;
  });
};

// Вызываем предзагрузку сразу при импорте модуля
if (typeof window !== 'undefined') {
  preloadImages();
}

interface HomeTabProps {
  onProfileClick?: () => void;
}

export function HomeTab({ onProfileClick }: HomeTabProps) {
  const { user, token } = useAuthStore();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: statsData } = useQuery({
    queryKey: ['gamification-stats'],
    queryFn: () => gamificationApi.stats(),
    enabled: !!user && !!token,
    retry: false,
    staleTime: 60 * 1000,
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
    <div className="min-h-screen w-full bg-[#f0ece8] relative">
      {/* ===== ФОН - адаптивный на все устройства ===== */}
      <div
        className="fixed pointer-events-none overflow-hidden bg-[#f0ece8]"
        style={{
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%',
        }}
      >
        {/*
          Газетная текстура - покрывает весь экран
          Используем большой размер с центрированием для покрытия при любом соотношении сторон
        */}
        <div
          className="absolute"
          style={{
            width: '250%',
            height: '250%',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%) rotate(-60.8deg)',
            opacity: 0.25,
            mixBlendMode: 'overlay',
          }}
        >
          <img
            src="/assets/newspaper-texture.png"
            alt=""
            className="w-full h-full object-cover"
          />
        </div>

        {/* Монеты/молоток слева */}
        <div
          className="absolute"
          style={{
            width: '160%',
            height: '120%',
            left: '-50%',
            top: '-10%',
            mixBlendMode: 'multiply',
            opacity: 0.4,
          }}
        >
          <img
            src="/assets/bg-coins.png"
            alt=""
            className="w-full h-full object-cover object-left-top"
          />
        </div>

        {/* Размытое цветное пятно 1 - слева внизу */}
        <div
          className="absolute"
          style={{
            width: '150%',
            height: '130%',
            left: '-80%',
            bottom: '-30%',
            mixBlendMode: 'color-dodge',
            filter: 'blur(200px)',
            transform: 'rotate(-22.76deg)',
            opacity: 0.5,
          }}
        >
          <img
            src="/assets/bg-blur.png"
            alt=""
            className="w-full h-full object-cover"
          />
        </div>

        {/* Размытое цветное пятно 2 - справа вверху */}
        <div
          className="absolute"
          style={{
            width: '150%',
            height: '130%',
            right: '-80%',
            top: '-70%',
            mixBlendMode: 'color-dodge',
            filter: 'blur(200px)',
            transform: 'rotate(77.63deg) scaleY(-1)',
            opacity: 0.5,
          }}
        >
          <img
            src="/assets/bg-blur.png"
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* ===== КОНТЕНТ - адаптивный ===== */}
      <div className="relative z-10 px-4 sm:px-6 lg:px-8 pt-4 pb-24 max-w-2xl mx-auto">

        {/* 1. Поиск - адаптивная ширина */}
        <form onSubmit={handleSearch} className="mb-5">
          <div
            className="w-full h-[40px] sm:h-[44px] bg-[#2d2620] flex items-center rounded-lg"
          >
            <Search
              className="ml-3 sm:ml-4 opacity-70 flex-shrink-0"
              style={{ width: '18px', height: '18px', color: '#f7f1e8' }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск..."
              className="flex-1 bg-transparent placeholder:opacity-70 px-3 focus:outline-none"
              style={{
                fontFamily: 'Gilroy, sans-serif',
                fontWeight: 600,
                fontSize: '14px',
                color: '#f7f1e8',
              }}
            />
          </div>
        </form>

        {/* 2. Пригласи друга - адаптивная ширина */}
        <div
          className="w-full mb-6 relative overflow-hidden"
          style={{
            borderRadius: '8px',
            border: '1px solid #d93547',
            background: 'linear-gradient(243.413deg, rgb(174, 30, 43) 15.721%, rgb(156, 23, 35) 99.389%)',
          }}
        >
          <div className="p-4 sm:p-5">
            {/* Заголовок с логотипом КОД */}
            <div className="flex items-center gap-3 mb-3">
              {/* Круг КОД */}
              <div className="relative flex-shrink-0" style={{ width: '44px', height: '44px' }}>
                <div
                  className="absolute inset-0 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.1)', mixBlendMode: 'soft-light' }}
                />
                <div
                  className="absolute rounded-full flex items-center justify-center"
                  style={{
                    inset: '4px',
                    border: '1px solid rgba(255,255,255,0.3)',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'Gilroy, sans-serif',
                      fontWeight: 700,
                      fontSize: '9px',
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
                  fontSize: '14px',
                  color: '#f7f1e8',
                }}
              >
                Пригласи друга в клуб КОД ДЕНЕГ
              </p>
            </div>

            {/* Линия */}
            <div className="w-full h-[1px] bg-white/20 mb-4" />

            {/* Белая плашка со ссылкой */}
            <div
              className="w-full flex items-center px-4 py-3"
              style={{
                borderRadius: '8px',
                border: '1px solid white',
                background: 'rgb(247, 241, 232)',
              }}
            >
              <div className="flex-1 min-w-0">
                <p
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontWeight: 600,
                    fontSize: '11px',
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
                    fontSize: '12px',
                    color: '#2d2620',
                  }}
                >
                  {referralLink}
                </p>
              </div>
              <button
                onClick={handleCopyReferralLink}
                className="flex-shrink-0 flex items-center justify-center ml-3 p-2 hover:bg-black/5 rounded-lg transition-colors"
              >
                <Copy style={{ width: '18px', height: '18px', color: '#2d2620' }} />
              </button>
            </div>
          </div>
        </div>

        {/* 3. Приветствие */}
        <div className="text-center mb-6">
          <p
            style={{
              fontFamily: '"TT Nooks", Georgia, serif',
              fontWeight: 300,
              fontSize: 'clamp(40px, 10vw, 54px)',
              lineHeight: 0.95,
              letterSpacing: '-0.06em',
              color: '#2d2620',
              marginBottom: '8px',
            }}
          >
            Привет, {userName}!
          </p>
          <p
            style={{
              fontFamily: '"TT Nooks", Georgia, serif',
              fontWeight: 300,
              fontSize: 'clamp(16px, 4vw, 21px)',
              lineHeight: 0.95,
              letterSpacing: '-0.06em',
              color: '#2d2620',
            }}
          >
            Ты в пространстве клуба «Код Денег»
          </p>
        </div>

        {/* 4. Мой баланс - адаптивная ширина */}
        <div
          className="w-full mb-6 relative overflow-hidden"
          style={{
            borderRadius: '8px',
            background: 'linear-gradient(243.413deg, rgb(174, 30, 43) 15.721%, rgb(156, 23, 35) 99.389%)',
            minHeight: '100px',
          }}
        >
          {/* Картинка молотка/денег */}
          <div
            className="absolute overflow-hidden"
            style={{
              left: '16px',
              bottom: '12px',
              width: 'min(50%, 200px)',
              height: '45px',
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
          <div className="relative z-10 h-full flex justify-between p-4">
            <p
              style={{
                fontFamily: '"TT Nooks", Georgia, serif',
                fontWeight: 300,
                fontSize: 'clamp(20px, 5vw, 24px)',
                color: '#f7f1e8',
              }}
            >
              Мой баланс
            </p>

            <div className="text-right">
              <p
                style={{
                  fontFamily: 'Gilroy, sans-serif',
                  fontWeight: 600,
                  fontSize: 'clamp(40px, 10vw, 48px)',
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
                  fontSize: 'clamp(16px, 4vw, 19px)',
                  color: '#f7f1e8',
                }}
              >
                энергий
              </p>
            </div>
          </div>
        </div>

        {/* 5. Анонсы */}
        <div className="w-full">
          <div className="flex items-center gap-2 mb-3">
            <p
              style={{
                fontFamily: '"TT Nooks", Georgia, serif',
                fontWeight: 300,
                fontSize: 'clamp(18px, 4vw, 21px)',
                lineHeight: 0.95,
                letterSpacing: '-0.06em',
                color: '#2d2620',
              }}
            >
              Анонсы
            </p>
            <Megaphone
              style={{
                width: '20px',
                height: '20px',
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
