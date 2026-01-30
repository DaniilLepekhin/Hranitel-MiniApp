/**
 * 🧭 CLUB FUNNEL - НУМЕРОЛОГИЧЕСКАЯ ВОРОНКА КЛУБА
 * Воронка #2 до покупки: персонализированный путь через нумерологию
 */

import { InlineKeyboard } from 'grammy';
import { db } from '@/db';
import { users, clubFunnelProgress } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { schedulerService } from '@/services/scheduler.service';
import { TelegramService } from '@/services/telegram.service';
import { logger } from '@/utils/logger';
import { config } from '@/config';
import { redis } from '@/utils/redis';

// Create telegram service instance
let telegramService: TelegramService | null = null;

export function initClubFunnelTelegramService(api: any) {
  telegramService = new TelegramService(api);
}

function getTelegramService(): TelegramService {
  if (!telegramService) {
    throw new Error('TelegramService not initialized. Call initClubFunnelTelegramService() first.');
  }
  return telegramService;
}

// ============================================================================
// КОНСТАНТЫ
// ============================================================================

const CHANNEL_ID = -1001177888886; // ID канала для проверки подписки
const STAR_WEBHOOK_URL = 'https://n8n4.daniillepekhin.ru/webhook/zvezda_club_generated';
const ROADMAP_WEBHOOK_URL = 'https://n8n4.daniillepekhin.ru/webhook/zvezda_club_generated_roadmap';
const BIRTHDATE_REGEX = /^(0[1-9]|[12][0-9]|3[01])\.(0[1-9]|1[012])\.((19|20)\d\d)$/;
const VIDEO_NOTE_EMOJI = 'https://t.me/mate_bot_open/9319';

// Таймауты в миллисекундах
const BUTTON_TIMEOUT = 300 * 1000; // 5 минут
const FINAL_TIMEOUT = 120 * 1000; // 2 минуты

// WebApp URL для покупки
const WEBAPP_PURCHASE_URL = 'https://hranitel.daniillepekhin.com/payment_form_club.html';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Redis key для хранения типа воронки пользователя
const FUNNEL_TYPE_PREFIX = 'funnel:type:';
const FUNNEL_TYPE_TTL = 3600; // 1 час

/**
 * Установить тип воронки для пользователя
 */
export async function setFunnelType(telegramId: number, funnelType: 'club' | 'character_test'): Promise<void> {
  if (!redis) return;
  const key = `${FUNNEL_TYPE_PREFIX}${telegramId}`;
  await redis.setex(key, FUNNEL_TYPE_TTL, funnelType);
  logger.debug({ telegramId, funnelType }, 'Funnel type set');
}

/**
 * Получить тип воронки для пользователя
 */
export async function getFunnelType(telegramId: number): Promise<'club' | 'character_test' | null> {
  if (!redis) return null;
  const key = `${FUNNEL_TYPE_PREFIX}${telegramId}`;
  const value = await redis.get(key);
  return value as 'club' | 'character_test' | null;
}

/**
 * Удалить тип воронки для пользователя
 */
export async function clearFunnelType(telegramId: number): Promise<void> {
  if (!redis) return;
  const key = `${FUNNEL_TYPE_PREFIX}${telegramId}`;
  await redis.del(key);
}

/**
 * Получить Telegram user ID (number) из UUID userId
 */
async function getTelegramUserId(userId: string): Promise<number> {
  const progress = await getClubProgress(userId);
  if (progress?.telegramId) {
    return progress.telegramId;
  }
  // Fallback: получить из users таблицы
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user ? user.telegramId : 0;
}

/**
 * Маппинг дня рождения на номер архетипа (1-22)
 * По ТЗ voronka_before_pay_2.txt
 */
function getBirthDayArchetype(day: number): number {
  const mapping: Record<number, number> = {
    1: 1,
    2: 2,
    3: 3, 30: 3,
    4: 4, 31: 4,
    5: 5, 23: 5,
    6: 6, 24: 6,
    7: 7, 25: 7,
    8: 8, 26: 8,
    9: 9, 27: 9,
    10: 10, 28: 10,
    11: 11, 29: 11,
    12: 12,
    13: 13,
    14: 14,
    15: 15,
    16: 16,
    17: 17,
    18: 18,
    19: 19,
    20: 20,
    21: 21,
    22: 22,
  };

  return mapping[day] ?? 1; // default to 1 if not found
}

