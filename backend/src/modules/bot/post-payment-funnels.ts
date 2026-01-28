/**
 * 🎯 POST-PAYMENT FUNNELS - ВОРОНКИ ПОСЛЕ ОПЛАТЫ
 * Все воронки после успешной оплаты подписки
 */

import { InlineKeyboard } from 'grammy';
import { db } from '@/db';
import { users, giftSubscriptions } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { schedulerService } from '@/services/scheduler.service';
import { TelegramService } from '@/services/telegram.service';
import { logger } from '@/utils/logger';
import { nanoid } from 'nanoid';
import { getMoscowTimeInDays, getTomorrowMoscowTime } from '@/utils/moscow-time';

// Create telegram service instance (needs bot API from Grammy)
// This will be initialized when bot module loads
let telegramService: TelegramService | null = null;

export function initTelegramService(api: any) {
  telegramService = new TelegramService(api);
}

function getTelegramService(): TelegramService {
  if (!telegramService) {
    throw new Error('TelegramService not initialized. Call initTelegramService() first.');
  }
  return telegramService;
}

// ============================================================================
// HELPER: Get user by telegram ID
// ============================================================================
export async function getUserByTgId(tgId: number) {
  const result = await db.select().from(users).where(eq(users.telegramId, tgId)).limit(1);
  return result[0] || null;
}

// ============================================================================
// ВОРОНКА 1: КОДОВОЕ СЛОВО "КАРТА"
// ============================================================================

/**
 * ЭТАП 1: Начать онбординг после оплаты
 */
export async function startOnboardingAfterPayment(userId: string, chatId: number) {
  // 🚫 Игнорируем групповые чаты и каналы (chatId < 0)
  if (chatId < 0) {
    logger.info({ userId, chatId }, 'Ignoring onboarding for group chat/channel');
    return;
  }

  // 1. Обновить статус пользователя
  await db.update(users)
    .set({ onboardingStep: 'awaiting_keyword' })
    .where(eq(users.id, userId));

  // 1.5. Установить команду /menu и кнопку меню для этого пользователя (только оплатившие видят кнопку Меню)
  try {
    await getTelegramService().setMyCommands(
      [{ command: 'menu', description: 'Главное меню' }],
      { scope: { type: 'chat', chat_id: chatId } }
    );
    // 🆕 Сразу устанавливаем кнопку меню в левом нижнем углу (не ждём завершения онбординга)
    await getTelegramService().setChatMenuButton(chatId, { type: 'commands' });
    logger.info({ chatId }, 'Set /menu command and menu button for paid user');
  } catch (error) {
    logger.error({ error, chatId }, 'Failed to set /menu command for user');
  }

  // 2. Отправить видео с сообщением
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

  // 3. Запланировать догревы через 20, 80, 200 минут
  const userInt = parseInt(userId);
  await schedulerService.schedule(
    { type: 'keyword_reminder_20m', userId: userInt, chatId },
    20 * 60 * 1000 // 20 минут
  );

  await schedulerService.schedule(
    { type: 'keyword_reminder_60m', userId: userInt, chatId },
    80 * 60 * 1000 // 80 минут от начала
  );

  await schedulerService.schedule(
    { type: 'keyword_reminder_120m', userId: userInt, chatId },
    200 * 60 * 1000 // 200 минут от начала
  );
}

export async function sendKeywordReminder20m(userId: number, chatId: number) {
  const user = await getUserByTgId(userId);
  if (!user || user.onboardingStep !== 'awaiting_keyword') return;

  await getTelegramService().sendPhoto(
    chatId,
    'https://t.me/mate_bot_open/9285',
    {
      caption: `Чтобы пройти дальше – введи кодовое слово, которое Кристина упомянула в видео.\n\nКод разблокирует следующий шаг 👇`,
      parse_mode: 'HTML'
    }
  );
}

export async function sendKeywordReminder60m(userId: number, chatId: number) {
  const user = await getUserByTgId(userId);
  if (!user || user.onboardingStep !== 'awaiting_keyword') return;

  await getTelegramService().sendPhoto(
    chatId,
    'https://t.me/mate_bot_open/9286',
    {
      caption: `Следующий этап откроется, как только ты введёшь код.\nСмотри внимательно, мы спрятали его в видео\n\nВведи код в поле ниже 👇`,
      parse_mode: 'HTML'
    }
  );
}

