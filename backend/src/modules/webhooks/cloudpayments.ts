/**
 * 💳 CLOUDPAYMENTS WEBHOOK HANDLER
 *
 * Обрабатывает уведомления от CloudPayments о платежах.
 * Все ответы: { code: 0 } = OK, { code: 10 } = ошибка (CP повторит запрос), { code: 13 } = неверная подпись
 *
 * Webhook URLs (прописать в личном кабинете CloudPayments → Уведомления):
 *   Pay:       https://app.successkod.com/api/webhooks/cloudpayments/pay
 *   Fail:      https://app.successkod.com/api/webhooks/cloudpayments/fail
 *   Refund:    https://app.successkod.com/api/webhooks/cloudpayments/refund
 *   Check:     https://app.successkod.com/api/webhooks/cloudpayments/check
 *   Cancel:    https://app.successkod.com/api/webhooks/cloudpayments/cancel
 *   Recurrent: https://app.successkod.com/api/webhooks/cloudpayments/recurrent
 *
 * Идентификатор пользователя: AccountId = telegram_id
 * Подпись: HMAC-SHA256(rawBody, CLOUDPAYMENTS_API_SECRET), заголовок Content-HMAC
 */

import Elysia from 'elysia';
import { createHmac, timingSafeEqual } from 'crypto';
import { db } from '@/db';
import { users, payments, paymentAnalytics } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/utils/logger';
import { config } from '@/config';
import { subscriptionGuardService } from '@/services/subscription-guard.service';
import { startOnboardingAfterPayment } from '@/modules/bot/post-payment-funnels';
import { energiesService } from '@/modules/energy-points/service';
import { processReferralBonus } from '@/modules/bot/referral-funnel';
import { decadesService } from '@/services/decades.service';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Верифицирует подпись Content-HMAC от CloudPayments.
 * HMAC-SHA256 от сырого URL-encoded тела, ключ — API Secret.
 */
function verifyHmac(rawBody: string, signature: string | null): boolean {
  if (!signature || !config.CLOUDPAYMENTS_API_SECRET) return false;
  const expected = createHmac('sha256', config.CLOUDPAYMENTS_API_SECRET)
    .update(rawBody)
    .digest('base64');
  try {
    return timingSafeEqual(
      Buffer.from(signature, 'base64'),
      Buffer.from(expected, 'base64')
    );
  } catch {
    return false;
  }
}

/** Парсит JsonData / Data из тела вебхука — строка с JSON от CloudPayments. */
function parseJsonData(raw: string | undefined): Record<string, any> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Расширяет дату подписки на 30 дней — от текущего срока или от сегодня (берёт максимум) */
function calcNewExpiry(current: Date | null): Date {
  const base = current && current > new Date() ? current : new Date();
  const next = new Date(base);
  next.setDate(next.getDate() + 30);
  return next;
}

// ============================================================================
// MODULE
// ============================================================================

