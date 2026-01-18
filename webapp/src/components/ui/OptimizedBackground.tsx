'use client';

import { memo } from 'react';

interface BackgroundProps {
  variant?: 'home' | 'ratings' | 'profile';
}

/**
 * 🚀 МАКСИМАЛЬНО БЫСТРЫЙ фоновый компонент
 * Использует обычные <img> вместо Next.js Image для мгновенного рендера
 * Мемоизация предотвращает перерендеры
 */
export const OptimizedBackground = memo(function OptimizedBackground({
  variant = 'home'
}: BackgroundProps) {
  const bgColor = variant === 'home' ? '#f0ece8' : '#f7f1e8';

  return (
    <div
      className="fixed pointer-events-none overflow-hidden"
      style={{
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
        backgroundColor: bgColor,
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
          opacity: variant === 'home' ? 0.25 : 0.18,
          mixBlendMode: 'overlay',
        }}
      >
        <img
          src="/assets/newspaper-texture.jpg"
          alt=""
          loading="lazy"
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
          loading="lazy"
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
          src="/assets/bg-blur.jpg"
          alt=""
          loading="lazy"
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
          src="/assets/bg-blur.jpg"
          alt=""
          loading="lazy"
          className="w-full h-full object-cover"
        />
      </div>
    </div>
  );
});
