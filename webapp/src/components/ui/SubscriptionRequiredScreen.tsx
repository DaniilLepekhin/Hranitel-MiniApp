'use client';

import { memo } from 'react';
import { Lock } from 'lucide-react';

/**
 * Экран блокировки для неоплативших пользователей
 * Показывает замок и кнопку для перехода к оплате
 */
export const SubscriptionRequiredScreen = memo(function SubscriptionRequiredScreen() {
  const handleGetAccess = () => {
    // Закрыть WebApp и перенаправить в бот для оплаты
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.close();
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center">
      {/* Фон как на LoadingScreen */}
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

        {/* Размытое цветное пятно 1 */}
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

        {/* Размытое цветное пятно 2 */}
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

      {/* Контент */}
      <div className="relative z-10 text-center px-6 max-w-md mx-auto">
        {/* Иконка замка */}
        <div className="mb-6">
          <div
            className="w-24 h-24 mx-auto rounded-full flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, rgba(217, 53, 71, 0.15) 0%, rgba(156, 23, 35, 0.15) 100%)',
              border: '2px solid rgba(217, 53, 71, 0.3)',
            }}
          >
            <Lock
              className="w-12 h-12"
              style={{
                color: '#d93547',
              }}
            />
          </div>
        </div>

        {/* Заголовок */}
        <h1
          className="text-2xl font-bold mb-3"
          style={{
            color: '#2b2520',
          }}
        >
          Доступ закрыт
        </h1>

        {/* Описание */}
        <p
          className="text-base mb-8 leading-relaxed"
          style={{
            color: '#6b5a4a',
          }}
        >
          Приложение доступно только участникам клуба «КОД УСПЕХА».
          Оформи подписку в боте, чтобы получить доступ ко всем материалам.
        </p>

        {/* Кнопка */}
        <button
          onClick={handleGetAccess}
          className="w-full py-4 px-6 rounded-2xl font-semibold text-white text-lg transition-all active:scale-[0.98]"
          style={{
            background: 'linear-gradient(135deg, #d93547 0%, #9c1723 100%)',
            boxShadow: '0 4px 20px rgba(217, 53, 71, 0.3)',
          }}
        >
          Вернуться в бот
        </button>

        {/* Подсказка */}
        <p
          className="mt-4 text-sm"
          style={{
            color: '#9c8b7a',
          }}
        >
          Нажми /start в боте для оформления подписки
        </p>
      </div>
    </div>
  );
});