export const cloudpaymentsWebhook = new Elysia({ prefix: '/webhooks/cloudpayments' })

  // --- Захватываем сырое тело для HMAC-верификации ---
  .onParse(async ({ request, contentType }) => {
    if (contentType?.includes('application/x-www-form-urlencoded')) {
      const raw = await request.text();
      const parsed = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>;
      return { ...parsed, __rawBody: raw };
    }
  })

  // ============================================================================
  // POST /pay — Успешный платёж
  // ============================================================================
  .post('/pay', async ({ body, headers }) => {
    const b = body as Record<string, string>;
    const rawBody: string = b.__rawBody || '';
    const hmacHeader = headers['content-hmac'] ?? null;

    // 1. Проверка подписи
    if (!verifyHmac(rawBody, hmacHeader)) {
      logger.warn({ hmacHeader }, '[CloudPayments /pay] Invalid HMAC signature');
      return { code: 13 };
    }

    const transactionId = b.TransactionId;
    const status = b.Status;
    const amount = parseFloat(b.Amount || '0');
    const accountId = b.AccountId; // telegram_id
    const subscriptionId = b.SubscriptionId || null;
    const jsonData = parseJsonData(b.JsonData || b.Data);

    logger.info({ transactionId, status, amount, accountId, subscriptionId }, '[CloudPayments /pay] received');

    // 2. Только Completed обрабатываем
    if (status !== 'Completed') {
      logger.info({ transactionId, status }, '[CloudPayments /pay] Status is not Completed, skipping');
      return { code: 0 };
    }

    // 3. Определяем telegram_id
    const telegramIdRaw = accountId || jsonData.telegram_id;
    const telegramId = telegramIdRaw ? Number(telegramIdRaw) : null;

    if (!telegramId || isNaN(telegramId)) {
      logger.error({ accountId, jsonData }, '[CloudPayments /pay] Cannot determine telegram_id');
      return { code: 10 };
    }

    try {
      // 4. Идемпотентность — не обрабатывать дважды
      const existingPayment = await db
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.externalPaymentId, String(transactionId)))
        .limit(1);

      if (existingPayment.length > 0) {
        logger.info({ transactionId }, '[CloudPayments /pay] Already processed, skipping');
        return { code: 0 };
      }

      // 5. Находим пользователя
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, telegramId))
        .limit(1);

      if (!user) {
        logger.error({ telegramId }, '[CloudPayments /pay] User not found');
        return { code: 10 };
      }

      const isFirstPurchase = !user.isPro && !user.firstPurchaseDate;
      const newExpiry = calcNewExpiry(user.subscriptionExpires ? new Date(user.subscriptionExpires) : null);

      const codeWord: string | null = jsonData.code_word || null;

      // 6. Обновляем подписку + сохраняем subscriptionId как типизированную колонку
      await db
        .update(users)
        .set({
          isPro: true,
          subscriptionExpires: newExpiry,
          autoRenewalEnabled: true,
          updatedAt: new Date(),
          ...(subscriptionId ? { cloudpaymentsSubscriptionId: subscriptionId } : {}),
          ...(isFirstPurchase ? { firstPurchaseDate: new Date() } : {}),
          ...(codeWord ? { codeWord } : {}),
        })
        .where(eq(users.id, user.id));

      // 7. Записываем в payments
      const [newPayment] = await db.insert(payments).values({
        userId: user.id,
        amount: String(amount),
        currency: b.Currency || 'RUB',
        status: 'completed',
        paymentProvider: 'cloudpayments',
        externalPaymentId: String(transactionId),
        name: jsonData.name || null,
        email: jsonData.email || null,
        phone: jsonData.phone || null,
        completedAt: new Date(),
        metadata: {
          subscriptionId,
          source: jsonData.source || 'cloudpayments',
          utmCampaign: jsonData.utm_campaign || null,
          utmMedium: jsonData.utm_medium || null,
          utmSource: jsonData.utm_source || null,
          period: jsonData.period || 'monthly',
          isFirstPurchase,
        },
      }).returning();

      // 8. Записываем в payment_analytics
      await db.insert(paymentAnalytics).values({
        telegramId,
        eventType: 'payment_success',
        paymentProvider: 'cloudpayments',
        paymentMethod: 'RUB',
        amount: String(amount),
        currency: b.Currency || 'RUB',
        paymentId: newPayment.id,
        name: jsonData.name || null,
        email: jsonData.email || null,
        phone: jsonData.phone || null,
        utmSource: jsonData.utm_source || null,
        utmMedium: jsonData.utm_medium || null,
        utmCampaign: jsonData.utm_campaign || null,
        utmContent: jsonData.utm_content || null,
        metka: jsonData.metka || null,
        metadata: {
          transactionId,
          subscriptionId,
          period: jsonData.period || 'monthly',
        },
      });

      logger.info(
        { telegramId, newExpiry, transactionId, isFirstPurchase, subscriptionId },
        '[CloudPayments /pay] Subscription extended successfully'
      );

      // 9. +500 энергий (как у Lava)
      try {
        await energiesService.award(user.id, 500, 'Продление подписки', {
          source: 'cloudpayments_payment',
          transactionId,
        });
      } catch (e) {
        logger.warn({ e, telegramId }, '[CloudPayments /pay] Failed to award energies');
      }

      // 10. Реферальный бонус
      try {
        const userMeta = (user.metadata as Record<string, any>) || {};
        const refCode = userMeta.ref_code || jsonData.ref_code || null;
        if (refCode) {
          await processReferralBonus(telegramId, user.id, newPayment.id, refCode);
          logger.info({ telegramId, refCode }, '[CloudPayments /pay] Referral bonus processed');
        }
      } catch (e) {
        logger.warn({ e, telegramId }, '[CloudPayments /pay] Failed to process referral bonus');
      }

      // 11. Разбаниваем из защищённых чатов
      try {
        await subscriptionGuardService.unbanUserFromAllChats(telegramId, user.id);
      } catch (e) {
        logger.warn({ e }, '[CloudPayments /pay] Failed to unban user');
      }

      // 12. Восстанавливаем в десятке
      try {
        await decadesService.restoreUserToDecade(user.id, telegramId);
      } catch (e) {
        logger.warn({ e, telegramId }, '[CloudPayments /pay] Failed to restore decade');
      }

      // 13. Онбординг для новых пользователей
      if (isFirstPurchase) {
        try {
          await startOnboardingAfterPayment(user.id, telegramId);
        } catch (e) {
          logger.warn({ e }, '[CloudPayments /pay] Failed to start onboarding');
        }
      }

      return { code: 0 };
    } catch (error) {
      logger.error({ error, telegramId, transactionId }, '[CloudPayments /pay] Unexpected error');
      return { code: 10 }; // CloudPayments повторит запрос
    }
  })

  // ============================================================================
  // POST /fail — Платёж не прошёл
  // ============================================================================
  .post('/fail', async ({ body, headers }) => {
    const b = body as Record<string, string>;
    const rawBody: string = b.__rawBody || '';
    const hmacHeader = headers['content-hmac'] ?? null;

    if (!verifyHmac(rawBody, hmacHeader)) {
      logger.warn('[CloudPayments /fail] Invalid HMAC signature');
      return { code: 13 };
    }

    logger.info(
      { transactionId: b.TransactionId, accountId: b.AccountId, reason: b.Reason },
      '[CloudPayments /fail] Payment failed'
    );

    // Логируем в payment_analytics
    const telegramId = b.AccountId ? Number(b.AccountId) : null;
    if (telegramId && !isNaN(telegramId)) {
      try {
        await db.insert(paymentAnalytics).values({
          telegramId,
          eventType: 'payment_failed',
          paymentProvider: 'cloudpayments',
          paymentMethod: 'RUB',
          metadata: { transactionId: b.TransactionId, reason: b.Reason },
        });
      } catch (e) {
        logger.warn({ e }, '[CloudPayments /fail] Failed to log to analytics');
      }
    }

    return { code: 0 };
  })

  // ============================================================================
  // POST /refund — Возврат платежа
  // ============================================================================
  .post('/refund', async ({ body, headers }) => {
    const b = body as Record<string, string>;
    const rawBody: string = b.__rawBody || '';
    const hmacHeader = headers['content-hmac'] ?? null;

    if (!verifyHmac(rawBody, hmacHeader)) {
      logger.warn('[CloudPayments /refund] Invalid HMAC signature');
      return { code: 13 };
    }

    const accountId = b.AccountId;
    const telegramId = accountId ? Number(accountId) : null;
    const transactionId = b.TransactionId;

    logger.info({ transactionId, telegramId }, '[CloudPayments /refund] Refund received');

    if (!telegramId || isNaN(telegramId)) return { code: 0 };

    try {
      const [user] = await db
        .select({ id: users.id, isPro: users.isPro })
        .from(users)
        .where(eq(users.telegramId, telegramId))
        .limit(1);

      if (user) {
        await db
          .update(users)
          .set({
            isPro: false,
            subscriptionExpires: null,
            cloudpaymentsSubscriptionId: null,
            autoRenewalEnabled: false,
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id));

        await db
          .update(payments)
          .set({ status: 'refunded' })
          .where(
            and(
              eq(payments.userId, user.id),
              eq(payments.externalPaymentId, String(transactionId))
            )
          );

        await db.insert(paymentAnalytics).values({
          telegramId,
          eventType: 'payment_refunded',
          paymentProvider: 'cloudpayments',
          metadata: { transactionId },
        });

        logger.info({ telegramId, transactionId }, '[CloudPayments /refund] Subscription revoked');
      }
    } catch (error) {
      logger.error({ error, telegramId }, '[CloudPayments /refund] Error processing refund');
      return { code: 10 };
    }

    return { code: 0 };
  })

  // ============================================================================
  // POST /check — Проверка перед платежом (всегда 0)
  // ============================================================================
  .post('/check', async ({ body }) => {
    const b = body as Record<string, string>;
    logger.info(
      { accountId: b.AccountId, amount: b.Amount, invoiceId: b.InvoiceId },
      '[CloudPayments /check] Pre-payment check'
    );
    return { code: 0 };
  })

  // ============================================================================
  // POST /cancel — Платёж отменён
  // ============================================================================
  .post('/cancel', async ({ body, headers }) => {
    const b = body as Record<string, string>;
    const rawBody: string = b.__rawBody || '';
    const hmacHeader = headers['content-hmac'] ?? null;

    if (!verifyHmac(rawBody, hmacHeader)) {
      logger.warn('[CloudPayments /cancel] Invalid HMAC signature');
      return { code: 13 };
    }

    logger.info(
      { transactionId: b.TransactionId, accountId: b.AccountId },
      '[CloudPayments /cancel] Payment cancelled'
    );
    return { code: 0 };
  })

  // ============================================================================
  // POST /recurrent — Изменение статуса рекуррентной подписки
  // ============================================================================
  .post('/recurrent', async ({ body, headers }) => {
    const b = body as Record<string, string>;
    const rawBody: string = b.__rawBody || '';
    const hmacHeader = headers['content-hmac'] ?? null;

    if (!verifyHmac(rawBody, hmacHeader)) {
      logger.warn('[CloudPayments /recurrent] Invalid HMAC signature');
      return { code: 13 };
    }

    const cpSubscriptionId = b.Id;
    const accountId = b.AccountId;
    const status = b.Status;
    const telegramId = accountId ? Number(accountId) : null;

    logger.info({ cpSubscriptionId, status, telegramId }, '[CloudPayments /recurrent] Subscription status change');

    if (!telegramId || isNaN(telegramId)) return { code: 0 };

    try {
      const [user] = await db
        .select({ id: users.id, metadata: users.metadata })
        .from(users)
        .where(eq(users.telegramId, telegramId))
        .limit(1);

      if (!user) return { code: 0 };

      if (status === 'Active') {
        // Сохраняем subscriptionId в типизированную колонку
        await db
          .update(users)
          .set({ cloudpaymentsSubscriptionId: cpSubscriptionId, updatedAt: new Date() })
          .where(eq(users.id, user.id));

      } else if (status === 'PastDue') {
        logger.warn({ telegramId, cpSubscriptionId }, '[CloudPayments /recurrent] Subscription past due');

      } else if (['Cancelled', 'Rejected', 'Expired'].includes(status)) {
        // Подписка отменена — отключаем автопродление и снимаем subscriptionId,
        // но сохраняем isPro=true до конца оплаченного периода (subscriptionExpires).
        // checkExpiredSubscriptionsDaily cron обнулит isPro когда срок истечёт.
        // Только для Expired/Rejected — сразу снимаем isPro (платёж не прошёл).
        const isHardEnd = status === 'Rejected' || status === 'Expired';
        await db
          .update(users)
          .set({
            ...(isHardEnd ? { isPro: false, subscriptionExpires: null } : {}),
            cloudpaymentsSubscriptionId: null,
            autoRenewalEnabled: false,
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id));

        await db.insert(paymentAnalytics).values({
          telegramId,
          eventType: 'subscription_cancelled',
          paymentProvider: 'cloudpayments',
          metadata: { cpSubscriptionId, status, reason: 'recurrent_status_change' },
        });

        logger.info({ telegramId, cpSubscriptionId, status, isHardEnd }, '[CloudPayments /recurrent] Subscription ended');
      }
    } catch (error) {
      logger.error({ error, telegramId, cpSubscriptionId }, '[CloudPayments /recurrent] Error');
    }

    return { code: 0 };
  });
