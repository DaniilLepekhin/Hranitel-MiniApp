/**
 * 💳 LAVATOP WEBHOOK HANDLER
 *
 * Обрабатывает уведомления от LavaTop о платежах и подписках.
 *
 * Webhook URLs (настроить в ЛК LavaTop → Webhooks):
 *   Тип "Результат платежа":   POST https://app.successkod.com/api/webhooks/lavatop/payment
 *   Тип "Регулярный платёж":   POST https://app.successkod.com/api/webhooks/lavatop/recurring
 *
 * Аутентификация входящих webhook:
 *   LavaTop шлёт заголовок X-Api-Key со значением, которое задаётся в ЛК LavaTop
 *   при настройке webhook. Это значение сохраняется как LAVATOP_WEBHOOK_SECRET.
 *
 * IP LavaTop для whitelist: 158.160.60.174
 *
 * Идентификация пользователя:
 *   1. По users.email (нормализованный lowercase)
 *   2. Fallback: по paymentAnalytics.email (где telegram_id сохранён при создании ссылки)
 *
 * Идемпотентность: payments.externalPaymentId = contractId (uniqueIndex)
 */

import Elysia from 'elysia';
import { timingSafeEqual } from 'crypto';
import { db } from '@/db';
import { users, payments, paymentAnalytics } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { logger } from '@/utils/logger';
import { config } from '@/config';
import { withLock } from '@/utils/distributed-lock';
import { lavatopOffers } from '@/db/schema';
import { subscriptionGuardService } from '@/services/subscription-guard.service';
import { startOnboardingAfterPayment, sendRenewalConfirmation } from '@/modules/bot/post-payment-funnels';
import { energiesService } from '@/modules/energy-points/service';
import { processReferralBonus } from '@/modules/bot/referral-funnel';
import { decadesService } from '@/services/decades.service';

// ============================================================================
// TYPES — LavaTop webhook payloads
// ============================================================================

interface LavaTopPaymentWebhook {
  eventType: 'payment.success' | 'payment.failed';
  product: { id: string; title: string };
  buyer: { email: string };
  contractId: string;
  parentContractId: string | null;
  amount: number;
  currency: string;
  /** 'completed' | 'subscription-active' | 'failed' | 'subscription-failed' */
  status: string;
  timestamp: string;
  clientUtm?: {
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    utm_content?: string | null;
    utm_term?: string | null;
  };
  errorMessage?: string;
}

