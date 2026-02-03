'use client';

import { useState, useEffect } from 'react';
import { Play, CheckCircle } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';

// YouTube icon SVG
const YouTubeIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

// RuTube icon SVG (official logo)
const RuTubeIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
    <path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm4.872 13.248l-6.336 4.416c-.24.168-.48.24-.744.24-.192 0-.384-.048-.552-.144-.384-.216-.624-.624-.624-1.056V7.296c0-.432.24-.84.624-1.056.384-.216.864-.192 1.224.048l6.408 4.416c.336.24.528.624.528 1.032 0 .408-.192.792-.528 1.032v-.048-.072z"/>
  </svg>
);

type VideoSource = 'youtube' | 'rutube';

interface DualVideoPlayerProps {
  youtubeUrl: string;
  rutubeUrl: string;
  title: string;
  description?: string;
  onComplete?: () => void;
  pdfUrl?: string;
}

export function DualVideoPlayer({
  youtubeUrl,
  rutubeUrl,
  title,
  description,
  onComplete,
  pdfUrl
}: DualVideoPlayerProps) {
  const { haptic } = useTelegram();
  const [selectedSource, setSelectedSource] = useState<VideoSource | null>(null);
  const [hasWatched, setHasWatched] = useState(false);

  // Load saved preference from localStorage
  useEffect(() => {
    const savedPreference = localStorage.getItem('videoPlayerPreference') as VideoSource | null;
    if (savedPreference && (savedPreference === 'youtube' || savedPreference === 'rutube')) {
      // Don't auto-select, just remember for future
    }
  }, []);

  const handleSourceSelect = (source: VideoSource) => {
    haptic.impact('light');
    setSelectedSource(source);
    // Save preference
    localStorage.setItem('videoPlayerPreference', source);
  };

  const handleBack = () => {
    haptic.impact('light');
    setSelectedSource(null);
  };

  const handleComplete = () => {
    setHasWatched(true);
    onComplete?.();
    haptic.notification('success');
  };

  // Extract YouTube video ID
  const getYouTubeVideoId = (url: string): string | null => {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
    return match ? match[1] : null;
  };

  // Generate embed URLs
  const youtubeEmbedUrl = getYouTubeVideoId(youtubeUrl)
    ? `https://www.youtube.com/embed/${getYouTubeVideoId(youtubeUrl)}?rel=0&modestbranding=1`
    : null;

  // RuTube URL already in embed format
  const rutubeEmbedUrl = rutubeUrl.includes('/embed/') || rutubeUrl.includes('/play/embed/')
    ? rutubeUrl
    : rutubeUrl.replace('rutube.ru/video/', 'rutube.ru/play/embed/');

  // Source selection screen
  if (!selectedSource) {
    return (
      <div className="w-full">
        {/* Preview Card */}
        <div className="relative w-full aspect-video bg-gradient-to-br from-[#2b2520] to-[#1a1512] rounded-2xl overflow-hidden mb-4 shadow-lg">
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            <Play className="w-16 h-16 text-white/80 mb-4" />
            <h3 className="text-white font-bold text-lg mb-2">{title}</h3>
            {description && (
              <p className="text-white/60 text-sm line-clamp-2">{description}</p>
            )}
          </div>
        </div>

        {/* Source Selection */}
        <div className="space-y-3">
          <p className="text-center text-[#6b5a4a] text-sm mb-4">
            Выберите плеер для просмотра
          </p>

          <div className="grid grid-cols-2 gap-3">
            {/* YouTube Button */}
            <button
              onClick={() => handleSourceSelect('youtube')}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/80 border-2 border-transparent hover:border-red-500 hover:bg-red-50 transition-all active:scale-[0.98]"
            >
              <div className="w-12 h-12 rounded-xl bg-red-600 flex items-center justify-center text-white">
                <YouTubeIcon />
              </div>
              <span className="font-semibold text-[#2b2520]">YouTube</span>
            </button>

            {/* RuTube Button */}
            <button
              onClick={() => handleSourceSelect('rutube')}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/80 border-2 border-transparent hover:border-blue-500 hover:bg-blue-50 transition-all active:scale-[0.98]"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white">
                <RuTubeIcon />
              </div>
              <span className="font-semibold text-[#2b2520]">RuTube</span>
            </button>
          </div>
        </div>

        {/* PDF Link */}
        {pdfUrl && (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#d93547]/10 text-[#d93547] font-semibold hover:bg-[#d93547]/20 transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Скачать презентацию (PDF)
          </a>
        )}
      </div>
    );
  }

  // Video player screen
  const embedUrl = selectedSource === 'youtube' ? youtubeEmbedUrl : rutubeEmbedUrl;

  return (
    <div className="w-full">
      {/* Back button & source indicator */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/60 hover:bg-white/80 transition-all text-sm font-medium text-[#2b2520]"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Выбрать другой плеер
        </button>

        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium ${
          selectedSource === 'youtube' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
        }`}>
          {selectedSource === 'youtube' ? <YouTubeIcon /> : <RuTubeIcon />}
          <span>{selectedSource === 'youtube' ? 'YouTube' : 'RuTube'}</span>
        </div>
      </div>

      {/* Video Player */}
      <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-lg">
        {embedUrl ? (
          <iframe
            src={embedUrl}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            title={title}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white">
            <p>Видео недоступно</p>
          </div>
        )}
      </div>

      {/* Video Info */}
      <div className="mt-4 p-4 rounded-xl bg-gradient-to-br from-[#d93547]/5 to-[#9c1723]/5">
        <h2 className="font-bold text-[#2b2520] mb-2">{title}</h2>
        {description && (
          <p className="text-[#6b5a4a] leading-relaxed text-sm">{description}</p>
        )}
      </div>

      {/* PDF Link */}
      {pdfUrl && (
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#d93547]/10 text-[#d93547] font-semibold hover:bg-[#d93547]/20 transition-all"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Скачать презентацию (PDF)
        </a>
      )}

      {/* Complete Button */}
      {!hasWatched && (
        <button
          onClick={handleComplete}
          className="w-full mt-4 px-6 py-4 rounded-xl bg-gradient-to-r from-[#d93547] to-[#9c1723] text-white font-bold shadow-lg hover:shadow-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <CheckCircle className="w-5 h-5" />
          <span>Я посмотрел(а) видео</span>
        </button>
      )}

      {hasWatched && (
        <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-[#d93547]/10 to-[#9c1723]/10 border border-[#9c1723]/30 flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-[#d93547] flex-shrink-0" />
          <div>
            <p className="font-semibold text-[#2b2520]">Видео просмотрено!</p>
            <p className="text-[#6b5a4a] text-sm">Energy Points начислены на ваш счёт</p>
          </div>
        </div>
      )}
    </div>
  );
}
