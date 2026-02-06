/**
 * 💃 WOMEN FUNNEL - ВОРОНКА "ЖЕНСКИЕ ДЕНЬГИ"
 * Воронка #3: специальная воронка для женской реализации через цифровую психологию
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

export function initWomenFunnelTelegramService(api: any) {
  telegramService = new TelegramService(api);
}

function getTelegramService(): TelegramService {
  if (!telegramService) {
    throw new Error('TelegramService not initialized. Call initWomenFunnelTelegramService() first.');
  }
  return telegramService;
}

// ============================================================================
// КОНСТАНТЫ
// ============================================================================

// Видео и тексты
const FIRST_VIDEO_URL = 'https://t.me/mate_bot_open/9811';
const MARATHON_VIDEO_URL = 'https://t.me/mate_bot_open/9684'; // То же видео что в club воронке

// WebApp URL для покупки (тот же что в club)
const WEBAPP_PURCHASE_URL = 'https://app.successkod.com/payment_form_club.html';

// Таймауты в миллисекундах
const DOGREV_TIMEOUT = 20 * 60 * 1000; // 20 минут
const DOGREV_TIMEOUT_TEST = 10 * 1000; // 10 секунд для тестового режима

// Redis key для хранения типа воронки
const FUNNEL_TYPE_PREFIX = 'funnel:type:';
const FUNNEL_TYPE_TTL = 3600; // 1 час

/**
 * Установить тип воронки women для пользователя
 */
