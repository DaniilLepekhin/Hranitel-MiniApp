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

const CHANNEL_USERNAME = '@kristina_egiazarovaaa1407';
const STAR_WEBHOOK_URL = 'https://n8n4.daniillepekhin.ru/webhook/zvezda_club_generated';
const BIRTHDATE_REGEX = /^(0[1-9]|[12][0-9]|3[01])\.(0[1-9]|1[012])\.((19|20)\d\d)$/;
const VIDEO_NOTE_EMOJI = 'https://t.me/mate_bot_open/9319';

// Таймауты в миллисекундах
const BUTTON_TIMEOUT = 300 * 1000; // 5 минут
const FINAL_TIMEOUT = 120 * 1000; // 2 минуты

// WebApp URL для покупки
const WEBAPP_PURCHASE_URL = 'https://ishodnyi-kod.com/webappclubik';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Получить Telegram user ID (number) из UUID userId
 */
async function getTelegramUserId(userId: string): Promise<number> {
  const progress = await getClubProgress(userId);
  if (progress?.telegramId) {
    return parseInt(progress.telegramId, 10);
  }
  // Fallback: получить из users таблицы
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user ? parseInt(user.telegramId, 10) : 0;
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

async function getOrCreateClubProgress(userId: string, telegramId: string) {
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
    const member = await getTelegramService().getChatMember(CHANNEL_USERNAME, userId);
    if (!member) return false;
    return ['member', 'administrator', 'creator'].includes(member.status);
  } catch (error) {
    logger.error({ error, userId }, 'Error checking channel subscription');
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


// ============================================================================
// СООБЩЕНИЕ 1: СТАРТ ВОРОНКИ
// ============================================================================

export async function startClubFunnel(userId: string, chatId: number, telegramId: string) {
  await getOrCreateClubProgress(userId, telegramId);

  // 🧹 Очистка всех запланированных задач при перезапуске (club + обычная воронка)
  const telegramUserId = parseInt(telegramId, 10);

  // Club воронка
  await schedulerService.cancelUserTasksByType(telegramUserId, 'club_auto_progress');

  // Обычная воронка (все типы задач)
  await schedulerService.cancelUserTasksByType(telegramUserId, 'start_reminder');
  await schedulerService.cancelUserTasksByType(telegramUserId, 'five_min_reminder');
  await schedulerService.cancelUserTasksByType(telegramUserId, 'burning_question_reminder');
  await schedulerService.cancelUserTasksByType(telegramUserId, 'payment_reminder');
  await schedulerService.cancelUserTasksByType(telegramUserId, 'final_reminder');
  await schedulerService.cancelUserTasksByType(telegramUserId, 'day2_reminder');
  await schedulerService.cancelUserTasksByType(telegramUserId, 'day3_reminder');
  await schedulerService.cancelUserTasksByType(telegramUserId, 'day4_reminder');
  await schedulerService.cancelUserTasksByType(telegramUserId, 'day5_final');

  logger.info({ userId, telegramId }, 'Club funnel started - cancelled all pending tasks from both funnels');

  const keyboard = new InlineKeyboard().text('Готов(а) 🚀', 'club_ready');

  // Сообщение 1 с картинкой
  await getTelegramService().sendPhoto(
    chatId,
    'https://t.me/mate_bot_open/9346',
    {
      caption: `<b>Ты на старте своего маршрута 🧭</b>\n\n` +
        `У каждого человека есть свой путь.\n` +
        `Сейчас ты увидишь <b>свою личную дорожную карту</b> — как ты движешься к деньгам и реализации ✨\n\n` +
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

  await schedulerService.schedule(
    { type: 'club_auto_progress', userId: telegramUserId, chatId: chatId, data: { odUserId: userId, step: 'ready' } },
    BUTTON_TIMEOUT
  );
}

// ============================================================================
// СООБЩЕНИЯ 2-3: ГОТОВ -> ЗАПРОС ДАТЫ РОЖДЕНИЯ
// ============================================================================

export async function handleClubReady(userId: string, chatId: number) {
  // Сообщение 2: Эмодзи
  try {
    await getTelegramService().sendAnimation(chatId, VIDEO_NOTE_EMOJI);
  } catch (e) {
    logger.warn({ error: e }, 'Failed to send video note');
  }

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

export async function handleBirthDateInput(userId: string, chatId: number, birthDate: string) {
  if (!BIRTHDATE_REGEX.test(birthDate)) {
    await getTelegramService().sendMessage(
      chatId,
      `❌ Неверный формат даты. Пожалуйста, введи дату в формате <b>ДД.ММ.ГГГГ</b>\nНапример: <i>14.07.1994</i>`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  const keyboard = new InlineKeyboard()
    .text('Да', `club_confirm_date_yes_${birthDate}`)
    .text('Нет', 'club_confirm_date_no');

  await getTelegramService().sendMessage(
    chatId,
    `Твоя дата рождения — <b>${birthDate}</b>\n\nВсе верно? 🤍`,
    { parse_mode: 'HTML', reply_markup: keyboard }
  );
}

export async function handleBirthDateConfirmed(userId: string, chatId: number, birthDate: string) {
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
  await schedulerService.schedule(
    { type: 'club_auto_progress', userId: telegramUserId, chatId: chatId, data: { odUserId: userId, step: 'activate' } },
    BUTTON_TIMEOUT
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
// СООБЩЕНИЯ 5-6: АКТИВАЦИЯ -> АРХЕТИП
// ============================================================================

export async function handleClubActivate(userId: string, chatId: number) {
  // Сообщение 5: Эмодзи
  try {
    await getTelegramService().sendAnimation(chatId, VIDEO_NOTE_EMOJI);
  } catch (e) {
    logger.warn({ error: e }, 'Failed to send video note');
  }

  // Сообщение 6: Архетип
  const progress = await getClubProgress(userId);

  if (!progress?.archetypeNumber) {
    logger.error({ userId }, 'No archetype number found');
    return;
  }

  await sendArchetypeMessage(chatId, progress.archetypeNumber);
  await updateClubProgress(userId, { currentStep: 'showing_archetype' });

  const telegramUserId = await getTelegramUserId(userId);
  await schedulerService.schedule(
    { type: 'club_auto_progress', userId: telegramUserId, chatId: chatId, data: { odUserId: userId, step: 'style' } },
    BUTTON_TIMEOUT
  );
}

// ============================================================================
// СООБЩЕНИЯ 7-8: СТИЛЬ -> МАСШТАБ
// ============================================================================

export async function handleClubGetStyle(userId: string, chatId: number) {
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

  // Сообщение 8: Картинка стиля (TODO: добавить картинки когда будут готовы)
  // Пока отправляем текст
  const styleImageUrl = getStyleImageUrl(styleGroup);
  if (styleImageUrl) {
    await getTelegramService().sendPhoto(chatId, styleImageUrl, { parse_mode: 'HTML' });
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
    { type: 'club_auto_progress', userId: telegramUserId, chatId: chatId, data: { odUserId: userId, step: 'scale' } },
    BUTTON_TIMEOUT
  );
}

// ============================================================================
// СООБЩЕНИЕ 9: ПОДПИСКА НА КАНАЛ
// ============================================================================

export async function handleClubGetScale(userId: string, chatId: number, telegramUserId: number) {
  const keyboard9 = new InlineKeyboard()
    .url('подписаться 😍', `https://t.me/${CHANNEL_USERNAME.replace('@', '')}`)
    .row()
    .text('Я подписалась ✅', 'club_check_subscription');

  await getTelegramService().sendMessage(
    chatId,
    `Ты уже у цели! Остался последний шаг 🗻\n` +
    `И на твоём счету <b>600 монет 🪙</b>\n\n` +
    `Пока система готовит следующую расшифровку,\n` +
    `подпишись на канал, там тебя ждут:\n` +
    `— практики и расшифровки\n` +
    `— подкасты про деньги и реализацию\n` +
    `— прогнозы и ориентиры на 2026\n\n` +
    `После подписки<b> вернись в БОТ и расшифровка откроется.</b> Без этого шага расшифровка <b>«Где твой масштаб»</b> не откроется 👇`,
    { parse_mode: 'HTML', reply_markup: keyboard9 }
  );

  await updateClubProgress(userId, { currentStep: 'awaiting_subscribe' });
}

// ============================================================================
// ПРОВЕРКА ПОДПИСКИ
// ============================================================================

export async function handleClubCheckSubscription(userId: string, chatId: number, telegramUserId: number) {
  // TODO: Временно отключена проверка подписки - нужно подключить бота к каналу
  const isSubscribed = true; // await checkChannelSubscription(telegramUserId);

  if (!isSubscribed) {
    const keyboard = new InlineKeyboard()
      .url('подписаться 😍', `https://t.me/${CHANNEL_USERNAME.replace('@', '')}`)
      .row()
      .text('Я подписалась ✅', 'club_check_subscription');

    await getTelegramService().sendMessage(
      chatId,
      `❌ Ты пока не подписана на канал.\n\nПодпишись на ${CHANNEL_USERNAME} и нажми кнопку ещё раз 👇`,
      { parse_mode: 'HTML', reply_markup: keyboard }
    );
    return;
  }

  await updateClubProgress(userId, { subscribedToChannel: true, currentStep: 'subscribed' });

  // Сообщение 10: Эмодзи
  try {
    await getTelegramService().sendAnimation(chatId, VIDEO_NOTE_EMOJI);
  } catch (e) {
    logger.warn({ error: e }, 'Failed to send video note');
  }

  // Сообщение 11: Масштаб (без задержки)
  await sendScaleMessage(userId, chatId);
}

// ============================================================================
// СООБЩЕНИЕ 11: МАСШТАБ
// ============================================================================

async function sendScaleMessage(userId: string, chatId: number) {
  const progress = await getClubProgress(userId);
  if (!progress?.birthDayNumber) return;

  const styleGroup = getStyleGroup(progress.birthDayNumber);

  // Картинка масштаба (TODO: добавить когда будут готовы)
  const scaleImageUrl = getScaleImageUrl(styleGroup);
  if (scaleImageUrl) {
    await getTelegramService().sendPhoto(chatId, scaleImageUrl, { parse_mode: 'HTML' });
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
    { type: 'club_auto_progress', userId: telegramUserId, chatId: chatId, data: { odUserId: userId, step: 'roadmap' } },
    BUTTON_TIMEOUT
  );
}

// ============================================================================
// СООБЩЕНИЕ 12: ДОРОЖНАЯ КАРТА
// ============================================================================

export async function handleClubGetRoadmap(userId: string, chatId: number) {
  const keyboard12 = new InlineKeyboard().text('👉 Начать маршрут', 'club_start_route');

  await getTelegramService().sendMessage(
    chatId,
    `Это <b>твоя дорожная карта на год 😍</b>\n\n` +
    `Если идти по ней шаг за шагом,\n` +
    `ты переходишь <b>из точки А в точку Б:</b>\n\n` +
    `— из хаоса → в систему\n` +
    `— из нестабильного дохода → в устойчивый доход 💰\n` +
    `— из сомнений → в ясную позицию\n` +
    `— из потенциала → в реализованный результат\n\n` +
    `Эта карта показывает, <b>каким человеком ты становишься по ходу пути:</b>\n` +
    `с опорой, фокусом и пониманием, куда ты идёшь 🚀\n\n` +
    `Хочешь пройти этот маршрут и реализовать его в реальности?\n\n` +
    `⬇️ Жми кнопку ниже и обменяй свои монеты на бонус`,
    { parse_mode: 'HTML', reply_markup: keyboard12 }
  );

  await updateClubProgress(userId, { currentStep: 'showing_roadmap' });

  const telegramUserId = await getTelegramUserId(userId);
  await schedulerService.schedule(
    { type: 'club_auto_progress', userId: telegramUserId, chatId: chatId, data: { odUserId: userId, step: 'purchase' } },
    FINAL_TIMEOUT
  );
}

// ============================================================================
// СООБЩЕНИЕ 13: ФИНАЛЬНАЯ ПРОДАЖА
// ============================================================================

export async function handleClubStartRoute(userId: string, chatId: number, user: any) {
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
    .webApp('оформить подписку ❤️', purchaseUrl.toString());

  logger.info({ chatId }, 'handleClubStartRoute: Sending final message...');

  await getTelegramService().sendMessage(
    chatId,
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
    { parse_mode: 'HTML', reply_markup: keyboard13 }
  );

  logger.info({ chatId }, 'handleClubStartRoute: Message sent successfully');

  await updateClubProgress(userId, { currentStep: 'awaiting_purchase' });
  logger.info({ userId, currentStep: 'awaiting_purchase' }, 'handleClubStartRoute: Updated progress');

  // Отменяем все предыдущие задачи club_auto_progress перед планированием fallback
  const telegramUserId = await getTelegramUserId(userId);
  await schedulerService.cancelUserTasksByType(telegramUserId, 'club_auto_progress');
  logger.info({ telegramUserId }, 'handleClubStartRoute: Cancelled previous club_auto_progress tasks');

  // Планируем переход в обычную воронку через 5 минут, если не оплатил
  logger.info({ telegramUserId, odUserId: userId }, 'handleClubStartRoute: Scheduling fallback task');

  await schedulerService.schedule(
    { type: 'club_auto_progress', userId: telegramUserId, chatId: chatId, data: { odUserId: userId, step: 'fallback_to_main' } },
    5 * 60 * 1000 // 5 минут
  );

  logger.info({ userId, telegramUserId, chatId }, 'handleClubStartRoute: COMPLETE - fallback task scheduled');
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

  // СООБЩЕНИЕ 2 обычной воронки (voronka_before_pay_1.txt строка 24-36)
  await getTelegramService().sendPhoto(
    chatId,
    'https://t.me/mate_bot_open/9276',
    {
      caption:
        `<b>🎫 Твой билет в КОД УСПЕХА. Глава: Пробуждение</b>\n\n` +
        `<b>Информация о подписке на клуб:</b>\n\n` +
        `👉🏼 1 месяц = 2000 ₽\n` +
        `👉🏼 В подписку входит полный доступ к клубу «Код Успеха»: обучение и мини-курсы по мягким нишам,\n` +
        `десятки — мини-группы поддержки, чаты и офлайн-встречи по городам, закрытые эфиры и разборы с Кристиной, подкасты, баллы и приложение\n` +
        `👉🏼 Подписка продлевается автоматически каждые 30 дней. Отписаться можно в любой момент в меню участника.\n` +
        `👉🏼 Если при оплате возникают сложности обратитесь в службу заботы клуба @Egiazarova_support_bot\n\n` +
        `<i>Нажимая "Оплатить", вы даете согласие на регулярные списания, <a href="https://ishodnyi-kod.com/clubofert">на обработку персональных данных и принимаете условия публичной оферты.</a></i>\n\n` +
        `Получить доступ в закрытый канал 👇🏼`,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }
  );

  // Отменяем все задачи club воронки
  const telegramUserId = parseInt(user.telegramId, 10);
  await schedulerService.cancelUserTasksByType(telegramUserId, 'club_auto_progress');

  // Помечаем что club воронка завершена
  await updateClubProgress(userId, { currentStep: 'completed' });

  // Запускаем таймеры обычной воронки (СООБЩЕНИЕ 4 через 2 минуты согласно voronka_before_pay_1.txt строка 49)
  await schedulerService.schedule(
    { type: 'five_min_reminder', userId: telegramUserId, chatId: chatId },
    2 * 60 * 1000 // 2 минуты
  );

  logger.info({ userId, telegramId: user.telegramId }, 'Club funnel → Main funnel fallback (unpaid after 5 min)');
}

// ============================================================================
// АВТОПРОКИДЫВАНИЕ
// ============================================================================

export async function handleClubAutoProgress(userId: string, chatId: number, step: string) {
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
    case 'style':
      if (currentStep === 'showing_archetype') {
        await handleClubGetStyle(userId, chatId);
      }
      break;
    case 'scale':
      if (currentStep === 'showing_style') {
        const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (user.length) {
          await handleClubGetScale(userId, chatId, parseInt(user[0].telegramId));
        }
      }
      break;
    case 'roadmap':
      if (currentStep === 'showing_scale') {
        await handleClubGetRoadmap(userId, chatId);
      }
      break;
    case 'purchase':
      if (currentStep === 'showing_roadmap') {
        const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (user.length) {
          await handleClubStartRoute(userId, chatId, user[0]);
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
    await getTelegramService().sendPhoto(chatId, archetype.imageUrl, {
      caption: archetype.text,
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  } catch (e) {
    // Если картинка не загрузилась, отправляем текст
    await getTelegramService().sendMessage(chatId, archetype.text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  }
}

function getStyleImageUrl(styleGroup: number): string | null {
  // TODO: Добавить URL картинок стилей когда будут готовы
  return null;
}

function getScaleImageUrl(styleGroup: number): string | null {
  // TODO: Добавить URL картинок масштабов когда будут готовы
  return null;
}

const ARCHETYPES: { [key: number]: { name: string; imageUrl: string; text: string } } = {
  1: {
    name: 'Исида',
    imageUrl: 'https://t.me/mate_bot_open/9320',
    text: `<b>✨ Рождённые 1 числа — архетип Исида ✨</b>\n\n<b>Твоя сила 💫</b>\nТы создаёшь реальность через <b>мысль, слово и намерение.</b>\nТо, что ты формулируешь — начинает работать.\n\n<b>Как ты проявляешься 🔑</b>\nТы запускаешь процессы, влияешь на людей и события.\nЧасто становишься <b>точкой начала</b> — идей, проектов, решений.\n\n<b>Где твой успех 🚀</b>\nЛичные проекты, управление, экспертиза, роль человека,\nкоторый <b>задаёт направление</b>, а не следует за другими.\n\n<b>Главный секрет ⚡️</b>\nКогда ты осознаёшь свою силу и используешь её осознанно,\nжизнь начинает <b>подстраиваться под тебя.</b>\n\n<b>Точка роста 🌱</b>\nНе распыляться и не уменьшать себя.\nТвоя энергия раскрывается, когда ты выбираешь <b>масштаб</b>\nи доводишь начатое до результата.\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  2: {
    name: 'Геката',
    imageUrl: 'https://t.me/mate_bot_open/9321',
    text: `<b>🌙 Рождённые 2 числа — архетип Гекаты 🌙</b>\n\n<b>Твоя сила 🔮</b>\nИнтуиция и доступ к скрытому знанию.\nТы чувствуешь то, что не видно логикой: подтексты, намерения, будущие развилки.\n\n<b>Как ты принимаешь решения 🧠</b>\nНе через давление извне, а через внутренний отклик.\nТы умеешь «знать», не имея доказательств — и часто оказываешься права раньше других.\n\n<b>Где твой успех 🌑</b>\nАналитика, психология, наставничество, стратегии, работа со смыслами.\nТы видишь <b>возможности и угрозы заранее</b>, когда остальные ещё сомневаются.\n\n<b>Главный секрет ⚡️</b>\nКогда ты доверяешь своему внутреннему голосу — решения становятся точными, а путь короче.\n\n<b>Точка роста 🌱</b>\nНе уходить в тень и не сомневаться в себе.\nТвоя интуиция — это не «чувствительность», а <b>инструмент влияния.</b>\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  3: {
    name: 'Афродита',
    imageUrl: 'https://t.me/mate_bot_open/9322',
    text: `<b>💗 Рождённые 3 и 30 числа — архетип Афродиты 💗</b>\n\n<b>Твоя сила ✨</b>\nЖенская привлекательность, харизма и энергия изобилия.\nТы влияешь не давлением, а состоянием — через красоту, эмоции и живой контакт.\n\n<b>Как ты притягиваешь деньги и людей 💫</b>\nЕстественно.\nК тебе тянутся, потому что рядом с тобой хочется быть: ты создаёшь ощущение тепла, гармонии и «можно».\n\n<b>Где твой успех 🌸</b>\nПубличность, творчество, личный бренд, эстетика, отношения, продажи через доверие.\nТы умеешь превращать внимание в ресурс.\n\n<b>Главный секрет ⚡️</b>\nКогда ты разрешаешь себе быть открытой и чувствующей — изобилие приходит само.\n\n<b>Точка роста 🌱</b>\nНе подменять ценность желанием нравиться.\nТвоя сила — не в одобрении, а в <b>осознанной привлекательности.</b>\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  4: {
    name: 'Гера',
    imageUrl: 'https://t.me/mate_bot_open/9323',
    text: `<b>👑 Рождённые 4 и 31 числа — архетип Геры 👑</b>\n\n<b>Твоя сила ✨</b>\nВласть, структура, дисциплина и врождённое лидерство.\nТы умеешь держать рамку, выстраивать порядок и быть опорой — для себя и для других.\n\n<b>Как ты зарабатываешь и реализуешься 💼</b>\nЧерез управление, ответственность и системность.\nЛюди доверяют тебе процессы, деньги и решения, потому что чувствуют надёжность.\n\n<b>Где твой успех 📊</b>\nРуководство, бизнес, администрирование, проекты с долгим циклом, команды.\nТы сильна там, где нужен порядок и результат.\n\n<b>Главный секрет ⚡️</b>\nТвой авторитет не нужно доказывать — он считывается автоматически.\n\n<b>Точка роста 🌱</b>\nНе уходить в жёсткость и контроль.\nИстинная сила Геры — в <b>спокойной власти</b>, а не в давлении.\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  5: {
    name: 'Бригита',
    imageUrl: 'https://t.me/mate_bot_open/9324',
    text: `<b>🔥 Рождённые 5 и 23 числа — архетип Бригиты 🔥</b>\n\n<b>Твоя сила ✨</b>\nМудрость, наставничество, умение соединять духовное и практическое.\nТы чувствуешь, как передать знание так, чтобы оно реально работало в жизни.\n\n<b>Как ты зарабатываешь и реализуешься 📚</b>\nЧерез обучение, консалтинг, наставничество, экспертность.\nЛюди приходят к тебе за ясностью, опорой и пониманием «как правильно».\n\n<b>Где твой успех 🎓</b>\nОбразование, коучинг, психология, управление знаниями, личные бренды экспертов.\nТы становишься точкой ориентира для других.\n\n<b>Главный секрет ⚡️</b>\nТебе доверяют не из-за громкости, а из-за глубины.\n\n<b>Точка роста 🌱</b>\nНе застревать в роли «вечного учителя».\nВажно позволить себе расти дальше и брать больше, чем просто благодарность.\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  6: {
    name: 'Фрейя',
    imageUrl: 'https://t.me/mate_bot_open/9325',
    text: `<b>💞 Рождённые 6 и 24 числа — архетип Фрейи 💞</b>\n\n<b>Твоя сила ✨</b>\nСтрасть, харизма и умение выбирать сердцем.\nТы создаёшь связь — с людьми, идеями, пространством.\n\n<b>Как ты проявляешься и влияешь 💫</b>\nЧерез искренность, эмоции и живой контакт.\nРядом с тобой хочется быть, сотрудничать, идти вместе.\n\n<b>Где твой успех 🤝</b>\nПартнёрства, коллаборации, продажи через доверие, личный бренд, проекты «про людей».\nТы умеешь объединять и вдохновлять.\n\n<b>Главный секрет ⚡️</b>\nТвоя открытость — не слабость, а источник силы и притяжения.\n\n<b>Точка роста 🌱</b>\nНе зависать в сомнениях и бесконечном выборе.\nТвоя энергия раскрывается, когда ты <b>решаешься и действуешь.</b>\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  7: {
    name: 'Дурга',
    imageUrl: 'https://t.me/mate_bot_open/9326',
    text: `<b>⚔️ Рождённые 7 и 25 числа — архетип Дурги ⚔️</b>\n\n<b>Твоя сила ✨</b>\nВоля, движение вперёд и способность побеждать через преодоление.\nТы не останавливаешься перед трудностями — ты проходишь их.\n\n<b>Как ты действуешь 🚀</b>\nФокус, решительность и внутренняя уверенность.\nКогда ты выбираешь цель, ты идёшь к ней, даже если путь непростой.\n\n<b>Где твой успех 🏁</b>\nПроекты с вызовом, предпринимательство, управление, сферы, где важны скорость и результат.\nТы сильна там, где нужно брать ответственность и вести вперёд.\n\n<b>Главный секрет ⚡️</b>\nТебя невозможно остановить, когда ты веришь в свой путь.\n\n<b>Точка роста 🌱</b>\nНе жить в постоянном режиме борьбы.\nИстинная сила Дурги — в <b>осознанном движении</b>, а не в вечном напряжении.\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  8: {
    name: 'Сехмет',
    imageUrl: 'https://t.me/mate_bot_open/9327',
    text: `<b>🦁 Рождённые 8 и 26 числа — архетип Сехмет 🦁</b>\n\n<b>Твоя сила ✨</b>\nВнутренняя мощь, смелость и умение управлять эмоциями и страхом.\nТы чувствуешь силу внутри и не нуждаешься в доказательствах.\n\n<b>Как ты проявляешь лидерство 🌊</b>\nСпокойно и уверенно.\nТы влияешь не давлением, а присутствием — люди чувствуют твою устойчивость и следуют за тобой.\n\n<b>Где твой успех 🧭</b>\nРуководство, психология, коучинг, управление людьми и ресурсами, проекты, где важна зрелость и ответственность.\nТы сильна там, где нужно держать баланс между силой и человечностью.\n\n<b>Главный секрет ⚡️</b>\nТвоя мягкость не ослабляет силу — она делает её глубже и эффективнее.\n\n<b>Точка роста 🌱</b>\nНе подавлять эмоции и не уходить в жёсткость.\nИстинная сила Сехмет — в <b>осознанном контроле и сострадании.</b>\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  9: {
    name: 'Веста',
    imageUrl: 'https://t.me/mate_bot_open/9328',
    text: `<b>🔥 Рождённые 9 и 27 числа — архетип Весты 🔥</b>\n\n<b>Твоя сила ✨</b>\nВнутренний свет, глубина и умение быть наедине с собой.\nТы находишь ответы не во внешнем шуме, а внутри.\n\n<b>Как ты принимаешь решения 🧠</b>\nЧерез тишину, концентрацию и осознанность.\nТы не поддаёшься влиянию толпы и умеешь держать свой курс, даже если он не самый популярный.\n\n<b>Где твой успех 🌿</b>\nЭкспертность, аналитика, наставничество, исследовательская работа, проекты, где важны глубина и смысл.\nТы сильна там, где требуется <b>фокус и зрелое мышление.</b>\n\n<b>Главный секрет ⚡️</b>\nОдиночество для тебя — не пустота, а источник силы и ясности.\n\n<b>Точка роста 🌱</b>\nНе закрываться полностью от мира.\nТвоя задача — <b>делиться своим светом</b>, не теряя внутреннего центра.\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  10: {
    name: 'Тюхе',
    imageUrl: 'https://t.me/mate_bot_open/9329',
    text: `<b>🎡 Рождённые 10 и 28 числа — архетип Тюхе 🎡</b>\n\n<b>Твоя сила ✨</b>\nЧувствительность к моменту, синхронии и удачные совпадения.\nТы умеешь быть в потоке и оказываться в нужном месте в нужное время.\n\n<b>Как ты действуешь 🌊</b>\nГибко и адаптивно.\nТы быстро считываешь ситуацию, чувствуешь, когда стоит рискнуть, а когда — отпустить.\n\n<b>Где твой успех 🍀</b>\nПроекты с движением, изменениями, новыми форматами, предпринимательство, медиа, продажи.\nТы сильна там, где важна скорость реакции и умение ловить шанс.\n\n<b>Главный секрет ⚡️</b>\nУдача приходит к тебе, когда ты не цепляешься за контроль и доверяешь ходу жизни.\n\n<b>Точка роста 🌱</b>\nНе пускать всё на самотёк.\nТвой поток усиливается, когда ты соединяешь интуицию с <b>осознанным выбором и действиями.</b>\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  11: {
    name: 'Астрея',
    imageUrl: 'https://t.me/mate_bot_open/9330',
    text: `<b>⚖️ Рождённые 11 и 29 числа — архетип Астреи ⚖️</b>\n\n<b>Твоя сила ✨</b>\nБаланс, честность и внутренний моральный компас.\nТы чувствуешь, где правда, и не готова идти против себя.\n\n<b>Как ты влияешь 🌿</b>\nЧерез справедливость и ясные правила.\nЛюди доверяют тебе, потому что знают: ты держишь слово и действуешь прозрачно.\n\n<b>Где твой успех 🤍</b>\nПартнёрства, управление, переговоры, консалтинг, юридические и экспертные сферы, проекты с высокой ответственностью.\nТы сильна там, где важны доверие и репутация.\n\n<b>Главный секрет ⚡️</b>\nТвоя честность — это капитал.\nОна притягивает людей, возможности и долгосрочные связи.\n\n<b>Точка роста 🌱</b>\nНе уходить в жёсткость и внутренний суд.\nИстинная сила Астреи — в <b>живом балансе</b>, а не в идеальности.\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  12: {
    name: 'Инанна',
    imageUrl: 'https://t.me/mate_bot_open/9331',
    text: `<b>💫 Рождённые 12 числа — архетип Инанны 💫</b>\n\n<b>Твоя сила ✨</b>\nСпособность расти через паузы, переосмысление и смену перспективы.\nТы умеешь остановиться, посмотреть иначе и увидеть то, что скрыто от других.\n\n<b>Как ты проходишь путь 🧠</b>\nЧерез терпение и глубину.\nТы готова пережить временные сложности ради большой цели, даже если окружающие не понимают твой выбор.\n\n<b>Где твой успех 🌱</b>\nСтратегия, психология, творчество, наставничество, трансформационные проекты.\nТы сильна там, где важно <b>изменение мышления</b>, а не быстрый результат.\n\n<b>Главный секрет ⚡️</b>\nТвоя пауза — не слабость, а точка роста.\nТы видишь возможности там, где другие видят ограничения.\n\n<b>Точка роста 🌿</b>\nНе застревать в жертве и ожидании.\nИстинная сила Инанны — в том, чтобы <b>вовремя выйти из паузы и сделать шаг.</b>\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  13: {
    name: 'Хель',
    imageUrl: 'https://t.me/mate_bot_open/9332',
    text: `<b>🖤 Рождённые 13 числа — архетип Хель 🖤</b>\n\n<b>Твоя сила ✨</b>\nТрансформация и умение завершать циклы.\nТы не боишься конца — потому что чувствуешь, что за ним всегда начинается новое.\n\n<b>Как ты проходишь изменения 🔄</b>\nЧерез принятие и честность с собой.\nТы умеешь отпускать старые формы, роли и связи, даже если это непросто.\n\n<b>Где твой успех 🌑</b>\nКризис-менеджмент, психология, трансформационные проекты, глубокая работа с людьми и системами.\nТы сильна там, где нужно <b>проводить через перемены.</b>\n\n<b>Главный секрет ⚡️</b>\nТвоя способность перерождаться — это источник устойчивости и силы.\n\n<b>Точка роста 🌱</b>\nНе застревать в разрушении ради разрушения.\nИстинная сила Хель — в том, чтобы <b>закрывать этап и смело идти дальше.</b>\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  14: {
    name: 'Ирида',
    imageUrl: 'https://t.me/mate_bot_open/9333',
    text: `<b>🌈 Рождённые 14 числа — архетип Ириды 🌈</b>\n\n<b>Твоя сила ✨</b>\nГармония, баланс и умение соединять противоположности.\nТы видишь не «или–или», а <b>как совместить</b> и выстроить устойчиво.\n\n<b>Как ты действуешь 🧠</b>\nЧерез интеграцию и выравнивание.\nТы умеешь управлять конфликтами, сглаживать острые углы и находить решения, которые работают для всех сторон.\n\n<b>Где твой успех ⚖️</b>\nУправление, переговоры, координация процессов, командная работа, проекты на стыке разных интересов.\nТы сильна там, где нужен <b>баланс и долгосрочная стабильность.</b>\n\n<b>Главный секрет ⚡️</b>\nТвоя мягкость — это форма силы.\nИменно через компромисс ты создаёшь устойчивые системы.\n\n<b>Точка роста 🌱</b>\nНе терять себя, стремясь всем угодить.\nИстинная сила Ириды — в <b>осознанном выборе меры</b>, а не в самопожертвовании.\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  15: {
    name: 'Лилит',
    imageUrl: 'https://t.me/mate_bot_open/9334',
    text: `<b>🔥 Рождённые 15 числа — архетип Лилит 🔥</b>\n\n<b>Твоя сила ✨</b>\nСексуальная энергия, свобода и принятие своей тёмной стороны.\nТы не подавляешь желания — ты умеешь превращать их в топливо.\n\n<b>Как ты влияешь 🖤</b>\nЧерез притяжение, честность и смелость быть собой.\nТы не играешь роли — и именно это делает тебя магнитом для людей и возможностей.\n\n<b>Где твой успех 💎</b>\nЛичный бренд, публичность, творчество, продажи, проекты про удовольствие, стиль, тело, влияние.\nТы сильна там, где важны <b>желание, энергия и харизма.</b>\n\n<b>Главный секрет ⚡️</b>\nКогда ты не стыдишься своей силы — она начинает работать на тебя.\n\n<b>Точка роста 🌱</b>\nНе уходить в разрушение и самосаботаж.\nИстинная сила Лилит — в <b>осознанном управлении желаниями</b>, а не в зависимости от них.\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  16: {
    name: 'Кали',
    imageUrl: 'https://t.me/mate_bot_open/9335',
    text: `<b>🔥 Рождённые 16 числа — архетип Кали 🔥</b>\n\n<b>Твоя сила ✨</b>\nРазрушение иллюзий и радикальные перемены.\nТы видишь, где система больше не работает, и не боишься её сломать.\n\n<b>Как ты проходишь кризисы ⚡️</b>\nЧерез честность и решимость.\nТы не держишься за старое из страха — ты выбираешь обновление, даже если это требует смелости.\n\n<b>Где твой успех 🧨</b>\nТрансформационные проекты, антикризисное управление, изменения в бизнесе и жизни, работа с переломными моментами.\nТы сильна там, где другие останавливаются.\n\n<b>Главный секрет ⚡️</b>\nКризисы для тебя — не конец, а точка пробуждения.\n\n<b>Точка роста 🌱</b>\nНе разрушать ради разрушения.\nИстинная сила Кали — в том, чтобы <b>создавать новое на очищенном месте,</b> а не жить в вечном обнулении.\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  17: {
    name: 'Нут',
    imageUrl: 'https://t.me/mate_bot_open/9336',
    text: `<b>✨ Рождённые 17 числа — архетип Нут ✨</b>\n\n<b>Твоя сила 💫</b>\nВдохновение, внутренний свет и вера в лучшее.\nТы несёшь ощущение надежды даже в непростые периоды — для себя и для других.\n\n<b>Как ты влияешь 🌟</b>\nЧерез пример, искренность и устойчивые ценности.\nЛюди тянутся к тебе, потому что рядом с тобой появляется ощущение смысла и направления.\n\n<b>Где твой успех 🌌</b>\nПубличные проекты, творчество, наставничество, социальные инициативы, личный бренд.\nТы сильна там, где важно <b>вдохновлять и вести</b>, а не давить.\n\n<b>Главный секрет ⚡️</b>\nТвоя вера — это магнит.\nКогда ты остаёшься верной своим идеалам, к тебе приходят люди и возможности.\n\n<b>Точка роста 🌱</b>\nНе уходить в мечты без действий.\nИстинная сила Нут — в том, чтобы <b>подкреплять вдохновение конкретными шагами.</b>\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  18: {
    name: 'Селена',
    imageUrl: 'https://t.me/mate_bot_open/9337',
    text: `<b>🌙 Рождённые 18 числа — архетип Селены 🌙</b>\n\n<b>Твоя сила ✨</b>\nТонкая чувствительность, эмоции и глубокий контакт с подсознанием.\nТы улавливаешь скрытые мотивы, настроения и невидимые процессы.\n\n<b>Как ты воспринимаешь мир 🔮</b>\nЧерез ощущения и интуицию.\nТы видишь больше, чем сказано словами, и чувствуешь, где есть правда, а где иллюзия.\n\n<b>Где твой успех 🌊</b>\nТворчество, психология, работа с образами, искусство, брендинг, проекты про атмосферу и состояние.\nТы умеешь создавать <b>магнетизм и глубину</b> там, где другие видят рутину.\n\n<b>Главный секрет ⚡️</b>\nТвоя чувствительность — это не слабость, а инструмент.\nКогда ты доверяешь интуиции, решения становятся точными.\n\n<b>Точка роста 🌱</b>\nНе тонуть в эмоциях и страхах.\nИстинная сила Селены — в том, чтобы <b>управлять чувствами, а не позволять им управлять тобой.</b>\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  19: {
    name: 'Аматэрасу',
    imageUrl: 'https://t.me/mate_bot_open/9338',
    text: `<b>☀️ Рождённые 19 числа — архетип Аматэрасу ☀️</b>\n\n<b>Твоя сила ✨</b>\nСвет, радость и мощная жизненная энергия.\nТы заряжаешь пространство собой — людям рядом становится теплее и увереннее.\n\n<b>Как ты влияешь 🌞</b>\nЧерез пример, открытость и искренность.\nТы не давишь и не убеждаешь — ты <b>светишь</b>, и за тобой хочется идти.\n\n<b>Где твой успех 🌻</b>\nПубличность, лидерские роли, личный бренд, обучение, проекты про людей, развитие и вдохновение.\nТы сильна там, где важно <b>вести и объединять</b>, а не контролировать.\n\n<b>Главный секрет ⚡️</b>\nТвоя энергия — твой капитал.\nКогда ты разрешаешь себе быть яркой и живой, ты естественно притягиваешь людей и возможности.\n\n<b>Точка роста 🌱</b>\nНе выгорать, отдавая свет всем подряд.\nИстинная сила Аматэрасу — в том, чтобы <b>сохранять баланс между отдачей и заботой о себе.</b>\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  20: {
    name: 'Маат',
    imageUrl: 'https://t.me/mate_bot_open/9339',
    text: `<b>⚖️ Рождённые 20 числа — архетип Маат ⚖️</b>\n\n<b>Твоя сила ✨</b>\nПробуждение, истина и ощущение высшего закона.\nТы чувствуешь, где правда, и не можешь идти против совести — даже если так было бы проще.\n\n<b>Как ты принимаешь решения 🧭</b>\nОсознанно и по внутреннему кодексу.\nТы видишь цель шире ситуации и понимаешь последствия своих выборов — для себя и для других.\n\n<b>Где твой успех 🌍</b>\nНаставничество, управление, социальные и образовательные проекты, консалтинг, сферы, где важны смысл, ответственность и влияние.\nТы сильна там, где нужно <b>пробуждать и направлять.</b>\n\n<b>Главный секрет ⚡️</b>\nТвоя честность и ясность меняют людей.\nЧерез тебя запускаются глубокие трансформации — без давления, но навсегда.\n\n<b>Точка роста 🌱</b>\nНе брать на себя роль судьи и не тащить всех за собой.\nИстинная сила Маат — в том, чтобы <b>показывать путь, а не тащить по нему.</b>\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  21: {
    name: 'Деметра',
    imageUrl: 'https://t.me/mate_bot_open/9340',
    text: `<b>🌾 Рождённые 21 числа — архетип Деметры 🌾</b>\n\n<b>Твоя сила ✨</b>\nЦелостность, зрелость и умение видеть полный цикл.\nТы понимаешь, как одно действие влияет на результат в долгую.\n\n<b>Как ты действуешь 🧠</b>\nСпокойно и стратегически.\nТы не суетишься, а выстраиваешь процессы так, чтобы они работали устойчиво и без перегруза.\n\n<b>Где твой успех 🌍</b>\nДолгосрочные проекты, управление, наставничество, системный бизнес, сообщества, сферы заботы и развития.\nТы сильна там, где важны <b>стабильность и рост со временем.</b>\n\n<b>Главный секрет ⚡️</b>\nТы видишь картину целиком — и поэтому создаёшь результат, который держится.\n\n<b>Точка роста 🌱</b>\nНе брать на себя слишком много и не жить только ради других.\nИстинная сила Деметры — в <b>балансе заботы о мире и заботы о себе.</b>\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
  22: {
    name: 'Персефона',
    imageUrl: 'https://t.me/mate_bot_open/9341',
    text: `<b>🌸 Рождённые 22 числа — архетип Персефоны 🌸</b>\n\n<b>Твоя сила ✨</b>\nНовые начала, лёгкость и доверие жизни.\nТы умеешь входить в неизвестное без страха и видеть возможности там, где другие теряются.\n\n<b>Как ты движешься 🌬</b>\nЧерез интерес, игру и любопытство.\nТы быстро адаптируешься, чувствуешь поток и не застреваешь в старых формах.\n\n<b>Где твой успех 🎈</b>\nКреативные проекты, старты, новые форматы, личный бренд, сферы, где важны гибкость и свежий взгляд.\nТы сильна там, где нужно <b>начинать с нуля и оживлять пространство.</b>\n\n<b>Главный секрет ⚡️</b>\nТвоя лёгкость — не поверхностность, а способ двигаться быстрее и свободнее.\n\n<b>Точка роста 🌱</b>\nНе убегать от ответственности и не обесценивать себя.\nИстинная сила Персефоны — в том, чтобы <b>сохранять игру, оставаясь в опоре.</b>\n\n<b>👇 Хочешь узнать, как именно ты проявляешься в мире?</b>\nНажми кнопку ниже и получи:\n• расшифровку <b>стиля проявления</b> по дате рождения\n• как тебя считывают люди\n• где твоя точка влияния и роста`,
  },
};
