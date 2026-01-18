'use client';

import React from 'react';

interface AudioBarsProps {
  isPlaying: boolean;
  className?: string;
}

export const AudioBars: React.FC<AudioBarsProps> = ({ isPlaying, className = '' }) => {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={`w-1 rounded-full bg-[#d93547] transition-all ${
            isPlaying ? 'animate-soundbar' : 'h-2'
          }`}
          style={{
            animationDelay: `${i * 0.1}s`,
            height: isPlaying ? '16px' : '8px',
          }}
        />
      ))}
      <style jsx>{`
        @keyframes soundbar {
          0%,
          100% {
            height: 16px;
          }
          50% {
            height: 8px;
          }
        }
        .animate-soundbar {
          animation: soundbar 0.8s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};
