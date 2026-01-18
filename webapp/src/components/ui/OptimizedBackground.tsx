'use client';

import Image from 'next/image';
import { memo } from 'react';

interface BackgroundProps {
  variant?: 'home' | 'ratings' | 'profile';
}

/**
 * Оптимизированный фоновый компонент с использованием Next.js Image
 * Использует мемоизацию для предотвращения перерендеров
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
      {/* Газетная текстура - оптимизирована */}
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
        <Image
          src="/assets/newspaper-texture.jpg"
          alt=""
          fill
          quality={60} // Снижена качество для фона - незаметно, но быстрее
          priority={false} // Не приоритет - грузится после контента
          sizes="250vw"
          style={{
            objectFit: 'cover',
          }}
        />
      </div>

      {/* Монеты/молоток слева - оптимизирована */}
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
        <Image
          src="/assets/bg-coins.jpg"
          alt=""
          fill
          quality={50} // Еще ниже качество - будет размыта
          priority={false}
          sizes="160vw"
          style={{
            objectFit: 'cover',
            objectPosition: 'left top',
          }}
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
        <Image
          src="/assets/bg-blur.jpg"
          alt=""
          fill
          quality={30} // Очень низкое качество - все равно размыто
          priority={false}
          sizes="150vw"
          style={{
            objectFit: 'cover',
          }}
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
        <Image
          src="/assets/bg-blur.jpg"
          alt=""
          fill
          quality={30}
          priority={false}
          sizes="150vw"
          style={{
            objectFit: 'cover',
          }}
        />
      </div>
    </div>
  );
});