export async function sendKeywordReminder120m(userId: number, chatId: number) {
  const user = await getUserByTgId(userId);
  if (!user || user.onboardingStep !== 'awaiting_keyword') return;

  await getTelegramService().sendPhoto(
    chatId,
    'https://t.me/mate_bot_open/9287',
    {
      caption: `Доступ в КЛУБ будет закрыт, пока ты не введешь кодовое слово из видео. Введи слово, чтобы открыть доступ 👇`,
      parse_mode: 'HTML'
    }
  );
}

/**
 * УСПЕШНЫЙ ВВОД КОДА
 */
export async function handleKeywordSuccess(userId: string, chatId: number) {
  // 1. Обновить статус
  await db.update(users)
    .set({ onboardingStep: 'awaiting_ready' })
    .where(eq(users.id, userId));

  // 2. Отменить все запланированные догревы кодового слова
  // ⚡ Используем batch метод для эффективности
  const userInt = parseInt(userId);
  await schedulerService.cancelUserTasksByTypes(userInt, [
    'keyword_reminder_20m',
    'keyword_reminder_60m',
    'keyword_reminder_120m',
  ]);

  // 3. Отправить приветственное сообщение с 4 задачами
  const keyboard = new InlineKeyboard()
    .url('перейти в канал', 'https://t.me/+mwJ5e0d78GYzNDRi')
    .row()
    .webApp('вступить в чат города', `${process.env.WEBAPP_URL}?tab=chats`)
    .row()
    .webApp('открыть штаб', process.env.WEBAPP_URL!)
    .row()
    .url('приложение', 'http://qr.numschool-web.ru/')
    .row()
    .text('готово', 'onboarding_ready');

  await getTelegramService().sendPhoto(
    chatId,
    'https://t.me/mate_bot_open/9357',
    {
      caption:
        `<b>🗝 Ключ принят. Добро пожаловать домой, родная!</b>\n\n` +
        `Я горжусь тобой. Ты посмотрела видео, услышала меня и приняла наши правила. Теперь ты — часть нашего сообщества.\n\n` +
        `<b>ТВОИ ПЕРВЫЕ ШАГИ (СДЕЛАЙ ПРЯМО СЕЙЧАС):</b>\n\n` +
        `1️⃣ Канал клуба – это наше главное инфо-поле. Все анонсы, ссылки на эфиры и послания от меня будут здесь. 👉 Вступить и закрепить канал.\n\n` +
        `2️⃣ Твой город – найди свой город в списке. Там тебя уже ждут живые люди, с которыми ты скоро встретишься оффлайн. Напиши им: "Привет, я с вами!". 👉 Выбрать город.\n\n` +
        `3️⃣ Твой штаб-приложение, где хранится вся информация – нажми на кнопку приложения. Там уже открыт доступ к практикам. 👉 Открыть штаб.\n` +
        `4️⃣ Доступ к приложению ментального здоровья  👉 приложение\n\n` +
        `🛑 Не откладывай. Сделай эти три действия сейчас.\n\n` +
        `Как только вступишь во все чаты — жми кнопку ГОТОВО внизу.»`,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }
  );

  // 4. Запланировать догревы кнопки ГОТОВО
  await schedulerService.schedule(
    { type: 'ready_reminder_30m', userId: userInt, chatId },
    30 * 60 * 1000
  );

  await schedulerService.schedule(
    { type: 'ready_reminder_60m', userId: userInt, chatId },
    90 * 60 * 1000
  );

  await schedulerService.schedule(
    { type: 'ready_final_120m', userId: userInt, chatId },
    210 * 60 * 1000
  );
}

// ============================================================================
// ВОРОНКА 2: КНОПКА "ГОТОВО"
// ============================================================================

export async function sendReadyReminder30m(userId: number, chatId: number) {
  const user = await getUserByTgId(userId);
  if (!user || user.onboardingStep !== 'awaiting_ready') return;

  const keyboard = new InlineKeyboard().text('готово', 'onboarding_ready');

  await getTelegramService().sendPhoto(
    chatId,
    'https://t.me/mate_bot_open/9289',
    {
      caption: `Большие перемены начинаются с маленького шага. Жми кнопку «Готово» и начнем.`,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }
  );
}

export async function sendReadyReminder60m(userId: number, chatId: number) {
  const user = await getUserByTgId(userId);
  if (!user || user.onboardingStep !== 'awaiting_ready') return;

  const keyboard = new InlineKeyboard().text('готово', 'onboarding_ready');

  await getTelegramService().sendMessage(
    chatId,
    `Уже в канале? Нажимай «Готово», чтобы мы с тобой продолжили 👇`,
    { reply_markup: keyboard }
  );
}

