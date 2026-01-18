'use client';

import { useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';

export function FullscreenButton() {
  const { webApp, requestFullscreen, exitFullscreen, isFullscreen, haptic } = useTelegram();
  const [isTransitioning, setIsTransitioning] = useState(false);

  if (!webApp) return null;

  const toggleFullscreen = () => {
    if (isTransitioning) return; // Предотвращаем двойные клики

    setIsTransitioning(true);
    haptic.impact('medium');

    if (isFullscreen) {
      exitFullscreen();
    } else {
      requestFullscreen();
    }

    // Сбрасываем блокировку через 500мс (время анимации Telegram)
    setTimeout(() => setIsTransitioning(false), 500);
  };

  return (
    <button
      onClick={toggleFullscreen}
      disabled={isTransitioning}
      className="fixed bottom-[140px] right-4 z-40 w-10 h-10 rounded-full bg-gray-800/90 backdrop-blur-sm shadow-lg flex items-center justify-center active:scale-95 transition-all hover:bg-gray-800 border border-white/10 disabled:opacity-50"
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