interface LavaTopRecurringWebhook {
  eventType:
    | 'subscription.recurring.payment.success'
    | 'subscription.recurring.payment.failed'
    | 'subscription.cancelled';
  contractId: string;
  parentContractId: string; // NOT null for recurring
  product: { id: string; title: string };
  buyer: { email: string };
  amount: number;
  currency: string;
  status: string;
  timestamp: string;
  cancelledAt?: string;
  willExpireAt?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/** Timing-safe проверка X-Api-Key заголовка */
export function verifyApiKey(header: string | undefined): boolean {
  if (!header || !config.LAVATOP_WEBHOOK_SECRET) return false;
  try {
    return timingSafeEqual(
      Buffer.from(header),
      Buffer.from(config.LAVATOP_WEBHOOK_SECRET)
    );
  } catch {
    // Буферы разной длины — не равны
    return false;
  }
}

/** Количество дней по periodicity из LavaTop */
export function periodicityToDays(periodicity: string | null | undefined): number {
  switch (periodicity) {
    case 'PERIOD_90_DAYS':  return 90;
    case 'PERIOD_180_DAYS': return 180;
    case 'MONTHLY':
    case 'ONE_TIME':
    default:                return 30;
  }
}

/** Расширяет дату подписки на нужное количество дней от текущего срока или от сегодня */
export function calcNewExpiry(current: Date | null, days = 30): Date {
  const base = current && current > new Date() ? current : new Date();
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

/** Ищет periodicity оффера по offer_id (product.id из webhook) в таблице lavatop_offers */
async function getPeriodicityByOfferId(offerId: string): Promise<string | null> {
  const [offer] = await db
    .select({ periodicity: lavatopOffers.periodicity })
    .from(lavatopOffers)
    .where(eq(lavatopOffers.offerId, offerId))
    .limit(1);
  return offer?.periodicity ?? null;
}

/**
 * Находит пользователя по email.
 * Сначала ищет в users.email, затем в paymentAnalytics (где telegram_id хранится при создании ссылки).
 * Возвращает { user, telegramId } или null если не найден.
 */
async function findUserByEmail(email: string): Promise<{
  user: typeof users.$inferSelect;
  telegramId: number;
} | null> {
  const normalizedEmail = email.toLowerCase().trim();

  // 1. Ищем напрямую в users.email
  const [userByEmail] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (userByEmail && userByEmail.telegramId) {
    return { user: userByEmail, telegramId: userByEmail.telegramId };
  }

  // 2. Fallback: ищем telegram_id в paymentAnalytics по email
  const [analytics] = await db
    .select({ telegramId: paymentAnalytics.telegramId })
    .from(paymentAnalytics)
    .where(eq(paymentAnalytics.email, normalizedEmail))
    .orderBy(desc(paymentAnalytics.createdAt))
    .limit(1);

  if (!analytics?.telegramId) return null;

  const telegramId = analytics.telegramId;

  const [userByTgId] = await db
    .select()
    .from(users)
    .where(eq(users.telegramId, telegramId))
    .limit(1);

  if (!userByTgId) return null;

  return { user: userByTgId, telegramId };
}

/**
 * Основная логика активации / продления подписки.
 * Используется и для payment.success и для recurring.payment.success.
 *
 * @param contractId     — уникальный ID платежа (используется как externalPaymentId)
 * @param email          — email покупателя
 * @param amount         — сумма
 * @param currency       — валюта
 * @param isFirstPaymentOfSubscription — true = первый платёж (запускаем онбординг + реферал)
 * @param isRecurring    — true = рекуррентное продление (нет онбординга, нет реферала)
 * @param parentContractId — id родительского контракта (для рекуррентных)
 * @param utm            — UTM-метки из webhook
 */
async function activateSubscription(opts: {
  contractId: string;
  email: string;
  amount: number;
  currency: string;
  periodicity: string | null | undefined;
  isFirstPaymentOfSubscription: boolean;
  isRecurring: boolean;
  parentContractId: string | null;
  utm: Record<string, string | null | undefined>;
  eventType: string;
}): Promise<void> {
  const {
    contractId,
    email,
    amount,
    currency,
    periodicity,
    isFirstPaymentOfSubscription,
    isRecurring,
    parentContractId,
    utm,
    eventType,
  } = opts;

  // 1. Идемпотентность
  const existing = await db
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.externalPaymentId, contractId))
    .limit(1);

  if (existing.length > 0) {
    logger.info({ contractId }, '[LavaTop] Already processed, skipping');
    return;
  }

  // 2. Найти пользователя
  const found = await findUserByEmail(email);
  if (!found) {
    logger.error({ email, contractId }, '[LavaTop] User not found by email');
    throw new Error(`User not found for email: ${email}`);
  }
  const { user, telegramId } = found;

  // Первая покупка = никогда не покупал (firstPurchaseDate не установлен).
  // isPro не учитываем: если подписка истекла (isPro=false) — это продление, а не первая покупка.
  const isFirstPurchase = !user.firstPurchaseDate;
  const days = periodicityToDays(periodicity);
  const newExpiry = calcNewExpiry(user.subscriptionExpires ? new Date(user.subscriptionExpires) : null, days);

  logger.info(
    { telegramId, email, contractId, isFirstPurchase, isRecurring, isFirstPaymentOfSubscription, days, newExpiry, currentExpiry: user.subscriptionExpires },
    '[LavaTop] activateSubscription started'
  );

  // 3. Обновляем подписку
  await db
    .update(users)
    .set({
      isPro: true,
      subscriptionExpires: newExpiry,
      autoRenewalEnabled: isFirstPaymentOfSubscription || isRecurring,
      updatedAt: new Date(),
      ...(isFirstPurchase ? { firstPurchaseDate: new Date() } : {}),
    })
    .where(eq(users.id, user.id));

  logger.info({ telegramId, newExpiry, isPro: true, autoRenewalEnabled: isFirstPaymentOfSubscription || isRecurring }, '[LavaTop] Step 3: user subscription updated');

  // 4. Записываем в payments
  const [newPayment] = await db
    .insert(payments)
    .values({
      userId: user.id,
      amount: String(amount),
      currency: currency || 'RUB',
      status: 'completed',
      paymentProvider: 'lavatop',
      externalPaymentId: contractId,
      email: email.toLowerCase().trim(),
      completedAt: new Date(),
      metadata: {
        parentContractId,
        isFirstPaymentOfSubscription,
        isRecurring,
        isFirstPurchase,
        utmSource: utm.utm_source || null,
        utmMedium: utm.utm_medium || null,
        utmCampaign: utm.utm_campaign || null,
        utmContent: utm.utm_content || null,
        eventType,
      },
    })
    .returning();

