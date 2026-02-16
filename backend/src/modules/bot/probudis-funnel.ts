/**
 * 🌅 PROBUDIS FUNNEL - ВОРОНКА "ПРОБУЖДЕНИЕ"
 * Воронка #4: "КОД УСПЕХА. ГЛАВА — ПРОБУЖДЕНИЕ"
 * 
 * Структура:
 * 1. (сразу) Видео 9865 + текст о клубе + кнопки "Получить доступ" / "Узнать подробнее"
 * 2. (5 мин ИЛИ кнопка) Билет: фото 9686 + информация о подписке
 * 3. (5 мин) 9 видео-отзывов + текст КОД ДЕНЕГ
 * Далее — полностью как women воронка (гайд, результаты, картинки, Кристина, МЧС, ловушки, топики, Татьяна, клуб, day2-5)
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

const FIRST_VIDEO_URL = 'https://t.me/mate_bot_open/9865';
const WEBAPP_PURCHASE_URL = 'https://app.successkod.com/payment_form_club.html';

// Таймауты
const DOGREV_TIMEOUT = 5 * 60 * 1000; // 5 минут
const DOGREV_TIMEOUT_TEST = 10 * 1000; // 10 секунд
const STEP_TIMEOUT = 5 * 60 * 1000; // 5 минут между шагами
const STEP_TIMEOUT_TEST = 10 * 1000; // 10 секунд
const HOUR_TIMEOUT = 60 * 60 * 1000; // 60 минут
const HOUR_TIMEOUT_TEST = 15 * 1000; // 15 секунд
const DAY_TIMEOUT = 24 * 60 * 60 * 1000; // 24 часа

// Redis
const FUNNEL_TYPE_PREFIX = 'funnel:type:';
const FUNNEL_TYPE_TTL = 3600;

// Все типы задач probudis воронки (для отмены)
const ALL_PROBUDIS_TASK_TYPES = [
  'probudis_dogrev_5m',
  'probudis_success_stories',
  'probudis_guide',
  'probudis_results',
  'probudis_images',
  'probudis_kristina',
  'probudis_success_story',
  'probudis_traps',
  'probudis_burning_topics',
  'probudis_energy_tatiana',
  'probudis_payment_reminder',
  'probudis_day2',
  'probudis_day3',
  'probudis_day4',
  'probudis_day5',
];

export async function setProbudisFunnelType(telegramId: number): Promise<void> {
  if (!redis) return;
  const key = `${FUNNEL_TYPE_PREFIX}${telegramId}`;
  await redis.setex(key, FUNNEL_TYPE_TTL, 'probudis');
}

export async function getFunnelType(telegramId: number): Promise<string | null> {
  if (!redis) return null;
  const key = `${FUNNEL_TYPE_PREFIX}${telegramId}`;
  return await redis.get(key);
}

// ============================================================================
// ХЕЛПЕРЫ
// ============================================================================

function getPaymentUrl(utmData?: Record<string, string>): string {
  let paymentUrl = WEBAPP_PURCHASE_URL;
  if (utmData && Object.keys(utmData).length > 0) {
    const params = new URLSearchParams(utmData);
    paymentUrl = `${WEBAPP_PURCHASE_URL}?${params.toString()}`;
  }
  return paymentUrl;
}

async function checkUserNotPaid(userId: string): Promise<boolean> {
  const [user] = await db.select().from(users).where(eq(users.telegramId, parseInt(userId))).limit(1);
  if (!user) {
    logger.error({ userId }, 'User not found');
    return false;
  }
  if (user.isPro) {
    logger.info({ userId }, 'User already has subscription, skipping');
    return false;
  }
  return true;
}

function getTimeout(isTestMode: boolean, normalTimeout: number, testTimeout: number): number {
  return isTestMode ? testTimeout : normalTimeout;
}

/**
 * Рассчитать задержку до 10:00 МСК следующего дня
 */
function getDelayUntilMoscowTime(hours: number, minutes: number): number {
  const now = new Date();
  // Moscow is UTC+3
  const mskOffset = 3 * 60 * 60 * 1000;
  const mskNow = new Date(now.getTime() + mskOffset);
  
  const target = new Date(mskNow);
  target.setUTCHours(hours - 3, minutes, 0, 0); // Convert MSK to UTC
  
  // If target time already passed today, schedule for tomorrow
  if (target.getTime() <= now.getTime()) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  
  return target.getTime() - now.getTime();
}

// ============================================================================
// ШАГ 1: НАЧАЛО ВОРОНКИ
// ============================================================================