export async function sendReadyFinal120m(userId: number, chatId: number) {
  const user = await getUserByTgId(userId);
  if (!user) return;

  // Даже если не нажал ГОТОВО, переводим дальше
  await completeOnboarding(user.id, chatId);
}

/**
 * ЗАВЕРШЕНИЕ ОНБОРДИНГА
 */
export async function completeOnboarding(userId: string, chatId: number) {
  // 1. Обновить статус
  await db.update(users)
    .set({ onboardingStep: 'onboarding_complete' })
    .where(eq(users.id, userId));

  // 2. Отменить все догревы ГОТОВО
  // ⚡ Используем batch метод для эффективности
  const userInt = parseInt(userId);
  await schedulerService.cancelUserTasksByTypes(userInt, [
    'ready_reminder_30m',
    'ready_reminder_60m',
    'ready_final_120m',
  ]);

  // 3. Установить кнопку меню в левом нижнем углу (показывает команды бота)
  await getTelegramService().setChatMenuButton(chatId, { type: 'commands' });

  // 4. Отправить видео-инструкцию по экосистеме клуба
  await getTelegramService().sendVideo(
    chatId,
    'https://t.me/mate_bot_open/9641',
    {
      caption:
        `<b>А теперь самое важное 👇</b>\n\n` +
        `Внимательно посмотри видео-инструкцию по экосистеме клуба, чтобы ты не потерялась и сразу во всём разобралась ✨\n\n` +
        `В левом нижнем углу находится кнопка <b>«Меню» ☰</b>\n` +
        `Через неё ты можешь посмотреть нужные разделы и уточнить любые вопросы, которые тебя интересуют`,
      parse_mode: 'HTML',
    }
  );

  // 4. Запланировать воронку вовлечения
  await scheduleEngagementFunnel(userId, chatId);
}

// ============================================================================
// ВОРОНКА 3: ВОВЛЕЧЕНИЕ ПО ДНЯМ (1/7/14/21/28)
// ============================================================================

export async function scheduleEngagementFunnel(userId: string, chatId: number) {
  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (user.length === 0) return;

  const isGifted = user[0].gifted;
  const userInt = parseInt(userId);

  // Если НЕ подарочная подписка, запланировать день 1 в 10:00 МСК
  if (!isGifted) {
    const delay = getTomorrowMoscowTime(10, 0) - Date.now();
    if (delay > 0) {
      await schedulerService.schedule(
        { type: 'day1_gift_promo', userId: userInt, chatId },
        delay
      );
    }
  }

  // Запланировать дни 7, 14, 21, 28 в 9:00 МСК
  for (const [days, type] of [
    [7, 'day7_check_in'],
    [14, 'day14_check_in'],
    [21, 'day21_check_in'],
    [28, 'day28_renewal']
  ] as const) {
    const delay = getMoscowTimeInDays(days, 9, 0) - Date.now();
    if (delay > 0) {
      await schedulerService.schedule(
        { type, userId: userInt, chatId },
        delay
      );
    }
  }

  logger.info({ userId }, 'Engagement funnel scheduled');
}

export async function sendDay1GiftPromo(userId: number, chatId: number) {
  const keyboard = new InlineKeyboard()
    .text('подарить подписку', 'gift_subscription')
    .row()
    .text('вернуться в меню', 'menu_back');

  await getTelegramService().sendVideo(
    chatId,
    'https://t.me/mate_bot_open/9290',
    {
      caption:
        `У тебя <b>точно</b> есть такая подружка 😌\n` +
        `Умная, классная, с потенциалом —\n` +
        `но сейчас будто зависла: думает, сомневается, ищет себя и немного буксует.\n\n` +
        `Ты уже всё пробовала 😅\n` +
        `И аккуратно намекнуть, и поддержать, и выслушать, и мысленно встряхнуть.\n` +
        `Но мы же знаем: пока человек сам не дозреет — никакие советы не заходят 🙌\n\n` +
        `И это ок.\n\n` +
        `В <b>КОДЕ УСПЕХА</b> мы как раз про другое.\n` +
        `Не лечим, не учим жизни и не «знаем лучше».\n` +
        `Мы создаём пространство, где человек:\n` +
        `— постепенно наводит порядок\n` +
        `— начинает слышать себя\n` +
        `— и сам делает первые шаги к деньгам и реализации 💫\n\n` +
        `Ты можешь не спасать.\n` +
        `Ты можешь просто быть рядом и дать точку входа 🤍\n\n` +
        `▫️ Подари подружке доступ в <b>КОД УСПЕХА</b> —\n` +
        `и закроешь сразу два вопроса:\n\n` +
        `а) классный, небанальный подарок 🎁\n` +
        `б) тёплую взрослую поддержку без моралей и давления\n\n` +
        `Дальше она пойдёт сама.\n` +
        `А ты будешь той самой подружкой, которая однажды сказала:\n` +
        `«Смотри, мне кажется, тебе сюда» ✨`,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }
  );
}