export async function setWomenFunnelType(telegramId: number): Promise<void> {
  if (!redis) return;
  const key = `${FUNNEL_TYPE_PREFIX}${telegramId}`;
  await redis.setex(key, FUNNEL_TYPE_TTL, 'women');
  logger.debug({ telegramId, funnelType: 'women' }, 'Women funnel type set');
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
 * ШАГ 1: Начало воронки "Женские деньги"
 */
export async function startWomenFunnel(userId: string, chatId: number, utmData?: Record<string, string>, isTestMode: boolean = false): Promise<void> {
  try {
    logger.info({ userId, chatId, isTestMode }, 'Starting women funnel');

    // Получаем пользователя
    const [user] = await db.select().from(users).where(eq(users.telegramId, parseInt(userId))).limit(1);

    if (!user) {
      logger.error({ userId }, 'User not found for women funnel');
      return;
    }

    // Устанавливаем тип воронки в Redis
    await setWomenFunnelType(parseInt(userId));

    // Формируем URL с UTM метками
    let paymentUrl = WEBAPP_PURCHASE_URL;
    if (utmData && Object.keys(utmData).length > 0) {
      const params = new URLSearchParams(utmData);
      paymentUrl = `${WEBAPP_PURCHASE_URL}?${params.toString()}`;
    }

    // Создаем клавиатуру с кнопкой оплаты
    const keyboard = new InlineKeyboard()
      .webApp('оформить подписку ❤️', paymentUrl);

    // Отправляем видео с текстом
    await getTelegramService().sendVideo(
      chatId,
      FIRST_VIDEO_URL,
      {
        caption:
          `Женские деньги — <b>не про гонку и давление.</b>\n` +
          `Они приходят иначе.\n\n` +
          `Когда женщина пытается зарабатывать по «мужской схеме» —\n` +
          `через усилие, контроль и постоянное «надо»,\n` +
          `часто включается <b>выгорание</b>, потеря вкуса и ощущение, что жизнь проходит мимо.\n\n` +
          `💭 Деньги начинают идти тяжело,\n` +
          `💭 реализация перестаёт радовать,\n` +
          `💭 а внутренняя лёгкость исчезает.\n\n` +
          `В этом видео я рассказываю, как <b>через цифровую психологию:</b>\n` +
          `— найти своё настоящее призвание\n` +
          `— сохранить женственность и чувствительность\n` +
          `— выстроить реализацию <b>без надрыва</b>\n` +
          `— и понять, <i>в чём именно твоё предназначение</i>\n\n` +
          `Чтобы деньги приходили\n` +
          `✨ легко\n` +
          `✨ в удовольствии\n` +
          `✨ и с любовью — к себе и к жизни.\n\n` +
          `Смотри видео и почувствуй, как может быть по-другому 🤍`,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      }
    );

    // Запланировать догрев через 20 минут (если не купил) или 10 сек в тестовом режиме
    await scheduleWomenDogrev(String(user.telegramId), chatId, utmData, isTestMode);

    logger.info({ userId, chatId, isTestMode }, 'Women funnel started successfully');
  } catch (error) {
    logger.error({ error, userId, chatId }, 'Error starting women funnel');
    throw error;
  }
}

/**
 * ШАГ 2: Догрев через 20 минут (если не купил)
 * Отправляет информацию о марафоне КОД ДЕНЕГ
 */
async function scheduleWomenDogrev(userId: string, chatId: number, utmData?: Record<string, string>, isTestMode: boolean = false): Promise<void> {
  try {
    // Отменяем предыдущие догревы women воронки
    await schedulerService.cancelUserTasksByTypes(parseInt(userId), ['women_dogrev_20m']);

    // Планируем новый догрев через 20 минут (или 10 сек в тестовом режиме)
    const timeout = isTestMode ? DOGREV_TIMEOUT_TEST : DOGREV_TIMEOUT;

    await schedulerService.schedule(
      {
        type: 'women_dogrev_20m',
        userId: parseInt(userId),
        chatId,
        data: {
          utmData: utmData || {},
          isTestMode,
        },
      },
      timeout
    );

    logger.info({ userId, chatId, timeout, isTestMode }, 'Women dogrev scheduled');
  } catch (error) {
    logger.error({ error, userId }, 'Error scheduling women dogrev');
  }
}

/**
 * Отправить догрев (марафон КОД ДЕНЕГ)
 * Вызывается планировщиком через 20 минут
 */
export async function sendWomenDogrev(userId: string, chatId: number, utmData?: Record<string, string>): Promise<void> {
  try {
    logger.info({ userId, chatId }, 'Sending women dogrev (marathon info)');

    // Проверяем что пользователь еще не купил
    const [user] = await db.select().from(users).where(eq(users.telegramId, parseInt(userId))).limit(1);
    if (!user) {
      logger.error({ userId }, 'User not found for women dogrev');
      return;
    }

    if (user.isPro) {
      logger.info({ userId }, 'User already has subscription, skipping women dogrev');
      return;
    }

    // Формируем URL с UTM метками
    let paymentUrl = WEBAPP_PURCHASE_URL;
    if (utmData && Object.keys(utmData).length > 0) {
      const params = new URLSearchParams(utmData);
      paymentUrl = `${WEBAPP_PURCHASE_URL}?${params.toString()}`;
    }

    const keyboard = new InlineKeyboard()
      .webApp('Оплатить ❤️', paymentUrl)
      .row()
      .text('Что входит в оплату?', 'what_included');

    // Отправляем видео марафона (без caption - будет отдельно текст)
    await getTelegramService().sendVideo(
      chatId,
      MARATHON_VIDEO_URL,
      {}
    );

    // Отправляем текст отдельным сообщением с кнопками
    await getTelegramService().sendMessage(
      chatId,
      `<b>‼️Марафон «КОД ДЕНЕГ» прошло уже более 100.000 человек ⬇️</b>\n\n` +
      `<b>30 дней марафона и 4 дня эфиров, в которых всё собирается в систему 👇</b>\n\n` +
      `<b>День 1</b>\n` +
      `Стиль, образ, позиционирование.\n` +
      `Ты понимаешь:\n` +
      `— как проявляться\n` +
      `— как привлекать внимание и возможности\n` +
      `— как через свой образ влиять на людей\n\n` +
      `<b>День 2</b>\n` +
      `Честный разбор слепых зон.\n` +
      `Без обвинений и иллюзий:\n` +
      `— что мешало раньше\n` +
      `— куда утекают ресурсы и деньги\n` +
      `— где именно стоит усилиться\n\n` +
      `<b>День 3</b>\n` +
      `Создание продукта.\n` +
      `Ты собираешь конкретный продукт,\n` +
      `на котором можно зарабатывать весь год,\n` +
      `и понимаешь, как внедрять его в жизнь и работу.\n\n` +
      `<b>День 4</b>\n` +
      `Дорожная карта.\n` +
      `План на месяц и маршрут на год вперёд.\n` +
      `Плюс — деление на Десятки:\n` +
      `мини-группы по 10 человек и включение в клуб с поддержкой.\n\n` +
      `<b>💰 Стоимость</b>\n` +
      `<s>3000 ₽</s>\n` +
      `<b>2000 ₽ для тебя</b> — марафон + месяц в клубе + доступ к приложению ментального здоровья\n\n` +
      `Если пойдешь с нами — у тебя появятся:\n` +
      `— дорожная карта\n` +
      `— структура\n` +
      `— среда, где не дают слиться 🤝\n\n` +
      `<b>Дальше — либо по-старому.\n` +
      `Либо по-настоящему.</b>`,
      {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      }
    );

    logger.info({ userId, chatId }, 'Women dogrev sent successfully');
  } catch (error) {
    logger.error({ error, userId, chatId }, 'Error sending women dogrev');
  }
}

/**
 * Отменить все задачи women воронки для пользователя
 */
export async function cancelWomenFunnelTasks(userId: number): Promise<void> {
  try {
    await schedulerService.cancelUserTasksByTypes(userId, ['women_dogrev_20m']);
    logger.info({ userId }, 'Women funnel tasks cancelled');
  } catch (error) {
    logger.error({ error, userId }, 'Error cancelling women funnel tasks');
  }
}