export async function startProbudisFunnel(userId: string, chatId: number, utmData?: Record<string, string>, isTestMode: boolean = false): Promise<void> {
  try {
    logger.info({ userId, chatId, isTestMode }, 'Starting probudis funnel');

    const [user] = await db.select().from(users).where(eq(users.telegramId, parseInt(userId))).limit(1);
    if (!user) {
      logger.error({ userId }, 'User not found for probudis funnel');
      return;
    }

    // Отменяем ВСЕ предыдущие задачи probudis воронки
    await cancelProbudisFunnelTasks(parseInt(userId));

    // Устанавливаем тип воронки в Redis
    await setProbudisFunnelType(parseInt(userId));

    const paymentUrl = getPaymentUrl(utmData);

    // Видео БЕЗ caption (текст > 1024 символов)
    await getTelegramService().sendVideo(chatId, FIRST_VIDEO_URL, {});

    // Текст отдельным сообщением
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
      { parse_mode: 'HTML', reply_markup: keyboard }
    );

    // Планируем шаг 2 через 5 мин
    await schedulerService.schedule(
      {
        type: 'probudis_dogrev_5m',
        userId: parseInt(userId),
        chatId,
        data: { utmData: utmData || {}, isTestMode },
      },
      getTimeout(isTestMode, DOGREV_TIMEOUT, DOGREV_TIMEOUT_TEST)
    );

    logger.info({ userId, chatId, isTestMode }, 'Probudis funnel started successfully');
  } catch (error) {
    logger.error({ error, userId, chatId }, 'Error starting probudis funnel');
    throw error;
  }
}

// ============================================================================
// ШАГ 2: БИЛЕТ (5 мин ИЛИ кнопка "Узнать подробнее")
// ============================================================================

export async function sendProbudisDogrev(userId: string, chatId: number, utmData?: Record<string, string>, isTestMode: boolean = false): Promise<void> {
  try {
    if (!(await checkUserNotPaid(userId))) return;

    const paymentUrl = getPaymentUrl(utmData);
    const keyboard = new InlineKeyboard().webApp('Оплатить ❤️', paymentUrl);

    await getTelegramService().sendPhoto(chatId, 'https://t.me/mate_bot_open/9686', {
      caption:
        `<b>🎫 Твой билет в КОД УСПЕХА. Глава: Пробуждение</b>\n\n` +
        `<b>Информация о подписке на клуб:</b>\n\n` +
        `👉🏼 1 месяц = 2000 ₽\n` +
        `👉🏼 В подписку входит полный доступ к клубу «Код Успеха»: марафон КОД ДЕНЕГ, обучение и мини-курсы по мягким нишам, десятки — мини-группы поддержки, чаты и офлайн-встречи по городам, закрытые эфиры и разборы с Кристиной, подкасты, баллы и приложение\n` +
        `👉🏼 Подписка продлевается автоматически каждые 30 дней. Отписаться можно в любой момент в меню участника.\n` +
        `👉🏼 Если при оплате возникают сложности обратитесь в службу заботы клуба @Egiazarova_support_bot\n\n` +
        `<i>Нажимая "Оплатить", вы даете согласие на регулярные списания, <a href="https://ishodnyi-kod.com/clubofert">на обработку персональных данных и принимаете условия публичной оферты.</a></i>\n\n` +
        `Получить доступ в закрытый канал 👇🏼`,
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });

    // Планируем шаг 3 через 5 мин
    const timeout = getTimeout(isTestMode, STEP_TIMEOUT, STEP_TIMEOUT_TEST);
    await schedulerService.schedule(
      {
        type: 'probudis_success_stories',
        userId: parseInt(userId),
        chatId,
        data: { utmData: utmData || {}, isTestMode },
      },
      timeout
    );

    logger.info({ userId, chatId }, 'Probudis dogrev sent');
  } catch (error) {
    logger.error({ error, userId, chatId }, 'Error sending probudis dogrev');
  }
}

// ============================================================================
// ШАГ 3: ИСТОРИИ УСПЕХА (КОД ДЕНЕГ)
// ============================================================================

export async function sendProbudisSuccessStories(userId: string, chatId: number, utmData?: Record<string, string>, isTestMode: boolean = false): Promise<void> {
  try {
    if (!(await checkUserNotPaid(userId))) return;

    const paymentUrl = getPaymentUrl(utmData);

    // 9 видео-отзывов альбомом
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

    const keyboard = new InlineKeyboard().webApp('попасть на марафон ❤️', paymentUrl);
    await getTelegramService().sendMessage(
      chatId,
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
      `это не повтор.`,
      { parse_mode: 'HTML', reply_markup: keyboard }
    );

    // Далее — нумерологический гайд через 5 мин
    const timeout = getTimeout(isTestMode, STEP_TIMEOUT, STEP_TIMEOUT_TEST);
    await schedulerService.schedule(
      { type: 'probudis_guide', userId: parseInt(userId), chatId, data: { utmData: utmData || {}, isTestMode } },
      timeout
    );

    logger.info({ userId }, 'Probudis success stories sent');
  } catch (error) {
    logger.error({ error, userId }, 'Error sending success stories');
  }
}

// ============================================================================
// ШАГ 4+: ВСЯ ОСТАЛЬНАЯ ЦЕПОЧКА (как women)
// Обрабатывается в processScheduledTask в bot/index.ts
// ============================================================================

/**
 * Отменить ВСЕ задачи probudis воронки
 */
export async function cancelProbudisFunnelTasks(userId: number): Promise<void> {
  try {
    await schedulerService.cancelUserTasksByTypes(userId, ALL_PROBUDIS_TASK_TYPES);
    logger.info({ userId }, 'All probudis funnel tasks cancelled');
  } catch (error) {
    logger.error({ error, userId }, 'Error cancelling probudis tasks');
  }
}