  // 5. Записываем в paymentAnalytics
  await db.insert(paymentAnalytics).values({
    telegramId,
    eventType: isRecurring ? 'subscription_renewed' : 'payment_success',
    paymentProvider: 'lavatop',
    paymentMethod: currency || 'RUB',
    amount: String(amount),
    currency: currency || 'RUB',
    paymentId: newPayment.id,
    email: email.toLowerCase().trim(),
    utmSource: utm.utm_source || null,
    utmMedium: utm.utm_medium || null,
    utmCampaign: utm.utm_campaign || null,
    utmContent: utm.utm_content || null,
    metadata: { contractId, parentContractId, eventType },
  });

  logger.info(
    { telegramId, newExpiry, contractId, isFirstPurchase, isFirstPaymentOfSubscription, isRecurring },
    '[LavaTop] Subscription extended — payments & analytics recorded'
  );

  // 6. +500 энергий
  try {
    await energiesService.award(user.id, 500, 'Продление подписки', {
      source: 'lavatop_payment',
      contractId,
    });
    logger.info({ telegramId }, '[LavaTop] Step 6: 500 energies awarded');
  } catch (e) {
    logger.warn({ e, telegramId }, '[LavaTop] Failed to award energies');
  }

  // 7. Реферальный бонус (только первая покупка, не рекуррентные)
  if (!isRecurring) {
    try {
      const userMeta = (user.metadata as Record<string, any>) || {};
      const refCode = userMeta.ref_code || utm.utm_campaign || null;
      if (refCode && isFirstPurchase) {
        await processReferralBonus(telegramId, user.id, newPayment.id, refCode);
        logger.info({ telegramId, refCode }, '[LavaTop] Referral bonus processed');
      }
    } catch (e) {
      logger.warn({ e, telegramId }, '[LavaTop] Failed to process referral bonus');
    }
  }

  // 8. Разбаниваем из защищённых чатов
  try {
    await subscriptionGuardService.unbanUserFromAllChats(telegramId);
    logger.info({ telegramId }, '[LavaTop] Step 8: unbanned from all chats');
  } catch (e) {
    logger.warn({ e }, '[LavaTop] Failed to unban user');
  }

  // 9. Восстанавливаем в десятке
  try {
    await decadesService.restoreUserToDecade(user.id, telegramId);
    logger.info({ telegramId }, '[LavaTop] Step 9: decade restore attempted');
  } catch (e) {
    logger.warn({ e, telegramId }, '[LavaTop] Failed to restore decade');
  }

  // 10. Онбординг / подтверждение продления
  if (isFirstPurchase) {
    // Первая покупка — запускаем полный онбординг с кодовым словом
    try {
      await startOnboardingAfterPayment(user.id, telegramId);
      logger.info({ telegramId }, '[LavaTop] Step 10: onboarding started (first purchase)');
    } catch (e) {
      logger.warn({ e }, '[LavaTop] Failed to start onboarding');
    }
  } else {
    // Повторная покупка / продление — отправляем подтверждение с меню
    try {
      await sendRenewalConfirmation(telegramId);
      logger.info({ telegramId }, '[LavaTop] Step 10: renewal confirmation sent');
    } catch (e) {
      logger.warn({ e }, '[LavaTop] Failed to send renewal confirmation');
    }
  }
}

// ============================================================================
// FEATURE FLAG — временно отключить обработку платежей (только логирование)
// Установить в true когда готовы принимать платежи через LavaTop
// ============================================================================
const LAVATOP_PROCESSING_ENABLED = false;

// ============================================================================
// MODULE
// ============================================================================