export async function sendDay7CheckIn(userId: number, chatId: number) {
  const user = await getUserByTgId(userId);
  if (!user) return;

  const firstName = user.firstName || 'дорогая';
  const keyboard = new InlineKeyboard()
    .text('навигация клуба', 'menu_back')
    .row()
    .url('Служба заботы', 'https://t.me/Egiazarova_support_bot');

  await getTelegramService().sendPhoto(
    chatId,
    'https://t.me/mate_bot_open/9358',
    {
      caption:
        `<b>${firstName}, ты 7 дней с КОД УСПЕХА ✨</b>\n\n` +
        `Как тебе старт, успела посмотреть первые материалы?\n` +
        `Или пока больше вопросов, чем ответов?\n\n` +
        `Если что-то не так — мы рядом, поможем и подскажем.\n` +
        `Просто напиши в нашу Службу Заботы, и тебе подскажут, куда и как двигаться дальше.\n\n` +
        `Мы готовы поддержать тебя 🫶\n` +
        `Нам важно видеть твой прогресс.»`,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }
  );
}

export async function sendDay14CheckIn(userId: number, chatId: number) {
  const keyboard = new InlineKeyboard()
    .text('навигация клуба', 'menu_back')
    .row()
    .url('Служба заботы', 'https://t.me/Egiazarova_support_bot');

  await getTelegramService().sendPhoto(
    chatId,
    'https://t.me/mate_bot_open/9306',
    {
      caption:
        `<b>Ты уже 14 дней с нами 🌿</b>\n\n` +
        `Ты в процессе, и это чувствуется.\n` +
        `Возможно, что-то уже начало проясняться, а где-то ещё остаются вопросы — это нормально.\n\n` +
        `Если у тебя есть вопросы – напиши в Службу Заботы.\n\n` +
        `Мы рядом 🤍\n` +
        `И внимательно следим за твоим движением.»`,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }
  );
}

export async function sendDay21CheckIn(userId: number, chatId: number) {
  const keyboard = new InlineKeyboard()
    .text('навигация клуба', 'menu_back')
    .row()
    .url('Служба заботы', 'https://t.me/Egiazarova_support_bot');

  await getTelegramService().sendPhoto(
    chatId,
    'https://t.me/mate_bot_open/9307',
    {
      caption:
        `<b>21 день — ты правда молодец 🌟</b>\n\n` +
        `Ты уже не просто смотришь, а привыкаешь быть в процессе.\n` +
        `Именно на этом этапе начинает появляться устойчивость и внутренняя опора.\n\n` +
        `Мы рядом и поддерживаем тебя 🫶`,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }
  );
}

export async function sendDay28Renewal(userId: number, chatId: number) {
  const keyboard = new InlineKeyboard()
    .text('навигация клуба', 'menu_back')
    .row()
    .url('Служба заботы', 'https://t.me/Egiazarova_support_bot');

  await getTelegramService().sendPhoto(
    chatId,
    'https://t.me/mate_bot_open/9360',
    {
      caption:
        `<b>Ты почти месяц с нами — 28 дней 🌙</b>\n\n` +
        `🔔 Небольшое напоминание\n` +
        `Скоро будет списание за следующий период подписки\n\n` +
        `Если ты планируешь продолжать путь с нами — ничего делать не нужно, всё произойдёт автоматически 🤍\n` +
        `Если появятся вопросы по формату, доступам или оплате — <b>Служба Заботы</b> всегда на связи 💬\n\n` +
        `Спасибо, что идёшь этот путь с нами 🤍\n` +
        `Нам важно видеть твой рост и продолжение движения 🌱`,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }
  );
}

// ============================================================================
// ВОРОНКА 4: ПРОДЛЕНИЕ ПОДПИСКИ (за 2/1/0 дней)
// ============================================================================

