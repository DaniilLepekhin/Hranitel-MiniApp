import { db } from '@/db';
import { shopItems } from '@/db/schema';
import { logger } from '@/utils/logger';

/**
 * Seed данные для магазина КОД ДЕНЕГ 4.0
 *
 * 3 категории:
 * 1. Элитный шанс (elite) - розыгрыши разборов
 * 2. Тайная комната (secret) - специальные уроки
 * 3. Копилка (savings) - скидки и бонусы
 */
export async function seedShopItems() {
  try {
    logger.info('[Seed] Starting shop items seeding...');

    const items = [
      // ============================================================================
      // КАТЕГОРИЯ 1: ЭЛИТНЫЙ ШАНС (elite)
      // ============================================================================
      {
        title: 'Билет на розыгрыш разбора от Топ-Нумеролога',
        description: 'Участвуйте в ежемесячном розыгрыше индивидуального разбора от лучшего нумеролога клуба',
        category: 'elite' as const,
        price: 1000,
        itemType: 'raffle_ticket' as const,
        imageUrl: '/images/shop/raffle-numerology.jpg',
        itemData: {
          raffleType: 'numerology',
          duration: '60 минут',
          specialist: 'Кристина Егиазарова',
        },
        sortOrder: 1,
        isActive: true,
      },
      {
        title: 'Билет на розыгрыш разбора по Таро',
        description: 'Шанс выиграть персональный расклад Таро на актуальный вопрос',
        category: 'elite' as const,
        price: 800,
        itemType: 'raffle_ticket' as const,
        imageUrl: '/images/shop/raffle-tarot.jpg',
        itemData: {
          raffleType: 'tarot',
          duration: '45 минут',
        },
        sortOrder: 2,
        isActive: true,
      },
      {
        title: 'Билет на розыгрыш разбора Дизайна Человека',
        description: 'Участие в розыгрыше глубокого разбора вашего бодиграфа',
        category: 'elite' as const,
        price: 1200,
        itemType: 'raffle_ticket' as const,
        imageUrl: '/images/shop/raffle-human-design.jpg',
        itemData: {
          raffleType: 'human_design',
          duration: '90 минут',
        },
        sortOrder: 3,
        isActive: true,
      },

      // ============================================================================
      // КАТЕГОРИЯ 2: ТАЙНАЯ КОМНАТА (secret)
      // ============================================================================
      {
        title: 'Урок: Магия Свечей',
        description: 'Практический урок по работе со свечами для привлечения желаемого',
        category: 'secret' as const,
        price: 600,
        itemType: 'lesson' as const,
        imageUrl: '/images/shop/lesson-candles.jpg',
        itemData: {
          duration: '45 минут',
          format: 'видео + PDF материалы',
          includes: ['Практика', 'Ритуалы', 'Безопасность'],
        },
        sortOrder: 4,
        isActive: true,
      },
      {
        title: 'Урок: Секс и Либидо',
        description: 'Откровенный разговор о сексуальной энергии и её трансформации',
        category: 'secret' as const,
        price: 800,
        itemType: 'lesson' as const,
        imageUrl: '/images/shop/lesson-sex.jpg',
        itemData: {
          duration: '60 минут',
          format: 'видео + чек-листы',
          ageRestriction: '18+',
          includes: ['Энергия', 'Практики', 'Медитации'],
        },
        sortOrder: 5,
        isActive: true,
      },
      {
        title: 'Урок: Работа с Деньгами через Подсознание',
        description: 'Глубинная проработка денежных блоков и установка программ изобилия',
        category: 'secret' as const,
        price: 700,
        itemType: 'lesson' as const,
        imageUrl: '/images/shop/lesson-money.jpg',
        itemData: {
          duration: '75 минут',
          format: 'видео + аудио-медитация',
          includes: ['Диагностика блоков', 'Трансформация', 'Аффирмации'],
        },
        sortOrder: 6,
        isActive: true,
      },
      {
        title: 'Урок: Тёмная сторона Луны',
        description: 'Работа с теневыми аспектами личности через лунные циклы',
        category: 'secret' as const,
        price: 650,
        itemType: 'lesson' as const,
        imageUrl: '/images/shop/lesson-moon.jpg',
        itemData: {
          duration: '50 минут',
          format: 'видео + лунный календарь',
          includes: ['Лунные фазы', 'Ритуалы', 'Дневник'],
        },
        sortOrder: 7,
        isActive: true,
      },
      {
        title: 'Урок: Активация Женской Силы',
        description: 'Пробуждение архетипической женской энергии и силы',
        category: 'secret' as const,
        price: 750,
        itemType: 'lesson' as const,
        imageUrl: '/images/shop/lesson-feminine.jpg',
        itemData: {
          duration: '55 минут',
          format: 'видео + практики',
          includes: ['7 архетипов', 'Активация', 'Интеграция'],
        },
        sortOrder: 8,
        isActive: true,
      },

      // ============================================================================
      // КАТЕГОРИЯ 3: КОПИЛКА (savings)
      // ============================================================================
      {
        title: 'Скидка 1000₽ на любой курс Института',
        description: 'Промокод на скидку 1000 рублей для покупки курсов Института Кода Денег',
        category: 'savings' as const,
        price: 3000,
        itemType: 'discount' as const,
        imageUrl: '/images/shop/discount-1000.jpg',
        itemData: {
          discountAmount: 1000,
          currency: 'RUB',
          validDays: 30,
          applicableTo: 'Любой курс Института',
        },
        sortOrder: 9,
        isActive: true,
      },
      {
        title: 'Скидка 3000₽ на обучение в Институте',
        description: 'Промокод на скидку 3000 рублей для покупки полных программ обучения',
        category: 'savings' as const,
        price: 8000,
        itemType: 'discount' as const,
        imageUrl: '/images/shop/discount-3000.jpg',
        itemData: {
          discountAmount: 3000,
          currency: 'RUB',
          validDays: 60,
          applicableTo: 'Полные программы Института',
          minPurchase: 15000,
        },
        sortOrder: 10,
        isActive: true,
      },
      {
        title: 'Месяц клуба в подарок',
        description: 'Продлите подписку на клуб на 1 месяц совершенно бесплатно',
        category: 'savings' as const,
        price: 5000,
        itemType: 'discount' as const,
        imageUrl: '/images/shop/free-month.jpg',
        itemData: {
          bonusType: 'subscription_extension',
          duration: 30,
          durationType: 'days',
        },
        sortOrder: 11,
        isActive: true,
      },
      {
        title: 'Скидка 50% на индивидуальную консультацию',
        description: 'Промокод на 50% скидку для записи на личную консультацию со специалистом',
        category: 'savings' as const,
        price: 4000,
        itemType: 'discount' as const,
        imageUrl: '/images/shop/consultation-50.jpg',
        itemData: {
          discountPercent: 50,
          validDays: 45,
          applicableTo: 'Индивидуальная консультация (60-90 мин)',
        },
        sortOrder: 12,
        isActive: true,
      },
      {
        title: 'VIP-доступ к закрытому мероприятию',
        description: 'Эксклюзивный доступ к закрытому онлайн-мероприятию клуба',
        category: 'savings' as const,
        price: 6000,
        itemType: 'discount' as const,
        imageUrl: '/images/shop/vip-event.jpg',
        itemData: {
          eventType: 'vip_access',
          benefits: [
            'Доступ к закрытому мероприятию',
            'Возможность задать вопрос лично',
            'Бонусные материалы',
          ],
        },
        sortOrder: 13,
        isActive: true,
      },
    ];

    // Проверяем, есть ли уже товары в базе
    const existingItems = await db.select().from(shopItems);

    if (existingItems.length > 0) {
      logger.info(`[Seed] Shop already has ${existingItems.length} items, skipping...`);
      return;
    }

    // Вставляем все товары
    await db.insert(shopItems).values(items);

    logger.info(`[Seed] Successfully seeded ${items.length} shop items`);
    logger.info('[Seed] Shop items breakdown:');
    logger.info(`  - Elite (Элитный шанс): 3 items`);
    logger.info(`  - Secret (Тайная комната): 5 items`);
    logger.info(`  - Savings (Копилка): 5 items`);

    return items;
  } catch (error) {
    logger.error({ error }, '[Seed] Error seeding shop items');
    throw error;
  }
}

// Запуск если вызван напрямую
if (import.meta.main) {
  seedShopItems()
    .then(() => {
      logger.info('[Seed] Shop seeding completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ error }, '[Seed] Shop seeding failed');
      process.exit(1);
    });
}
