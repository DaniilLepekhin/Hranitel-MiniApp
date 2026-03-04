/**
 * 🤝 REFERRAL FUNNEL — Воронка регистрации агента реферальной программы
 *
 * Флоу:
 * 1. Кнопка «пригласить друга» в меню → картинка + текст о программе + кнопка «зарегистрироваться»
 * 2. Вопрос 1: ФИО
 * 3. Вопрос 2: Телефон (кнопка «Поделиться номером» или вручную)
 * 4. Вопрос 3: Почему хотите стать агентом
 * 5. Успех: картинка + персональная ссылка + кнопка «личный кабинет агента»
 *
 * Догревы при незавершённой регистрации: 5, 15, 30, 45 минут
 *
 * Реферальная ссылка: https://t.me/SuccessKODBot?start=ref_{telegramId}
 * Бонус: 500 руб за каждого приведённого, 4 человека = бесплатный месяц
 */

import { InlineKeyboard, Keyboard } from 'grammy';
import { db } from '@/db';
import { users, referralAgents, referralPayments, payments } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { schedulerService } from '@/services/scheduler.service';
import { stateService } from '@/services/state.service';
import { TelegramService } from '@/services/telegram.service';
import { logger } from '@/utils/logger';
import { getWebAppUrl } from '@/config';

// Telegram service instance (initialized from bot/index.ts)
let telegramService: TelegramService | null = null;

export function initReferralFunnelTelegramService(api: any) {
  telegramService = new TelegramService(api);
}

function getTelegramService(): TelegramService {
  if (!telegramService) {
    throw new Error('TelegramService not initialized for referral funnel.');
  }
  return telegramService;
}

// ============================================================================
// REFERRAL LINK HELPERS
// ============================================================================

/** Генерирует реферальный код из telegramId */
export function buildRefCode(telegramId: number): string {
  return String(telegramId);
}

/** Генерирует реферальную ссылку */
export function buildRefLink(telegramId: number): string {
  return `https://t.me/SuccessKODBot?start=ref_${buildRefCode(telegramId)}`;
}

// ============================================================================
// STEP 1: Показать анонс программы (по нажатию «пригласить друга»)
// ============================================================================

export async function sendReferralProgramIntro(chatId: number, telegramId: number) {
  const tg = getTelegramService();

  // Проверяем — может уже зарегистрирован?
  const existing = await db
    .select()
    .from(referralAgents)
    .where(eq(referralAgents.telegramId, telegramId))
    .limit(1);

  if (existing.length > 0 && existing[0].isActive) {
    // Уже агент — показываем личный кабинет
    return sendReferralCabinet(chatId, telegramId);
  }

  const keyboard = new InlineKeyboard()
    .text('зарегистрироваться в программе ❤️', 'referral_register');

  await tg.sendPhoto(
    chatId,
    'https://t.me/mate_bot_open/10130',
    {
      caption: `<b>🎁 РЕФЕРАЛЬНАЯ ПРОГРАММА КЛУБА «КОД УСПЕХА»</b>

Хочешь платить за клуб меньше — или вообще бесплатно?
Приглашай своих людей и получай бонусы 💫

<b>Как это работает:</b>
1️⃣ Ты получаешь свою <b>реферальную</b> ссылку
2️⃣ Отправляешь её друзьям
3️⃣ Они оплачивают подписку именно по твоей ссылке

Это важно — засчитываются только оплаты по твоей персональной ссылке.

<b>Твои бонусы:</b>
💰 За каждого приведённого участника — <b>скидка 500 рублей</b> на следующий месяц.

Если ты приглашаешь 4 человек,
и они оплачивают клуб по твоей ссылке —

✨ твой следующий месяц участия становится бесплатным.

Это честная система:
ты делишься клубом — клуб благодарит тебя.

<b>Если хочешь стать АГЕНТОМ клуба, регистрируйся по кнопке ниже.</b> Тебе придет 3 коротких вопроса, чтобы мы добавили тебя в реферальную программу и закрепили за тобой личную ссылку.

Ответь на них — и я сразу отправлю твою персональную реферальную ссылку 💫`,
      parse_mode: 'HTML',
      reply_markup: keyboard,
    }
  );

  // Запускаем догревы (если пользователь не зарегистрируется)
  await scheduleReferralReminders(telegramId, chatId);
}