export async function sendRenewal2Days(userId: number, chatId: number) {
  const keyboard = new InlineKeyboard()
    .text('навигация клуба', 'menu_back')
    .row()
    .url('Служба заботы', 'https://t.me/Egiazarova_support_bot');

  await getTelegramService().sendPhoto(
    chatId,
    'https://t.me/mate_bot_open/9360',
    {
      caption:
        `<b>Ты почти месяц с нами — 28 дней 🌙</b>\n\n` +
        `🔔 Небольшое напоминание\n` +
        `Скоро будет списание за следующий период подписки\n\n` +
        `Если ты планируешь продолжать путь с нами — ничего делать не нужно, всё произойдёт автоматически 🤍\n` +
        `Если появятся вопросы по формату, доступам или оплате — <b>Служба Заботы</b> всегда на связи 💬\n\n` +
        `Спасибо, что идёшь этот путь с нами 🤍\n` +
        `Нам важно видеть твой рост и продолжение движения 🌱`,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }
  );
}

export async function sendRenewal1Day(userId: number, chatId: number) {
  const user = await getUserByTgId(userId);
  if (!user) return;

  const firstName = user.firstName || 'дорогая';
  const keyboard = new InlineKeyboard()
    .text('навигация клуба', 'menu_back')
    .row()
    .url('Служба заботы', 'https://t.me/Egiazarova_support_bot');

  await getTelegramService().sendPhoto(
    chatId,
    'https://t.me/mate_bot_open/9363',
    {
      caption:
        `<b>${firstName}, важное напоминание 🌿</b>\n\n` +
        `Завтра завершается твой текущий период подписки в <b>КОД УСПЕХА</b>\n\n` +
        `Оплата за следующий период спишется автоматически 💳\n\n` +
        `Если появятся вопросы по подписке или доступам — напиши в <b>Службу Заботы 💬</b>\n` +
        `Мы рядом и поможем разобраться 🤍\n»`,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }
  );
}

export async function sendRenewalToday(userId: number, chatId: number) {
  const user = await getUserByTgId(userId);
  if (!user) return;

  const firstName = user.firstName || 'дорогая';
  const keyboard = new InlineKeyboard()
    .text('навигация клуба', 'menu_back')
    .row()
    .url('Служба заботы', 'https://t.me/Egiazarova_support_bot');

  await getTelegramService().sendPhoto(
    chatId,
    'https://t.me/mate_bot_open/9364',
    {
      caption:
        `${firstName}, информируем 🤍\n\n` +
        `Сегодня происходит автоматическое списание за следующий период подписки в <b>КОД УСПЕХА 💳</b>\n\n` +
        `Если что-то пойдёт не так или появятся вопросы — <b>Служба Заботы</b> рядом 💬\n»`,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }
  );
}

// ============================================================================
// ВОРОНКА 5: ПОДАРОЧНАЯ ПОДПИСКА - ИСТЕЧЕНИЕ (за 3/2/1 день)
// ============================================================================

export async function sendGiftExpiry3Days(userId: number, chatId: number) {
  const keyboard = new InlineKeyboard().text('продолжить путь', 'gift_continue');

  await getTelegramService().sendPhoto(
    chatId,
    'https://t.me/mate_bot_open/9361',
    {
      caption:
        `<b>🎁 Твой подарочный доступ подходит к концу</b>\n\n` +
        `Если этот месяц был для тебя полезным и ты хочешь продолжить путь с <b>КОДОМ УСПЕХА</b> —\n` +
        `ты можешь остаться с нами и двигаться дальше в своём темпе 🌿\n\n` +
        `Всё просто:\n` +
        `👉 нажми кнопку ниже и продолжи участие в клубе.\n\n` +
        `Мы будем рады, если ты пойдёшь этот путь дальше вместе с нами 🤍`,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }
  );
}

export async function sendGiftExpiry2Days(userId: number, chatId: number) {
  const keyboard = new InlineKeyboard().text('пойти дальше', 'gift_continue');

  await getTelegramService().sendPhoto(
    chatId,
    'https://t.me/mate_bot_open/9314',
    {
      caption:
        `<b>🎁 Небольшое напоминание</b>\n\n` +
        `Через <b>2 дня</b> закончится твой подарочный доступ к <b>КОДУ УСПЕХА.</b>\n\n` +
        `Если чувствуешь, что это пространство тебе откликается и хочешь продолжить путь с нами —\n` +
        `ты можешь перейти по кнопке ниже и остаться в клубе 🌿\n\n` +
        `Мы рядом и будем рады идти дальше вместе 🤍`,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }
  );
}

