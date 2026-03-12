/**
 * 💳 PUBLIC PAYMENTS MODULE
 *
 * POST /api/payments/generate-link
 *   — Создаёт инвойс LavaTop. Для CP-пользователей возвращает auto_renewal.
 *   — Используется из payment_form_club.html.
 *
 * POST /api/payments/generate-link-support
 *   — Форма поддержки (?start=oplatasup). Логика провайдера по истории платежей:
 *     • LavaTop/Lava история → LavaTop инвойс
 *     • CP история или новый пользователь → CloudPayments order (SBP)
 */

import Elysia from 'elysia';
import { db } from '@/db';
import { lavatopOffers, paymentAnalytics, users, payments } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { logger } from '@/utils/logger';
import { lavaTopService } from '@/services/lavatop.service';
import { config } from '@/config';

const CP_API_BASE = 'https://api.cloudpayments.ru';
const SUPPORT_AMOUNT = 2000; // рублей

/**
 * Создаёт платёжную ссылку CloudPayments (hosted form) для формы поддержки.
 * Используется для новых клиентов и тех, кто ранее платил через CP.
 */
async function createCloudPaymentsOrder(params: {
  email: string;
  name?: string;
  phone?: string;
  telegramId: number;
  codeWord?: string;
}): Promise<string> {
  const { email, name, phone, telegramId, codeWord } = params;

  if (!config.CLOUDPAYMENTS_PUBLIC_ID || !config.CLOUDPAYMENTS_API_SECRET) {
    throw new Error('CloudPayments не настроен (нет PUBLIC_ID или API_SECRET)');
  }

  const authHeader = 'Basic ' + Buffer.from(
    `${config.CLOUDPAYMENTS_PUBLIC_ID}:${config.CLOUDPAYMENTS_API_SECRET}`
  ).toString('base64');

  const body: Record<string, any> = {
    Amount: SUPPORT_AMOUNT,
    Currency: 'RUB',
    Description: 'Подписка КОД УСПЕХА — 1 месяц',
    Email: email,
    RequireConfirmation: false,
    SendEmail: false,
    AccountId: String(telegramId),
    InvoiceId: `support_${telegramId}_${Date.now()}`,
    Data: JSON.stringify({ telegram_id: telegramId, source: 'support_form', ...(codeWord ? { code_word: codeWord } : {}) }),
  };

  if (name) body.Name = name;
  if (phone) body.Phone = phone;

  const response = await fetch(`${CP_API_BASE}/orders/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`CloudPayments orders/create failed: ${response.status} ${text}`);
  }

  const data = await response.json() as { Success: boolean; Message?: string; Model?: { Url?: string } };

  if (!data.Success || !data.Model?.Url) {
    throw new Error(`CloudPayments order error: ${data.Message ?? JSON.stringify(data)}`);
  }

  return data.Model.Url;
}

export const paymentsModule = new Elysia({ prefix: '/payments' })

  // ============================================================================
  // POST /payments/generate-link
  // ============================================================================
  .post('/generate-link', async ({ body, set }) => {
    const {
      telegram_id: rawTelegramId,
      email: rawEmail,
      name,
      phone,
      offer_key,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      currency: rawCurrency,
      payment_provider: rawPaymentProvider,
    } = body as {
      telegram_id: string | number;
      email: string;
      name?: string;
      phone?: string;
      offer_key: string;
      utm_source?: string;
      utm_medium?: string;
      utm_campaign?: string;
      utm_content?: string;
      currency?: string;
      payment_provider?: string; // 'PAYPAL' для PayPal, иначе не передаётся
    };

    // Нормализуем валюту — только RUB / USD / EUR, default RUB
    const allowedCurrencies = ['RUB', 'USD', 'EUR'] as const;
    type AllowedCurrency = typeof allowedCurrencies[number];
    const currency: AllowedCurrency = (rawCurrency && allowedCurrencies.includes(rawCurrency.toUpperCase() as AllowedCurrency))
      ? rawCurrency.toUpperCase() as AllowedCurrency
      : 'RUB';

    // Валидация обязательных полей
    if (!rawTelegramId || !rawEmail || !offer_key) {
      set.status = 400;
      return { success: false, error: 'Обязательные поля: telegram_id, email, offer_key' };
    }

    const telegram_id = typeof rawTelegramId === 'string' ? parseInt(rawTelegramId, 10) : rawTelegramId;
    const email = rawEmail.toLowerCase().trim();

    if (isNaN(telegram_id) || telegram_id <= 0) {
      set.status = 400;
      return { success: false, error: 'Некорректный telegram_id' };
    }

    // Проверяем статус подписки пользователя
    const [userRecord] = await db
      .select({
        id: users.id,
        isPro: users.isPro,
        subscriptionExpires: users.subscriptionExpires,
        lavatopContractId: users.lavatopContractId,
        cloudpaymentsSubscriptionId: users.cloudpaymentsSubscriptionId,
        autoRenewalEnabled: users.autoRenewalEnabled,
        email: users.email,
      })
      .from(users)
      .where(eq(users.telegramId, telegram_id))
      .limit(1);

    if (userRecord?.cloudpaymentsSubscriptionId) {
      // CloudPayments-пользователь — подписка продлевается автоматически через CP.
      // Создавать LavaTop инвойс нельзя — возникнет параллельная подписка.
      logger.info({ telegram_id }, '[payments/generate-link] CP user — auto_renewal active, skipping LavaTop invoice');
      return {
        success: true,
        provider: 'cloudpayments',
        auto_renewal: true,
      };
    }

    // Если подписка активна и есть lavatop_contract_id — предупреждаем фронтенд.
    // Фронтенд покажет диалог: «Продлить вперёд / Отменить подписку / Закрыть».
    // Исключение: force_renew=true — пользователь явно подтвердил продление.
    const forceRenew = (body as any).force_renew === true;
    if (!forceRenew && userRecord?.isPro && userRecord?.lavatopContractId) {
      const expires = userRecord.subscriptionExpires
        ? new Date(userRecord.subscriptionExpires).toLocaleDateString('ru-RU')
        : null;
      logger.info({ telegram_id }, '[payments/generate-link] active subscription detected, prompting user');
      return {
        success: true,
        active_subscription: true,
        expires_at: expires,
        subscription_expires: userRecord.subscriptionExpires,
      };
    }

    // Ищем оффер в БД
    const [offer] = await db
      .select()
      .from(lavatopOffers)
      .where(eq(lavatopOffers.key, offer_key))
      .limit(1);

    if (!offer) {
      set.status = 404;
      return { success: false, error: `Оффер '${offer_key}' не найден` };
    }

    if (!offer.isActive) {
      set.status = 400;
      return { success: false, error: `Оффер '${offer_key}' недоступен` };
    }

    // Сохраняем payment_attempt — нужно для идентификации пользователя при webhook
    try {
      await db.insert(paymentAnalytics).values({
        telegramId: telegram_id,
        eventType: 'payment_attempt',
        paymentProvider: 'lavatop',
        paymentMethod: offer.currency,
        amount: offer.amount ?? '0',
        currency: offer.currency,
        name: name || null,
        email,
        phone: phone || null,
        utmSource: utm_source || null,
        utmMedium: utm_medium || null,
        utmCampaign: utm_campaign || null,
        utmContent: utm_content || null,
        metadata: {
          source: 'webapp_payment_form',
          offer_key,
          offer_id: offer.offerId,
        },
      });
    } catch (e) {
      // Не блокируем генерацию ссылки если аналитика упала
      logger.warn({ e, telegram_id, email }, '[payments/generate-link] Failed to save payment_attempt');
    }

    // Создаём инвойс в LavaTop
    try {
      const invoice = await lavaTopService.createInvoice({
        email,
        offerId: offer.offerId,
        // Если передана валюта (иностранный банк) — используем её, иначе берём из оффера
        currency: currency !== 'RUB' ? currency : (offer.currency as 'RUB' | 'USD' | 'EUR'),
        periodicity: offer.periodicity as 'ONE_TIME' | 'MONTHLY' | 'PERIOD_90_DAYS' | 'PERIOD_180_DAYS',
        paymentProvider: rawPaymentProvider === 'PAYPAL' ? 'PAYPAL' : undefined,
        buyerLanguage: 'RU',
        clientUtm: {
          utm_source: utm_source || null,
          utm_medium: utm_medium || null,
          utm_campaign: utm_campaign || null,
          utm_content: utm_content || null,
          utm_term: null,
        },
      });

      logger.info(
        { telegram_id, email, offer_key, invoiceId: invoice.id },
        '[payments/generate-link] LavaTop invoice created'
      );

      return {
        success: true,
        payment_url: invoice.paymentUrl,
        invoice_id: invoice.id,
      };
    } catch (e) {
      logger.error({ e, telegram_id, email, offer_key }, '[payments/generate-link] Failed to create LavaTop invoice');
      set.status = 500;
      return { success: false, error: 'Не удалось создать ссылку на оплату. Попробуйте ещё раз.' };
    }
  })

  // ============================================================================
  // POST /payments/generate-link-support
  // Форма поддержки (?start=oplatasup).
  // Провайдер определяется по истории платежей:
  //   LavaTop / Lava история  → LavaTop инвойс
  //   CP история              → CloudPayments order (SBP)
  //   Новый пользователь      → CloudPayments order (SBP)
  // ============================================================================
  .post('/generate-link-support', async ({ body, set }) => {
    const {
      telegram_id: rawTelegramId,
      email: rawEmail,
      name,
      phone,
      code_word,
      payment_method: rawPaymentMethod,
      currency: rawSupportCurrency,
      payment_provider: rawSupportPaymentProvider,
    } = body as {
      telegram_id: string | number;
      email: string;
      name?: string;
      phone?: string;
      code_word?: string;
      payment_method?: string;  // 'bank-rf' | 'foreign-bank'
      currency?: string;        // 'USD' | 'EUR' (PayPal → USD)
      payment_provider?: string; // 'PAYPAL' для PayPal
    };

    // Нормализуем currency для LavaTop: paypal → USD, EUR → EUR, иначе RUB
    const supportAllowedCurrencies = ['RUB', 'USD', 'EUR'] as const;
    type SupportAllowedCurrency = typeof supportAllowedCurrencies[number];
    const rawSupportCurrencyUpper = rawSupportCurrency?.toUpperCase();
    const supportCurrency: SupportAllowedCurrency =
      rawSupportCurrencyUpper === 'EUR' ? 'EUR'
      : rawSupportCurrencyUpper === 'USD' || rawSupportCurrency === 'paypal' ? 'USD'
      : 'RUB';

    const isForeignBank = rawPaymentMethod === 'foreign-bank';

    if (!rawTelegramId || !rawEmail) {
      set.status = 400;
      return { success: false, error: 'Обязательные поля: telegram_id, email' };
    }

    const telegram_id = typeof rawTelegramId === 'string' ? parseInt(rawTelegramId, 10) : rawTelegramId;
    const email = rawEmail.toLowerCase().trim();

    if (isNaN(telegram_id) || telegram_id <= 0) {
      set.status = 400;
      return { success: false, error: 'Некорректный telegram_id' };
    }

    // Ищем пользователя и его последний завершённый платёж
    const [user] = await db
      .select({
        id: users.id,
        isPro: users.isPro,
        subscriptionExpires: users.subscriptionExpires,
        lavatopContractId: users.lavatopContractId,
        cloudpaymentsSubscriptionId: users.cloudpaymentsSubscriptionId,
      })
      .from(users)
      .where(eq(users.telegramId, telegram_id))
      .limit(1);

    let lastProvider: string | null = null;
    if (user) {
      const [lastPayment] = await db
        .select({ paymentProvider: payments.paymentProvider })
        .from(payments)
        .where(and(eq(payments.userId, user.id), eq(payments.status, 'completed')))
        .orderBy(desc(payments.createdAt))
        .limit(1);
      lastProvider = lastPayment?.paymentProvider ?? null;
    }

    // Логика выбора провайдера:
    // • Иностранный банк (foreign-bank) → всегда LavaTop (независимо от истории)
    // • LavaTop / Lava история → LavaTop инвойс
    // • CP история / новый пользователь → CloudPayments SBP
    const useLavaTop = isForeignBank || lastProvider === 'lavatop' || lastProvider === 'lava' || lastProvider === 'manual';

    logger.info({ telegram_id, email, lastProvider, useLavaTop }, '[payments/generate-link-support] provider resolved');

    // Защита от дублей: если подписка активна и есть lavatop_contract_id — предупреждаем
    const forceRenew = (body as any).force_renew === true;
    if (!forceRenew && user?.isPro && user?.lavatopContractId) {
      const expires = user.subscriptionExpires
        ? new Date(user.subscriptionExpires).toLocaleDateString('ru-RU')
        : null;
      return { success: true, active_subscription: true, expires_at: expires, subscription_expires: user.subscriptionExpires };
    }

    // Сохраняем payment_attempt
    try {
      await db.insert(paymentAnalytics).values({
        telegramId: telegram_id,
        eventType: 'payment_attempt',
        paymentProvider: useLavaTop ? 'lavatop' : 'cloudpayments',
        paymentMethod: 'RUB',
        amount: String(SUPPORT_AMOUNT),
        currency: 'RUB',
        name: name || null,
        email,
        phone: phone || null,
        metadata: { source: 'support_form', lastProvider, code_word: code_word || null },
      });
    } catch (e) {
      logger.warn({ e, telegram_id }, '[payments/generate-link-support] Failed to save payment_attempt');
    }

    if (useLavaTop) {
      // --- LavaTop ---
      try {
        const [offer] = await db
          .select()
          .from(lavatopOffers)
          .where(eq(lavatopOffers.key, 'monthly_rub_2000'))
          .limit(1);

        if (!offer || !offer.isActive) {
          set.status = 500;
          return { success: false, error: 'Оффер LavaTop недоступен' };
        }

        const invoice = await lavaTopService.createInvoice({
          email,
          offerId: offer.offerId,
          currency: supportCurrency,
          periodicity: 'MONTHLY',
          paymentProvider: rawSupportPaymentProvider === 'PAYPAL' ? 'PAYPAL' : undefined,
          buyerLanguage: 'RU',
          clientUtm: { utm_source: 'support', utm_medium: 'direct', utm_campaign: 'oplatasup', utm_content: null, utm_term: null },
        });

        logger.info({ telegram_id, email, invoiceId: invoice.id }, '[payments/generate-link-support] LavaTop invoice created');
        return { success: true, provider: 'lavatop', payment_url: invoice.paymentUrl };
      } catch (e) {
        logger.error({ e, telegram_id, email }, '[payments/generate-link-support] LavaTop invoice failed');
        set.status = 500;
        return { success: false, error: 'Не удалось создать ссылку на оплату. Попробуйте ещё раз.' };
      }
    } else {
      // --- CloudPayments SBP ---
      try {
        const paymentUrl = await createCloudPaymentsOrder({ email, name, phone, telegramId: telegram_id, codeWord: code_word || undefined });
        logger.info({ telegram_id, email }, '[payments/generate-link-support] CloudPayments order created');
        return { success: true, provider: 'cloudpayments', payment_url: paymentUrl };
      } catch (e) {
        logger.error({ e, telegram_id, email }, '[payments/generate-link-support] CloudPayments order failed');
        set.status = 500;
        return { success: false, error: 'Не удалось создать ссылку на оплату. Попробуйте ещё раз.' };
      }
    }
  })

  // ============================================================================
  // POST /payments/cancel-subscription
  // Отменяет подписку LavaTop пользователя. Доступ остаётся до конца оплаченного периода.
  // ============================================================================
  .post('/cancel-subscription', async ({ body, set }) => {
    const { telegram_id: rawTelegramId } = body as { telegram_id: string | number };

    if (!rawTelegramId) {
      set.status = 400;
      return { success: false, error: 'Обязательное поле: telegram_id' };
    }

    const telegram_id = typeof rawTelegramId === 'string' ? parseInt(rawTelegramId, 10) : rawTelegramId;
    if (isNaN(telegram_id) || telegram_id <= 0) {
      set.status = 400;
      return { success: false, error: 'Некорректный telegram_id' };
    }

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        lavatopContractId: users.lavatopContractId,
        subscriptionExpires: users.subscriptionExpires,
        autoRenewalEnabled: users.autoRenewalEnabled,
      })
      .from(users)
      .where(eq(users.telegramId, telegram_id))
      .limit(1);

    if (!user) {
      set.status = 404;
      return { success: false, error: 'Пользователь не найден' };
    }

    if (!user.lavatopContractId) {
      // Нет активной LavaTop подписки — просто снимаем флаг автопродления
      await db.update(users).set({ autoRenewalEnabled: false }).where(eq(users.telegramId, telegram_id));
      const expires = user.subscriptionExpires
        ? new Date(user.subscriptionExpires).toLocaleDateString('ru-RU')
        : null;
      return { success: true, message: 'Автопродление отключено', expires_at: expires };
    }

    const email = user.email ?? `${telegram_id}@unknown.local`;

    try {
      await lavaTopService.cancelSubscription(user.lavatopContractId, email);
    } catch (e: any) {
      // Если подписка уже отменена в LavaTop — не падаем, просто логируем
      logger.warn({ e: e?.message, telegram_id, contractId: user.lavatopContractId }, '[payments/cancel-subscription] LavaTop cancel failed (may already be cancelled)');
    }

    // Снимаем автопродление в нашей БД (доступ остаётся до subscriptionExpires)
    await db.update(users)
      .set({ autoRenewalEnabled: false })
      .where(eq(users.telegramId, telegram_id));

    const expires = user.subscriptionExpires
      ? new Date(user.subscriptionExpires).toLocaleDateString('ru-RU')
      : null;

    logger.info({ telegram_id, contractId: user.lavatopContractId }, '[payments/cancel-subscription] subscription cancelled');

    return {
      success: true,
      message: 'Подписка отменена',
      expires_at: expires,
    };
  })

  // ============================================================================
  // GET /payments/detect-provider?telegram_id=...
  // Возвращает провайдера для подсказки в форме поддержки (без генерации ссылки).
  // ============================================================================
  .get('/detect-provider', async ({ query }) => {
    const rawId = (query as any).telegram_id;
    if (!rawId) return { success: false, provider: 'cloudpayments' };

    const telegram_id = parseInt(String(rawId), 10);
    if (isNaN(telegram_id) || telegram_id <= 0) return { success: false, provider: 'cloudpayments' };

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.telegramId, telegram_id))
      .limit(1);

    if (!user) return { success: true, provider: 'cloudpayments' };

    const [lastPayment] = await db
      .select({ paymentProvider: payments.paymentProvider })
      .from(payments)
      .where(and(eq(payments.userId, user.id), eq(payments.status, 'completed')))
      .orderBy(desc(payments.createdAt))
      .limit(1);

    const lastProvider = lastPayment?.paymentProvider ?? null;
    const provider = (lastProvider === 'lavatop' || lastProvider === 'lava' || lastProvider === 'manual')
      ? lastProvider
      : 'cloudpayments';

    return { success: true, provider };
  });