// ============================================================================
// STEP 2+: Начать регистрацию агента (callback: referral_register)
// ============================================================================

export async function startReferralRegistration(chatId: number, telegramId: number) {
  const tg = getTelegramService();

  // Отменяем догревы — пользователь кликнул «зарегистрироваться»
  await cancelReferralReminders(telegramId);

  // Устанавливаем состояние «ожидаем ФИО»
  await stateService.setState(telegramId, 'awaiting_referral_name', {}, 3600);

  await tg.sendMessage(
    chatId,
    '👤 <b>Как вас зовут?</b>\n\nВведите ваше полное ФИО (Фамилия Имя Отчество):',
    { parse_mode: 'HTML' }
  );
}

// ============================================================================
// STEP 3: Получили ФИО → спрашиваем телефон
// ============================================================================

export async function handleReferralName(chatId: number, telegramId: number, fullName: string) {
  const tg = getTelegramService();

  // Сохраняем ФИО в метаданных состояния
  await stateService.setState(telegramId, 'awaiting_referral_phone', { fullName }, 3600);

  // Клавиатура с кнопкой «Поделиться номером»
  const keyboard = new Keyboard()
    .requestContact('📱 Поделиться номером')
    .resized();

  await tg.sendMessage(
    chatId,
    '📱 <b>Укажите ваш номер телефона</b>\n\nНажмите кнопку ниже или введите номер вручную в формате +79991234567:',
    { parse_mode: 'HTML', reply_markup: keyboard }
  );
}

// ============================================================================
// STEP 4: Получили телефон → спрашиваем причину
// ============================================================================

export async function handleReferralPhone(
  chatId: number,
  telegramId: number,
  phone: string,
  currentMetadata: Record<string, any>
) {
  const tg = getTelegramService();

  // Убираем Reply Keyboard
  const removeKeyboard = { remove_keyboard: true } as any;

  await stateService.setState(
    telegramId,
    'awaiting_referral_reason',
    { ...currentMetadata, phone },
    3600
  );

  await tg.sendMessage(
    chatId,
    '💭 <b>Почему хотите стать агентом?</b>\n\nРасскажите немного о себе и своих планах по привлечению участников в клуб:',
    { parse_mode: 'HTML', reply_markup: removeKeyboard }
  );
}

// ============================================================================
// STEP 5: Получили причину → создаём агента и отправляем успех
// ============================================================================

export async function handleReferralReason(
  chatId: number,
  telegramId: number,
  reason: string,
  currentMetadata: Record<string, any>
) {
  const tg = getTelegramService();

  const fullName = currentMetadata.fullName as string;
  const phone = currentMetadata.phone as string;

  if (!fullName || !phone) {
    logger.error({ telegramId }, 'Missing fullName or phone in referral registration metadata');
    await stateService.deleteState(telegramId);
    await tg.sendMessage(chatId, 'Произошла ошибка. Попробуйте снова — нажмите «пригласить друга» в меню.');
    return;
  }

  // Находим пользователя в БД
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.telegramId, telegramId))
    .limit(1);

  if (!user) {
    logger.error({ telegramId }, 'User not found during referral registration');
    await stateService.deleteState(telegramId);
    await tg.sendMessage(chatId, 'Не удалось найти ваш аккаунт. Обратитесь в поддержку.');
    return;
  }

  // Проверяем — вдруг уже есть агент (двойной сабмит)
  const existingAgent = await db
    .select()
    .from(referralAgents)
    .where(eq(referralAgents.telegramId, telegramId))
    .limit(1);

  let agent = existingAgent[0];

  if (!agent) {
    const refCode = buildRefCode(telegramId);

    const [newAgent] = await db
      .insert(referralAgents)
      .values({
        userId: user.id,
        telegramId,
        fullName,
        phone,
        reason,
        refCode,
      })
      .returning();

    agent = newAgent;
    logger.info({ telegramId, agentId: agent.id, refCode }, 'New referral agent registered');
  }

  // Сбрасываем состояние
  await stateService.deleteState(telegramId);

  // Отправляем финальное сообщение с реферальной ссылкой
  const refLink = buildRefLink(telegramId);
  const cabinetUrl = `${getWebAppUrl()}/referral`;

  const keyboard = new InlineKeyboard()
    .webApp('перейти в личный кабинет агента', cabinetUrl);

  await tg.sendPhoto(
    chatId,
    'https://t.me/mate_bot_open/10131',
    {
      caption: `🎉 <b>Поздравляем! Вы стали агентом реферальной программы!</b>

Ваша персональная ссылка:
<code>${refLink}</code>

Поделитесь ею с друзьями — за каждого нового участника вы получите <b>500 рублей</b>.
<b>4 приглашённых</b> = бесплатный месяц в клубе!

Отслеживайте своих рефералов и бонусы в личном кабинете 👇`,
      parse_mode: 'HTML',
      reply_markup: keyboard,
    }
  );
}

