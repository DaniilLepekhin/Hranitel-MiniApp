'use client';

import { useRouter } from 'next/navigation';
import { Megaphone } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';

// Категории контента с изображениями
const contentCategories = [
  {
    id: 'month-program',
    title: 'Программа месяца',
    path: '/month-program',
    image: '/assets/path-month-program.jpg',
  },
  {
    id: 'course',
    title: 'Курсы',
    path: '/content-list/course',
    image: '/assets/path-courses.jpg',
  },
  {
    id: 'podcast',
    title: 'Подкасты',
    path: '/content-list/podcast',
    image: '/assets/path-podcasts.jpg',
  },
  {
    id: 'stream_record',
    title: 'Эфиры (записи)',
    path: '/content-list/stream_record',
    image: '/assets/path-streams.jpg',
  },
  {
    id: 'practice',
    title: 'Практики',
    path: '/content-list/practice',
    image: '/assets/path-practices.jpg',
  },
];

export function PathTab() {
  const router = useRouter();
  const { haptic } = useTelegram();

  const handleNavigate = (path: string) => {
    haptic.impact('light');
    router.push(path);
  };

  return (
    <div className="min-h-screen w-full bg-[#f7f1e8] relative">
      {/* ===== ФОН ===== */}
      <div
        className="fixed pointer-events-none overflow-hidden bg-[#f7f1e8]"
        style={{
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%',
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
            opacity: 0.18,
            mixBlendMode: 'overlay',
          }}
        >
          <img
            src="/assets/newspaper-texture.png"
            alt=""
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
            src="/assets/bg-coins.png"
            alt=""
            className="w-full h-full object-cover object-left-top"
          />
        </div>

        {/* Размытое цветное пятно - слева внизу */}
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
            src="/assets/bg-blur.png"
            alt=""
            className="w-full h-full object-cover"
          />
        </div>

        {/* Размытое цветное пятно - справа вверху */}
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
            src="/assets/bg-blur.png"
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* ===== КОНТЕНТ ===== */}
      <div className="relative z-10 px-4 sm:px-6 pt-6 pb-28 max-w-2xl mx-auto">
        {/* Иконка мегафона */}
        <div className="flex justify-center mb-4">
          <Megaphone
            className="w-9 h-9"
            style={{ color: '#9c1723' }}
          />
        </div>

        {/* Заголовок */}
        <h1
          className="text-center mb-4"
          style={{
            fontFamily: '"TT Nooks", Georgia, serif',
            fontWeight: 300,
            fontSize: 'clamp(36px, 10vw, 46px)',
            lineHeight: 0.95,
            letterSpacing: '-0.06em',
            color: '#2d2620',
          }}
        >
          Здесь твой обучающий путь:
        </h1>

        {/* Описание */}
        <p
          className="text-center mb-8"
          style={{
            fontFamily: 'Gilroy, sans-serif',
            fontWeight: 400,
            fontSize: '13px',
            lineHeight: 1.45,
            letterSpacing: '-0.02em',
            color: '#2d2620',
          }}
        >
          <span style={{ fontWeight: 700 }}>
            уроки, эфиры и практики, которые ведут к ментальному и материальному росту,
          </span>
          {' '}помогают выстроить мышление, систему действий и устойчивый доход.
        </p>

        {/* Сетка категорий 2x2 */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          {contentCategories.slice(0, 4).map((category) => (
            <CategoryCard
              key={category.id}
              title={category.title}
              image={category.image}
              onClick={() => handleNavigate(category.path)}
            />
          ))}
        </div>

        {/* Практики - центрированная карточка */}
        <div className="flex justify-center">
          <div className="w-[calc(50%-6px)]">
            <CategoryCard
              title={contentCategories[4].title}
              image={contentCategories[4].image}
              onClick={() => handleNavigate(contentCategories[4].path)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Компонент карточки категории
interface CategoryCardProps {
  title: string;
  image: string;
  onClick: () => void;
}

function CategoryCard({ title, image, onClick }: CategoryCardProps) {
  return (
    <div
      onClick={onClick}
      className="relative overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
      style={{
        borderRadius: '6px',
        border: '1px solid #d93547',
        background: 'linear-gradient(256.35deg, rgb(174, 30, 43) 15.72%, rgb(156, 23, 35) 99.39%)',
        aspectRatio: '165 / 160',
      }}
    >
      {/* Изображение с маской */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{
          borderRadius: '6px',
        }}
      >
        <img
          src={image}
          alt={title}
          className="w-full h-full object-cover"
          style={{
            opacity: 0.85,
            mixBlendMode: 'luminosity',
          }}
        />
        {/* Градиентный оверлей снизу для читаемости текста */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to top, rgba(156, 23, 35, 0.9) 0%, rgba(156, 23, 35, 0.4) 50%, transparent 100%)',
          }}
        />
      </div>

      {/* Декоративная линия */}
      <div
        className="absolute left-3 right-3"
        style={{
          bottom: '45px',
          height: '1px',
          backgroundColor: 'rgba(255, 255, 255, 0.3)',
        }}
      />

      {/* Название категории */}
      <p
        className="absolute left-0 right-0 text-center px-2"
        style={{
          bottom: '12px',
          fontFamily: '"TT Nooks", Georgia, serif',
          fontWeight: 300,
          fontSize: 'clamp(18px, 5vw, 22px)',
          lineHeight: 1.05,
          color: '#f7f1e8',
        }}
      >
        {title}
      </p>
    </div>
  );
}
