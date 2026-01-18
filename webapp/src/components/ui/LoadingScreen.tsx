'use client';

import { memo } from 'react';

/**
 * 🎯 РЕВОЛЮЦИОННЫЙ ЭКРАН ЗАГРУЗКИ
 * Использует новый дизайн с фоном как на Главной/Рейтинге/Профиле
 * Отображает "KOD" вместо emoji
 * Мемоизирован для максимальной производительности
 */
export const LoadingScreen = memo(function LoadingScreen() {
  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center">
      {/* 🎨 НОВЫЙ ФОН - КАК НА ВСЕХ ЭКРАНАХ */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundColor: '#f0ece8',
        }}
      >
        {/* Газетная текстура */}
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
            src="/assets/newspaper-texture.jpg"
            alt=""
            loading="eager"
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
            src="/assets/bg-coins.jpg"
            alt=""
            loading="eager"
            className="w-full h-full object-cover object-left-top"
          />
        </div>

        {/* Размытое цветное пятно 1 - слева внизу */}
        <div
          className="absolute"
          style={{
            width: '150%',
            height: '100%',
            left: '-80%',
            bottom: '-30%',
            mixBlendMode: 'color-dodge',
            filter: 'blur(200px)',
            transform: 'rotate(-22.76deg)',
            opacity: 0.5,
          }}
        >
          <img
            src="/assets/bg-blur.jpg"
            alt=""
            loading="eager"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Размытое цветное пятно 2 - справа вверху */}
        <div
          className="absolute"
          style={{
            width: '150%',
            height: '100%',
            right: '-80%',
            top: '-70%',
            mixBlendMode: 'color-dodge',
            filter: 'blur(200px)',
            transform: 'rotate(77.63deg) scaleY(-1)',
            opacity: 0.5,
          }}
        >
          <img
            src="/assets/bg-blur.jpg"
            alt=""
            loading="eager"
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* 🎯 КОНТЕНТ ЗАГРУЗКИ */}
      <div className="relative z-10 text-center">
        {/* KOD Logo с анимацией */}
        <div className="mb-6 animate-pulse">
          <h1
            className="font-bold tracking-wider"
            style={{
              fontSize: 'clamp(3rem, 12vw, 5rem)',
              background: 'linear-gradient(135deg, #d93547 0%, #ae1e2b 50%, #9c1723 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              textShadow: '0 4px 20px rgba(217, 53, 71, 0.3)',
            }}
          >
            KOD
          </h1>
        </div>

        {/* Загрузочная полоса */}
        <div className="w-48 h-1 mx-auto bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full animate-loading-bar"
            style={{
              background: 'linear-gradient(90deg, #d93547, #ae1e2b, #9c1723)',
            }}
          />
        </div>

        {/* Текст "Загрузка..." */}
        <p
          className="mt-4 text-base font-medium tracking-wide"
          style={{
            color: '#9c1723',
          }}
        >
          Загрузка...
        </p>
      </div>

      {/* CSS для анимации загрузочной полосы */}
      <style jsx>{`
        @keyframes loading-bar {
          0% {
            transform: translateX(-100%);
          }
          50% {
            transform: translateX(0%);
          }
          100% {
            transform: translateX(100%);
          }
        }

        .animate-loading-bar {
          animation: loading-bar 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
});
