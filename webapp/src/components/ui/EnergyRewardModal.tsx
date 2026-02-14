'use client';

import { useEffect, useState } from 'react';
import { X, Zap, Sparkles } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';

interface EnergyRewardModalProps {
  isOpen: boolean;
  onClose: () => void;
  energyAmount: number;
  videoTitle?: string;
}

export function EnergyRewardModal({ isOpen, onClose, energyAmount, videoTitle }: EnergyRewardModalProps) {
  const { haptic } = useTelegram();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShow(true);
      haptic.notification('success');
    }
  }, [isOpen, haptic]);

  const handleClose = () => {
    setShow(false);
    setTimeout(onClose, 300);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop with blur */}
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-50 transition-opacity duration-300 ${
          show ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleClose}
      />

      {/* Confetti particles */}
      {show && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute animate-confetti"
              style={{
                left: `${Math.random() * 100}%`,
                top: '-10%',
                animationDelay: `${Math.random() * 0.5}s`,
                animationDuration: `${2 + Math.random() * 2}s`,
              }}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: ['#10b981', '#22c55e', '#84cc16', '#eab308', '#f59e0b'][
                    Math.floor(Math.random() * 5)
                  ],
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className={`bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden pointer-events-auto transform transition-all duration-300 ${
            show ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
          }`}
        >
          {/* Header with gradient */}
          <div className="relative bg-gradient-to-br from-green-400 via-emerald-500 to-green-600 p-8 pb-16 overflow-hidden">
            {/* Animated background circles */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 animate-pulse" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full -ml-12 -mb-12 animate-pulse delay-150" />

            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>

            {/* Energy icon with glow */}
            <div className="relative flex justify-center mb-4">
              <div className="absolute w-24 h-24 bg-yellow-300/50 rounded-full blur-2xl animate-pulse" />
              <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-yellow-300 to-orange-400 flex items-center justify-center shadow-xl transform animate-bounce-slow">
                <Zap className="w-12 h-12 text-white fill-white drop-shadow-lg" />
              </div>
            </div>

            {/* Title */}
            <h2 className="text-3xl font-black text-white text-center drop-shadow-lg">
              Отлично!
            </h2>
          </div>

          {/* Content */}
          <div className="relative -mt-8 px-6 pb-6">
            {/* Energy amount card */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-6 shadow-lg border-2 border-green-200 mb-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Sparkles className="w-6 h-6 text-green-600 animate-pulse" />
                <span className="text-5xl font-black bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                  +{energyAmount}
                </span>
                <Zap className="w-8 h-8 text-green-600 fill-green-600" />
              </div>
              <p className="text-center text-lg font-bold text-green-700">
                Энергии начислена!
              </p>
            </div>

            {/* Message */}
            <div className="text-center mb-6">
              <p className="text-gray-600 leading-relaxed">
                Вы получили награду за просмотр видео
              </p>
              {videoTitle && (
                <p className="text-sm text-gray-500 mt-2 line-clamp-2">
                  "{videoTitle}"
                </p>
              )}
            </div>

            {/* Action button */}
            <button
              onClick={handleClose}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold text-lg shadow-lg hover:shadow-xl active:scale-98 transition-all"
            >
              Продолжить обучение
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes confetti {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
        @keyframes bounce-slow {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
          }
        }
        .animate-confetti {
          animation: confetti linear forwards;
        }
        .animate-bounce-slow {
          animation: bounce-slow 2s ease-in-out infinite;
        }
        .active\\:scale-98:active {
          transform: scale(0.98);
        }
      `}</style>
    </>
  );
}
