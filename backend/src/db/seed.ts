import { db, courses, courseDays, meditations, achievements } from './index';
import { logger } from '@/utils/logger';

const seedCourses = [
  {
    title: 'Основы медитации',
    description: 'Познакомьтесь с базовыми техниками медитации и осознанности',
    category: 'mindset' as const,
    coverUrl: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800',
    isPremium: false,
    sortOrder: 1,
  },
  {
    title: 'Управление стрессом',
    description: 'Научитесь справляться со стрессом и тревогой',
    category: 'health' as const,
    coverUrl: 'https://images.unsplash.com/photo-1499209974431-9dddcece7f88?w=800',
    isPremium: false,
    sortOrder: 2,
  },
  {
    title: 'Осознанные отношения',
    description: 'Построение гармоничных отношений через осознанность',
    category: 'mindset' as const,
    coverUrl: 'https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?w=800',
    isPremium: true,
    sortOrder: 3,
  },
  {
    title: 'Здоровый сон',
    description: 'Улучшите качество сна с помощью специальных техник',
    category: 'health' as const,
    coverUrl: 'https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=800',
    isPremium: false,
    sortOrder: 4,
  },
  {
    title: 'Продуктивность и фокус',
    description: 'Повысьте концентрацию и эффективность работы',
    category: 'mindset' as const,
    coverUrl: 'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=800',
    isPremium: true,
    sortOrder: 5,
  },
  {
    title: 'Духовное пробуждение',
    description: 'Глубокие практики для духовного развития',
    category: 'spiritual' as const,
    coverUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800',
    isPremium: true,
    sortOrder: 6,
  },
];

const seedCourseDays = [
  // Course 1: Основы медитации
  {
    id: 'day-1-1',
    courseId: 'course-1',
    dayNumber: 1,
    title: 'Знакомство с медитацией',
    content: 'Сегодня мы познакомимся с основами медитации. Медитация — это практика, которая помогает успокоить ум и обрести внутреннюю гармонию.',
    welcomeContent: 'Добро пожаловать в мир медитации! Этот курс поможет вам освоить базовые техники.',
  },
  {
    id: 'day-1-2',
    courseId: 'course-1',
    dayNumber: 2,
    title: 'Дыхательные техники',
    content: 'Дыхание — основа медитации. Научимся правильно дышать для достижения расслабления.',
  },
  {
    id: 'day-1-3',
    courseId: 'course-1',
    dayNumber: 3,
    title: 'Сканирование тела',
    content: 'Практика сканирования тела помогает осознать ощущения и снять напряжение.',
  },
  // Course 2: Управление стрессом
  {
    id: 'day-2-1',
    courseId: 'course-2',
    dayNumber: 1,
    title: 'Понимание стресса',
    content: 'Узнаем, что такое стресс и как он влияет на наше тело и ум.',
    welcomeContent: 'Стресс — часть жизни, но мы можем научиться управлять им.',
  },
  {
    id: 'day-2-2',
    courseId: 'course-2',
    dayNumber: 2,
    title: 'Техники быстрого расслабления',
    content: 'Изучим простые техники, которые помогут быстро успокоиться в стрессовой ситуации.',
  },
];

const seedMeditations = [
  {
    id: 'med-1',
    title: 'Утренняя медитация',
    description: 'Начните день с ясным умом и позитивным настроем',
    duration: 10,
    coverUrl: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800',
    audioUrl: 'https://example.com/meditations/morning.mp3',
    isPremium: false,
  },
  {
    id: 'med-2',
    title: 'Расслабление перед сном',
    description: 'Успокойте ум для глубокого и восстанавливающего сна',
    duration: 15,
    coverUrl: 'https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=800',
    audioUrl: 'https://example.com/meditations/sleep.mp3',
    isPremium: false,
  },
  {
    id: 'med-3',
    title: 'Снятие тревоги',
    description: 'Медитация для успокоения беспокойного ума',
    duration: 12,
    coverUrl: 'https://images.unsplash.com/photo-1499209974431-9dddcece7f88?w=800',
    audioUrl: 'https://example.com/meditations/anxiety.mp3',
    isPremium: false,
  },
  {
    id: 'med-4',
    title: 'Глубокая концентрация',
    description: 'Повысьте фокус и продуктивность',
    duration: 20,
    coverUrl: 'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=800',
    audioUrl: 'https://example.com/meditations/focus.mp3',
    isPremium: true,
  },
  {
    id: 'med-5',
    title: 'Любящая доброта',
    description: 'Развивайте сострадание к себе и другим',
    duration: 15,
    coverUrl: 'https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?w=800',
    audioUrl: 'https://example.com/meditations/loving-kindness.mp3',
    isPremium: true,
  },
];

const seedAchievements = [
  {
    id: 'ach-1',
    code: 'first_meditation',
    title: 'Первый шаг',
    description: 'Завершите первую медитацию',
    icon: '🎯',
    xpReward: 50,
  },
  {
    id: 'ach-2',
    code: 'streak_7',
    title: 'Неделя практики',
    description: 'Практикуйте 7 дней подряд',
    icon: '🔥',
    xpReward: 100,
  },
  {
    id: 'ach-3',
    code: 'streak_30',
    title: 'Месяц дисциплины',
    description: 'Практикуйте 30 дней подряд',
    icon: '💪',
    xpReward: 500,
  },
  {
    id: 'ach-4',
    code: 'first_course',
    title: 'Первый курс',
    description: 'Завершите первый курс полностью',
    icon: '📚',
    xpReward: 200,
  },
  {
    id: 'ach-5',
    code: 'level_5',
    title: 'Адепт',
    description: 'Достигните 5 уровня',
    icon: '⭐',
    xpReward: 150,
  },
  {
    id: 'ach-6',
    code: 'level_10',
    title: 'Мастер',
    description: 'Достигните 10 уровня',
    icon: '🏆',
    xpReward: 300,
  },
  {
    id: 'ach-7',
    code: 'meditations_10',
    title: 'Медитатор',
    description: 'Завершите 10 медитаций',
    icon: '🧘',
    xpReward: 100,
  },
  {
    id: 'ach-8',
    code: 'meditations_50',
    title: 'Гуру медитации',
    description: 'Завершите 50 медитаций',
    icon: '🌟',
    xpReward: 400,
  },
];

async function seed() {
  logger.info('Starting database seed...');

  try {
    // Seed courses
    logger.info('Seeding courses...');
    for (const course of seedCourses) {
      await db.insert(courses).values(course).onConflictDoNothing();
    }

    // Seed course days
    logger.info('Seeding course days...');
    for (const day of seedCourseDays) {
      await db.insert(courseDays).values(day).onConflictDoNothing();
    }

    // Seed meditations
    logger.info('Seeding meditations...');
    for (const meditation of seedMeditations) {
      await db.insert(meditations).values(meditation).onConflictDoNothing();
    }

    // Seed achievements
    logger.info('Seeding achievements...');
    for (const achievement of seedAchievements) {
      await db.insert(achievements).values(achievement).onConflictDoNothing();
    }

    logger.info('Database seed completed successfully!');
  } catch (error) {
    logger.error({ error }, 'Database seed failed');
    process.exit(1);
  }
}

// Run seed
seed();
