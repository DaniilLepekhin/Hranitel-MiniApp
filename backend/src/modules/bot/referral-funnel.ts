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
import { users, referralAgents, referralPayments, payments, paymentAnalytics } from '@/db/schema';
import { eq, and, gte } from 'drizzle-orm';
import { schedulerService } from '@/services/scheduler.service';
import { stateService } from '@/services/state.service';
import { TelegramService } from '@/services/telegram.service';
import { logger } from '@/utils/logger';
import { getWebAppUrl } from '@/config';
import { lavaTopService } from '@/services/lavatop.service';

// [OLD] n8n URL для генерации реферальных ссылок — заменён на прямой вызов LavaTop API
// const N8N_LAVA_WEBHOOK_URL = 'https://n8n4.daniillepekhin.ru/webhook/lava_club2';

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

  // Рефералы за текущий месяц
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const monthReferrals = await db
    .select({ id: referralPayments.id })
    .from(referralPayments)
    .where(
      and(
        eq(referralPayments.agentId, agent.id),
        gte(referralPayments.createdAt, startOfMonth)
      )
    );

  const thisMonthCount = monthReferrals.length;
  const firstName = agent.fullName.split(' ')[1] || agent.fullName.split(' ')[0]; // Имя (второе слово = имя, или первое если одно)
  const refLink = buildRefLink(telegramId);
  const cabinetUrl = `${getWebAppUrl()}/referral`;

  const keyboard = new InlineKeyboard()
    .webApp('открыть личный кабинет', cabinetUrl);

  await tg.sendPhoto(
    chatId,
    'https://t.me/mate_bot_open/10131',
    {
      caption: `С возвращением, агент ${firstName}! 👋

Это твой личный кабинет реферальной программы клуба <b>«Код Успеха».</b>

<b>📊 Статистика по приглашениям:</b>
— Друзей пришло от тебя (всего): ${agent.totalReferrals}
— В этом месяце: ${thisMonthCount}

<b>💰 Твоя скидка на следующий месяц:</b>
— ${agent.pendingBonus} рублей

<b>🔗 Твоя реферальная ссылка</b> (если потерял(а)):
<code>${refLink}</code>

Продолжай делиться — и делай следующий месяц в клубе ещё выгоднее для себя.`,
      parse_mode: 'HTML',
      reply_markup: keyboard,
    }
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

/**
 * Система наград по циклу из 4 рефералов:
 *   Реферал 1 (из цикла) → скидка 500 руб (ссылка Lava)
 *   Реферал 2 → скидка 1000 руб
 *   Реферал 3 → скидка 1500 руб
 *   Реферал 4 → бесплатный месяц (авто-продление подписки)
 * После каждого 4-го цикл сбрасывается.
 */
const REFERRAL_REWARD_TIERS = [
  // position 1 (1-й в цикле)
  {
    position: 1,
    discount: 500,
    offerId: '294eab72-4f3a-474b-9c1c-6c1eedd7f2d4', // разовый платёж 500 руб (скидка 1500)
    lavaUrl: 'https://app.lava.top/products/66c2fa21-3575-4ffa-99b7-49ca0e2750cd',
    label: 'скидка 500 руб на следующий месяц',
  },
  // position 2
  {
    position: 2,
    discount: 1000,
    offerId: '4434506c-dffd-4c5d-b50e-a2ddb74808eb', // разовый платёж 1000 руб (скидка 1000)
    lavaUrl: 'https://app.lava.top/products/ae1b3721-c75a-46b3-82d0-d05ac129bb7c',
    label: 'скидка 1000 руб на следующий месяц',
  },
  // position 3
  {
    position: 3,
    discount: 1500,
    offerId: '539cb542-d350-4c79-9d2e-ced03f68d21b', // разовый платёж 1500 руб (скидка 500)
    lavaUrl: 'https://app.lava.top/products/55348c77-6da8-4e1c-a68d-6252395c247e',
    label: 'скидка 1500 руб на следующий месяц',
  },
  // position 0 (4-й, 8-й, 12-й... — бесплатный месяц)
  {
    position: 0,
    discount: 2000,
    offerId: null,
    lavaUrl: null,
    label: 'бесплатный месяц клуба',
  },
] as const;

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

    // Определяем награду по позиции в цикле (1..4, затем сброс)
    const newTotal = agent.totalReferrals + 1;
    const cyclePosition = newTotal % 4; // 1→1, 2→2, 3→3, 4→0, 5→1 ...
    const reward = REFERRAL_REWARD_TIERS.find((t) => t.position === cyclePosition)!;

    // Создаём запись о бонусе
    await db.insert(referralPayments).values({
      agentId: agent.id,
      referredUserId: referredUser?.id || null,
      referredTelegramId,
      paymentId,
      bonusAmount: reward.discount,
      status: 'pending',
    });

    // Обновляем счётчик рефералов агента
    await db
      .update(referralAgents)
      .set({
        totalReferrals: newTotal,
        totalBonusEarned: agent.totalBonusEarned + reward.discount,
        updatedAt: new Date(),
      })
      .where(eq(referralAgents.id, agent.id));

    logger.info(
      { agentId: agent.id, agentTelegramId: agent.telegramId, referredTelegramId, newTotal, cyclePosition, reward: reward.label },
      'Referral reward accrued'
    );

    // Если 4-й в цикле — бесплатный месяц: продлеваем подписку
    if (cyclePosition === 0) {
      try {
        const [agentUser] = await db
          .select({ id: users.id, subscriptionExpires: users.subscriptionExpires, isPro: users.isPro })
          .from(users)
          .where(eq(users.telegramId, agent.telegramId))
          .limit(1);

        if (agentUser) {
          const baseDate = agentUser.subscriptionExpires && new Date(agentUser.subscriptionExpires) > new Date()
            ? new Date(agentUser.subscriptionExpires)
            : new Date();
          const newExpiry = new Date(baseDate);
          newExpiry.setMonth(newExpiry.getMonth() + 1);

          await db
            .update(users)
            .set({ subscriptionExpires: newExpiry, isPro: true, updatedAt: new Date() })
            .where(eq(users.id, agentUser.id));

          logger.info({ agentId: agent.id, newExpiry }, 'Free month awarded to referral agent');
        }
      } catch (extendError) {
        logger.error({ extendError, agentId: agent.id }, 'Failed to extend subscription for free month reward');
      }
    }

    // Уведомить агента в телеграм
    try {
      const tg = getTelegramService();

      if (cyclePosition === 0) {
        // Бесплатный месяц — подписка уже продлена автоматически
        await tg.sendMessage(
          agent.telegramId,
          `🎉 <b>Поздравляем! Бесплатный месяц!</b>\n\n` +
          `По вашей ссылке зарегистрировался <b>${newTotal}-й участник</b> клуба.\n\n` +
          `🎁 Ваша награда: <b>+1 месяц клуба бесплатно!</b>\n` +
          `Подписка автоматически продлена на 30 дней.\n\n` +
          `Всего рефералов: <b>${newTotal}</b>`,
          { parse_mode: 'HTML' }
        );
      } else {
        // Скидка — генерируем персональную ссылку через n8n с offer_id и данными агента
        const discountAmount = reward.discount;
        const offerId = reward.offerId!;

        // Получаем email агента из таблицы users
        const [agentUser] = await db
          .select({ email: users.email, firstName: users.firstName })
          .from(users)
          .where(eq(users.telegramId, agent.telegramId))
          .limit(1);

        const agentEmail = agentUser?.email || null;
        const agentPhone = agent.phone || null;
        const agentName = agent.fullName || agentUser?.firstName || '';
        const nextReward = REFERRAL_REWARD_TIERS.find((t) => t.position === (cyclePosition === 3 ? 0 : cyclePosition + 1))!;
        const remainingForFree = 4 - cyclePosition;

        let personalPaymentUrl: string | null = null;

        if (agentEmail) {
          try {
            // Создаём payment_attempt в нашей БД (для трекинга)
            await db.insert(paymentAnalytics).values({
              telegramId: agent.telegramId,
              eventType: 'payment_attempt',
              paymentMethod: 'RUB',
              amount: discountAmount.toString(),
              currency: 'RUB',
              name: agentName,
              email: agentEmail,
              phone: agentPhone,
              utmSource: 'referral_reward',
              utmCampaign: `referral_discount_${discountAmount}`,
              metka: `referral_discount_${discountAmount}_referral_reward`,
              metadata: {
                source: 'referral_discount',
                discount_amount: discountAmount,
                offer_id: offerId,
                referral_count: newTotal,
                cycle_position: cyclePosition,
                agent_id: agent.id,
              },
            });

            // Вызываем LavaTop напрямую для генерации персональной ссылки
            const invoice = await lavaTopService.createInvoice({
              email: agentEmail.toLowerCase().trim(),
              offerId: offerId,
              currency: 'RUB',
              periodicity: 'ONE_TIME',
              buyerLanguage: 'RU',
              clientUtm: {
                utm_source: 'referral_reward',
                utm_campaign: `referral_discount_${discountAmount}`,
                utm_medium: null,
                utm_content: null,
                utm_term: null,
              },
            });
            personalPaymentUrl = invoice.paymentUrl;
            logger.info({ agentId: agent.id, invoiceId: invoice.id }, 'Generated LavaTop referral discount link');
          } catch (linkError) {
            logger.warn({ linkError, agentId: agent.id }, 'Failed to generate LavaTop referral link, falling back to lavaUrl');
          }
        }

        // Если персональная ссылка не получилась — используем Lava-продукт как запасной вариант
        const paymentLink = personalPaymentUrl || reward.lavaUrl!;
        const linkNote = personalPaymentUrl
          ? `Ссылка персональная — данные уже заполнены`
          : `Введите свои данные при оплате`;

        await tg.sendMessage(
          agent.telegramId,
          `🎉 <b>Новый реферал!</b>\n\n` +
          `По вашей ссылке зарегистрировался новый участник клуба.\n\n` +
          `🎁 Ваша награда: <b>${reward.label}</b>\n` +
          `Оплатите следующий месяц по ссылке:\n\n` +
          `${paymentLink}\n\n` +
          `<i>${linkNote}</i>\n\n` +
          `Всего рефералов: <b>${newTotal}</b>\n` +
          `До бесплатного месяца: ещё <b>${remainingForFree}</b> ${remainingForFree === 1 ? 'человек' : remainingForFree < 5 ? 'человека' : 'человек'}\n` +
          `Следующая награда: <b>${nextReward.label}</b>`,
          { parse_mode: 'HTML' }
        );
      }
    } catch (notifyError) {
      logger.error({ notifyError, agentId: agent.id }, 'Failed to notify agent about referral reward');
    }
  } catch (error) {
    logger.error({ error, referredTelegramId, refCode }, 'Failed to process referral bonus');
  }
}