// ============================================================================
// PERSONAL CABINET: Показ кабинета уже зарегистрированному агенту
// ============================================================================

export async function sendReferralCabinet(chatId: number, telegramId: number) {
  const tg = getTelegramService();

  const [agent] = await db
    .select()
    .from(referralAgents)
    .where(eq(referralAgents.telegramId, telegramId))
    .limit(1);

  if (!agent) {
    await tg.sendMessage(chatId, 'Вы пока не зарегистрированы в реферальной программе.');
    return;
  }

  const refLink = buildRefLink(telegramId);
  const cabinetUrl = `${getWebAppUrl()}/referral`;

  const keyboard = new InlineKeyboard()
    .webApp('открыть личный кабинет', cabinetUrl);

  await tg.sendMessage(
    chatId,
    `📊 <b>Ваш кабинет агента</b>

🔗 Реферальная ссылка:
<code>${refLink}</code>

👥 Всего рефералов: <b>${agent.totalReferrals}</b>
💰 Ожидает выплаты: <b>${agent.pendingBonus} руб</b>
✅ Всего заработано: <b>${agent.totalBonusEarned} руб</b>`,
    { parse_mode: 'HTML', reply_markup: keyboard }
  );
}

// ============================================================================
// DOGREV: Запланировать догревы при незавершённой регистрации
// ============================================================================

const REMINDER_TEXTS: Record<string, string> = {
  referral_reminder_5m: `👋 Вы только что узнали о нашей реферальной программе!

Зарегистрируйтесь как агент и получайте <b>500 рублей</b> за каждого приглашённого друга.

Это займёт всего 2 минуты 👇`,

  referral_reminder_15m: `💡 Пока вы думаете, другие уже зарабатывают на реферальной программе Клуба КОД УСПЕХА!

<b>500 рублей</b> за каждого друга — простой способ получить бонус.
<b>4 человека</b> = бесплатный месяц!

Присоединитесь сейчас 👇`,

  referral_reminder_30m: `⏰ Напоминаем о реферальной программе!

Ваши друзья ищут место для роста? Клуб КОД УСПЕХА — именно то, что им нужно.
А вы получите <b>500 рублей</b> за каждого.

Зарегистрируйтесь как агент — это бесплатно 👇`,

  referral_reminder_45m: `🌟 Последнее напоминание о реферальной программе.

Мы искренне хотим, чтобы вы поучаствовали — ведь это выгодно для всех!
Приглашайте друзей, получайте бонусы и помогайте людям меняться к лучшему.

Жмите и регистрируйтесь 👇`,
};

export async function scheduleReferralReminders(telegramId: number, chatId: number) {
  const delays = [
    { type: 'referral_reminder_5m' as const, ms: 5 * 60 * 1000 },
    { type: 'referral_reminder_15m' as const, ms: 15 * 60 * 1000 },
    { type: 'referral_reminder_30m' as const, ms: 30 * 60 * 1000 },
    { type: 'referral_reminder_45m' as const, ms: 45 * 60 * 1000 },
  ];

  for (const { type, ms } of delays) {
    await schedulerService.schedule({ type, userId: telegramId, chatId }, ms);
  }
}

