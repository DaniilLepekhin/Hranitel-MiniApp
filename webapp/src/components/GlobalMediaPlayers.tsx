'use client';

import { MiniPlayer } from '@/components/player/MiniPlayer';
import { FullMediaPlayer } from '@/components/player/FullMediaPlayer';

/**
 * Глобальные медиа-плееры, рендерятся на всех страницах
 * Client Component wrapper для использования в Server Component layout
 */
export function GlobalMediaPlayers() {
  return (
    <>
      <MiniPlayer />
      <FullMediaPlayer />
    </>
  );
}
