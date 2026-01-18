'use client';

import { Maximize2, Minimize2 } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';

export function FullscreenButton() {
  const { webApp, requestFullscreen, exitFullscreen, isFullscreen, haptic } = useTelegram();

  if (!webApp) return null;

  const toggleFullscreen = () => {
    haptic.impact('medium');
    if (isFullscreen) {
      exitFullscreen();
    } else {
      requestFullscreen();
    }
  };

  return (
    <button
      onClick={toggleFullscreen}
      className="fixed bottom-[140px] right-4 z-40 w-10 h-10 rounded-full bg-gray-800/90 backdrop-blur-sm shadow-lg flex items-center justify-center active:scale-95 transition-all hover:bg-gray-800 border border-white/10"
      aria-label={isFullscreen ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим'}
    >
      {isFullscreen ? (
        <Minimize2 className="w-4 h-4 text-gray-300" />
      ) : (
        <Maximize2 className="w-4 h-4 text-gray-300" />
      )}
    </button>
  );
}
