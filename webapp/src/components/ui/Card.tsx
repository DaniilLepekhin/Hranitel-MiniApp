'use client';

import { clsx } from 'clsx';
import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  variant?: 'default' | 'glass' | 'gradient' | 'feature';
  gradient?: string;
  coverUrl?: string;
}

export function Card({
  children,
  className,
  onClick,
  variant = 'default',
  gradient,
  coverUrl,
}: CardProps) {
  const baseStyles = 'rounded-xl overflow-hidden transition-all duration-300';

  const variantStyles = {
    default: 'card',
    glass: 'glass',
    gradient: gradient ? `bg-gradient-to-br ${gradient}` : 'bg-gradient-to-br from-[#d93547]/10 to-[#9c1723]/5',
    feature: 'feature-card',
  };

  return (
    <div
      onClick={onClick}
      className={clsx(
        baseStyles,
        variantStyles[variant],
        onClick && 'cursor-pointer active:scale-[0.98]',
        className
      )}
      style={
        coverUrl
          ? {
              backgroundImage: `url(${coverUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : undefined
      }
    >
      {coverUrl && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent" />
      )}
      <div className={coverUrl ? 'relative z-10' : ''}>{children}</div>
    </div>
  );
}

// Feature card with icon (KOD style)
interface FeatureCardProps {
  icon: string;
  title: string;
  description?: string;
  onClick?: () => void;
  className?: string;
}

export function FeatureCard({
  icon,
  title,
  description,
  onClick,
  className,
}: FeatureCardProps) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'feature-card p-3 flex items-center gap-3',
        onClick && 'cursor-pointer',
        className
      )}
    >
      <span className="icon-badge">{icon}</span>
      <div className="flex-1">
        <span className="font-semibold text-sm text-[#2b2520]">{title}</span>
        {description && (
          <p className="text-xs text-[#6b5a4a] mt-0.5">{description}</p>
        )}
      </div>
    </div>
  );
}

interface CourseCardProps {
  title: string;
  description?: string;
  coverUrl?: string;
  progress?: number;
  isFavorite?: boolean;
  isLocked?: boolean;
  onClick?: () => void;
}

export function CourseCard({
  title,
  description,
  coverUrl,
  progress,
  isFavorite,
  isLocked,
  onClick,
}: CourseCardProps) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'relative h-32 rounded-xl overflow-hidden cursor-pointer',
        'border-2 border-[#9c1723]/30',
        'transition-all duration-300 hover:shadow-lg active:scale-[0.98]',
        isLocked && 'opacity-70'
      )}
    >
      {/* Background */}
      {coverUrl ? (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${coverUrl})` }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#d93547] to-[#9c1723]" />
      )}

      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent" />

      {/* Content */}
      <div className="absolute inset-0 p-4 flex flex-col justify-between text-white">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <h3 className="font-semibold text-lg leading-tight line-clamp-2">{title}</h3>
            {description && (
              <p className="text-sm text-white/80 mt-1 line-clamp-1">{description}</p>
            )}
          </div>
          {isFavorite && <span className="text-lg">❤️</span>}
          {isLocked && <span className="text-lg">🔒</span>}
        </div>

        <div className="flex items-center justify-between">
          {progress !== undefined && progress > 0 && (
            <div className="flex-1 mr-4">
              <div className="h-1.5 bg-white/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
          <button className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-md border border-[#9c1723]/20">
            <span className="text-[#d93547]">▶</span>
          </button>
        </div>
      </div>
    </div>
  );
}