export async function sendGiftExpiry1Day(userId: number, chatId: number) {
  const keyboard = new InlineKeyboard().text('пойти дальше', 'gift_continue');

  await getTelegramService().sendPhoto(
    chatId,
    'https://t.me/mate_bot_open/9315',
    {
      caption:
        `<b>🎁 Напоминаем</b>\n\n` +
        `Завтра заканчивается твой подарочный доступ к <b>КОДУ УСПЕХА.</b>\n\n` +
        `Если хочешь продолжить путь с нами и сохранить доступ ко всем материалам и пространству клуба —\n` +
        `нажми кнопку ниже и оставайся 🌿\n\n` +
        `Мы будем рады, если ты пойдёшь дальше вместе с нами 🤍`,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }
  );
}

/**
 * Показать форму оплаты продления после подарочной подписки
 */
export async function showGiftContinuePayment(userId: number, chatId: number) {
  const user = await getUserById(userId);
  if (!user) return;

  const keyboard = new InlineKeyboard()
    .webApp('Оплатить', `https://hranitel.daniillepekhin.com/payment_form_club.html`);

  await getTelegramService().sendPhoto(
    chatId,
    'https://t.me/mate_bot_open/9362',
    {
      caption:
        `<b>🎫 Твой билет в КОД УСПЕХА </b>\n` +
        `<b>Информация о подписке на клуб «Код Успеха»:</b>\n\n` +
        `👉🏼 1 месяц = 2.000 ₽\n` +
        `👉🏼 В подписку входит полный доступ к клубу «Код Успеха»: обучение и мини-курсы по мягким нишам,\n` +
        `десятки — мини-группы поддержки, чаты и офлайн-встречи по городам, закрытые эфиры и разборы с Кристиной, подкасты, баллы и приложение\n` +
        `👉🏼 Подписка продлевается автоматически каждые 30 дней. Отписаться можно в любой момент в меню участника.\n` +
        `👉🏼 Если при оплате возникают сложности обратитесь в службу заботы клуба @Egiazarova_support_bot\n\n` +
        `Нажимая "Оплатить", <a href="https://ishodnyi-kod.com/clubofert">вы даете согласие на обработку персональных данных и принимаете условия публичной оферты.</a>\n\n` +
        `Получить доступ в закрытый канал 👇🏼`,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }
  );
}

// ============================================================================
// ВОРОНКА 6: ПОДАРОЧНАЯ МЕХАНИКА
// ============================================================================

/**
 * Обработка выбора пользователя для подарка
 */
export async function handleUserShared(gifterTgId: number, recipientTgId: number, chatId: number) {
  const gifter = await getUserByTgId(gifterTgId);
  if (!gifter) return;

  // Сбросить статус
  await db.update(users)
    .set({ onboardingStep: 'onboarding_complete' })
    .where(eq(users.id, gifter.id));

  // Проверка 1: Даритель ДОЛЖЕН быть участником клуба
  if (!gifter.isPro) {
    await getTelegramService().sendMessage(
      chatId,
      '❌ Дарить подписку могут только участники клуба.\n\n' +
      'Оформите подписку для себя, чтобы получить возможность дарить доступ друзьям.',
      {
        reply_markup: new InlineKeyboard()
          .text('вернуться в меню', 'menu_back')
      }
    );
    return;
  }

  // Проверка 2: Получатель НЕ должен быть участником клуба
  const existingRecipient = await getUserByTgId(recipientTgId);

  if (existingRecipient && existingRecipient.isPro) {
    await getTelegramService().sendMessage(
      chatId,
      '❌ Этот пользователь уже является участником клуба.\n\n' +
      'Пожалуйста, выберите другого друга для подарка.',
      {
        reply_markup: new InlineKeyboard()
          .text('выбрать другого друга', 'menu_gift_subscription')
          .row()
          .text('вернуться в меню', 'menu_back')
      }
    );
    return;
  }

  logger.info({ gifterTgId, recipientTgId }, 'Gift subscription - sending payment form');

  // Отправить форму оплаты (без полей - email формируется автоматически как recipientTgId@gift.local)
  const keyboard = new InlineKeyboard()
    .webApp('Оплатить', `https://hranitel.daniillepekhin.com/payment_form_gift.html?recipient_id=${recipientTgId}&gifter_id=${gifterTgId}`);

  await getTelegramService().sendPhoto(
    chatId,
    'https://t.me/mate_bot_open/9317',
    {
      caption:
        `<b>🎁 Стоимость подарка — 2.000 рублей</b>\n\n` +
        `Автоплатеж не подключается, получатель получит уведомление о необходимости продления подписки со своей карты.\n\n` +
        `<u>Ссылка на оплату действует - 60 минут.</u>\n\n` +
        `Нажимая "Оплатить", <a href="https://ishodnyi-kod.com/clubofert">вы даете согласие на обработку персональных данных и принимаете условия публичной оферты.</a>`,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }
  );
}

