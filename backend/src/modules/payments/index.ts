/**
 * 💳 PUBLIC PAYMENTS MODULE
 *
 * Публичные endpoints для генерации ссылок на оплату через LavaTop.
 * Используется напрямую из Telegram Mini App (payment_form_club.html, payment_form_gift.html).
 *
 * POST /api/payments/generate-link
 *   — Создаёт инвойс LavaTop и возвращает paymentUrl.
 *   — Требует telegram_id, email, offer_key.
 *   — Сохраняет payment_attempt в paymentAnalytics.
 *   — Rate-limit через paymentRateLimiter (настраивается в index.ts).
 */

import Elysia from 'elysia';
import { db } from '@/db';
import { lavatopOffers, paymentAnalytics } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/utils/logger';
import { lavaTopService } from '@/services/lavatop.service';

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
  });
