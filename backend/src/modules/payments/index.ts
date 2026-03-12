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
}): Promise<string> {
  const { email, name, phone, telegramId } = params;

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
    Data: JSON.stringify({ telegram_id: telegramId, source: 'support_form' }),
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
    };

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

    // Определяем провайдера пользователя по cloudpaymentsSubscriptionId
    const [userRecord] = await db
      .select({ cloudpaymentsSubscriptionId: users.cloudpaymentsSubscriptionId })
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
        currency: offer.currency as 'RUB' | 'USD' | 'EUR',
        periodicity: offer.periodicity as 'ONE_TIME' | 'MONTHLY' | 'PERIOD_90_DAYS' | 'PERIOD_180_DAYS',
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
    } = body as {
      telegram_id: string | number;
      email: string;
      name?: string;
      phone?: string;
    };

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
      .select({ id: users.id, cloudpaymentsSubscriptionId: users.cloudpaymentsSubscriptionId })
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
    // • LavaTop / Lava (старый) → LavaTop инвойс
    // • CP история / новый пользователь → CloudPayments SBP
    const useLavaTop = lastProvider === 'lavatop' || lastProvider === 'lava' || lastProvider === 'manual';

    logger.info({ telegram_id, email, lastProvider, useLavaTop }, '[payments/generate-link-support] provider resolved');

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
        metadata: { source: 'support_form', lastProvider },
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
          currency: 'RUB',
          periodicity: 'MONTHLY',
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
        const paymentUrl = await createCloudPaymentsOrder({ email, name, phone, telegramId: telegram_id });
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