async function getOrCreateClubProgress(userId: string, telegramId: number) {
  const existing = await db
    .select()
    .from(clubFunnelProgress)
    .where(eq(clubFunnelProgress.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const [newProgress] = await db
    .insert(clubFunnelProgress)
    .values({
      userId,
      telegramId,
      currentStep: 'start',
    })
    .returning();

  return newProgress;
}

async function updateClubProgress(
  userId: string,
  updates: Partial<typeof clubFunnelProgress.$inferInsert>
) {
  await db
    .update(clubFunnelProgress)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(clubFunnelProgress.userId, userId));
}

async function getClubProgress(userId: string) {
  const progress = await db
    .select()
    .from(clubFunnelProgress)
    .where(eq(clubFunnelProgress.userId, userId))
    .limit(1);
  return progress[0] || null;
}

function getBirthDay(dateString: string): number {
  return parseInt(dateString.split('.')[0], 10);
}

function getArchetypeNumber(birthDay: number): number {
  const mapping: { [key: number]: number } = {
    1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10,
    11: 11, 12: 12, 13: 13, 14: 14, 15: 15, 16: 16, 17: 17, 18: 18,
    19: 19, 20: 20, 21: 21, 22: 22, 23: 5, 24: 6, 25: 7, 26: 8,
    27: 9, 28: 10, 29: 11, 30: 3, 31: 4,
  };
  return mapping[birthDay] || 1;
}

function getStyleGroup(birthDay: number): number {
  const groups = [
    [1, 10, 19, 28],
    [2, 11, 20, 29],
    [3, 12, 21, 30],
    [4, 13, 22, 31],
    [5, 14, 23],
    [6, 15, 24],
    [7, 16, 25],
    [8, 17, 26],
    [9, 18, 27],
  ];

  for (let i = 0; i < groups.length; i++) {
    if (groups[i].includes(birthDay)) {
      return i + 1;
    }
  }
  return 1;
}

async function checkChannelSubscription(userId: number): Promise<boolean> {
  try {
    const member = await getTelegramService().getChatMember(CHANNEL_ID, userId);
    if (!member) return false;
    return ['member', 'administrator', 'creator'].includes(member.status);
  } catch (error) {
    logger.error({ error, userId, channelId: CHANNEL_ID }, 'Error checking channel subscription');
    return false;
  }
}

async function generateStar(birthDate: string): Promise<Buffer | string | null> {
  try {
    const response = await fetch(STAR_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_date: birthDate }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const contentType = response.headers.get('content-type');

    // Если вернулся JSON с URL
    if (contentType?.includes('application/json')) {
      const data = await response.json() as { image_url?: string; url?: string };
      return data.image_url || data.url || null;
    }

    // Если вернулся binary файл (изображение) - возвращаем Buffer напрямую
    if (contentType?.includes('image/')) {
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    logger.warn({ contentType, birthDate }, 'Unexpected content type from star webhook');
    return null;
  } catch (error) {
    logger.error({ error, birthDate }, 'Error generating star');
    return null;
  }
}

async function generateRoadmap(birthDate: string): Promise<Buffer | string | null> {
  try {
    const response = await fetch(ROADMAP_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_date: birthDate }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const contentType = response.headers.get('content-type');

    // Если вернулся JSON с URL
    if (contentType?.includes('application/json')) {
      const data = await response.json() as { image_url?: string; url?: string };
      return data.image_url || data.url || null;
    }

    // Если вернулся binary файл (изображение) - возвращаем Buffer напрямую
    if (contentType?.includes('image/')) {
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    logger.warn({ contentType, birthDate }, 'Unexpected content type from roadmap webhook');
    return null;
  } catch (error) {
    logger.error({ error, birthDate }, 'Error generating roadmap');
    return null;
  }
}


// ============================================================================
// СООБЩЕНИЕ 1: СТАРТ ВОРОНКИ
// ============================================================================

// 🧪 Флаг для тестового режима с ускоренными таймерами
let testModeEnabled = false;
const TEST_BUTTON_TIMEOUT = 15 * 1000; // 15 секунд вместо 5 минут
const TEST_FINAL_TIMEOUT = 10 * 1000; // 10 секунд вместо 2 минут

// 🧪 Флаг для игнорирования isPro в тестовом режиме (чтобы админ мог пройти воронку как новый пользователь)
let ignoreIsProEnabled = false;

export function setTestMode(enabled: boolean) {
  testModeEnabled = enabled;
  logger.info({ testModeEnabled: enabled }, 'Club funnel test mode changed');
}

export function setIgnoreIsPro(enabled: boolean) {
  ignoreIsProEnabled = enabled;
  logger.info({ ignoreIsProEnabled: enabled }, 'Club funnel ignoreIsPro mode changed');
}

// Проверка isPro с учётом тестового режима
export function shouldTreatAsIsPro(actualIsPro: boolean): boolean {
  if (ignoreIsProEnabled) {
    return false; // В тестовом режиме всегда считаем что isPro = false
  }
  return actualIsPro;
}

// 🧪 Восстановить флаги тестового режима из БД (для callback'ов)
export async function restoreTestModeFromProgress(userId: string): Promise<void> {
  const progress = await getClubProgress(userId);
  if (progress) {
    if (progress.isTestMode) {
      setTestMode(true);
    }
    if (progress.ignoreIsPro) {
      setIgnoreIsPro(true);
    }
    logger.info({ userId, isTestMode: progress.isTestMode, ignoreIsPro: progress.ignoreIsPro }, 'Restored test mode flags from progress');
  }
}

/**
 * Полный сброс тестового режима - вызывается из /menu
 * Сбрасывает глобальные флаги, очищает флаги в БД и отменяет запланированные задачи
 */
export async function resetTestMode(userId: string, telegramId: number): Promise<boolean> {
  try {
    // 1. Сбрасываем глобальные флаги
    setTestMode(false);
    setIgnoreIsPro(false);

    // 2. Сбрасываем флаги в БД
    await updateClubProgress(userId, {
      isTestMode: false,
      ignoreIsPro: false,
    });

    // 3. Отменяем все запланированные задачи тестовых воронок
    await schedulerService.cancelUserTasksByTypes(telegramId, [
      'club_auto_progress',
      'start_reminder',
      'five_min_reminder',
      'burning_question_reminder',
      'payment_reminder',
      'final_reminder',
      'day2_reminder',
      'day3_reminder',
      'day4_reminder',
      'day5_final',
    ]);

    logger.info({ userId, telegramId }, 'Test mode reset - all flags cleared and tasks cancelled');
    return true;
  } catch (error) {
    logger.error({ error, userId, telegramId }, 'Failed to reset test mode');
    return false;
  }
}

function getButtonTimeout(): number {
  return testModeEnabled ? TEST_BUTTON_TIMEOUT : BUTTON_TIMEOUT;
}

function getFinalTimeout(): number {
  return testModeEnabled ? TEST_FINAL_TIMEOUT : FINAL_TIMEOUT;
}

export async function startClubFunnel(userId: string, chatId: number, telegramId: number, isTestMode: boolean = false, ignoreIsPro: boolean = false) {
  // Устанавливаем или сбрасываем тестовый режим
  setTestMode(isTestMode);
  // Устанавливаем флаг игнорирования isPro (для тестирования воронки админами)
  setIgnoreIsPro(ignoreIsPro);

  await getOrCreateClubProgress(userId, telegramId);

  // 🧪 Сохраняем флаги тестового режима в БД для восстановления при callback'ах
  await updateClubProgress(userId, {
    isTestMode: isTestMode,
    ignoreIsPro: ignoreIsPro,
  });

  // 🧹 Очистка всех запланированных задач при перезапуске (club + обычная воронка)
  // ⚡ Используем batch метод для эффективности - один проход вместо 10 отдельных запросов
  const telegramUserId = telegramId;

  await schedulerService.cancelUserTasksByTypes(telegramUserId, [
    'club_auto_progress',    // Club воронка
    'start_reminder',        // Обычная воронка
    'five_min_reminder',
    'burning_question_reminder',
    'payment_reminder',
    'final_reminder',
    'day2_reminder',
    'day3_reminder',
    'day4_reminder',
    'day5_final',
  ]);

  logger.info({ userId, telegramId, isTestMode }, 'Club funnel started - cancelled all pending tasks from both funnels');

  const keyboard = new InlineKeyboard().text('Готов(а) 🚀', 'club_ready');

  // Сообщение 1 с картинкой
  await getTelegramService().sendPhoto(
    chatId,
    'https://t.me/mate_bot_open/9346',
    {
      caption: `<b>Ты на старте своего маршрута 🧭</b>\n\n` +
        `У каждого человека есть свой путь.\n` +
        `Сейчас ты увидишь <b>своего персонажа</b> — как ты движешься к деньгам и реализации ✨\n\n` +
        `Пройди бота до конца, чтобы:\n` +
        `— понять, из какой роли ты действуешь\n` +
        `— увидеть свой маршрут\n` +
        `— получить <b>1000 монет</b> и обменять их на подарок 🎁\n\n` +
        `<b>Готова посмотреть на себя без иллюзий и ожиданий? 👇</b>\n` +
        `<i>Важно: если бот отвечает не сразу, не нажимай кнопку повторно — иногда ему нужно чуть больше времени, чтобы всё корректно собрать ⏳</i>`,
      parse_mode: 'HTML',
      reply_markup: keyboard,
    }
  );

  await updateClubProgress(userId, { currentStep: 'awaiting_ready' });

  const timeout = getButtonTimeout();

  await schedulerService.schedule(
    { type: 'club_auto_progress', userId: telegramUserId, chatId: chatId, data: { odUserId: userId, step: 'ready', isTestMode: testModeEnabled, ignoreIsPro: ignoreIsProEnabled } },
    timeout
  );
}

// ============================================================================
// СООБЩЕНИЯ 2-3: ГОТОВ -> ЗАПРОС ДАТЫ РОЖДЕНИЯ
// ============================================================================

export async function handleClubReady(userId: string, chatId: number) {
  // 🧪 Восстанавливаем флаги тестового режима из БД
  await restoreTestModeFromProgress(userId);

  // Сообщение 2: Эмодзи
  try {
    await getTelegramService().sendAnimation(chatId, VIDEO_NOTE_EMOJI);
  } catch (e) {
    logger.warn({ error: e }, 'Failed to send video note');
  }

  // Получаем telegram_id для установки типа воронки
  const telegramUserId = await getTelegramUserId(userId);
  // Устанавливаем тип воронки = club (обычная воронка, не тест персонажа)
  await setFunnelType(telegramUserId, 'club');

  // Сообщение 3: Запрос даты рождения с картинкой
  await getTelegramService().sendPhoto(
    chatId,
    'https://t.me/mate_bot_open/9347',
    {
      caption: `<b>С этого момента путь уже запущен.</b>\n\n` +
        `Первый шаг сделан — и это главное.\n` +
        `Твои <b>200 монет</b> 🪙 уже здесь.\n\n` +
        `По дате рождения ты получишь расшифровку:\n` +
        `— <b>твоего архетипа</b> — из какой роли ты действуешь\n` +
        `— <b>твоего стиля</b> — как ты проявляешься и считываешься людьми\n` +
        `— <b>твоего масштаба</b> — где твой потенциал и точка роста\n\n` +
        `Для этого <b>МНЕ НУЖНА ТВОЯ ДАТА РОЖДЕНИЯ.</b>\n` +
        `Она отражает твой внутренний ритм и способ принимать решения 🧠\n\n` +
        `Введи дату рождения в формате <b>ДД.ММ.ГГГГ</b>\n` +
        `Например: <i>14.07.1994</i>\n\n` +
        `<b>Впиши свою дату рождения в поле ниже 👇</b>`,
      parse_mode: 'HTML',
    }
  );

  await updateClubProgress(userId, { currentStep: 'awaiting_birthdate' });
}

// ============================================================================
// ОБРАБОТКА ДАТЫ РОЖДЕНИЯ
// ============================================================================

export async function handleBirthDateInput(userId: string, chatId: number, birthDate: string, telegramUserId: number) {
  if (!BIRTHDATE_REGEX.test(birthDate)) {
    await getTelegramService().sendMessage(
      chatId,
      `❌ Неверный формат даты. Пожалуйста, введи дату в формате <b>ДД.ММ.ГГГГ</b>\nНапример: <i>14.07.1994</i>`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  // Проверяем тип воронки для выбора правильного callback
  const funnelType = await getFunnelType(telegramUserId);
  const isCharacterTest = funnelType === 'character_test';

  const keyboard = new InlineKeyboard()
    .text('Да', isCharacterTest ? `ct_confirm_date_yes_${birthDate}` : `club_confirm_date_yes_${birthDate}`)
    .text('Нет', isCharacterTest ? 'ct_confirm_date_no' : 'club_confirm_date_no');

  await getTelegramService().sendMessage(
    chatId,
    `Твоя дата рождения — <b>${birthDate}</b>\n\nВсе верно? 🤍`,
    { parse_mode: 'HTML', reply_markup: keyboard }
  );
}

export async function handleBirthDateConfirmed(userId: string, chatId: number, birthDate: string) {
  // 🧪 Восстанавливаем флаги тестового режима из БД
  await restoreTestModeFromProgress(userId);

  const birthDay = getBirthDay(birthDate);
  const archetypeNumber = getArchetypeNumber(birthDay);

  await updateClubProgress(userId, {
    birthDate,
    birthDayNumber: birthDay,
    archetypeNumber,
    currentStep: 'birthdate_confirmed',
  });

  // Сообщение 4: Генерация звезды и вычисление архетипа
  const starImage = await generateStar(birthDate);

  // Вычисляем архетип по дню рождения (локально, без webhook)
  const archetypeFromDay = getBirthDayArchetype(birthDay);

  const updateData: any = {
    chislo: archetypeFromDay, // Сохраняем архетип для условной логики
  };

  // Сохраняем URL только если это строка (не Buffer)
  if (starImage && typeof starImage === 'string') {
    updateData.starImageUrl = starImage;
  }

  await updateClubProgress(userId, updateData);

  const message4Text =
    `Перед тобой — <b>твоя личная карта ✨</b>\n\n` +
    `Круги и цифры на звезде — это <b>числа из твоей даты рождения 🔢</b>\n` +
    `Они показывают, как ты думаешь, принимаешь решения и <b>как у тебя устроены сферы денег, отношений и здоровья.</b>\n\n` +
    `Важно понимать:\n` +
    `у кого-то эта система <b>работает и даёт результат,</b>\n` +
    `а у кого-то — есть, но почти не включена ⚠️\n\n` +
    `Эта карта показывает <b>потенциал 🌱</b>\n` +
    `Но потенциал ≠ реализация.\n\n` +
    `Дальше ты получишь персональную расшифровку:\n` +
    `— твоего <b>архетипа</b>\n` +
    `— <b>стиля проявления</b>\n` +
    `— и <b>твоего масштаба</b>\n\n` +
    `<b>Если хочешь включить эту систему —\nжми кнопку ниже 👇</b>`;

  const keyboard4 = new InlineKeyboard().text('хочу активировать свой потенциал', 'club_activate');

  if (starImage) {
    // starImage может быть Buffer или string (URL)
    await getTelegramService().sendPhoto(chatId, starImage, {
      caption: message4Text,
      parse_mode: 'HTML',
      reply_markup: keyboard4,
    });
  } else {
    await getTelegramService().sendMessage(chatId, message4Text, {
      parse_mode: 'HTML',
      reply_markup: keyboard4,
    });
  }

  await updateClubProgress(userId, { currentStep: 'showing_star' });

  const telegramUserId = await getTelegramUserId(userId);
  // После "личной карты" идёт подписка на канал
  await schedulerService.schedule(
    { type: 'club_auto_progress', userId: telegramUserId, chatId: chatId, data: { odUserId: userId, step: 'subscribe', isTestMode: testModeEnabled, ignoreIsPro: ignoreIsProEnabled } },
    getButtonTimeout()
  );
}

export async function handleBirthDateRejected(userId: string, chatId: number) {
  await getTelegramService().sendMessage(
    chatId,
    `Хорошо, давай попробуем еще раз.\n\nВведи дату рождения в формате <b>ДД.ММ.ГГГГ</b>\nНапример: <i>14.07.1994</i>`,
    { parse_mode: 'HTML' }
  );
}

// ============================================================================
// СООБЩЕНИЕ 5: АКТИВАЦИЯ -> ПОДПИСКА НА КАНАЛ
// ============================================================================

export async function handleClubActivate(userId: string, chatId: number) {
  // 🧪 Восстанавливаем флаги тестового режима из БД
  await restoreTestModeFromProgress(userId);

  // После нажатия "хочу активировать" → подписка на канал
  const telegramUserId = await getTelegramUserId(userId);
  await handleClubSubscribeRequest(userId, chatId, telegramUserId);
}

// ============================================================================
// СООБЩЕНИЕ: ПОДПИСКА НА КАНАЛ (перенесено сюда - после "личной карты")
// ============================================================================

export async function handleClubSubscribeRequest(userId: string, chatId: number, telegramUserId: number) {
  // 🧪 Восстанавливаем флаги тестового режима из БД
  await restoreTestModeFromProgress(userId);

  const keyboard = new InlineKeyboard()
    .url('подписаться 😍', 'https://t.me/kristina_egiazarovaaa1407')
    .row()
    .text('Я подписалась ✅', 'club_check_subscription');

  await getTelegramService().sendMessage(
    chatId,
    `Ты уже у цели! Остался последний шаг 🗻\n` +
    `И на твоём счету <b>400 монет 🪙</b>\n\n` +
    `Пока система готовит следующую расшифровку,\n` +
    `подпишись на канал, там тебя ждут:\n` +
    `— практики и расшифровки\n` +
    `— подкасты про деньги и реализацию\n` +
    `— прогнозы и ориентиры на 2026\n\n` +
    `После подписки <b>вернись в БОТ и расшифровка откроется.</b> Без этого шага расшифровка <b>«Где твой масштаб»</b> не откроется 👇`,
    { parse_mode: 'HTML', reply_markup: keyboard }
  );

  await updateClubProgress(userId, { currentStep: 'awaiting_subscribe' });
}

// ============================================================================
// СООБЩЕНИЯ 6-7: АРХЕТИП (после подписки)
// ============================================================================

export async function handleClubShowArchetype(userId: string, chatId: number) {
  // 🧪 Восстанавливаем флаги тестового режима из БД
  await restoreTestModeFromProgress(userId);

  // Сообщение: Эмодзи
  try {
    await getTelegramService().sendAnimation(chatId, VIDEO_NOTE_EMOJI);
  } catch (e) {
    logger.warn({ error: e }, 'Failed to send video note');
  }

  // Сообщение: Архетип
  const progress = await getClubProgress(userId);

  if (!progress?.archetypeNumber) {
    logger.error({ userId }, 'No archetype number found');
    return;
  }

  await sendArchetypeMessage(chatId, progress.archetypeNumber);
  await updateClubProgress(userId, { currentStep: 'showing_archetype' });

  const telegramUserId = await getTelegramUserId(userId);
  await schedulerService.schedule(
    { type: 'club_auto_progress', userId: telegramUserId, chatId: chatId, data: { odUserId: userId, step: 'style', isTestMode: testModeEnabled, ignoreIsPro: ignoreIsProEnabled } },
    getButtonTimeout()
  );
}

// ============================================================================
// СООБЩЕНИЯ 7-8: СТИЛЬ -> МАСШТАБ
// ============================================================================

export async function handleClubGetStyle(userId: string, chatId: number) {
  // 🧪 Восстанавливаем флаги тестового режима из БД
  await restoreTestModeFromProgress(userId);

  // Сообщение 7: Эмодзи
  try {
    await getTelegramService().sendAnimation(chatId, VIDEO_NOTE_EMOJI);
  } catch (e) {
    logger.warn({ error: e }, 'Failed to send video note');
  }

  const progress = await getClubProgress(userId);
  if (!progress?.birthDayNumber) {
    logger.error({ userId }, 'No birth day found');
    return;
  }

  const styleGroup = getStyleGroup(progress.birthDayNumber);

  // Сообщение 8: Картинки стиля (media group)
  const styleImages = getStyleImages(styleGroup);
  if (styleImages.length > 0) {
    try {
      await getTelegramService().sendMediaGroup(
        chatId,
        styleImages.map((url) => ({ type: 'photo', media: url }))
      );
    } catch (e) {
      logger.warn({ error: e, styleGroup }, 'Failed to send style media group');
    }
  }

  const keyboard8 = new InlineKeyboard().text('👉 Где мой масштаб', 'club_get_scale');

  await getTelegramService().sendMessage(
    chatId,
    `<b>✨ Прочитай расшифровку своего стиля выше.</b>\n` +
    `Эти образы и смыслы можно сохранить —\n` +
    `чтобы возвращаться к ним и <b>не терять своё ощущение себя 🤍</b>\n\n` +
    `Это то, <b>как ты уже влияешь на людей и пространство —</b>\n` +
    `даже если раньше не всегда это осознавала.\n\n` +
    `Но стиль — это лишь форма\n` +
    `Самое интересное — глубже 👇\n\n` +
    `<b>💥 Где твой масштаб?</b>\n` +
    `Где твои деньги, рост и реализация?\n\n` +
    `Давай посмотрим, <b>какой уровень тебе действительно доступен —</b>\n` +
    `по твоей дате рождения 🔍\n\n` +
    `⬇️ Нажми кнопку ниже, чтобы получить следующую расшифровку.`,
    { parse_mode: 'HTML', reply_markup: keyboard8 }
  );

  await updateClubProgress(userId, { currentStep: 'showing_style' });

  const telegramUserId = await getTelegramUserId(userId);
  await schedulerService.schedule(
    { type: 'club_auto_progress', userId: telegramUserId, chatId: chatId, data: { odUserId: userId, step: 'scale', isTestMode: testModeEnabled, ignoreIsPro: ignoreIsProEnabled } },
    getButtonTimeout()
  );
}

// ============================================================================
// ПОКАЗАТЬ МАСШТАБ (по кнопке "👉 Где мой масштаб")
// ============================================================================

export async function handleClubGetScale(userId: string, chatId: number, telegramUserId: number) {
  // 🧪 Восстанавливаем флаги тестового режима из БД
  await restoreTestModeFromProgress(userId);

  // Эмодзи
  try {
    await getTelegramService().sendAnimation(chatId, VIDEO_NOTE_EMOJI);
  } catch (e) {
    logger.warn({ error: e }, 'Failed to send video note');
  }

  // Показываем масштаб
  await sendScaleMessage(userId, chatId);
}

// ============================================================================
// ПРОВЕРКА ПОДПИСКИ
// ============================================================================

export async function handleClubCheckSubscription(userId: string, chatId: number, telegramUserId: number) {
  // 🧪 Восстанавливаем флаги тестового режима из БД
  await restoreTestModeFromProgress(userId);

  // Проверяем подписку на канал
  const isSubscribed = await checkChannelSubscription(telegramUserId);

  if (!isSubscribed) {
    const keyboard = new InlineKeyboard()
      .url('подписаться 😍', 'https://t.me/kristina_egiazarovaaa1407')
      .row()
      .text('Я подписалась ✅', 'club_check_subscription');

    await getTelegramService().sendMessage(
      chatId,
      `❌ Ты пока не подписана на канал.\n\nПодпишись на канал и нажми кнопку ещё раз 👇`,
      { parse_mode: 'HTML', reply_markup: keyboard }
    );
    return;
  }

  await updateClubProgress(userId, { subscribedToChannel: true, currentStep: 'subscribed' });

  // После подписки показываем архетип (а не масштаб как раньше)
  await handleClubShowArchetype(userId, chatId);
}

// ============================================================================
// СООБЩЕНИЕ 11: МАСШТАБ
// ============================================================================

async function sendScaleMessage(userId: string, chatId: number) {
  const progress = await getClubProgress(userId);
  if (!progress?.birthDayNumber) return;

  const styleGroup = getStyleGroup(progress.birthDayNumber);

  // Картинки масштаба - отправляем как media group
  const scaleImages = getScaleImages(styleGroup);
  if (scaleImages.length > 0) {
    await getTelegramService().sendMediaGroup(
      chatId,
      scaleImages.map((url) => ({ type: 'photo', media: url }))
    );
  }

  const keyboard11 = new InlineKeyboard().text('👉 Узнать свою точку роста', 'club_get_roadmap');

  await getTelegramService().sendMessage(
    chatId,
    `Прочитав расшифровку <b>своего масштаба по дате рождения</b> выше, ты могла почувствовать, <b>в чём твоя сила и как тебе легче расти ✨</b>\n\n` +
    `И обычно в этот момент возникает другое ощущение 👇\n` +
    `что возможностей больше, чем реализовано.\n\n` +
    `Хочется понять:\n` +
    `— где именно сейчас твой потенциал не включён\n` +
    `— почему деньги и рост идут неравномерно 💸\n` +
    `— и что в тебе уже готово к следующему шагу 🚀\n\n` +
    `⬇️ Нажми кнопку ниже,\n` +
    `забери свои монетки 🪙\n` +
    `и посмотри, <b>что для тебя открывается дальше ✨</b>`,
    { parse_mode: 'HTML', reply_markup: keyboard11 }
  );

  await updateClubProgress(userId, { currentStep: 'showing_scale' });

  const telegramUserId = await getTelegramUserId(userId);
  await schedulerService.schedule(
    { type: 'club_auto_progress', userId: telegramUserId, chatId: chatId, data: { odUserId: userId, step: 'roadmap', isTestMode: testModeEnabled, ignoreIsPro: ignoreIsProEnabled } },
    getButtonTimeout()
  );
}

// ============================================================================
// СООБЩЕНИЕ 12: ДОРОЖНАЯ КАРТА
// ============================================================================

export async function handleClubGetRoadmap(userId: string, chatId: number) {
  // 🧪 Восстанавливаем флаги тестового режима из БД
  await restoreTestModeFromProgress(userId);

  const keyboard12 = new InlineKeyboard().text('👉 Начать маршрут', 'club_start_route');

  // Получаем дату рождения из прогресса для генерации картинки
  const progress = await getClubProgress(userId);
  const birthDate = progress?.birthDate;

  const message12Text =
    `Это <b>твоя дорожная карта на год 😍</b>\n\n` +
    `Если идти по ней шаг за шагом,\n` +
    `ты переходишь <b>из точки А в точку Б:</b>\n\n` +
    `— из хаоса → в систему\n` +
    `— из нестабильного дохода → в устойчивый доход 💰\n` +
    `— из сомнений → в ясную позицию\n` +
    `— из потенциала → в реализованный результат\n\n` +
    `<b>Готова узнать свое предназначение и активировать свой КОД УСПЕХА? 💰</b>`;

  // Генерируем картинку дорожной карты
  const roadmapImage = birthDate ? await generateRoadmap(birthDate) : null;

  if (roadmapImage) {
    await getTelegramService().sendPhoto(chatId, roadmapImage, {
      caption: message12Text,
      parse_mode: 'HTML',
      reply_markup: keyboard12,
    });
  } else {
    await getTelegramService().sendMessage(chatId, message12Text, {
      parse_mode: 'HTML',
      reply_markup: keyboard12,
    });
  }

  await updateClubProgress(userId, { currentStep: 'showing_roadmap' });

  const telegramUserId = await getTelegramUserId(userId);
  await schedulerService.schedule(
    { type: 'club_auto_progress', userId: telegramUserId, chatId: chatId, data: { odUserId: userId, step: 'purchase', isTestMode: testModeEnabled, ignoreIsPro: ignoreIsProEnabled } },
    getFinalTimeout()
  );
}

// ============================================================================
// СООБЩЕНИЕ 13: ФИНАЛЬНАЯ ПРОДАЖА
// ============================================================================

export async function handleClubStartRoute(userId: string, chatId: number, user: any) {
  // 🧪 Восстанавливаем флаги тестового режима из БД
  await restoreTestModeFromProgress(userId);

  logger.info({ userId, chatId, telegramId: user?.telegramId }, 'handleClubStartRoute: START');

  // Формируем URL с параметрами
  const purchaseUrl = new URL(WEBAPP_PURCHASE_URL);
  logger.info({ purchaseUrl: purchaseUrl.toString() }, 'handleClubStartRoute: URL created');

  // Добавляем UTM и другие параметры из метаданных пользователя
  const metadata = user.metadata as any || {};

  if (metadata.metka) purchaseUrl.searchParams.set('metka', metadata.metka);
  if (metadata.group_id) purchaseUrl.searchParams.set('group_id', metadata.group_id);
  purchaseUrl.searchParams.set('client_id', user.telegramId);
  purchaseUrl.searchParams.set('platform_id', user.username || '');

  // UTM параметры
  if (metadata.utm_campaign) purchaseUrl.searchParams.set('utm_campaign', metadata.utm_campaign);
  if (metadata.utm_medium) purchaseUrl.searchParams.set('utm_medium', metadata.utm_medium);
  if (metadata.utm_source) purchaseUrl.searchParams.set('utm_source', metadata.utm_source);
  if (metadata.utm_content) purchaseUrl.searchParams.set('utm_content', metadata.utm_content);
  if (metadata.utm_term) purchaseUrl.searchParams.set('utm_term', metadata.utm_term);

  const keyboard13 = new InlineKeyboard()
    .webApp('оформить подписку ❤️', purchaseUrl.toString())
    .row()
    .text('подробнее 🧐', 'club_more_info');

  logger.info({ chatId }, 'handleClubStartRoute: Sending final message with video...');

  await getTelegramService().sendVideo(
    chatId,
    'https://t.me/mate_bot_open/9633',
    {
      caption:
        `<b>🧭 ТВОЙ МАРШРУТ ОТКРЫТ. ВОПРОС — ПОЙДЁШЬ ЛИ ТЫ ПО НЕМУ?</b>\n\n` +
        `Ты увидела:\n` +
        `<b>свой архетип · масштаб · потенциал</b>\n\n` +
        `Результат появляется там,\n` +
        `где есть <b>действие + среда</b>, которая удерживает фокус и не даёт свернуть.\n\n` +
        `<b>🔑 КЛУБ «КОД УСПЕХА. ГЛАВА: ПРОБУЖДЕНИЕ»</b>\n\n` +
        `Это пространство, где:\n` +
        `— ты перестаёшь <b>стоять на месте</b>, даже если много стараешься\n` +
        `— доход <b>перестаёт быть случайным</b>\n` +
        `— исчезают бесконечные <b>рывки и откаты</b>\n` +
        `— становится понятно, <b>что именно делать дальше</b>\n` +
        `— потенциал наконец <b>начинает давать деньги</b>\n\n` +
        `<b>Внутри тебя ждёт:</b>\n` +
        `▪ <b>марафон «Код денег» — 30 дней</b>\n` +
        `▪ понимание, <i>почему сейчас рост и доход идут нестабильно</i>\n` +
        `▪ <b>дорожная карта:</b> из точки А → в точку Б\n` +
        `▪ мини-курсы / эфиры / практики и подкасты\n` +
        `▪ среда, где <b>доходят до результата,</b> а не бросают\n\n` +
        `<b>Дополнительно:</b>\n` +
        `— <b>4 онлайн-эфира с Кристиной</b> (1–4 февраля)\n` +
        `— работа в <b>Десятке</b> с бадди\n` +
        `— встречи по городам\n` +
        `— регулярные практики для ресурса и фокуса\n\n` +
        `<b>💰Твои 🪙 принесли тебе скидку — 2000₽ вместо 3000₽.\n` +
        `Скидка активна 24 часа. </b>\n\n` +
        `<b>👇 Нажимай кнопку и пробудись. Двери уже открыты.</b>`,
      parse_mode: 'HTML',
      reply_markup: keyboard13,
    }
  );

  logger.info({ chatId }, 'handleClubStartRoute: Message sent successfully');

  await updateClubProgress(userId, { currentStep: 'awaiting_purchase' });
  logger.info({ userId, currentStep: 'awaiting_purchase' }, 'handleClubStartRoute: Updated progress');

  // Отменяем все предыдущие задачи club_auto_progress перед планированием fallback
  const telegramUserId = await getTelegramUserId(userId);
  await schedulerService.cancelUserTasksByType(telegramUserId, 'club_auto_progress');
  logger.info({ telegramUserId }, 'handleClubStartRoute: Cancelled previous club_auto_progress tasks');

  // Планируем переход в обычную воронку через 5 минут (или 10 сек в тестовом режиме), если не оплатил
  const fallbackTimeout = testModeEnabled ? TEST_FINAL_TIMEOUT : 5 * 60 * 1000;
  logger.info({ telegramUserId, odUserId: userId, fallbackTimeout }, 'handleClubStartRoute: Scheduling fallback task');

  await schedulerService.schedule(
    { type: 'club_auto_progress', userId: telegramUserId, chatId: chatId, data: { odUserId: userId, step: 'fallback_to_main', isTestMode: testModeEnabled, ignoreIsPro: ignoreIsProEnabled } },
    fallbackTimeout
  );

  logger.info({ userId, telegramUserId, chatId }, 'handleClubStartRoute: COMPLETE - fallback task scheduled');
}

// ============================================================================
// ПОДРОБНЕЕ О ПРОГРАММЕ ФЕВРАЛЯ
// ============================================================================

/**
 * Обработчик кнопки "подробнее 🧐" - отправляет видео с подробным описанием программы февраля
 */
export async function handleClubMoreInfo(userId: string, chatId: number) {
  logger.info({ userId, chatId }, 'handleClubMoreInfo: START');

  // Получаем user для формирования WebApp URL
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    logger.error({ userId, chatId }, 'handleClubMoreInfo: User not found');
    return;
  }

  // Формируем URL с параметрами
  const purchaseUrl = new URL(WEBAPP_PURCHASE_URL);
  const metadata = user.metadata as any || {};

  if (metadata.metka) purchaseUrl.searchParams.set('metka', metadata.metka);
  if (metadata.group_id) purchaseUrl.searchParams.set('group_id', metadata.group_id);
  purchaseUrl.searchParams.set('client_id', user.telegramId);
  purchaseUrl.searchParams.set('platform_id', user.username || '');

  // UTM параметры
  if (metadata.utm_campaign) purchaseUrl.searchParams.set('utm_campaign', metadata.utm_campaign);
  if (metadata.utm_medium) purchaseUrl.searchParams.set('utm_medium', metadata.utm_medium);
  if (metadata.utm_source) purchaseUrl.searchParams.set('utm_source', metadata.utm_source);
  if (metadata.utm_content) purchaseUrl.searchParams.set('utm_content', metadata.utm_content);
  if (metadata.utm_term) purchaseUrl.searchParams.set('utm_term', metadata.utm_term);

  const keyboard = new InlineKeyboard()
    .webApp('я с вами 😍', purchaseUrl.toString());

  // Сначала отправляем видео без подписи
  await getTelegramService().sendVideo(
    chatId,
    'https://t.me/mate_bot_open/9676',
    {}
  );

  // Затем отправляем длинное сообщение с кнопкой
  await getTelegramService().sendMessage(
    chatId,
    `<b>ФЕВРАЛЬ — МЕСЯЦ СБОРКИ ✨</b>\n\n` +
    `Новая версия тебя, где спокойно и ясно:\n` +
    `<b>кто ты • как проявляешься • какую роль занимаешь на рынке</b>\n\n` +
    `<b>🚀 ЧТО МЫ СОБИРАЕМ</b>\n` +
    `— личный продукт 💼\n` +
    `— твою роль в рынке\n` +
    `— <b>картину Точки Б на 12 месяцев 🗺</b>\n\n` +
    `<b>🌿 ЧТО МЫ ОСВОБОЖДАЕМ</b>\n` +
    `— страхи и синдром самозванца\n` +
    `— внутренний запрет быть Автором\n` +
    `— ожидание «разрешения» от мира\n\n` +
    `<b>🎓 МИНИ-КУРСЫ В ПРИЛОЖЕНИИ</b>\n` +
    `<i>— Психология личности\n` +
    `— Выход из кризиса</i>\n\n` +
    `⚠️ Курс месяца:\n` +
    `<b>Психология личности</b>\n` +
    `самоценность • самозванец • границы\n\n` +
    `<b>🎙 ЭФИРЫ ФЕВРАЛЯ</b>\n` +
    `<i>— «Твой Персонаж 2026: кем тебе стать, чтобы пришли деньги»\n` +
    `— «План на год по цифрам: цель → декомпозиция → контроль»\n` +
    `— «Как выбрать канал привлечения на год и не распылиться»\n` +
    `— «Самозванец и страх видимости»</i>\n\n` +
    `<b>🧩 ПРАКТИКИ МЕСЯЦА\n` +
    `— «Контракт Автора» ✍️</b>\n` +
    `(письмо себе + 3 правила года)\n` +
    `<b>— «Точка Б через 12 месяцев»</b>\n` +
    `(визуал + 10 решений, которые к ней ведут)\n\n` +
    `<b>🎯 ТРЕК ДЕСЯТКИ</b>\n\n` +
    `<b>СБОРКА ИДЕНТИЧНОСТИ</b>\n` +
    `Ты фиксируешь:\n` +
    `— кто я сейчас\n` +
    `— что я создаю\n` +
    `— какую жизнь строю в 2026\n\n` +
    `✅ Итог месяца:\n` +
    `чёткая формулировка <b>роли + продукта + Точки Б,</b>\n` +
    `проговорённая и закреплённая в чате десятки.\n\n` +
    `<b>🤝 ВСТРЕЧА ГОРОДА\n` +
    `«МАНИФЕСТ АВТОРА»</b>\n\n` +
    `Знакомство не через должности,\n` +
    `а через <b>ценности → выбор → намерение.</b>\n\n` +
    `Фраза месяца:\n` +
    `<b>«В 2026 я выбираю быть…»</b>\n` +
    `одно действие, которое подтверждает выбор.\n\n` +
    `🧭 Маршрут есть.\n` +
    `Осталось решить — <b>ты в нём или снова «потом».</b>`,
    {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    }
  );

  logger.info({ userId, chatId }, 'handleClubMoreInfo: COMPLETE');
}

// ============================================================================
// ПЕРЕХОД В ОБЫЧНУЮ ВОРОНКУ
// ============================================================================

async function handleFallbackToMainFunnel(userId: string, chatId: number) {
  logger.info({ userId, chatId }, 'handleFallbackToMainFunnel: START');

  // Получаем user для формирования WebApp URL
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    logger.error({ userId, chatId }, 'handleFallbackToMainFunnel: User not found');
    return;
  }

  logger.info({ userId: user.id, telegramId: user.telegramId, chatId }, 'handleFallbackToMainFunnel: User found');

  // Формируем URL с параметрами (как в handleClubStartRoute)
  const purchaseUrl = new URL(WEBAPP_PURCHASE_URL);
  const metadata = user.metadata as any || {};

  if (metadata.metka) purchaseUrl.searchParams.set('metka', metadata.metka);
  if (metadata.group_id) purchaseUrl.searchParams.set('group_id', metadata.group_id);
  purchaseUrl.searchParams.set('client_id', user.telegramId);
  purchaseUrl.searchParams.set('platform_id', user.username || '');

  // UTM параметры
  if (metadata.utm_campaign) purchaseUrl.searchParams.set('utm_campaign', metadata.utm_campaign);
  if (metadata.utm_medium) purchaseUrl.searchParams.set('utm_medium', metadata.utm_medium);
  if (metadata.utm_source) purchaseUrl.searchParams.set('utm_source', metadata.utm_source);
  if (metadata.utm_content) purchaseUrl.searchParams.set('utm_content', metadata.utm_content);
  if (metadata.utm_term) purchaseUrl.searchParams.set('utm_term', metadata.utm_term);

  const keyboard = new InlineKeyboard()
    .webApp('Оплатить ❤️', purchaseUrl.toString());

  // СООБЩЕНИЕ 3 обычной воронки - "Марафон КОД ДЕНЕГ"
  await getTelegramService().sendVideo(
    chatId,
    'https://t.me/mate_bot_open/9369',
    {
      caption:
        `<b>Марафон КОД ДЕНЕГ внутри клуба КОД УСПЕХА</b>\n\n` +
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
        `на котором можно зарабатывать <b>весь год,</b>\n` +
        `и понимаешь, как внедрять его в жизнь и работу.\n\n` +
        `<b>День 4</b>\n` +
        `Дорожная карта.\n` +
        `План на месяц и маршрут на год вперёд.\n` +
        `Плюс — деление на <b>Десятки:</b>\n` +
        `мини-группы по 10 человек и включение в клуб с поддержкой.\n\n` +
        `<b>💰 Стоимость</b>\n` +
        `<s>3000 ₽</s>\n` +
        `<b>2000 ₽ для тебя</b> — марафон + месяц в клубе + доступ к приложению ментального здоровья\n\n` +
        `Если пойдешь с нами — у тебя появятся:\n` +
        `— дорожная карта\n` +
        `— структура\n` +
        `— среда, где не дают слиться 🤝\n\n` +
        `<b>Дальше — либо по-старому.\nЛибо по-настоящему.</b>`,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }
  );

  // Отменяем все задачи club воронки
  const telegramUserId = user.telegramId;
  await schedulerService.cancelUserTasksByType(telegramUserId, 'club_auto_progress');

  // Помечаем что club воронка завершена
  await updateClubProgress(userId, { currentStep: 'completed' });

  // Запускаем таймеры обычной воронки: сначала нумерологический гид, затем "3 ловушки"
  // В тестовом режиме используем тестовые типы задач с ускоренными таймерами
  if (testModeEnabled) {
    // Тестовый режим: используем test_* типы задач с 15-секундными интервалами
    await schedulerService.schedule(
      { type: 'test_numerology_guide', userId: telegramUserId, chatId: chatId },
      TEST_FINAL_TIMEOUT // 10 секунд
    );
    logger.info({ userId, telegramId: user.telegramId }, 'Club funnel → TEST funnel fallback: scheduled test_numerology_guide');
  } else {
    // Боевой режим: используем обычные типы задач с реальными таймерами
    await schedulerService.schedule(
      { type: 'numerology_guide_reminder', userId: telegramUserId, chatId: chatId },
      20 * 60 * 1000 // 20 минут
    );
    logger.info({ userId, telegramId: user.telegramId }, 'Club funnel → Main funnel fallback: scheduled numerology_guide_reminder');
  }
}

// ============================================================================
// АВТОПРОКИДЫВАНИЕ
// ============================================================================

export async function handleClubAutoProgress(userId: string, chatId: number, step: string, isTestMode: boolean = false, ignoreIsPro: boolean = false) {
  // 🚫 Игнорируем групповые чаты и каналы (chatId < 0)
  if (chatId < 0) {
    logger.info({ userId, chatId, step }, 'Ignoring club auto-progress for group chat/channel');
    return;
  }

  // Восстанавливаем тестовый режим из данных задачи
  if (isTestMode) {
    setTestMode(true);
  }
  // Восстанавливаем флаг ignoreIsPro из данных задачи
  if (ignoreIsPro) {
    setIgnoreIsPro(true);
  }

  const progress = await getClubProgress(userId);
  if (!progress) return;

  const currentStep = progress.currentStep;

  switch (step) {
    case 'ready':
      if (currentStep === 'awaiting_ready') {
        await handleClubReady(userId, chatId);
      }
      break;
    case 'activate':
      if (currentStep === 'showing_star') {
        await handleClubActivate(userId, chatId);
      }
      break;
    case 'subscribe':
      // Автопрокидывание на подписку (после "личной карты")
      if (currentStep === 'showing_star') {
        const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (user.length) {
          // 🆕 Для импортированных пользователей (isPro=true) пропускаем подписку
          // 🧪 В тестовом режиме ignoreIsPro=true всегда идём как новый пользователь
          if (shouldTreatAsIsPro(user[0].isPro)) {
            logger.info({ userId, telegramId: user[0].telegramId }, 'Imported user - skipping channel subscription, showing archetype directly');
            await handleClubShowArchetype(userId, chatId);
          } else {
            await handleClubSubscribeRequest(userId, chatId, user[0].telegramId);
          }
        }
      }
      break;
    case 'style':
      if (currentStep === 'showing_archetype') {
        await handleClubGetStyle(userId, chatId);
      }
      break;
    case 'scale':
      if (currentStep === 'showing_style') {
        const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (user.length) {
          await handleClubGetScale(userId, chatId, user[0].telegramId);
        }
      }
      break;
    case 'roadmap':
      if (currentStep === 'showing_scale') {
        // 🆕 Для импортированных пользователей (isPro=true) показываем версию без покупки
        // 🧪 В тестовом режиме ignoreIsPro=true всегда идём как новый пользователь
        const userForRoadmap = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (userForRoadmap.length && shouldTreatAsIsPro(userForRoadmap[0].isPro)) {
          logger.info({ userId }, 'Imported user - showing roadmap for imported');
          await handleClubGetRoadmapImported(userId, chatId);
        } else {
          await handleClubGetRoadmap(userId, chatId);
        }
      }
      break;
    case 'purchase':
      if (currentStep === 'showing_roadmap') {
        const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (user.length) {
          // 🆕 Для импортированных пользователей (isPro=true) показываем "Ключ принят"
          // 🧪 В тестовом режиме ignoreIsPro=true всегда идём как новый пользователь
          if (shouldTreatAsIsPro(user[0].isPro)) {
            logger.info({ userId }, 'Imported user - showing welcome instead of purchase');
            await handleClubStartRouteImported(userId, chatId);
          } else {
            await handleClubStartRoute(userId, chatId, user[0]);
          }
        }
      }
      break;
    case 'fallback_to_main':
      logger.info({ userId, chatId, currentStep }, 'Club auto-progress: fallback_to_main triggered');
      if (currentStep === 'awaiting_purchase') {
        logger.info({ userId, chatId }, 'Club funnel: executing fallback to main funnel');
        await handleFallbackToMainFunnel(userId, chatId);
      } else {
        logger.warn({ userId, chatId, currentStep, expected: 'awaiting_purchase' }, 'Club funnel: fallback skipped - wrong step');
      }
      break;

    // 🆕 Шаги для импортированных пользователей (уже с подпиской)
    case 'ready_imported':
      if (currentStep === 'awaiting_ready') {
        await handleClubReady(userId, chatId);
      }
      break;
    case 'roadmap_imported':
      if (currentStep === 'showing_scale') {
        await handleClubGetRoadmapImported(userId, chatId);
      }
      break;
    case 'welcome_imported':
      if (currentStep === 'showing_roadmap') {
        await handleClubStartRouteImported(userId, chatId);
      }
      break;
  }
}

// ============================================================================
// ДАННЫЕ АРХЕТИПОВ (1-22)
// ============================================================================

async function sendArchetypeMessage(chatId: number, archetypeNumber: number) {
  const archetype = ARCHETYPES[archetypeNumber];
  if (!archetype) {
    logger.error({ archetypeNumber }, 'Unknown archetype');
    return;
  }

  const keyboard = new InlineKeyboard().text('👉 Получить расшифровку стиля', 'club_get_style');

  try {
    // Отправляем картинки как media group
    if (archetype.images && archetype.images.length > 0) {
      await getTelegramService().sendMediaGroup(
        chatId,
        archetype.images.map((url) => ({ type: 'photo', media: url }))
      );
    }

    // Затем отправляем текст с кнопкой
    await getTelegramService().sendMessage(chatId, archetype.text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  } catch (e) {
    // Если картинки не загрузились, отправляем только текст
    await getTelegramService().sendMessage(chatId, archetype.text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  }
}

function getStyleImages(styleGroup: number): string[] {
  // Картинки стиля по группам (1-9)
  const styleImages: { [key: number]: string[] } = {
    // Группа 1: числа 1/10/19/28
    1: [
      'https://t.me/mate_bot_open/9382',
      'https://t.me/mate_bot_open/9383',
      'https://t.me/mate_bot_open/9384',
      'https://t.me/mate_bot_open/9385',
      'https://t.me/mate_bot_open/9386',
      'https://t.me/mate_bot_open/9387',
    ],
    // Группа 2: числа 2/11/20/29
    2: [
      'https://t.me/mate_bot_open/9388',
      'https://t.me/mate_bot_open/9389',
      'https://t.me/mate_bot_open/9390',
      'https://t.me/mate_bot_open/9391',
      'https://t.me/mate_bot_open/9392',
      'https://t.me/mate_bot_open/9393',
    ],
    // Группа 3: числа 3/12/21/30
    3: [
      'https://t.me/mate_bot_open/9394',
      'https://t.me/mate_bot_open/9395',
      'https://t.me/mate_bot_open/9396',
      'https://t.me/mate_bot_open/9397',
      'https://t.me/mate_bot_open/9398',
      'https://t.me/mate_bot_open/9399',
    ],
    // Группа 4: числа 4/13/22/31
    4: [
      'https://t.me/mate_bot_open/9400',
      'https://t.me/mate_bot_open/9401',
      'https://t.me/mate_bot_open/9402',
      'https://t.me/mate_bot_open/9403',
      'https://t.me/mate_bot_open/9404',
      'https://t.me/mate_bot_open/9405',
    ],
    // Группа 5: числа 5/14/23
    5: [
      'https://t.me/mate_bot_open/9406',
      'https://t.me/mate_bot_open/9407',
      'https://t.me/mate_bot_open/9408',
      'https://t.me/mate_bot_open/9409',
      'https://t.me/mate_bot_open/9410',
      'https://t.me/mate_bot_open/9411',
    ],
    // Группа 6: числа 6/15/24
    6: [
      'https://t.me/mate_bot_open/9412',
      'https://t.me/mate_bot_open/9413',
      'https://t.me/mate_bot_open/9414',
      'https://t.me/mate_bot_open/9415',
      'https://t.me/mate_bot_open/9416',
      'https://t.me/mate_bot_open/9417',
    ],
    // Группа 7: числа 7/16/25
    7: [
      'https://t.me/mate_bot_open/9418',
      'https://t.me/mate_bot_open/9419',
      'https://t.me/mate_bot_open/9420',
      'https://t.me/mate_bot_open/9421',
      'https://t.me/mate_bot_open/9422',
      'https://t.me/mate_bot_open/9423',
      'https://t.me/mate_bot_open/9424',
    ],
    // Группа 8: числа 8/17/26
    8: [
      'https://t.me/mate_bot_open/9425',
      'https://t.me/mate_bot_open/9426',
      'https://t.me/mate_bot_open/9427',
      'https://t.me/mate_bot_open/9428',
      'https://t.me/mate_bot_open/9429',
      'https://t.me/mate_bot_open/9430',
      'https://t.me/mate_bot_open/9431',
    ],
    // Группа 9: числа 9/18/27
    9: [
      'https://t.me/mate_bot_open/9432',
      'https://t.me/mate_bot_open/9433',
      'https://t.me/mate_bot_open/9434',
      'https://t.me/mate_bot_open/9435',
      'https://t.me/mate_bot_open/9436',
      'https://t.me/mate_bot_open/9437',
    ],
  };

  return styleImages[styleGroup] || [];
}

function getScaleImages(styleGroup: number): string[] {
  const scaleImages: { [key: number]: string[] } = {
    // Группа 1: 1/10/19/28
    1: [
      'https://t.me/mate_bot_open/9438',
      'https://t.me/mate_bot_open/9439',
      'https://t.me/mate_bot_open/9440',
      'https://t.me/mate_bot_open/9441',
      'https://t.me/mate_bot_open/9442',
      'https://t.me/mate_bot_open/9443',
    ],
    // Группа 2: 2/11/20/29
    2: [
      'https://t.me/mate_bot_open/9444',
      'https://t.me/mate_bot_open/9445',
      'https://t.me/mate_bot_open/9446',
      'https://t.me/mate_bot_open/9447',
      'https://t.me/mate_bot_open/9448',
      'https://t.me/mate_bot_open/9449',
    ],
    // Группа 3: 3/12/21/30
    3: [
      'https://t.me/mate_bot_open/9450',
      'https://t.me/mate_bot_open/9451',
      'https://t.me/mate_bot_open/9452',
      'https://t.me/mate_bot_open/9453',
      'https://t.me/mate_bot_open/9454',
      'https://t.me/mate_bot_open/9455',
    ],
    // Группа 4: 4/13/22/31
    4: [
      'https://t.me/mate_bot_open/9456',
      'https://t.me/mate_bot_open/9457',
      'https://t.me/mate_bot_open/9458',
      'https://t.me/mate_bot_open/9459',
      'https://t.me/mate_bot_open/9460',
      'https://t.me/mate_bot_open/9461',
    ],
    // Группа 5: 5/14/23
    5: [
      'https://t.me/mate_bot_open/9462',
      'https://t.me/mate_bot_open/9463',
      'https://t.me/mate_bot_open/9464',
      'https://t.me/mate_bot_open/9465',
      'https://t.me/mate_bot_open/9466',
      'https://t.me/mate_bot_open/9467',
    ],
    // Группа 6: 6/15/24
    6: [
      'https://t.me/mate_bot_open/9468',
      'https://t.me/mate_bot_open/9469',
      'https://t.me/mate_bot_open/9470',
      'https://t.me/mate_bot_open/9471',
      'https://t.me/mate_bot_open/9472',
      'https://t.me/mate_bot_open/9473',
    ],
    // Группа 7: 7/16/25
    7: [
      'https://t.me/mate_bot_open/9474',
      'https://t.me/mate_bot_open/9475',
      'https://t.me/mate_bot_open/9476',
      'https://t.me/mate_bot_open/9477',
      'https://t.me/mate_bot_open/9478',
      'https://t.me/mate_bot_open/9479',
    ],
    // Группа 8: 8/17/26
    8: [
      'https://t.me/mate_bot_open/9480',
      'https://t.me/mate_bot_open/9481',
      'https://t.me/mate_bot_open/9482',
      'https://t.me/mate_bot_open/9483',
      'https://t.me/mate_bot_open/9484',
      'https://t.me/mate_bot_open/9485',
    ],
    // Группа 9: 9/18/27
    9: [
      'https://t.me/mate_bot_open/9486',
      'https://t.me/mate_bot_open/9487',
      'https://t.me/mate_bot_open/9488',
      'https://t.me/mate_bot_open/9489',
      'https://t.me/mate_bot_open/9490',
      'https://t.me/mate_bot_open/9491',
    ],
  };

  return scaleImages[styleGroup] || [];
}

const ARCHETYPES: { [key: number]: { name: string; images: string[]; text: string } } = {
  1: {
    name: 'Исида',
    images: [
      'https://t.me/mate_bot_open/9493',
      'https://t.me/mate_bot_open/9494',
      'https://t.me/mate_bot_open/9495',
      'https://t.me/mate_bot_open/9496',
      'https://t.me/mate_bot_open/9497',
      'https://t.me/mate_bot_open/9498',
      'https://t.me/mate_bot_open/9499',
    ],
    text: `<b>✨ Рождённые 1 числа любого месяца — архетип Исиды ✨</b>\n\n<b>Роль: Инициатор / Архитектор реальности</b>\n(тот, кто запускает, задаёт направление и формирует основу системы)\n\nЧитай полную расшифровку выше ☝️\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  2: {
    name: 'Геката',
    images: [
      'https://t.me/mate_bot_open/9500',
      'https://t.me/mate_bot_open/9501',
      'https://t.me/mate_bot_open/9502',
      'https://t.me/mate_bot_open/9503',
      'https://t.me/mate_bot_open/9504',
      'https://t.me/mate_bot_open/9505',
      'https://t.me/mate_bot_open/9506',
    ],
    text: `<b>🌙 Рождённые 2 числа — архетип Гекаты 🌙</b>\n\n<b>Роль: Навигатор / Стратег скрытых процессов</b>\n<i>Человек, который ориентируется в неопределённости, видит развилки и помогает выбирать верное направление.</i>\n\nЧитай полную расшифровку выше ☝️\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  3: {
    name: 'Афродита',
    images: [
      'https://t.me/mate_bot_open/9507',
      'https://t.me/mate_bot_open/9508',
      'https://t.me/mate_bot_open/9509',
      'https://t.me/mate_bot_open/9510',
      'https://t.me/mate_bot_open/9511',
      'https://t.me/mate_bot_open/9512',
    ],
    text: `<b>💗 Рождённые 3 и 30 числа — архетип Афродиты 💗</b>\n\n<b>Роль: Коммуникатор / Создатель ценности и притяжения</b>\n<i>Человек, который усиливает ценность через контакт, эмоцию, образ и умение вызывать желание.</i>\n\nЧитай полную расшифровку выше ☝️\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  4: {
    name: 'Гера',
    images: [
      'https://t.me/mate_bot_open/9513',
      'https://t.me/mate_bot_open/9514',
      'https://t.me/mate_bot_open/9515',
      'https://t.me/mate_bot_open/9516',
      'https://t.me/mate_bot_open/9517',
      'https://t.me/mate_bot_open/9518',
    ],
    text: `<b>👑 Рождённые 4 и 31 числа — архетип Геры 👑</b>\n\n<b>Роль: Строитель / Хранитель структуры и устойчивости</b>\n<i>Человек, который создаёт порядок, систему и долгосрочную опору — в проектах, деньгах и жизни.</i>\n\nЧитай полную расшифровку выше ☝️\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  5: {
    name: 'Бригита',
    images: [
      'https://t.me/mate_bot_open/9519',
      'https://t.me/mate_bot_open/9520',
      'https://t.me/mate_bot_open/9521',
      'https://t.me/mate_bot_open/9522',
      'https://t.me/mate_bot_open/9523',
      'https://t.me/mate_bot_open/9524',
    ],
    text: `<b>🔥 Рождённые 5 и 23 числа — архетип Бригиты 🔥</b>\n\n<b>Роль: Катализатор / Двигатель изменений</b>\n<i>Человек, который запускает движение, оживляет процессы и приносит энергию роста.</i>\n\nЧитай полную расшифровку выше ☝️\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  6: {
    name: 'Фрейя',
    images: [
      'https://t.me/mate_bot_open/9525',
      'https://t.me/mate_bot_open/9526',
      'https://t.me/mate_bot_open/9527',
      'https://t.me/mate_bot_open/9528',
      'https://t.me/mate_bot_open/9529',
      'https://t.me/mate_bot_open/9530',
    ],
    text: `<b>💞 Рождённые 6 и 24 числа — архетип Фрейи 💞</b>\n\n<b>Роль: Магнит ценности / Управляющий ресурсами</b>\n<i>Человек, который притягивает ресурсы, выстраивает обмен и умеет превращать внимание и доверие в стабильную ценность.</i>\n\nЧитай полную расшифровку выше ☝️\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  7: {
    name: 'Дурга',
    images: [
      'https://t.me/mate_bot_open/9531',
      'https://t.me/mate_bot_open/9532',
      'https://t.me/mate_bot_open/9533',
      'https://t.me/mate_bot_open/9534',
      'https://t.me/mate_bot_open/9535',
      'https://t.me/mate_bot_open/9536',
    ],
    text: `<b>⚔️ Рождённые 7 и 25 числа — архетип Дурги ⚔️</b>\n\n<b>Роль: Защитник / Прорывной стратег</b>\n<i>Человек, который видит угрозы, выдерживает давление и способен идти через кризисы, не ломаясь.</i>\n\nЧитай полную расшифровку выше ☝️\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  8: {
    name: 'Сехмет',
    images: [
      'https://t.me/mate_bot_open/9537',
      'https://t.me/mate_bot_open/9538',
      'https://t.me/mate_bot_open/9539',
      'https://t.me/mate_bot_open/9540',
      'https://t.me/mate_bot_open/9541',
      'https://t.me/mate_bot_open/9542',
    ],
    text: `<b>🦁 Рождённые 8 и 26 числа — архетип Сехмет 🦁</b>\n\n<b>Роль: Лидер силы / Управляющий ресурсами и властью</b>\n<i>Человек, который умеет концентрировать силу, брать ответственность и управлять большими объёмами ресурсов и влияния.</i>\n\nЧитай полную расшифровку выше ☝️\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  9: {
    name: 'Веста',
    images: [
      'https://t.me/mate_bot_open/9543',
      'https://t.me/mate_bot_open/9544',
      'https://t.me/mate_bot_open/9545',
      'https://t.me/mate_bot_open/9546',
      'https://t.me/mate_bot_open/9547',
      'https://t.me/mate_bot_open/9548',
    ],
    text: `<b>🔥 Рождённые 9 и 27 числа — архетип Весты 🔥</b>\n\n<b>Роль: Хранитель смысла / Проводник ценностей</b>\n<i>Человек, который удерживает внутренний огонь, смысл и направление, когда другие теряются.</i>\n\nЧитай полную расшифровку выше ☝️\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  10: {
    name: 'Тюхе',
    images: [
      'https://t.me/mate_bot_open/9549',
      'https://t.me/mate_bot_open/9550',
      'https://t.me/mate_bot_open/9551',
      'https://t.me/mate_bot_open/9552',
      'https://t.me/mate_bot_open/9553',
      'https://t.me/mate_bot_open/9554',
    ],
    text: `<b>🍀 Рождённые 10 и 28 числа — архетип Тюхе🍀</b>\n\n<b>Роль: Навигатор возможностей / Управляющий циклами удачи.</b> <i>Человек, который чувствует момент, умеет входить в поток возможностей и разворачивать случай в результат.</i>\n\nЧитай полную расшифровку выше ☝️\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  11: {
    name: 'Астрея',
    images: [
      'https://t.me/mate_bot_open/9555',
      'https://t.me/mate_bot_open/9556',
      'https://t.me/mate_bot_open/9557',
      'https://t.me/mate_bot_open/9558',
      'https://t.me/mate_bot_open/9559',
      'https://t.me/mate_bot_open/9560',
    ],
    text: `<b>⚖️ Рождённые 11 и 29 числа — архетип Астреи ⚖️</b>\n\n<b>Арбитр / Носитель справедливости и баланса</b>\n<i>Человек, который чувствует истину, видит искажения и стремится выровнять систему — в людях, решениях и процессах.</i>\n\nЧитай полную расшифровку выше ☝️\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  12: {
    name: 'Инанна',
    images: [
      'https://t.me/mate_bot_open/9561',
      'https://t.me/mate_bot_open/9562',
      'https://t.me/mate_bot_open/9563',
      'https://t.me/mate_bot_open/9564',
      'https://t.me/mate_bot_open/9565',
      'https://t.me/mate_bot_open/9566',
    ],
    text: `<b>💫 Рождённые 12 числа — архетип Инанны 💫</b>\n\n<b>Роль: Трансформатор / Проводник силы через опыт</b>\n<i>Человек, который проходит через изменения, кризисы и рост и умеет превращать личный опыт в влияние, ценность и результат.</i>\n\nЧитай полную расшифровку выше ☝️\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  13: {
    name: 'Хель',
    images: [
      'https://t.me/mate_bot_open/9567',
      'https://t.me/mate_bot_open/9568',
      'https://t.me/mate_bot_open/9569',
      'https://t.me/mate_bot_open/9570',
      'https://t.me/mate_bot_open/9571',
      'https://t.me/mate_bot_open/9572',
      'https://t.me/mate_bot_open/9573',
    ],
    text: `<b>🖤 Рождённые 13 числа — архетип Хель 🖤</b>\n\n<b>Роль: Проводник переходов / Хранитель границ / Архитектор завершений</b>\nЧеловек, который умеет работать с тем, от чего другие отворачиваются: концами, потерями, тенью, кризисами и точками невозврата. Ты не про «светлое и приятное», ты про <b>честное и настоящее.</b>\n\nЧитай полную расшифровку выше ☝️\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  14: {
    name: 'Ирида',
    images: [
      'https://t.me/mate_bot_open/9574',
      'https://t.me/mate_bot_open/9575',
      'https://t.me/mate_bot_open/9576',
      'https://t.me/mate_bot_open/9577',
      'https://t.me/mate_bot_open/9578',
      'https://t.me/mate_bot_open/9579',
      'https://t.me/mate_bot_open/9580',
    ],
    text: `<b>🌈 Рождённые 14 числа — архетип Ириды 🌈</b>\n\n<b>Роль: Коммуникатор / Соединитель миров / Переводчик смыслов</b>\nЧеловек, который умеет связывать разные уровни: людей, идеи, системы и смыслы. Ты — мост между внутренним и внешним, сложным и понятным, хаосом и структурой.\n\nЧитай полную расшифровку выше ☝️\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  15: {
    name: 'Лилит',
    images: [
      'https://t.me/mate_bot_open/9581',
      'https://t.me/mate_bot_open/9582',
      'https://t.me/mate_bot_open/9583',
      'https://t.me/mate_bot_open/9584',
      'https://t.me/mate_bot_open/9585',
      'https://t.me/mate_bot_open/9586',
      'https://t.me/mate_bot_open/9587',
    ],
    text: `<b>🔥 Рождённые 15 числа — архетип Лилит 🔥</b>\n\n<b>Роль: Автономная сила / Носительница запретной правды / Личность вне рамок</b>\nЧеловек, который не вписывается в чужие ожидания и не живёт по навязанным сценариям. Твоя задача — быть собой даже там, где это неудобно.\n\nЧитай полную расшифровку выше ☝️\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  16: {
    name: 'Кали',
    images: [
      'https://t.me/mate_bot_open/9588',
      'https://t.me/mate_bot_open/9589',
      'https://t.me/mate_bot_open/9590',
      'https://t.me/mate_bot_open/9591',
      'https://t.me/mate_bot_open/9592',
      'https://t.me/mate_bot_open/9593',
      'https://t.me/mate_bot_open/9594',
    ],
    text: `<b>🔥 Рождённые 16 числа — архетип Кали 🔥</b>\n\n<b>Роль: Разрушитель старого / Инициатор радикальных перемен / Освободитель от иллюзий</b>\nЧеловек, который приходит, когда прежнее больше не работает. Ты не поддерживаешь форму — ты проверяешь её на живучесть.\n\nЧитай полную расшифровку выше ☝️\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  17: {
    name: 'Нут',
    images: [
      'https://t.me/mate_bot_open/9595',
      'https://t.me/mate_bot_open/9596',
      'https://t.me/mate_bot_open/9597',
      'https://t.me/mate_bot_open/9598',
      'https://t.me/mate_bot_open/9599',
      'https://t.me/mate_bot_open/9600',
      'https://t.me/mate_bot_open/9601',
    ],
    text: `<b>✨ Рождённые 17 числа — архетип Нут ✨</b>\n\n<b>Роль: Хранитель пространства / Создатель контекста / Расширитель горизонтов</b>\nЧеловек, который удерживает большое поле возможностей, видит перспективу и создаёт пространство, в котором другие могут расти.\n\nЧитай полную расшифровку выше ☝️\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  18: {
    name: 'Селена',
    images: [
      'https://t.me/mate_bot_open/9602',
      'https://t.me/mate_bot_open/9603',
      'https://t.me/mate_bot_open/9604',
      'https://t.me/mate_bot_open/9605',
      'https://t.me/mate_bot_open/9606',
      'https://t.me/mate_bot_open/9607',
      'https://t.me/mate_bot_open/9608',
    ],
    text: `<b>🌙 Рождённые 18 числа — архетип Селены 🌙</b>\n\n<b>Роль: Отражатель / Проводник чувств и состояний / Настройщик эмоционального поля</b>\nЧеловек, который тонко чувствует внутренние процессы — свои и чужие — и умеет работать с эмоциями, циклами и состояниями.\n\nЧитай полную расшифровку выше ☝️\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  19: {
    name: 'Аматэрасу',
    images: [
      'https://t.me/mate_bot_open/9609',
      'https://t.me/mate_bot_open/9610',
      'https://t.me/mate_bot_open/9611',
      'https://t.me/mate_bot_open/9612',
      'https://t.me/mate_bot_open/9613',
      'https://t.me/mate_bot_open/9614',
    ],
    text: `<b>☀️ Рождённые 19 числа — архетип Аматэрасу ☀️</b>\n\n<b>Роль: Источник света / Лидер присутствия / Точка ясности</b> Человек, который освещает пространство — своим присутствием, ясностью и способностью задавать тон.\n\nЧитай полную расшифровку выше ☝️\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку<b> стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  20: {
    name: 'Маат',
    images: [
      'https://t.me/mate_bot_open/9615',
      'https://t.me/mate_bot_open/9616',
      'https://t.me/mate_bot_open/9617',
      'https://t.me/mate_bot_open/9618',
      'https://t.me/mate_bot_open/9619',
      'https://t.me/mate_bot_open/9620',
    ],
    text: `<b>⚖️ Рождённые 20 числа — архетип Маат ⚖️</b>\n\n<b>Роль: Хранитель баланса / Архитектор гармоничных систем</b>\nЧеловек, который чувствует меру, справедливость и умеет выстраивать устойчивые, честные структуры — в делах, отношениях и жизни.\n\nЧитай полную расшифровку выше ☝️\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  21: {
    name: 'Деметра',
    images: [
      'https://t.me/mate_bot_open/9621',
      'https://t.me/mate_bot_open/9622',
      'https://t.me/mate_bot_open/9623',
      'https://t.me/mate_bot_open/9624',
      'https://t.me/mate_bot_open/9625',
      'https://t.me/mate_bot_open/9626',
    ],
    text: `<b>🌾 Рождённые 21 числа — архетип Деметры 🌾</b>\n\n<b>Роль: Питатель / Создатель роста и изобилия</b>\nЧеловек, который умеет выращивать — людей, проекты, системы и долгосрочные результаты.\n\nЧитай полную расшифровку выше ☝️\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  22: {
    name: 'Персефона',
    images: [
      'https://t.me/mate_bot_open/9627',
      'https://t.me/mate_bot_open/9628',
      'https://t.me/mate_bot_open/9629',
      'https://t.me/mate_bot_open/9630',
      'https://t.me/mate_bot_open/9631',
      'https://t.me/mate_bot_open/9632',
    ],
    text: `<b>🌸 Рождённые 22 числа — архетип Персефоны 🌸</b>\n\n<b>Роль: Проводник между мирами / Медиатор изменений / Носитель двойной природы</b>\nЧеловек, который одновременно чувствует свет и тень, рост и кризис, начало и завершение. Ты умеешь быть на границе состояний и проводить через неё других.\n\nЧитай полную расшифровку выше ☝️\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
};

// ============================================================================
// 🆕 СПЕЦИАЛЬНАЯ ВОРОНКА ДЛЯ ИМПОРТИРОВАННЫХ ПОЛЬЗОВАТЕЛЕЙ
// Пользователи с isPro=true но без onboardingStep - проходят воронку без покупки
// ============================================================================

/**
 * Запуск воронки для импортированных пользователей (с уже активной подпиской)
 * Отличие от обычной воронки: после roadmap показывается "Ключ принят" вместо покупки
 */
export async function startClubFunnelForImported(userId: string, chatId: number, telegramId: number) {
  // Сбрасываем тестовый режим
  setTestMode(false);

  await getOrCreateClubProgress(userId, telegramId);

  // 🧹 Очистка всех запланированных задач
  await schedulerService.cancelUserTasksByTypes(telegramId, [
    'club_auto_progress',
    'start_reminder',
    'five_min_reminder',
    'burning_question_reminder',
    'payment_reminder',
    'final_reminder',
    'day2_reminder',
    'day3_reminder',
    'day4_reminder',
    'day5_final',
  ]);

  logger.info({ userId, telegramId, isImported: true }, 'Club funnel for imported user started');

  const keyboard = new InlineKeyboard().text('Готов(а) 🚀', 'club_ready_imported');

  // Сообщение 1 с картинкой - слегка изменённый текст для импортированных
  await getTelegramService().sendPhoto(
    chatId,
    'https://t.me/mate_bot_open/9346',
    {
      caption: `<b>Ты на старте своего маршрута 🧭</b>\n\n` +
        `У каждого человека есть свой путь.\n` +
        `Сейчас ты увидишь <b>своего персонажа</b> — как ты движешься к деньгам и реализации ✨\n\n` +
        `Пройди бота до конца, чтобы:\n` +
        `— понять, из какой роли ты действуешь\n` +
        `— увидеть свой маршрут\n` +
        `— получить <b>доступ ко всем материалам клуба</b> 🎁\n\n` +
        `<b>Готова посмотреть на себя без иллюзий и ожиданий? 👇</b>\n` +
        `<i>Важно: если бот отвечает не сразу, не нажимай кнопку повторно — иногда ему нужно чуть больше времени, чтобы всё корректно собрать ⏳</i>`,
      parse_mode: 'HTML',
      reply_markup: keyboard,
    }
  );

  await updateClubProgress(userId, { currentStep: 'awaiting_ready' });

  await schedulerService.schedule(
    { type: 'club_auto_progress', userId: telegramId, chatId: chatId, data: { odUserId: userId, step: 'ready_imported', isImported: true } },
    getButtonTimeout()
  );
}

/**
 * Показать roadmap для импортированных с кнопкой "Начать маршрут" -> "Ключ принят"
 */
export async function handleClubGetRoadmapImported(userId: string, chatId: number) {
  const keyboard12 = new InlineKeyboard().text('👉 Начать маршрут', 'club_start_route_imported');

  // Получаем дату рождения из прогресса для генерации картинки
  const progress = await getClubProgress(userId);
  const birthDate = progress?.birthDate;

  const message12Text =
    `Это <b>твоя дорожная карта на год 😍</b>\n\n` +
    `Если идти по ней шаг за шагом,\n` +
    `ты переходишь <b>из точки А в точку Б:</b>\n\n` +
    `— из хаоса → в систему\n` +
    `— из нестабильного дохода → в устойчивый доход 💰\n` +
    `— из сомнений → в ясную позицию\n` +
    `— из потенциала → в реализованный результат\n\n` +
    `<b>Готова узнать свое предназначение и активировать свой КОД УСПЕХА? 💰</b>`;

  // Генерируем картинку дорожной карты
  const roadmapImage = birthDate ? await generateRoadmap(birthDate) : null;

  if (roadmapImage) {
    await getTelegramService().sendPhoto(chatId, roadmapImage, {
      caption: message12Text,
      parse_mode: 'HTML',
      reply_markup: keyboard12,
    });
  } else {
    await getTelegramService().sendMessage(chatId, message12Text, {
      parse_mode: 'HTML',
      reply_markup: keyboard12,
    });
  }

  await updateClubProgress(userId, { currentStep: 'showing_roadmap' });

  const telegramUserId = await getTelegramUserId(userId);
  await schedulerService.schedule(
    { type: 'club_auto_progress', userId: telegramUserId, chatId: chatId, data: { odUserId: userId, step: 'welcome_imported', isImported: true } },
    getFinalTimeout()
  );
}

/**
 * Финальный шаг для импортированных - показать видео с кодовым словом
 * После ввода кода пользователь получит "Ключ принят"
 */
export async function handleClubStartRouteImported(userId: string, chatId: number) {
  logger.info({ userId, chatId }, 'handleClubStartRouteImported: START - showing keyword video');

  // Отменяем все задачи club воронки
  const telegramUserId = await getTelegramUserId(userId);
  await schedulerService.cancelUserTasksByType(telegramUserId, 'club_auto_progress');

  // Обновляем статус пользователя - ожидаем кодовое слово
  await db
    .update(users)
    .set({ onboardingStep: 'awaiting_keyword' })
    .where(eq(users.id, userId));

  // Отправляем видео с сообщением о кодовом слове
  await getTelegramService().sendVideo(
    chatId,
    'https://t.me/mate_bot_open/9644',
    {
      caption: `«Ты начинаешь погружение в <b>«Код успеха. Глава: Пробуждение»</b> ✨\n\n` +
        `Чтобы двери нашей экосистемы открылись, тебе нужно принять её правила.\n\n` +
        `🎥 Посмотри видео Кристины <b>до самого конца.</b> Кристина расскажет, как устроена наша Вселенная: где искать ключи, как работает супер-апп и как найти свою стаю 😄 (чаты городов и десятки).\n\n` +
        `<b>🗝 Внимание: внутри видео спрятан секретный Ключ (кодовое слово). Без него я не смогу выдать тебе доступы к материалам и закрытым чатам.</b>\n\n` +
        `Смотри внимательно. <i>Как только услышишь слово — пиши его мне в ответ 👇🏼</i>»`,
      parse_mode: 'HTML'
    }
  );

  // Планируем догревы для кодового слова через 20, 80, 200 минут
  await schedulerService.schedule(
    { type: 'keyword_reminder_20m', userId: telegramUserId, chatId },
    20 * 60 * 1000 // 20 минут
  );

  await schedulerService.schedule(
    { type: 'keyword_reminder_60m', userId: telegramUserId, chatId },
    80 * 60 * 1000 // 80 минут от начала
  );

  await schedulerService.schedule(
    { type: 'keyword_reminder_120m', userId: telegramUserId, chatId },
    200 * 60 * 1000 // 200 минут от начала
  );

  // Не обновляем clubFunnelProgress здесь - статус хранится в users.onboardingStep = 'awaiting_keyword'
  // После ввода кодового слова пользователь перейдёт в handleKeywordSuccess

  logger.info({ userId, chatId }, 'handleClubStartRouteImported: COMPLETE - keyword video sent, reminders scheduled');
}

/**
 * Обработка авто-прогресса для импортированных пользователей
 */
export async function handleClubAutoProgressImported(
  userId: string,
  chatId: number,
  step: string
) {
  // 🚫 Игнорируем групповые чаты и каналы (chatId < 0)
  if (chatId < 0) {
    logger.info({ userId, chatId, step }, 'Ignoring club auto-progress imported for group chat/channel');
    return;
  }

  const progress = await getClubProgress(userId);
  const currentStep = progress?.currentStep;

  logger.info({ userId, chatId, step, currentStep, isImported: true }, 'Club auto-progress imported triggered');

  switch (step) {
    case 'ready_imported':
      if (currentStep === 'awaiting_ready') {
        await handleClubReady(userId, chatId);
      }
      break;
    case 'roadmap_imported':
      if (currentStep === 'showing_scale') {
        await handleClubGetRoadmapImported(userId, chatId);
      }
      break;
    case 'welcome_imported':
      if (currentStep === 'showing_roadmap') {
        await handleClubStartRouteImported(userId, chatId);
      }
      break;
  }
}

// ============================================================================
// 🎭 ВОРОНКА ТЕСТА ПЕРСОНАЖА (БЕЗ ПРОДАЖИ)
// Доступна всем пользователям через кнопку "Пройти тест: какой я персонаж"
// ============================================================================

/**
 * Запуск воронки теста персонажа
 */
export async function startCharacterTestFunnel(userId: string, chatId: number, telegramUserId: number) {
  // Создаём или обновляем прогресс воронки
  await getOrCreateClubProgress(userId, telegramUserId);

  // Устанавливаем тип воронки = character_test
  await setFunnelType(telegramUserId, 'character_test');

  // Отправляем запрос даты рождения
  await getTelegramService().sendPhoto(
    chatId,
    'https://t.me/mate_bot_open/9347',
    {
      caption: `<b>С этого момента путь уже запущен.</b>\n\n` +
        `Первый шаг сделан — и это главное.\n\n` +
        `По дате рождения ты получишь расшифровку:\n` +
        `— <b>твоего архетипа</b> — из какой роли ты действуешь\n` +
        `— <b>твоего стиля</b> — как ты проявляешься и считываешься людьми\n` +
        `— <b>твоего масштаба</b> — где твой потенциал и точка роста\n\n` +
        `Для этого <b>МНЕ НУЖНА ТВОЯ ДАТА РОЖДЕНИЯ.</b>\n` +
        `Она отражает твой внутренний ритм и способ принимать решения 🧠\n\n` +
        `Введи дату рождения в формате <b>ДД.ММ.ГГГГ</b>\n` +
        `Например: <i>14.07.1994</i>\n\n` +
        `<b>Впиши свою дату рождения в поле ниже 👇</b>`,
      parse_mode: 'HTML',
    }
  );

  await updateClubProgress(userId, { currentStep: 'awaiting_birthdate' });
  logger.info({ userId, chatId }, 'Character test funnel started - awaiting birthdate');
}

/**
 * Показать финальное сообщение теста (дорожная карта без продажи)
 */
export async function handleCharacterTestFinal(userId: string, chatId: number) {
  const progress = await getClubProgress(userId);
  const birthDate = progress?.birthDate;

  // Генерируем дорожную карту
  const roadmapImage = birthDate ? await generateRoadmap(birthDate) : null;

  const finalText =
    `<b>Это твоя дорожная карта на год 😍</b>\n\n` +
    `Если идти по ней шаг за шагом,\n` +
    `ты переходишь из точки А в точку Б:\n\n` +
    `— из хаоса → в систему\n` +
    `— из нестабильного дохода → в устойчивый доход 💰\n` +
    `— из сомнений → в ясную позицию\n` +
    `— из потенциала → в реализованный результат\n\n` +
    `<b>Сохрани эту карту и возвращайся к ней ✨</b>`;

  if (roadmapImage) {
    await getTelegramService().sendPhoto(chatId, roadmapImage, {
      caption: finalText,
      parse_mode: 'HTML',
    });
  } else {
    await getTelegramService().sendMessage(chatId, finalText, {
      parse_mode: 'HTML',
    });
  }

  await updateClubProgress(userId, { currentStep: 'character_test_complete' });
  logger.info({ userId, chatId }, 'Character test funnel completed');
}

/**
 * Показать масштаб в тесте персонажа (без кнопки продажи, с кнопкой на финал)
 */
export async function handleCharacterTestScale(userId: string, chatId: number) {
  // Эмодзи
  try {
    await getTelegramService().sendAnimation(chatId, VIDEO_NOTE_EMOJI);
  } catch (e) {
    logger.warn({ error: e }, 'Failed to send video note');
  }

  const progress = await getClubProgress(userId);
  if (!progress?.birthDayNumber) return;

  const styleGroup = getStyleGroup(progress.birthDayNumber);

  // Картинки масштаба
  const scaleImages = getScaleImages(styleGroup);
  if (scaleImages.length > 0) {
    await getTelegramService().sendMediaGroup(
      chatId,
      scaleImages.map((url) => ({ type: 'photo', media: url }))
    );
  }

  const keyboard = new InlineKeyboard().text('👉 Узнать свою точку роста', 'character_test_final');

  await getTelegramService().sendMessage(
    chatId,
    `Прочитав расшифровку <b>своего масштаба по дате рождения</b> выше, ты могла почувствовать, <b>в чём твоя сила и как тебе легче расти ✨</b>\n\n` +
    `И обычно в этот момент возникает другое ощущение 👇\n` +
    `что возможностей больше, чем реализовано.\n\n` +
    `Хочется понять:\n` +
    `— где именно сейчас твой потенциал не включён\n` +
    `— почему деньги и рост идут неравномерно 💸\n` +
    `— и что в тебе уже готово к следующему шагу 🚀\n\n` +
    `⬇️ Нажми кнопку ниже,\n` +
    `забери свои монетки 🪙\n` +
    `и посмотри, <b>что для тебя открывается дальше ✨</b>`,
    { parse_mode: 'HTML', reply_markup: keyboard }
  );

  await updateClubProgress(userId, { currentStep: 'character_test_scale' });
}

/**
 * Показать стиль в тесте персонажа (с кнопкой на масштаб теста)
 */
export async function handleCharacterTestStyle(userId: string, chatId: number) {
  // Эмодзи
  try {
    await getTelegramService().sendAnimation(chatId, VIDEO_NOTE_EMOJI);
  } catch (e) {
    logger.warn({ error: e }, 'Failed to send video note');
  }

  const progress = await getClubProgress(userId);
  if (!progress?.birthDayNumber) {
    logger.error({ userId }, 'No birth day found');
    return;
  }

  const styleGroup = getStyleGroup(progress.birthDayNumber);

  // Картинки стиля
  const styleImages = getStyleImages(styleGroup);
  if (styleImages.length > 0) {
    try {
      await getTelegramService().sendMediaGroup(
        chatId,
        styleImages.map((url) => ({ type: 'photo', media: url }))
      );
    } catch (e) {
      logger.warn({ error: e, styleGroup }, 'Failed to send style media group');
    }
  }

  const keyboard = new InlineKeyboard().text('👉 Где мой масштаб', 'character_test_scale');

  await getTelegramService().sendMessage(
    chatId,
    `<b>✨ Прочитай расшифровку своего стиля выше.</b>\n` +
    `Эти образы и смыслы можно сохранить —\n` +
    `чтобы возвращаться к ним и <b>не терять своё ощущение себя 🤍</b>\n\n` +
    `Это то, <b>как ты уже влияешь на людей и пространство —</b>\n` +
    `даже если раньше не всегда это осознавала.\n\n` +
    `Но стиль — это лишь форма\n` +
    `Самое интересное — глубже 👇\n\n` +
    `<b>💥 Где твой масштаб?</b>\n` +
    `Где твои деньги, рост и реализация?\n\n` +
    `Давай посмотрим, <b>какой уровень тебе действительно доступен —</b>\n` +
    `по твоей дате рождения 🔍\n\n` +
    `⬇️ Нажми кнопку ниже, чтобы получить следующую расшифровку.`,
    { parse_mode: 'HTML', reply_markup: keyboard }
  );

  await updateClubProgress(userId, { currentStep: 'character_test_style' });
}

/**
 * Показать архетип в тесте персонажа (с кнопкой на стиль теста)
 */
export async function handleCharacterTestArchetype(userId: string, chatId: number) {
  const progress = await getClubProgress(userId);
  if (!progress?.archetypeNumber) {
    logger.error({ userId }, 'No archetype number found');
    return;
  }

  const archetype = ARCHETYPES[progress.archetypeNumber];
  if (!archetype) {
    logger.error({ archetypeNumber: progress.archetypeNumber }, 'Unknown archetype');
    return;
  }

  const keyboard = new InlineKeyboard().text('👉 Получить расшифровку стиля', 'character_test_style');

  try {
    // Отправляем картинки как media group
    if (archetype.images && archetype.images.length > 0) {
      await getTelegramService().sendMediaGroup(
        chatId,
        archetype.images.map((url) => ({ type: 'photo', media: url }))
      );
    }

    await getTelegramService().sendMessage(chatId, archetype.text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  } catch (e) {
    await getTelegramService().sendMessage(chatId, archetype.text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  }

  await updateClubProgress(userId, { currentStep: 'character_test_archetype' });
}

/**
 * Обработка подтверждения даты рождения в тесте персонажа
 */
export async function handleCharacterTestBirthDateConfirmed(userId: string, chatId: number, birthDate: string) {
  const birthDay = getBirthDay(birthDate);
  const archetypeNumber = getArchetypeNumber(birthDay);

  await updateClubProgress(userId, {
    birthDate,
    birthDayNumber: birthDay,
    archetypeNumber,
    currentStep: 'character_test_birthdate_confirmed',
  });

  // Генерируем звезду
  const starImage = await generateStar(birthDate);

  // Вычисляем архетип по дню рождения
  const archetypeFromDay = getBirthDayArchetype(birthDay);

  await updateClubProgress(userId, {
    chislo: archetypeFromDay,
  });

  const message4Text =
    `Перед тобой — <b>твоя личная карта ✨</b>\n\n` +
    `Круги и цифры на звезде — это <b>числа из твоей даты рождения 🔢</b>\n` +
    `Они показывают, как ты думаешь, принимаешь решения и <b>как у тебя устроены сферы денег, отношений и здоровья.</b>\n\n` +
    `Важно понимать:\n` +
    `у кого-то эта система <b>работает и даёт результат,</b>\n` +
    `а у кого-то — есть, но почти не включена ⚠️\n\n` +
    `Эта карта показывает <b>потенциал 🌱</b>\n` +
    `Но потенциал ≠ реализация.\n\n` +
    `Дальше ты получишь персональную расшифровку:\n` +
    `— твоего <b>архетипа</b>\n` +
    `— <b>стиля проявления</b>\n` +
    `— и <b>твоего масштаба</b>\n\n` +
    `<b>Если хочешь включить эту систему —\nжми кнопку ниже 👇</b>`;

  const keyboard = new InlineKeyboard().text('хочу активировать свой потенциал', 'character_test_activate');

  if (starImage) {
    await getTelegramService().sendPhoto(chatId, starImage, {
      caption: message4Text,
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  } else {
    await getTelegramService().sendMessage(chatId, message4Text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  }

  await updateClubProgress(userId, { currentStep: 'character_test_showing_star' });
}
