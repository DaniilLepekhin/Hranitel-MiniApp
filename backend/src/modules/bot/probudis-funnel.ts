/**
 * 🌅 PROBUDIS FUNNEL - ВОРОНКА "ПРОБУЖДЕНИЕ"
 * Воронка #4: "КОД УСПЕХА. ГЛАВА — ПРОБУЖДЕНИЕ"
 */

import { InlineKeyboard } from 'grammy';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { schedulerService } from '@/services/scheduler.service';
import { TelegramService } from '@/services/telegram.service';
import { logger } from '@/utils/logger';
import { redis } from '@/utils/redis';

// Create telegram service instance
let telegramService: TelegramService | null = null;

export function initProbudisFunnelTelegramService(api: any) {
  telegramService = new TelegramService(api);
}

function getTelegramService(): TelegramService {
  if (!telegramService) {
    throw new Error('TelegramService not initialized. Call initProbudisFunnelTelegramService() first.');
  }
  return telegramService;
}

// ============================================================================
// КОНСТАНТЫ
// ============================================================================

// Видео и тексты
const FIRST_VIDEO_URL = 'https://t.me/mate_bot_open/9865';
const MARATHON_VIDEO_URL = 'https://t.me/mate_bot_open/9684';

// WebApp URL для покупки
const WEBAPP_PURCHASE_URL = 'https://app.successkod.com/payment_form_club.html';

// Таймауты в миллисекундах
const DOGREV_TIMEOUT = 5 * 60 * 1000; // 5 минут
const DOGREV_TIMEOUT_TEST = 10 * 1000; // 10 секунд

// Redis key для хранения типа воронки
const FUNNEL_TYPE_PREFIX = 'funnel:type:';
const FUNNEL_TYPE_TTL = 3600; // 1 час

/**
 * Установить тип воронки probudis для пользователя
 */
export async function setProbudisFunnelType(telegramId: number): Promise<void> {
  if (!redis) return;
  const key = `${FUNNEL_TYPE_PREFIX}${telegramId}`;
  await redis.setex(key, FUNNEL_TYPE_TTL, 'probudis');
  logger.debug({ telegramId, funnelType: 'probudis' }, 'Probudis funnel type set');
}

/**
 * Получить тип воронки для пользователя
 */
export async function getFunnelType(telegramId: number): Promise<string | null> {
  if (!redis) return null;
  const key = `${FUNNEL_TYPE_PREFIX}${telegramId}`;
  const value = await redis.get(key);
  return value;
}

// ============================================================================
// ОСНОВНЫЕ ФУНКЦИИ ВОРОНКИ
// ============================================================================

/**
 * ШАГ 1: Начало воронки "ПРОБУЖДЕНИЕ"
 */
export async function startProbudisFunnel(userId: string, chatId: number, utmData?: Record<string, string>, isTestMode: boolean = false): Promise<void> {
  try {
    logger.info({ userId, chatId, isTestMode }, 'Starting probudis funnel');

    // Получаем пользователя
    const [user] = await db.select().from(users).where(eq(users.telegramId, parseInt(userId))).limit(1);

    if (!user) {
      logger.error({ userId }, 'User not found for probudis funnel');
      return;
    }

    // 🧹 Отменяем все предыдущие задачи probudis воронки при новом запуске
    await cancelProbudisFunnelTasks(parseInt(userId));
    logger.info({ userId }, 'Cancelled all previous probudis funnel tasks');

    // Устанавливаем тип воронки в Redis
    await setProbudisFunnelType(parseInt(userId));

    // Формируем URL с UTM метками
    let paymentUrl = WEBAPP_PURCHASE_URL;
    if (utmData && Object.keys(utmData).length > 0) {
      const params = new URLSearchParams(utmData);
      paymentUrl = `${WEBAPP_PURCHASE_URL}?${params.toString()}`;
    }

    // Отправляем видео БЕЗ caption (текст больше 1024 символов)
    await getTelegramService().sendVideo(
      chatId,
      FIRST_VIDEO_URL,
      {}
    );

    // Отправляем текст отдельным сообщением с кнопками
    const keyboard = new InlineKeyboard()
      .webApp('Получить доступ', paymentUrl)
      .row()
      .text('Узнать подробнее', 'probudis_learn_more');

    await getTelegramService().sendMessage(
      chatId,
      `<b>КЛУБ «КОД УСПЕХА». ГЛАВА — «ПРОБУЖДЕНИЕ»</b>\n\n` +
      `Это пространство для тех, кто хочет <b>деньги, масштаб и проявленность,</b> но <b>больше не готов выгорать</b> ради результата.\n\n` +
      `Здесь не гонка ❌\n` +
      `Здесь <b>путь.</b>\n\n` +
      `Сначала — <b>состояние и база.</b>\n` +
      `Потом — <b>деньги и рост.</b>\n\n` +
      `<b>Что ты получаешь 👇</b>\n` +
      `— <b>личную дорожную карту из точки А в точку Б</b>\n` +
      `с понятными шагами\n` +
      `— <b>один фокус в месяц,</b> без распыления\n` +
      `— систему, а не бесконечное обучение\n` +
      `— изменения, которые отражаются в <b>доходе и качестве жизни</b>\n\n` +
      `<b>Внутри клуба 🤍</b>\n\n` +
      `— <b>живые эфиры с Кристиной 🎥</b>\n` +
      `— разборы, прогнозы, работа с состоянием\n` +
      `— приглашённые сильные спикеры\n` +
      `— <b>мини-курсы каждый месяц</b>\n` +
      `— медитации и практики для ресурса 🌿\n` +
      `— баллы за действия → разборы, уроки, бонусы\n` +
      `— <b>Десятки:</b> группы по 10 человек + бадди 🤝\n` +
      `— чаты по городам и <b>живые встречи</b>\n` +
      `— доступ к приложению ментального здоровья <b>KOD</b>\n\n` +
      `<b>Этот клуб для тебя, если ты:</b>\n` +
      `— устала от хаоса и «надо больше»\n` +
      `— хочешь по-другому — <b>без надрыва</b>\n` +
      `— готова к следующему уровню 💫\n\n` +
      `<b>Если чувствуешь, что пора проснуться —\n` +
      `добро пожаловать в «КОД УСПЕХА».\n` +
      `ГЛАВА — «ПРОБУЖДЕНИЕ».</b>\n\n` +
      `Доступ открывается <b>сразу после входа 👇</b>`,
      {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      }
    );

    // Запланировать догрев через 5 минут
    await scheduleProbudisDogrev(String(user.telegramId), chatId, utmData, isTestMode);

    logger.info({ userId, chatId, isTestMode }, 'Probudis funnel started successfully');
  } catch (error) {
    logger.error({ error, userId, chatId }, 'Error starting probudis funnel');
    throw error;
  }
}