export async function cancelReferralReminders(telegramId: number) {
  await schedulerService.cancelUserTasksByType(telegramId, 'referral_reminder_5m');
  await schedulerService.cancelUserTasksByType(telegramId, 'referral_reminder_15m');
  await schedulerService.cancelUserTasksByType(telegramId, 'referral_reminder_30m');
  await schedulerService.cancelUserTasksByType(telegramId, 'referral_reminder_45m');
}

export async function sendReferralReminder(chatId: number, telegramId: number, type: string) {
  const tg = getTelegramService();

  // Если уже зарегистрирован — не отправляем догрев
  const existing = await db
    .select()
    .from(referralAgents)
    .where(eq(referralAgents.telegramId, telegramId))
    .limit(1);

  if (existing.length > 0) return;

  // Если уже в процессе регистрации — не отправляем догрев
  const state = await stateService.getState(telegramId);
  if (
    state?.state === 'awaiting_referral_name' ||
    state?.state === 'awaiting_referral_phone' ||
    state?.state === 'awaiting_referral_reason'
  ) {
    return;
  }

  const text = REMINDER_TEXTS[type];
  if (!text) return;

  const keyboard = new InlineKeyboard()
    .text('зарегистрироваться в программе ❤️', 'referral_register');

  await tg.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: keyboard });
}

// ============================================================================
// PAYMENT HOOK: Начислить бонус агенту когда его реферал оплатил
// ============================================================================

const REFERRAL_BONUS = 500; // руб

export async function processReferralBonus(
  referredTelegramId: number,
  referredUserId: string,
  paymentId: string,
  refCode: string
) {
  try {
    // Находим агента по refCode
    const [agent] = await db
      .select()
      .from(referralAgents)
      .where(eq(referralAgents.refCode, refCode))
      .limit(1);

    if (!agent) {
      logger.warn({ refCode, referredTelegramId }, 'Referral agent not found for refCode');
      return;
    }

    if (!agent.isActive) {
      logger.warn({ refCode, agentId: agent.id }, 'Referral agent is inactive, skipping bonus');
      return;
    }

    // Проверяем — нет ли уже начисления за этого пользователя
    const existing = await db
      .select()
      .from(referralPayments)
      .where(eq(referralPayments.referredTelegramId, referredTelegramId))
      .limit(1);

    if (existing.length > 0) {
      logger.info({ referredTelegramId, agentId: agent.id }, 'Referral bonus already recorded for this user');
      return;
    }

    // Находим referred user UUID
    const [referredUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.telegramId, referredTelegramId))
      .limit(1);

    // Создаём запись о бонусе
    await db.insert(referralPayments).values({
      agentId: agent.id,
      referredUserId: referredUser?.id || null,
      referredTelegramId,
      paymentId,
      bonusAmount: REFERRAL_BONUS,
      status: 'pending',
    });

    // Обновляем счётчики агента
    await db
      .update(referralAgents)
      .set({
        totalReferrals: agent.totalReferrals + 1,
        pendingBonus: agent.pendingBonus + REFERRAL_BONUS,
        totalBonusEarned: agent.totalBonusEarned + REFERRAL_BONUS,
        updatedAt: new Date(),
      })
      .where(eq(referralAgents.id, agent.id));

    logger.info(
      { agentId: agent.id, agentTelegramId: agent.telegramId, referredTelegramId, bonus: REFERRAL_BONUS },
      'Referral bonus accrued'
    );

    // Уведомить агента в телеграм
    try {
      const tg = getTelegramService();
      await tg.sendMessage(
        agent.telegramId,
        `🎉 <b>Новый реферал!</b>\n\nПо вашей ссылке зарегистрировался новый участник клуба.\nВам начислено <b>${REFERRAL_BONUS} рублей</b>.\n\nВсего рефералов: <b>${agent.totalReferrals + 1}</b>`,
        { parse_mode: 'HTML' }
      );
    } catch (notifyError) {
      logger.error({ notifyError, agentId: agent.id }, 'Failed to notify agent about referral bonus');
    }
  } catch (error) {
    logger.error({ error, referredTelegramId, refCode }, 'Failed to process referral bonus');
  }
}