/**
 * После успешной оплаты подарка - отправить ссылку дарителю
 */
export async function handleGiftPaymentSuccess(
  gifterUserId: string,
  recipientTgId: number,
  gifterTgId: number,
  paymentId: string
) {
  // Ссылка для активации подарка
  const giftLink = `https://t.me/hranitel_kod_bot?start=present_${recipientTgId}`;

  // Отправить ссылку дарителю
  await getTelegramService().sendMessage(
    gifterTgId,
    `<b>🎁 Отправь эту ссылку получателю и мы откроем доступ</b>\n\n${giftLink}`,
    { parse_mode: 'HTML' }
  );

  logger.info({ gifterUserId, gifterTgId, recipientTgId, paymentId, giftLink }, 'Gift link sent to gifter');
}

/**
 * Активация подарка когда получатель переходит по ссылке /start=present_{tg_id}
 */
export async function activateGiftSubscription(recipientTgId: number, chatId: number) {
  // Найти неактивированный подарок для этого получателя в аналитике
  const allGiftPayments = await db
    .select()
    .from(paymentAnalytics)
    .where(eq(paymentAnalytics.eventType, 'gift_payment_success'))
    .orderBy(desc(paymentAnalytics.createdAt))
    .limit(100);

  const giftPayment = allGiftPayments.find(payment => {
    const metadata = payment.metadata as Record<string, any>;
    return metadata?.recipient_tg_id === recipientTgId.toString() && !metadata?.activated;
  });

  if (!giftPayment) {
    await getTelegramService().sendMessage(
      chatId,
      '❌ Подарок не найден или уже был активирован.',
      { parse_mode: 'HTML' }
    );
    return false;
  }

  // Пометить подарок как активированный
  const currentMetadata = (giftPayment.metadata as Record<string, any>) || {};
  await db
    .update(paymentAnalytics)
    .set({
      metadata: {
        ...currentMetadata,
        activated: true,
        activated_at: new Date().toISOString(),
      },
    })
    .where(eq(paymentAnalytics.id, giftPayment.id));

  // Найти или создать пользователя получателя
  let [recipient] = await db
    .select()
    .from(users)
    .where(eq(users.telegramId, recipientTgId))
    .limit(1);

  const gifterTgId = currentMetadata.gifter_tg_id || giftPayment.telegramId;

  if (!recipient) {
    // Создаем пользователя
    const [newRecipient] = await db
      .insert(users)
      .values({
        telegramId: recipientTgId,
        isPro: true,
        subscriptionExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        firstPurchaseDate: new Date(),
        metadata: {
          gifted_by: gifterTgId,
          gift_date: new Date().toISOString(),
        },
      })
      .returning();
    recipient = newRecipient;
  } else {
    // Обновляем существующего
    const recipientMetadata = (recipient.metadata as Record<string, any>) || {};
    const [updatedRecipient] = await db
      .update(users)
      .set({
        isPro: true,
        subscriptionExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
        firstPurchaseDate: recipient.firstPurchaseDate || new Date(),
        metadata: {
          ...recipientMetadata,
          gifted_by: gifterTgId,
          gift_date: new Date().toISOString(),
        },
      })
      .where(eq(users.id, recipient.id))
      .returning();
    recipient = updatedRecipient;
  }

  logger.info({ recipientTgId, recipientId: recipient.id, giftPaymentId: giftPayment.id }, 'Gift subscription activated');

  // Запустить воронку после оплаты
  await startOnboardingAfterPayment(recipient.id, chatId);

  return true;
}

/**
 * Обработка перехода по подарочной ссылке
 */