/**
 * ШАГ 2: Догрев через 5 минут
 */
async function scheduleProbudisDogrev(userId: string, chatId: number, utmData?: Record<string, string>, isTestMode: boolean = false): Promise<void> {
  try {
    await schedulerService.cancelUserTasksByTypes(parseInt(userId), ['probudis_dogrev_5m']);

    const timeout = isTestMode ? DOGREV_TIMEOUT_TEST : DOGREV_TIMEOUT;

    await schedulerService.schedule(
      {
        type: 'probudis_dogrev_5m',
        userId: parseInt(userId),
        chatId,
        data: {
          utmData: utmData || {},
          isTestMode,
        },
      },
      timeout
    );

    logger.info({ userId, chatId, timeout, isTestMode }, 'Probudis dogrev scheduled');
  } catch (error) {
    logger.error({ error, userId }, 'Error scheduling probudis dogrev');
  }
}

export async function sendProbudisDogrev(userId: string, chatId: number, utmData?: Record<string, string>): Promise<void> {
  try {
    logger.info({ userId, chatId }, 'Sending probudis dogrev');

    const [user] = await db.select().from(users).where(eq(users.telegramId, parseInt(userId))).limit(1);
    if (!user) {
      logger.error({ userId }, 'User not found');
      return;
    }

    if (user.isPro) {
      logger.info({ userId }, 'User already has subscription, skipping');
      return;
    }

    let paymentUrl = WEBAPP_PURCHASE_URL;
    if (utmData && Object.keys(utmData).length > 0) {
      const params = new URLSearchParams(utmData);
      paymentUrl = `${WEBAPP_PURCHASE_URL}?${params.toString()}`;
    }

    const keyboard = new InlineKeyboard().webApp('Оплатить ❤️', paymentUrl);

    const caption =
      `<b>🎫 Твой билет в КОД УСПЕХА. Глава: Пробуждение</b>\n\n` +
      `<b>Информация о подписке на клуб:</b>\n\n` +
      `👉🏼 1 месяц = 2000 ₽\n` +
      `👉🏼 В подписку входит полный доступ к клубу «Код Успеха»: марафон КОД ДЕНЕГ, обучение и мини-курсы по мягким нишам, десятки — мини-группы поддержки, чаты и офлайн-встречи по городам, закрытые эфиры и разборы с Кристиной, подкасты, баллы и приложение\n` +
      `👉🏼 Подписка продлевается автоматически каждые 30 дней. Отписаться можно в любой момент в меню участника.\n` +
      `👉🏼 Если при оплате возникают сложности обратитесь в службу заботы клуба @Egiazarova_support_bot\n\n` +
      `<i>Нажимая "Оплатить", вы даете согласие на регулярные списания, <a href="https://ishodnyi-kod.com/clubofert">на обработку персональных данных и принимаете условия публичной оферты.</a></i>\n\n` +
      `Получить доступ в закрытый канал 👇🏼`;

    await getTelegramService().sendPhoto(chatId, 'https://t.me/mate_bot_open/9686', {
      caption,
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });

    // Запланировать шаг 3
    await scheduleProbudisSuccessStories(userId, chatId, utmData, false);

    logger.info({ userId, chatId }, 'Probudis dogrev sent');
  } catch (error) {
    logger.error({ error, userId, chatId }, 'Error sending probudis dogrev');
  }
}

