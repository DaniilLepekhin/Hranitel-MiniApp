'use client';

import { useRouter } from 'next/navigation';
import { useTelegram } from '@/hooks/useTelegram';
import { Lock } from 'lucide-react';

// 🔒 ФЛАГ БЛОКИРОВКИ КУРСОВ
const COURSES_LOCKED = false; // ✅ Курсы разблокированы!

// Категории контента с изображениями
const contentCategories = [
  {
    id: 'month-program',
    title: 'Программа месяца',
    path: '/month-program',
    image: '/assets/path-month-program.jpg',
    isLocked: false,
  },
  {
    id: 'course',
    title: 'Курсы',
    path: '/courses',
    image: '/assets/path-courses.jpg',
    isLocked: COURSES_LOCKED, // ✅ Курсы разблокированы!
  },
  {
    id: 'podcast',
    title: 'Подкасты',
    path: '/content-list/podcast',
    image: '/assets/path-podcasts.jpg',
    isLocked: false,
  },
  {
    id: 'stream_record',
    title: 'Эфиры (записи)',
    path: '/content-list/stream_record',
    image: '/assets/path-streams.jpg',
    isLocked: false,
  },
  {
    id: 'practice',
    title: 'Практики',
    path: '/content-list/practice',
    image: '/assets/path-practices.jpg',
    isLocked: false,
  },
];

export function PathTab() {
  const router = useRouter();
  const { haptic } = useTelegram();

  const handleNavigate = (path: string, isLocked: boolean = false) => {
    if (isLocked) {
      // 🔒 Заблокировано - показываем haptic feedback
      haptic.notification('error');
      return;
    }
    haptic.impact('light');
    router.push(path);
  };

  return (
    <div className="min-h-screen w-full bg-[#f7f1e8] relative" style={{ WebkitOverflowScrolling: 'touch' }}>
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
          zIndex: 0,
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
            src="/assets/newspaper-texture.jpg"
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
            src="/assets/bg-coins.jpg"
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
            src="/assets/bg-blur.jpg"
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
            src="/assets/bg-blur.jpg"
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* ===== КОНТЕНТ ===== */}
      <div className="relative z-10 pt-[23px] pb-28 max-w-2xl mx-auto" style={{ paddingLeft: '29px', paddingRight: '29px' }}>
        {/* Иконка указателя из макета - бордовый цвет */}
        <div className="flex justify-center mb-4">
          <div
            style={{
              width: '37px',
              height: '37px',
              backgroundColor: '#9c1723',
              WebkitMaskImage: 'url(/assets/path-icon.png)',
              WebkitMaskSize: 'contain',
              WebkitMaskRepeat: 'no-repeat',
              WebkitMaskPosition: 'center',
              maskImage: 'url(/assets/path-icon.png)',
              maskSize: 'contain',
              maskRepeat: 'no-repeat',
              maskPosition: 'center',
            }}
          />
        </div>

        {/* Заголовок */}
        <h1
          className="text-center"
          style={{
            fontFamily: '"TT Nooks", Georgia, serif',
            fontWeight: 300,
            fontSize: '45.8px',
            lineHeight: 0.95,
            letterSpacing: '-2.75px',
            color: '#2d2620',
            marginBottom: '16px',
          }}
        >
          Здесь твой обучающий путь:
        </h1>

        {/* Описание */}
        <p
          className="text-center"
          style={{
            fontFamily: 'Gilroy, sans-serif',
            fontWeight: 400,
            fontSize: '13px',
            lineHeight: 1.45,
            letterSpacing: '-0.26px',
            color: '#2d2620',
            marginBottom: '24px',
            maxWidth: '341px',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          <span style={{ fontWeight: 700 }}>
            уроки, эфиры и практики, которые ведут к ментальному и материальному росту,
          </span>
          {' '}помогают выстроить мышление, систему действий и устойчивый доход.
        </p>

        {/* Сетка категорий 2x2 */}
        <div className="grid grid-cols-2 mb-[5px]" style={{ gap: '5px' }}>
          {contentCategories.slice(0, 4).map((category) => (
            <CategoryCard
              key={category.id}
              title={category.title}
              image={category.image}
              isLocked={category.isLocked}
              onClick={() => handleNavigate(category.path, category.isLocked)}
            />
          ))}
        </div>

        {/* Практики - центрированная карточка */}
        <div className="flex justify-center">
          <div style={{ width: '165px' }}>
            <CategoryCard
              title={contentCategories[4].title}
              image={contentCategories[4].image}
              isLocked={contentCategories[4].isLocked}
              onClick={() => handleNavigate(contentCategories[4].path, contentCategories[4].isLocked)}
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
  isLocked?: boolean;
  onClick: () => void;
}

function CategoryCard({ title, image, isLocked = false, onClick }: CategoryCardProps) {
  return (
    <div
      onClick={onClick}
      className="relative overflow-hidden cursor-pointer active:scale-[0.98] transition-transform flex flex-col"
      style={{
        borderRadius: '5.73px',
        border: '0.955px solid #d93547',
        aspectRatio: '165.456 / 160.471',
        opacity: isLocked ? 0.6 : 1,
      }}
    >
      {/* Верхняя часть - изображение (примерно 55% высоты) */}
      <div
        className="relative overflow-hidden"
        style={{
          flex: '0 0 55%',
          borderTopLeftRadius: '5.73px',
          borderTopRightRadius: '5.73px',
        }}
      >
        <img
          src={image}
          alt={title}
          className="w-full h-full object-cover"
        />

        {/* 🔒 Overlay замка если заблокировано */}
        {isLocked && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center">
            <div className="bg-white/90 rounded-full p-2.5 shadow-lg">
              <Lock className="w-5 h-5 text-[#d93547]" strokeWidth={2.5} />
            </div>
          </div>
        )}
      </div>

      {/* Нижняя часть - красный блок с текстом (45% высоты) */}
      <div
        className="relative flex-1 flex flex-col justify-center items-center"
        style={{
          background: 'linear-gradient(256.35deg, rgb(174, 30, 43) 15.72%, rgb(156, 23, 35) 99.39%)',
          borderBottomLeftRadius: '5.73px',
          borderBottomRightRadius: '5.73px',
        }}
      >
        {/* Декоративная линия */}
        <div
          className="absolute left-3 right-3"
          style={{
            top: '8px',
            height: '1px',
            backgroundColor: 'rgba(255, 255, 255, 0.3)',
          }}
        />

        {/* Название категории */}
        <p
          className="text-center px-2"
          style={{
            fontFamily: '"TT Nooks", Georgia, serif',
            fontWeight: 300,
            fontSize: '22.39px',
            lineHeight: 1.05,
            color: '#f7f1e8',
          }}
        >
          {title}
        </p>
      </div>
    </div>
  );
}