export async function handleGiftActivation(recipientTgId: number, token: string, chatId: number) {
  // Найти подарок
  const gift = await db
    .select()
    .from(giftSubscriptions)
    .where(eq(giftSubscriptions.activationToken, token))
    .limit(1);

  if (gift.length === 0) {
    await getTelegramService().sendMessage(
      chatId,
      '❌ Подарочная ссылка не найдена или недействительна.'
    );
    return;
  }

  const giftRecord = gift[0];

  // Проверка 1: Ссылка только для указанного получателя
  if (giftRecord.recipientTgId !== recipientTgId) {
    await getTelegramService().sendMessage(
      chatId,
      '❌ Этот подарок предназначен для другого пользователя.'
    );
    return;
  }

  // Проверка 2: Ссылка работает только 1 раз
  if (giftRecord.activated) {
    await getTelegramService().sendMessage(
      chatId,
      '❌ Этот подарок уже был активирован ранее.'
    );
    return;
  }

  // Проверка 3: Оплата должна быть произведена
  if (!giftRecord.paymentId) {
    await getTelegramService().sendMessage(
      chatId,
      '❌ Подарок еще не оплачен дарителем.'
    );
    return;
  }

  // Отправить приветственное сообщение
  const keyboard = new InlineKeyboard().text('начать', 'gift_start');

  await getTelegramService().sendPhoto(
    chatId,
    'https://t.me/mate_bot_open/9359',
    {
      caption:
        `<b>🎁 Тебе сделали очень крутой подарок!</b>\n\n` +
        `Это не вещь и не случайность —\n` +
        `это <b>билет в клуб КОД УСПЕХА ⭐️</b>\n\n` +
        `Добро пожаловать 🤍\n` +
        `Мы рады тебе и тому пути, который начинается прямо сейчас.\n\n` +
        `Внутри — пространство для роста, ясности и движения к своему масштабу.\n\n` +
        `👉 Нажми <b>«Начать»</b>, чтобы продолжить и сделать первый шаг ✨`,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }
  );

  // Активировать подарок
  await db
    .update(giftSubscriptions)
    .set({ activated: true, activatedAt: new Date() })
    .where(eq(giftSubscriptions.activationToken, token));
}

/**
 * Активация подарка для пользователя (создание/обновление)
 * 🔒 Uses transaction to ensure atomicity
 */
export async function activateGiftForUser(recipientTgId: number, token: string, chatId: number, ctx: any) {
  // 🔒 Wrap in transaction to prevent partial updates
  await db.transaction(async (tx) => {
    // Найти или создать пользователя
    let user = await getUserByTgId(recipientTgId);

    if (!user) {
      // Создать нового пользователя
      const newUsers = await tx.insert(users).values({
        telegramId: recipientTgId,
        username: ctx.from.username,
        firstName: ctx.from.first_name,
        isPro: true,
        gifted: true,
        subscriptionExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 дней
        firstPurchaseDate: new Date()
      }).returning();

      user = newUsers[0];
    } else {
      // Обновить существующего пользователя
      await tx.update(users).set({
        isPro: true,
        gifted: true,
        subscriptionExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        firstPurchaseDate: user.firstPurchaseDate || new Date()
      }).where(eq(users.id, user.id));
    }

    // Найти информацию о дарителе
    const gift = await tx
      .select()
      .from(giftSubscriptions)
      .where(
        and(
          eq(giftSubscriptions.recipientTgId, recipientTgId),
          eq(giftSubscriptions.activated, true)
        )
      )
      .limit(1);

    if (gift.length > 0) {
      await tx.update(users)
        .set({ giftedBy: parseInt(gift[0].gifterUserId) })
        .where(eq(users.id, user.id));
    }

    // Начать онбординг (outside transaction, it's just scheduling)
    if (user) {
      await startOnboardingAfterPayment(user.id, chatId);
    }
  });
}

// ============================================================================
// МЕНЮ БОТА
// ============================================================================

export async function sendMenuMessage(chatId: number) {
  // Установить команду /menu и кнопку меню в левом нижнем углу
  // Это восстановит кнопку если она пропала
  try {
    await getTelegramService().setMyCommands(
      [{ command: 'menu', description: 'Главное меню' }],
      { scope: { type: 'chat', chat_id: chatId } }
    );
    await getTelegramService().setChatMenuButton(chatId, { type: 'commands' });
  } catch (error) {
    logger.error({ error, chatId }, 'Failed to set menu commands/button');
  }

  const keyboard = new InlineKeyboard()
    .text('инструкция', 'menu_instruction')
    .row()
    .url('доступ в приложение', 'http://qr.numschool-web.ru/')
    .row()
    .url('канал клуба', 'https://t.me/+mwJ5e0d78GYzNDRi')
    .row()
    .webApp('все материалы здесь', process.env.WEBAPP_URL!)
    .row()
    .url('Пройти тест: какой я персонаж', 'https://t.me/mate_bot_hranitel?start=character_test')
    .row()
    .text('подарить подписку', 'menu_gift_subscription')
    .row()
    .url('оферта', 'https://ishodnyi-код.com/clubofert')
    .row()
    .url('политика', 'https://ishodnyi-kod.com/clubofert');

  await getTelegramService().sendMessage(
    chatId,
    `<b>Меню участника клуба КОД УСПЕХА ⬇️</b>`,
    { parse_mode: 'HTML', reply_markup: keyboard }
  );
}