export const lavatopWebhook = new Elysia({ prefix: '/webhooks/lavatop' })

  // ============================================================================
  // POST /payment — Результат платежа (payment.success / payment.failed)
  // ============================================================================
  .post('/payment', async ({ body, headers, set }) => {
    const apiKey = headers['x-api-key'];

    if (!verifyApiKey(apiKey)) {
      logger.warn({ apiKey: apiKey?.slice(0, 8) }, '[LavaTop /payment] Invalid X-Api-Key');
      set.status = 401;
      return { success: false, error: 'Unauthorized' };
    }

    const payload = body as LavaTopPaymentWebhook;
    const { eventType, buyer, contractId, parentContractId, amount, currency, status, clientUtm } = payload;

    logger.info({ eventType, contractId, email: buyer?.email, status, processing_enabled: LAVATOP_PROCESSING_ENABLED }, '[LavaTop /payment] received');

    // Режим паузы — только логируем, не обрабатываем
    if (!LAVATOP_PROCESSING_ENABLED) {
      logger.info({ payload }, '[LavaTop /payment] PROCESSING PAUSED — payload logged, no action taken');
      return { success: true, processing: false, note: 'Processing paused' };
    }

    // Логируем ошибочные платежи
    if (eventType === 'payment.failed' || status === 'failed' || status === 'subscription-failed') {
      logger.warn({ contractId, email: buyer?.email, status, errorMessage: payload.errorMessage }, '[LavaTop /payment] Payment failed');
      try {
        if (buyer?.email) {
          const found = await findUserByEmail(buyer.email);
          if (found) {
            await db.insert(paymentAnalytics).values({
              telegramId: found.telegramId,
              eventType: 'payment_failed',
              paymentProvider: 'lavatop',
              email: buyer.email.toLowerCase().trim(),
              metadata: { contractId, status, errorMessage: payload.errorMessage, eventType },
            });
          }
        }
      } catch (e) {
        logger.warn({ e }, '[LavaTop /payment] Failed to log payment_failed analytics');
      }
      return { success: true };
    }

    // Только успешные дальше
    if (eventType !== 'payment.success') {
      logger.info({ eventType }, '[LavaTop /payment] Unknown eventType, ignoring');
      return { success: true };
    }

    if (!buyer?.email || !contractId) {
      logger.error({ payload }, '[LavaTop /payment] Missing required fields');
      set.status = 400;
      return { success: false, error: 'Missing email or contractId' };
    }

    // status === 'completed'        → разовая покупка
    // status === 'subscription-active' → первый платёж подписки
    const isFirstPaymentOfSubscription = status === 'subscription-active';
    const periodicity = await getPeriodicityByOfferId(payload.product.id);

    // Предупреждение если оффер не найден в нашей таблице lavatop_offers —
    // возможно платёж за другой продукт на том же LavaTop-аккаунте
    if (!periodicity) {
      logger.warn(
        { productId: payload.product.id, productTitle: payload.product.title, contractId, email: buyer.email, amount },
        '[LavaTop /payment] ⚠️ Unknown offer — product not in lavatop_offers table. Processing with default 30-day periodicity. Verify this payment belongs to Khranitelnitsa.'
      );
    }

    try {
      await withLock(`payment:lavatop:${contractId}`, async () => {
        await activateSubscription({
          contractId,
          email: buyer.email,
          amount,
          currency,
          periodicity,
          isFirstPaymentOfSubscription,
          isRecurring: false,
          parentContractId: parentContractId ?? null,
          utm: {
            utm_source: clientUtm?.utm_source,
            utm_medium: clientUtm?.utm_medium,
            utm_campaign: clientUtm?.utm_campaign,
            utm_content: clientUtm?.utm_content,
          },
          eventType,
        });
      });
    } catch (error) {
      logger.error({ error, contractId }, '[LavaTop /payment] Error processing payment');
      set.status = 500;
      return { success: false, error: 'Internal error' };
    }

    return { success: true };
  })

  // ============================================================================
  // POST /recurring — Регулярные платежи (subscription.recurring.* / subscription.cancelled)
  // ============================================================================
  .post('/recurring', async ({ body, headers, set }) => {
    const apiKey = headers['x-api-key'];

    if (!verifyApiKey(apiKey)) {
      logger.warn({ apiKey: apiKey?.slice(0, 8) }, '[LavaTop /recurring] Invalid X-Api-Key');
      set.status = 401;
      return { success: false, error: 'Unauthorized' };
    }

    const payload = body as LavaTopRecurringWebhook;
    const { eventType, buyer, contractId, parentContractId, amount, currency, status } = payload;

    logger.info({ eventType, contractId, parentContractId, email: buyer?.email, status, processing_enabled: LAVATOP_PROCESSING_ENABLED }, '[LavaTop /recurring] received');

    // Режим паузы — только логируем, не обрабатываем
    if (!LAVATOP_PROCESSING_ENABLED) {
      logger.info({ payload }, '[LavaTop /recurring] PROCESSING PAUSED — payload logged, no action taken');
      return { success: true, processing: false, note: 'Processing paused' };
    }

    // ---- subscription.cancelled ----
    if (eventType === 'subscription.cancelled') {
      logger.info(
        { contractId, parentContractId, cancelledAt: payload.cancelledAt, willExpireAt: payload.willExpireAt },
        '[LavaTop /recurring] Subscription cancelled'
      );

      try {
        if (buyer?.email) {
          const found = await findUserByEmail(buyer.email);
          if (found) {
            await db.insert(paymentAnalytics).values({
              telegramId: found.telegramId,
              eventType: 'subscription_cancelled',
              paymentProvider: 'lavatop',
              email: buyer.email.toLowerCase().trim(),
              metadata: {
                contractId,
                parentContractId,
                cancelledAt: payload.cancelledAt,
                willExpireAt: payload.willExpireAt,
                eventType,
              },
            });

            // Если willExpireAt уже истёк — отключаем подписку сразу
            if (payload.willExpireAt && new Date(payload.willExpireAt) <= new Date()) {
              await db
                .update(users)
                .set({ isPro: false, autoRenewalEnabled: false, updatedAt: new Date() })
                .where(eq(users.id, found.user.id));
              logger.info({ telegramId: found.telegramId }, '[LavaTop /recurring] Subscription deactivated (willExpireAt passed)');
            } else {
              // willExpireAt в будущем — снимаем autoRenewal и обновляем subscription_expires
              // до willExpireAt если он раньше текущего (LavaTop говорит когда реально кончится)
              const willExpireAtDate = payload.willExpireAt ? new Date(payload.willExpireAt) : null;
              const currentExpiry = found.user.subscriptionExpires ? new Date(found.user.subscriptionExpires) : null;
              const shouldUpdateExpiry = willExpireAtDate && (!currentExpiry || willExpireAtDate < currentExpiry);

              await db
                .update(users)
                .set({
                  autoRenewalEnabled: false,
                  updatedAt: new Date(),
                  ...(shouldUpdateExpiry ? { subscriptionExpires: willExpireAtDate } : {}),
                })
                .where(eq(users.id, found.user.id));

              logger.info(
                { telegramId: found.telegramId, willExpireAt: payload.willExpireAt, updatedExpiry: shouldUpdateExpiry },
                '[LavaTop /recurring] Subscription cancelled — autoRenewal off, expiry updated to willExpireAt'
              );
            }
          }
        }
      } catch (e) {
        logger.error({ e, contractId }, '[LavaTop /recurring] Error processing cancellation');
        set.status = 500;
        return { success: false, error: 'Internal error' };
      }

      return { success: true };
    }

    // ---- subscription.recurring.payment.failed ----
    if (eventType === 'subscription.recurring.payment.failed') {
      logger.warn({ contractId, parentContractId, email: buyer?.email }, '[LavaTop /recurring] Recurring payment failed');

      try {
        if (buyer?.email) {
          const found = await findUserByEmail(buyer.email);
          if (found) {
            await db.insert(paymentAnalytics).values({
              telegramId: found.telegramId,
              eventType: 'payment_failed',
              paymentProvider: 'lavatop',
              email: buyer.email.toLowerCase().trim(),
              metadata: { contractId, parentContractId, eventType },
            });
          }
        }
      } catch (e) {
        logger.warn({ e }, '[LavaTop /recurring] Failed to log recurring payment_failed');
      }

      return { success: true };
    }

    // ---- subscription.recurring.payment.success ----
    if (eventType === 'subscription.recurring.payment.success') {
      if (!buyer?.email || !contractId) {
        logger.error({ payload }, '[LavaTop /recurring] Missing required fields');
        set.status = 400;
        return { success: false, error: 'Missing email or contractId' };
      }

      const recurringPeriodicity = await getPeriodicityByOfferId(payload.product.id);

      if (!recurringPeriodicity) {
        logger.warn(
          { productId: payload.product.id, productTitle: payload.product.title, contractId, email: buyer.email, amount },
          '[LavaTop /recurring] ⚠️ Unknown offer — product not in lavatop_offers table. Processing with default 30-day periodicity. Verify this payment belongs to Khranitelnitsa.'
        );
      }

      try {
        await withLock(`payment:lavatop:${contractId}`, async () => {
          await activateSubscription({
            contractId,
            email: buyer.email,
            amount,
            currency,
            periodicity: recurringPeriodicity,
            isFirstPaymentOfSubscription: false,
            isRecurring: true,
            parentContractId: parentContractId ?? null,
            utm: {},
            eventType,
          });
        });
      } catch (error) {
        logger.error({ error, contractId }, '[LavaTop /recurring] Error processing recurring payment');
        set.status = 500;
        return { success: false, error: 'Internal error' };
      }

      return { success: true };
    }

    logger.info({ eventType }, '[LavaTop /recurring] Unknown eventType, ignoring');
    return { success: true };
  });