/**
 * ШАГ 3: Истории успеха
 */
async function scheduleProbudisSuccessStories(userId: string, chatId: number, utmData?: Record<string, string>, isTestMode: boolean): Promise<void> {
  try {
    await schedulerService.cancelUserTasksByTypes(parseInt(userId), ['probudis_success_stories']);

    const timeout = isTestMode ? 10 * 1000 : 5 * 60 * 1000;

    await schedulerService.schedule(
      {
        type: 'probudis_success_stories',
        userId: parseInt(userId),
        chatId,
        data: { utmData: utmData || {}, isTestMode },
      },
      timeout
    );

    logger.info({ userId, timeout }, 'Probudis success stories scheduled');
  } catch (error) {
    logger.error({ error, userId }, 'Error scheduling success stories');
  }
}

export async function sendProbudisSuccessStories(userId: string, chatId: number, utmData?: Record<string, string>): Promise<void> {
  try {
    logger.info({ userId, chatId }, 'Sending probudis success stories');

    const [user] = await db.select().from(users).where(eq(users.telegramId, parseInt(userId))).limit(1);
    if (!user || user.isPro) return;

    let paymentUrl = WEBAPP_PURCHASE_URL;
    if (utmData && Object.keys(utmData).length > 0) {
      const params = new URLSearchParams(utmData);
      paymentUrl = `${WEBAPP_PURCHASE_URL}?${params.toString()}`;
    }

    // Отправляем 9 видео-отзывов участников альбомом
    const videoMedia = [
      { type: 'video' as const, media: 'https://t.me/mate_bot_open/9713' },
      { type: 'video' as const, media: 'https://t.me/mate_bot_open/9714' },
      { type: 'video' as const, media: 'https://t.me/mate_bot_open/9715' },
      { type: 'video' as const, media: 'https://t.me/mate_bot_open/9716' },
      { type: 'video' as const, media: 'https://t.me/mate_bot_open/9717' },
      { type: 'video' as const, media: 'https://t.me/mate_bot_open/9718' },
      { type: 'video' as const, media: 'https://t.me/mate_bot_open/9719' },
      { type: 'video' as const, media: 'https://t.me/mate_bot_open/9720' },
      { type: 'video' as const, media: 'https://t.me/mate_bot_open/9721' },
    ];

    await getTelegramService().sendMediaGroup(chatId, videoMedia);

    // Отправляем текст с кнопкой отдельным сообщением
    const keyboard = new InlineKeyboard().webApp('попасть на марафон ❤️', paymentUrl);

    const message =
      `<b>ЭТО ЛЮДИ, КОТОРЫЕ ЗА 3 ДНЯ ВПЕРВЫЕ УВИДЕЛИ, ГДЕ У НИХ ДЕНЬГИ</b>\n\n` +
      `На КОД ДЕНЕГ они:\n` +
      `— увидели свою денежную механику\n` +
      `— поняли, что именно мешает росту\n` +
      `— сделали первые действия туда, где есть результат\n\n` +
      `И да — у многих первые деньги пришли уже в процессе.\n\n` +
      `‼️ <b>В ЭТОТ РАЗ Я ЗАПУСКАЮ СОВЕРШЕННО НОВЫЙ «КОД ДЕНЕГ».</b>\n\n` +
      `👉 НОВЫЕ ТЕМЫ.\n` +
      `👉 НОВЫЕ РАЗБОРЫ.\n` +
      `👉 НОВЫЕ РАСШИФРОВКИ.\n\n` +
      `Это совершенно другой и новый формат.\n` +
      `30 дней работы.\n` +
      `4 дня подряд со мной в прямом эфире.\n\n` +
      `Даже если ты уже была раньше —\n` +
      `это не повтор.`;

    await getTelegramService().sendMessage(chatId, message, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });

    logger.info({ userId }, 'Probudis success stories sent');
  } catch (error) {
    logger.error({ error, userId }, 'Error sending success stories');
  }
}

/**
 * Отменить все задачи probudis воронки
 */
export async function cancelProbudisFunnelTasks(userId: number): Promise<void> {
  try {
    await schedulerService.cancelUserTasksByTypes(userId, [
      'probudis_dogrev_5m',
      'probudis_success_stories',
    ]);
  } catch (error) {
    logger.error({ error, userId }, 'Error cancelling probudis tasks');
  }
}
