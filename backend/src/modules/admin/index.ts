/**
 * 🔐 ADMIN API
 * API для административных операций
 *
 * Документация:
 * - POST /admin/generate-payment-link - Генерация ссылки на оплату (БЕЗ авторизации)
 * - POST /admin/reset-user-funnel - Сброс воронки пользователя
 * - POST /admin/revoke-subscription - Отзыв подписки
 * - GET /admin/user/:telegram_id - Информация о пользователе
 */

import { Elysia, t } from 'elysia';
import { timingSafeEqual } from 'crypto';
import { db, rawDb } from '@/db';
import { lavaTopService } from '@/services/lavatop.service';
import { config } from '@/config';
import { users, payments, paymentAnalytics, clubFunnelProgress, videos, contentItems, decades, decadeMembers, leaderTestResults, lavatopOffers, energyTransactions } from '@/db/schema';
import { eq, desc, and, isNull, sql, gte, lte } from 'drizzle-orm';
import { logger } from '@/utils/logger';
import { startOnboardingAfterPayment } from '@/modules/bot/post-payment-funnels';
import { subscriptionGuardService } from '@/services/subscription-guard.service';
import { decadesService } from '@/services/decades.service';
import { energiesService } from '@/modules/energy-points/service';

// n8n webhook для генерации ссылки на оплату Lava
const N8N_LAVA_WEBHOOK_URL = 'https://n8n4.daniillepekhin.ru/webhook/lava_club2';

// n8n webhook для отмены подписки Lava (старый)
const CANCEL_SUBSCRIPTION_WEBHOOK = 'https://n8n4.daniillepekhin.ru/webhook/deletelava_miniapp';

// CloudPayments API base
const CP_API_BASE = 'https://api.cloudpayments.ru';

// Хелпер для проверки авторизации (timing-safe сравнение)
const checkAdminAuth = (headers: Record<string, string | undefined>): boolean => {
  const adminSecret = headers['x-admin-secret'];
  if (!adminSecret) return false;

  const expected = process.env.ADMIN_SECRET;
  if (expected) {
    try {
      if (timingSafeEqual(Buffer.from(adminSecret), Buffer.from(expected))) return true;
    } catch {
      // Buffer.lengths differ — значит не равны
    }
  }

  // local-dev-secret разрешён только вне production
  if (process.env.NODE_ENV !== 'production' && adminSecret === 'local-dev-secret') return true;

  return false;
};

export const adminRoutes = new Elysia({ prefix: '/admin' })
  /**
   * 📝 Генерация ссылки на оплату (БЕЗ АВТОРИЗАЦИИ)
   * Создает payment_attempt и возвращает ссылку на виджет Lava
   */
  .post(
    '/generate-payment-link',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }
      const {
        telegram_id: rawTelegramId,
        email,
        name,
        phone,
        currency = 'RUB',
        amount = '2000',
        utm_source = 'admin',
        utm_campaign = 'manual',
      } = body;

      // Преобразуем telegram_id в число
      const telegram_id = typeof rawTelegramId === 'string' ? parseInt(rawTelegramId, 10) : rawTelegramId;

      // Создаем payment_attempt (необходим для webhook)
      await db.insert(paymentAnalytics).values({
        telegramId: telegram_id,
        eventType: 'payment_attempt',
        paymentMethod: currency,
        amount: amount,
        currency: currency,
        name: name || null,
        email: email.toLowerCase().trim(),
        phone: phone || null,
        utmSource: utm_source,
        utmCampaign: utm_campaign,
        metka: `${utm_campaign}_${utm_source}`,
        metadata: {
          source: 'admin_generated',
          generated_at: new Date().toISOString(),
        },
      });

      // Вызываем n8n webhook для генерации ссылки на оплату
      // Формат как в payment_form_club.html
      const n8nResponse = await fetch(N8N_LAVA_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          name: name || '',
          phone: phone || '',
          payment_method: currency, // RUB, USD, EUR
          telegram_id: telegram_id.toString(),
        }),
      });

      if (!n8nResponse.ok) {
        logger.error({ status: n8nResponse.status }, 'n8n webhook failed');
        throw new Error(`n8n webhook failed: ${n8nResponse.status}`);
      }

      const n8nResult = await n8nResponse.json() as { paymentUrl?: string; payment_url?: string; url?: string; link?: string };
      const paymentUrl = n8nResult.paymentUrl || n8nResult.payment_url || n8nResult.url || n8nResult.link;

      if (!paymentUrl) {
        logger.error({ n8nResult }, 'n8n did not return payment URL');
        throw new Error('n8n did not return payment URL');
      }

      logger.info(
        {
          telegram_id,
          email,
          name,
          phone,
          amount,
          currency,
          paymentUrl,
        },
        'Admin generated payment link via n8n'
      );

      return {
        success: true,
        payment_url: paymentUrl,
        message: `Ссылка создана для ${email}. После оплаты подписка активируется автоматически.`,
        data: {
          telegram_id,
          email: email.toLowerCase().trim(),
          name,
          phone,
          amount,
          currency,
        },
      };
    },
    {
      body: t.Object({
        telegram_id: t.Union([t.Number(), t.String()], { description: 'Telegram ID пользователя' }),
        email: t.String({ description: 'Email пользователя (обязательно для Lava)' }),
        name: t.Optional(t.String({ description: 'Имя пользователя' })),
        phone: t.Optional(t.String({ description: 'Телефон пользователя' })),
        currency: t.Optional(t.String({ description: 'Валюта: RUB, USD, EUR. По умолчанию RUB' })),
        amount: t.Optional(t.String({ description: 'Сумма платежа. По умолчанию 2000' })),
        utm_source: t.Optional(t.String({ description: 'UTM source' })),
        utm_campaign: t.Optional(t.String({ description: 'UTM campaign' })),
      }),
      detail: {
        summary: 'Генерация ссылки на оплату',
        description: 'Создает payment_attempt в базе и возвращает ссылку на виджет Lava с предзаполненными данными. После оплаты подписка активируется автоматически через webhook.',
      },
    }
  )

  /**
   * 💳 Генерация ссылки на оплату через LavaTop (новый провайдер, параллельно n8n)
   * Создаёт invoice через LavaTop API напрямую (без n8n).
   * Текущая схема через n8n остаётся рабочей — этот endpoint только для LavaTop.
   */

  /**
   * 💳 Сгенерировать ссылку CloudPayments с произвольной суммой
   */
  .post(
    '/generate-cp-custom-link',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) { set.status = 401; throw new Error('Unauthorized'); }

      const { amount, description = 'Доплата КОД УСПЕХА' } = body;

      if (!config.CLOUDPAYMENTS_PUBLIC_ID || !config.CLOUDPAYMENTS_API_SECRET) {
        set.status = 500;
        return { success: false, error: 'CloudPayments не настроен' };
      }

      const authHeader = 'Basic ' + Buffer.from(
        `${config.CLOUDPAYMENTS_PUBLIC_ID}:${config.CLOUDPAYMENTS_API_SECRET}`
      ).toString('base64');

      const res = await fetch('https://api.cloudpayments.ru/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify({
          Amount: amount,
          Currency: 'RUB',
          Description: description,
          RequireConfirmation: false,
          SendEmail: false,
        }),
      });

      const data = await res.json() as { Success: boolean; Message?: string; Model?: { Url?: string; Id?: string } };

      if (!data.Success || !data.Model?.Url) {
        set.status = 500;
        return { success: false, error: data.Message ?? 'CP error' };
      }

      logger.info({ amount, description, url: data.Model.Url }, '[admin] CP custom link generated');

      return { success: true, url: data.Model.Url, order_id: data.Model.Id };
    },
    {
      body: t.Object({
        amount: t.Number(),
        description: t.Optional(t.String()),
      }),
    }
  )

  .post(
    '/generate-lavatop-payment-link',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      if (!config.LAVATOP_API_KEY) {
        set.status = 503;
        return {
          success: false,
          error: 'LavaTop не настроен. Добавьте LAVATOP_API_KEY в GitHub Secrets.',
        };
      }

      const {
        telegram_id: rawTelegramId,
        email,
        name,
        phone,
        offer_key,
        utm_source = 'admin',
        utm_campaign = 'manual',
      } = body;

      const telegram_id = typeof rawTelegramId === 'string' ? parseInt(rawTelegramId, 10) : rawTelegramId;
      const normalizedEmail = email.toLowerCase().trim();

      // Ищем оффер в БД по ключу
      const [offer] = await db
        .select()
        .from(lavatopOffers)
        .where(eq(lavatopOffers.key, offer_key))
        .limit(1);

      if (!offer) {
        set.status = 404;
        return {
          success: false,
          error: `Оффер с ключом '${offer_key}' не найден. Используйте GET /admin/lavatop-offers чтобы увидеть доступные офферы.`,
        };
      }

      if (!offer.isActive) {
        set.status = 400;
        return {
          success: false,
          error: `Оффер '${offer_key}' деактивирован.`,
        };
      }

      // Сохраняем payment_attempt (telegram_id нужен для поиска пользователя при webhook)
      await db.insert(paymentAnalytics).values({
        telegramId: telegram_id,
        eventType: 'payment_attempt',
        paymentProvider: 'lavatop',
        paymentMethod: offer.currency,
        amount: offer.amount ?? '0',
        currency: offer.currency,
        name: name || null,
        email: normalizedEmail,
        phone: phone || null,
        utmSource: utm_source,
        utmCampaign: utm_campaign,
        metka: `${utm_campaign}_${utm_source}`,
        metadata: {
          source: 'admin_generated_lavatop',
          offer_key,
          offer_id: offer.offerId,
          generated_at: new Date().toISOString(),
        },
      });

      // Вызываем LavaTop API напрямую
      const invoice = await lavaTopService.createInvoice({
        email: normalizedEmail,
        offerId: offer.offerId,
        currency: offer.currency as 'RUB' | 'USD' | 'EUR',
        periodicity: offer.periodicity as 'ONE_TIME' | 'MONTHLY' | 'PERIOD_90_DAYS' | 'PERIOD_180_DAYS',
        buyerLanguage: 'RU',
        clientUtm: {
          utm_source: utm_source || null,
          utm_campaign: utm_campaign || null,
          utm_medium: null,
          utm_content: null,
          utm_term: null,
        },
      });

      logger.info(
        { telegram_id, email: normalizedEmail, offer_key, invoiceId: invoice.id, paymentUrl: invoice.paymentUrl },
        'Admin generated LavaTop payment link'
      );

      return {
        success: true,
        payment_url: invoice.paymentUrl,
        invoice_id: invoice.id,
        message: `Ссылка LavaTop создана для ${normalizedEmail} (оффер: ${offer.label}). После оплаты подписка активируется автоматически.`,
        data: {
          telegram_id,
          email: normalizedEmail,
          name,
          phone,
          offer_key,
          offer_label: offer.label,
          currency: offer.currency,
          amount: offer.amount,
          periodicity: offer.periodicity,
          invoice_id: invoice.id,
        },
      };
    },
    {
      body: t.Object({
        telegram_id: t.Union([t.Number(), t.String()], { description: 'Telegram ID пользователя' }),
        email: t.String({ description: 'Email пользователя' }),
        offer_key: t.String({ description: 'Ключ оффера из таблицы lavatop_offers (например: monthly_rub_2000). GET /admin/lavatop-offers — список.' }),
        name: t.Optional(t.String({ description: 'Имя пользователя' })),
        phone: t.Optional(t.String({ description: 'Телефон пользователя' })),
        utm_source: t.Optional(t.String({ description: 'UTM source' })),
        utm_campaign: t.Optional(t.String({ description: 'UTM campaign' })),
      }),
      detail: {
        summary: 'Генерация ссылки на оплату через LavaTop',
        description: 'Создаёт invoice через LavaTop API и возвращает ссылку на виджет оплаты. Оффер выбирается по ключу из таблицы lavatop_offers (GET /admin/lavatop-offers). После оплаты подписка активируется через webhook /webhooks/lavatop/payment.',
      },
    }
  )

  /**
   * 🔄 Сброс воронки пользователя
   * Удаляет прогресс воронки, чтобы пользователь прошел её заново
   */
  .post(
    '/reset-user-funnel',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const { telegram_id: rawTelegramId } = body;
      const telegram_id = typeof rawTelegramId === 'string' ? parseInt(rawTelegramId, 10) : rawTelegramId;

      // Находим пользователя
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, telegram_id))
        .limit(1);

      if (!user) {
        return {
          success: false,
          error: 'Пользователь не найден',
        };
      }

      // Удаляем прогресс воронки
      const deleted = await db
        .delete(clubFunnelProgress)
        .where(eq(clubFunnelProgress.telegramId, telegram_id))
        .returning();

      logger.info(
        { telegram_id, deleted_count: deleted.length },
        'Admin reset user funnel'
      );

      return {
        success: true,
        message: `Воронка сброшена для пользователя ${telegram_id}. Удалено записей: ${deleted.length}`,
        user: {
          id: user.id,
          telegram_id: user.telegramId,
          is_pro: user.isPro,
          subscription_expires: user.subscriptionExpires,
        },
      };
    },
    {
      body: t.Object({
        telegram_id: t.Union([t.Number(), t.String()], { description: 'Telegram ID пользователя' }),
      }),
      detail: {
        summary: 'Сброс воронки пользователя',
        description: 'Удаляет прогресс воронки пользователя. После сброса при следующем входе в бота пользователь пройдет воронку заново.',
      },
    }
  )

  /**
   * ❌ Отзыв подписки
   * Устанавливает дату окончания в прошлое, при следующем cron пользователь будет удален из каналов
   */
  .post(
    '/revoke-subscription',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const { telegram_id: rawTelegramId, kick_immediately = false } = body;
      const telegram_id = typeof rawTelegramId === 'string' ? parseInt(rawTelegramId, 10) : rawTelegramId;

      // Находим пользователя
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, telegram_id))
        .limit(1);

      if (!user) {
        return {
          success: false,
          error: 'Пользователь не найден',
        };
      }

      // Устанавливаем дату окончания в прошлое
      const expiredDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 дня назад

      const [updated] = await db
        .update(users)
        .set({
          subscriptionExpires: expiredDate,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id))
        .returning();

      logger.info(
        { telegram_id, previous_expires: user.subscriptionExpires, new_expires: expiredDate },
        'Admin revoked subscription'
      );

      let kickMessage = 'Пользователь будет удален из каналов при следующем cron (6:00 МСК).';

      // Если нужно кикнуть сразу - вызываем cron endpoint
      if (kick_immediately) {
        try {
          const response = await fetch('http://localhost:3002/api/webhooks/cron/check-expired-subscriptions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-cron-secret': process.env.CRON_SECRET || 'local-dev-secret',
            },
          });
          const result = await response.json() as { success: boolean; removed?: number };
          if (result.success) {
            kickMessage = `Пользователь удален из каналов. Обработано: ${result.removed} пользователей.`;
          }
        } catch (error) {
          logger.error({ error }, 'Failed to trigger immediate kick');
          kickMessage += ' (Попытка немедленного удаления не удалась)';
        }
      }

      return {
        success: true,
        message: `Подписка отозвана для ${telegram_id}. ${kickMessage}`,
        user: {
          id: updated.id,
          telegram_id: updated.telegramId,
          is_pro: updated.isPro,
          subscription_expires: updated.subscriptionExpires,
        },
      };
    },
    {
      body: t.Object({
        telegram_id: t.Union([t.Number(), t.String()], { description: 'Telegram ID пользователя' }),
        kick_immediately: t.Optional(t.Boolean({ description: 'Удалить из каналов сразу (по умолчанию false)' })),
      }),
      detail: {
        summary: 'Отзыв подписки',
        description: 'Устанавливает дату окончания подписки в прошлое. Пользователь будет удален из всех каналов и чатов при следующем cron (6:00 МСК) или сразу, если kick_immediately=true.',
      },
    }
  )

  /**
   * ❌ Отмена рекуррентной подписки (LavaTop / CloudPayments / Lava)
   * Отменяет автопродление у провайдера и ставит autoRenewalEnabled=false в БД.
   * При revoke=true дополнительно переводит subscription_expires в прошлое.
   */
  .post(
    '/cancel-subscription',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const { telegram_id: rawId, revoke = false } = body;
      const telegram_id = typeof rawId === 'string' ? parseInt(rawId, 10) : rawId;

      // Находим пользователя
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, telegram_id))
        .limit(1);

      if (!user) {
        return { success: false, error: 'Пользователь не найден' };
      }

      const cpSubscriptionId = (user as any).cloudpaymentsSubscriptionId as string | null;
      const lavatopContractId = (user as any).lavatopContractId as string | null;
      const lavaContactId = (user as any).lavaContactId as string | null;

      // Определяем провайдера: CP → LavaTop → Lava (старый)
      const provider = cpSubscriptionId ? 'cloudpayments'
        : lavatopContractId ? 'lavatop'
        : lavaContactId ? 'lava'
        : null;

      let cancelDetails = '';

      try {
        if (provider === 'cloudpayments') {
          // --- CloudPayments: отменяем рекуррент ---
          const authHeader = 'Basic ' + Buffer.from(
            `${config.CLOUDPAYMENTS_PUBLIC_ID}:${config.CLOUDPAYMENTS_API_SECRET}`
          ).toString('base64');

          const cpResponse = await fetch(`${CP_API_BASE}/subscriptions/cancel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: authHeader },
            body: JSON.stringify({ Id: cpSubscriptionId }),
          });

          if (!cpResponse.ok) {
            const errorText = await cpResponse.text();
            logger.error(
              { telegram_id, cpSubscriptionId, error: errorText },
              'Admin: failed to cancel CloudPayments subscription'
            );
            return { success: false, error: `CloudPayments API error: ${errorText}` };
          }

          cancelDetails = `CloudPayments subscriptionId=${cpSubscriptionId}`;
          logger.info({ telegram_id, cpSubscriptionId }, 'Admin: cancelled CloudPayments subscription');

        } else if (provider === 'lavatop') {
          // --- LavaTop: отменяем через LavaTop API ---
          if (!user.email) {
            return { success: false, error: 'У пользователя не указан email — необходим для отмены LavaTop подписки' };
          }
          await lavaTopService.cancelSubscription(lavatopContractId!, user.email.toLowerCase());
          cancelDetails = `LavaTop contractId=${lavatopContractId}`;
          logger.info({ telegram_id, lavatopContractId }, 'Admin: cancelled LavaTop subscription');

        } else if (provider === 'lava') {
          // --- Lava (старый): отменяем через n8n ---
          const response = await fetch(CANCEL_SUBSCRIPTION_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: user.email?.toLowerCase() ?? '',
              contactid: lavaContactId,
            }),
          });
          if (!response.ok) {
            const errorText = await response.text();
            logger.error({ telegram_id, lavaContactId, error: errorText }, 'Admin: failed to cancel Lava subscription');
            return { success: false, error: `Lava n8n webhook error: ${errorText}` };
          }
          cancelDetails = `Lava contactId=${lavaContactId}`;
          logger.info({ telegram_id, lavaContactId }, 'Admin: cancelled Lava subscription via n8n');

        } else {
          // Нет рекуррентных данных — просто ставим флаг
          cancelDetails = 'no recurring provider found, only disabling autorenew';
          logger.warn({ telegram_id }, 'Admin: cancel-subscription — no recurring provider found');
        }

        // Обновляем флаг autoRenewalEnabled и опционально отзываем подписку
        const dbUpdate: Record<string, any> = {
          autoRenewalEnabled: false,
          updatedAt: new Date(),
        };
        if (revoke) {
          dbUpdate.subscriptionExpires = new Date(); // текущий момент — cron выкинет на следующем прогоне
        }

        const [updated] = await db
          .update(users)
          .set(dbUpdate)
          .where(eq(users.id, user.id))
          .returning();

        return {
          success: true,
          provider: provider ?? 'none',
          cancel_details: cancelDetails,
          auto_renewal_enabled: updated.autoRenewalEnabled,
          subscription_expires: updated.subscriptionExpires,
          revoked: revoke,
        };

      } catch (error) {
        logger.error({ error, telegram_id }, 'Admin: error in cancel-subscription');
        return { success: false, error: String(error) };
      }
    },
    {
      body: t.Object({
        telegram_id: t.Union([t.Number(), t.String()], { description: 'Telegram ID пользователя' }),
        revoke: t.Optional(t.Boolean({ description: 'Дополнительно перевести subscription_expires в прошлое (default: false)' })),
      }),
      detail: {
        summary: 'Отмена рекуррентной подписки',
        description: 'Отменяет автопродление у провайдера (CloudPayments / LavaTop / Lava) и ставит autoRenewalEnabled=false. При revoke=true также переводит subscription_expires в прошлое.',
      },
    }
  )

  /**
   * 👤 Информация о пользователе
   */
  .get(
    '/user/:telegram_id',
    async ({ params, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const telegram_id = parseInt(params.telegram_id);

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, telegram_id))
        .limit(1);

      if (!user) {
        return {
          success: false,
          error: 'Пользователь не найден',
        };
      }

      // Получаем прогресс воронки
      const [funnel] = await db
        .select()
        .from(clubFunnelProgress)
        .where(eq(clubFunnelProgress.telegramId, telegram_id))
        .limit(1);

      return {
        success: true,
        user: {
          id: user.id,
          telegram_id: user.telegramId,
          username: user.username,
          first_name: user.firstName,
          last_name: user.lastName,
          email: user.email,
          phone: user.phone,
          is_pro: user.isPro,
          subscription_expires: user.subscriptionExpires,
          first_purchase_date: user.firstPurchaseDate,
          auto_renewal_enabled: user.autoRenewalEnabled,
          lava_contact_id: user.lavaContactId,
          cloudpayments_subscription_id: (user as any).cloudpaymentsSubscriptionId ?? null,
          payment_provider: user.lavaContactId ? 'lava' : ((user as any).cloudpaymentsSubscriptionId ? 'cloudpayments' : null),
          created_at: user.createdAt,
          level: user.level,
          experience: user.experience,
          streak: user.streak,
        },
        funnel: funnel ? {
          current_step: funnel.currentStep,
          birth_date: funnel.birthDate,
          archetype_number: funnel.archetypeNumber,
          chislo: funnel.chislo,
          updated_at: funnel.updatedAt,
        } : null,
      };
    },
    {
      params: t.Object({
        telegram_id: t.String({ description: 'Telegram ID пользователя' }),
      }),
      detail: {
        summary: 'Информация о пользователе',
        description: 'Возвращает полную информацию о пользователе, включая статус подписки и прогресс воронки.',
      },
    }
  )

  /**
   * ➕ Выдать подписку вручную (без сообщения)
   */
  .post(
    '/grant-subscription',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const { telegram_id: rawTelegramId, days = 30, source = 'admin_grant' } = body;
      const telegram_id = typeof rawTelegramId === 'string' ? parseInt(rawTelegramId, 10) : rawTelegramId;

      // Находим или создаем пользователя
      let [user] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, telegram_id))
        .limit(1);

      const subscriptionExpires = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

      // Был ли без активной подписки — для запуска онбординга
      const wasNotPro = !user || !user.isPro || !user.subscriptionExpires || user.subscriptionExpires < new Date();

      if (!user) {
        // Создаем нового пользователя
        const [newUser] = await db
          .insert(users)
          .values({
            telegramId: telegram_id,
            isPro: true,
            subscriptionExpires,
            metadata: { source },
          })
          .returning();
        user = newUser;

        logger.info({ telegram_id, days, source }, 'Admin created user with subscription');
      } else {
        // Обновляем существующего
        const [updated] = await db
          .update(users)
          .set({
            isPro: true,
            subscriptionExpires,
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id))
          .returning();
        user = updated;

        logger.info({ telegram_id, days, source, previous_expires: user.subscriptionExpires }, 'Admin granted subscription');
      }

      // Запускаем онбординг если до этого подписки не было
      if (wasNotPro) {
        try {
          await startOnboardingAfterPayment(user.id, telegram_id);
        } catch (e) {
          logger.warn({ e, telegram_id }, 'Failed to start onboarding after grant-subscription');
        }
      }

      return {
        success: true,
        message: `Подписка выдана на ${days} дней для ${telegram_id}`,
        user: {
          id: user.id,
          telegram_id: user.telegramId,
          is_pro: user.isPro,
          subscription_expires: user.subscriptionExpires,
        },
      };
    },
    {
      body: t.Object({
        telegram_id: t.Union([t.Number(), t.String()], { description: 'Telegram ID пользователя' }),
        days: t.Optional(t.Number({ description: 'Количество дней подписки (по умолчанию 30)' })),
        source: t.Optional(t.String({ description: 'Источник выдачи' })),
      }),
      detail: {
        summary: 'Выдать подписку вручную',
        description: 'Выдает подписку пользователю на указанное количество дней. Если пользователь не существует, он будет создан.',
      },
    }
  )

  /**
   * 💳 Ручная оплата - выдает подписку И отправляет сообщение с видео (как после реальной оплаты)
   */
  .post(
    '/manual-payment',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const { telegram_id: rawTelegramId, days = 30, source = 'manual_payment' } = body;
      const telegram_id = typeof rawTelegramId === 'string' ? parseInt(rawTelegramId, 10) : rawTelegramId;

      // Находим или создаем пользователя
      let [user] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, telegram_id))
        .limit(1);

      const subscriptionExpires = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

      if (!user) {
        // Создаем нового пользователя
        const [newUser] = await db
          .insert(users)
          .values({
            telegramId: telegram_id,
            isPro: true,
            subscriptionExpires,
            firstPurchaseDate: new Date(),
            metadata: { source },
          })
          .returning();
        user = newUser;

        logger.info({ telegram_id, days, source }, 'Admin created user with manual payment');
      } else {
        // Обновляем существующего
        const [updated] = await db
          .update(users)
          .set({
            isPro: true,
            subscriptionExpires,
            firstPurchaseDate: user.firstPurchaseDate || new Date(),
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id))
          .returning();
        user = updated;

        logger.info({ telegram_id, days, source }, 'Admin granted manual payment subscription');
      }

      // ⚡ Начислить +500 Энергии за оплату (по документу "Геймификация")
      try {
        const { energiesService } = await import('@/modules/energy-points/service');
        await energiesService.award(user.id, 500, 'Продление подписки', { source: 'manual_payment' });
        logger.info({ telegram_id, userId: user.id }, 'Awarded 500 energy for manual payment');
      } catch (error) {
        logger.error({ error, telegram_id }, 'Failed to award energy for manual payment');
      }

      // 🔄 Восстановить в десятку, если пользователь был исключён (с проверкой вместимости)
      try {
        const restoreResult = await decadesService.restoreUserToDecade(user.id, telegram_id);
        if (restoreResult.restored) {
          logger.info({ telegram_id, userId: user.id, decadeName: restoreResult.decadeName }, 'Restored user to decade after payment');
        } else {
          logger.info({ telegram_id, userId: user.id, reason: restoreResult.error }, 'No decade restored after payment');
        }
      } catch (error) {
        logger.error({ error, telegram_id }, 'Failed to restore user to decade');
      }

      // Отправляем сообщение с видео (как после реальной оплаты)
      // chatId = telegram_id для личных сообщений
      try {
        await startOnboardingAfterPayment(user.id, telegram_id);
        logger.info({ telegram_id, userId: user.id }, 'Sent onboarding message after manual payment');
      } catch (error) {
        logger.error({ error, telegram_id }, 'Failed to send onboarding message');
        return {
          success: true,
          message: `Подписка выдана на ${days} дней для ${telegram_id}, но сообщение не отправлено (возможно бот заблокирован)`,
          user: {
            id: user.id,
            telegram_id: user.telegramId,
            is_pro: user.isPro,
            subscription_expires: user.subscriptionExpires,
          },
          message_sent: false,
        };
      }

      return {
        success: true,
        message: `Подписка выдана на ${days} дней для ${telegram_id}. Сообщение с видео отправлено.`,
        user: {
          id: user.id,
          telegram_id: user.telegramId,
          is_pro: user.isPro,
          subscription_expires: user.subscriptionExpires,
        },
        message_sent: true,
      };
    },
    {
      body: t.Object({
        telegram_id: t.Union([t.Number(), t.String()], { description: 'Telegram ID пользователя' }),
        days: t.Optional(t.Number({ description: 'Количество дней подписки (по умолчанию 30)' })),
        source: t.Optional(t.String({ description: 'Источник выдачи' })),
      }),
      detail: {
        summary: 'Ручная оплата (с отправкой сообщения)',
        description: 'Выдает подписку И отправляет сообщение с видео о правилах и кодовом слове (как после реальной оплаты). Пользователь будет поставлен на шаг awaiting_keyword.',
      },
    }
  )

  /**
   * 🎯 Запуск онбординга (только отправка воронки, без изменения подписки)
   */
  .post(
    '/trigger-onboarding',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const { telegram_id: rawTelegramId } = body;
      const telegram_id = typeof rawTelegramId === 'string' ? parseInt(rawTelegramId, 10) : rawTelegramId;

      // Находим пользователя
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, telegram_id))
        .limit(1);

      if (!user) {
        set.status = 404;
        return {
          success: false,
          error: 'Пользователь не найден',
        };
      }

      // Запускаем воронку
      try {
        await startOnboardingAfterPayment(user.id, telegram_id);
        logger.info({ telegram_id, userId: user.id }, 'Admin triggered onboarding');

        return {
          success: true,
          message: `Воронка запущена для ${telegram_id}. Сообщение с видео отправлено.`,
          user: {
            id: user.id,
            telegram_id: user.telegramId,
            is_pro: user.isPro,
          },
        };
      } catch (error) {
        logger.error({ error, telegram_id }, 'Failed to trigger onboarding');
        set.status = 500;
        return {
          success: false,
          error: 'Не удалось отправить сообщение (возможно бот заблокирован)',
        };
      }
    },
    {
      body: t.Object({
        telegram_id: t.Union([t.Number(), t.String()], { description: 'Telegram ID пользователя' }),
      }),
      detail: {
        summary: 'Запуск воронки онбординга',
        description: 'Отправляет сообщение с видео о правилах и кодовом слове. НЕ изменяет статус подписки. Используется для повторной отправки воронки.',
      },
    }
  )

  /**
   * 🔔 Ручной запуск рассылки напоминаний о продлении подписки
   * Позволяет запустить напоминания в любое время (без ожидания 09:00 МСК)
   */
  .post(
    '/trigger-renewal-reminders',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      // force=true игнорирует защиту "уже отправлено сегодня"
      const force = (body as any)?.force === true;

      try {
        logger.info({ force }, 'Admin triggered renewal reminders');
        const result = await subscriptionGuardService.sendRenewalReminders(force);
        logger.info({ result }, 'Admin-triggered renewal reminders completed');
        return {
          success: true,
          message: 'Напоминания отправлены',
          result,
        };
      } catch (error: any) {
        logger.error({ err: error }, 'Admin-triggered renewal reminders failed');
        set.status = 500;
        return { success: false, error: error?.message || 'Unknown error' };
      }
    },
    {
      detail: {
        summary: 'Запуск рассылки напоминаний о продлении подписки',
        description: 'Отправляет напоминания пользователям с подпиской истекающей сегодня, завтра или послезавтра. force=true — повторная отправка даже если уже отправляли сегодня.',
      },
    }
  )

  /**
   * 📱 Отправить меню участника клуба
   */
  .post(
    '/send-menu',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const { telegram_id: rawTelegramId } = body;
      const telegram_id = typeof rawTelegramId === 'string' ? parseInt(rawTelegramId, 10) : rawTelegramId;

      try {
        const { sendMenuMessage } = await import('@/modules/bot/post-payment-funnels');
        await sendMenuMessage(telegram_id);
        logger.info({ telegram_id }, 'Admin sent menu to user');

        return {
          success: true,
          message: `Меню отправлено пользователю ${telegram_id}`,
        };
      } catch (error: any) {
        logger.error({ error, telegram_id }, 'Failed to send menu');
        set.status = 500;
        return { success: false, error: error.message };
      }
    },
    {
      body: t.Object({
        telegram_id: t.Union([t.Number(), t.String()], { description: 'Telegram ID пользователя' }),
      }),
    }
  )

  /**
   * 💳 Отправить сообщение с формой оплаты пользователю
   */
  .post(
    '/send-payment',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const { telegram_id: rawTelegramId } = body;
      const telegram_id = typeof rawTelegramId === 'string' ? parseInt(rawTelegramId, 10) : rawTelegramId;

      try {
        const { sendRenewalToday } = await import('@/modules/bot/post-payment-funnels');
        await sendRenewalToday(telegram_id, telegram_id);
        logger.info({ telegram_id }, 'Admin sent payment message to user');

        return {
          success: true,
          message: `Сообщение с формой оплаты отправлено пользователю ${telegram_id}`,
        };
      } catch (error: any) {
        logger.error({ error, telegram_id }, 'Failed to send payment message');
        set.status = 500;
        return { success: false, error: error.message };
      }
    },
    {
      body: t.Object({
        telegram_id: t.Union([t.Number(), t.String()], { description: 'Telegram ID пользователя' }),
      }),
      detail: {
        summary: 'Отправить форму оплаты',
        description: 'Отправляет пользователю сообщение с кнопкой оплаты через бота',
      },
    }
  )

  /**
   * 🎬 Обновить видео (добавить RuTube URL и PDF)
   */
  .post(
    '/update-video',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const { video_id, video_url, rutube_url, pdf_url, title, description } = body;

      // Проверяем существование видео
      const [existingVideo] = await db
        .select()
        .from(videos)
        .where(eq(videos.id, video_id))
        .limit(1);

      if (!existingVideo) {
        set.status = 404;
        return { success: false, error: 'Видео не найдено' };
      }

      const updateData: any = {};
      if (video_url !== undefined) updateData.videoUrl = video_url;
      if (rutube_url !== undefined) updateData.rutubeUrl = rutube_url;
      if (pdf_url !== undefined) updateData.pdfUrl = pdf_url;
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;

      const [updated] = await db
        .update(videos)
        .set(updateData)
        .where(eq(videos.id, video_id))
        .returning();

      logger.info({ video_id, updateData }, 'Admin updated video');

      return {
        success: true,
        message: `Видео обновлено: ${updated.title}`,
        video: updated,
      };
    },
    {
      body: t.Object({
        video_id: t.String({ description: 'UUID видео' }),
        video_url: t.Optional(t.String({ description: 'YouTube URL' })),
        rutube_url: t.Optional(t.String({ description: 'RuTube URL' })),
        pdf_url: t.Optional(t.String({ description: 'URL презентации' })),
        title: t.Optional(t.String({ description: 'Название' })),
        description: t.Optional(t.String({ description: 'Описание' })),
      }),
      detail: {
        summary: 'Обновить видео',
        description: 'Обновляет URL-адреса и метаданные существующего видео',
      },
    }
  )

  /**
   * 🎬 Создать видео для контента
   */
  .post(
    '/create-video',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const { content_item_id, title, description, video_url, rutube_url, pdf_url, duration_seconds } = body;

      // Проверяем существование контент-айтема
      const [contentItem] = await db
        .select()
        .from(contentItems)
        .where(eq(contentItems.id, content_item_id))
        .limit(1);

      if (!contentItem) {
        set.status = 404;
        return { success: false, error: 'Content item не найден' };
      }

      const [created] = await db
        .insert(videos)
        .values({
          contentItemId: content_item_id,
          title,
          description: description || null,
          videoUrl: video_url,
          rutubeUrl: rutube_url || null,
          pdfUrl: pdf_url || null,
          durationSeconds: duration_seconds || null,
          orderIndex: 0,
        })
        .returning();

      logger.info({ content_item_id, video_id: created.id, title }, 'Admin created video');

      return {
        success: true,
        message: `Видео создано: ${created.title}`,
        video: created,
      };
    },
    {
      body: t.Object({
        content_item_id: t.String({ description: 'UUID контент-айтема' }),
        title: t.String({ description: 'Название видео' }),
        description: t.Optional(t.String({ description: 'Описание' })),
        video_url: t.String({ description: 'YouTube URL' }),
        rutube_url: t.Optional(t.String({ description: 'RuTube URL' })),
        pdf_url: t.Optional(t.String({ description: 'URL презентации' })),
        duration_seconds: t.Optional(t.Number({ description: 'Длительность в секундах' })),
      }),
      detail: {
        summary: 'Создать видео',
        description: 'Создает новое видео и привязывает к контент-айтему (эфиру)',
      },
    }
  )

  /**
   * 🗑️ Выполнить SQL (только для миграций)
   */
  .post(
    '/exec-sql',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const { sql: sqlQuery } = body;

      // Разрешаем безопасные SQL операции
      const safePrefixes = ['ALTER TABLE', 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE TABLE', 'CREATE UNIQUE INDEX', 'CREATE INDEX'];
      const isSafe = safePrefixes.some(prefix => sqlQuery.toUpperCase().trim().startsWith(prefix));

      if (!isSafe) {
        set.status = 400;
        return { success: false, error: 'Только SELECT, INSERT, UPDATE, DELETE, ALTER TABLE и CREATE TABLE/INDEX запросы разрешены' };
      }

      // Запрещаем множественные выражения (SQL injection через точку с запятой)
      const withoutStrings = sqlQuery.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
      const withoutTrailingSemicolon = withoutStrings.trimEnd().replace(/;$/, '');
      if (withoutTrailingSemicolon.includes(';')) {
        set.status = 400;
        return { success: false, error: 'Множественные SQL выражения не разрешены' };
      }

      try {
        const result = await rawDb.unsafe(sqlQuery);
        logger.info({ sql: sqlQuery }, 'Admin executed SQL');
        return { success: true, result };
      } catch (error: any) {
        logger.error({ error, sql: sqlQuery }, 'Admin SQL execution failed');
        return { success: false, error: `Failed query: ${sqlQuery}\n${error.message}` };
      }
    },
    {
      body: t.Object({
        sql: t.String({ description: 'SQL запрос (только ALTER TABLE или SELECT)' }),
      }),
      detail: {
        summary: 'Выполнить SQL',
        description: 'Выполняет безопасный SQL запрос (только ALTER TABLE и SELECT)',
      },
    }
  )

  /**
   * 🗑️ Деактивировать десятку
   */
  .post(
    '/deactivate-decade',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const { decade_id } = body;

      try {
        // Проверяем существование десятки
        const [decade] = await db
          .select()
          .from(decades)
          .where(eq(decades.id, decade_id))
          .limit(1);

        if (!decade) {
          set.status = 404;
          return { success: false, error: 'Десятка не найдена' };
        }

        // Удаляем всех участников
        const deletedMembers = await db
          .delete(decadeMembers)
          .where(eq(decadeMembers.decadeId, decade_id))
          .returning();

        // Деактивируем десятку
        await db
          .update(decades)
          .set({
            isActive: false,
            updatedAt: new Date(),
          })
          .where(eq(decades.id, decade_id));

        // Очищаем связь в leader_test_results
        await db
          .update(leaderTestResults)
          .set({ decadeId: null })
          .where(eq(leaderTestResults.decadeId, decade_id));

        logger.info(
          {
            decade_id,
            city: decade.city,
            number: decade.number,
            members_removed: deletedMembers.length,
          },
          'Decade deactivated by admin'
        );

        return {
          success: true,
          message: `Десятка №${decade.number} (${decade.city}) деактивирована`,
          members_removed: deletedMembers.length,
        };
      } catch (error: any) {
        logger.error({ error, decade_id }, 'Failed to deactivate decade');
        set.status = 500;
        return { success: false, error: error.message };
      }
    },
    {
      body: t.Object({
        decade_id: t.String({ description: 'ID десятки для деактивации' }),
      }),
      detail: {
        summary: 'Деактивировать десятку',
        description: 'Деактивирует десятку, удаляет всех участников и очищает связи',
      },
    }
  )

  /**
   * 🔓 Разблокировать пользователя во всех чатах и каналах
   */
  .post(
    '/unban-user',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const { telegram_id: rawTelegramId } = body;
      const telegram_id = typeof rawTelegramId === 'string' ? parseInt(rawTelegramId, 10) : rawTelegramId;

      try {
        // Находим пользователя
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.telegramId, telegram_id))
          .limit(1);

        if (!user) {
          set.status = 404;
          return { success: false, error: 'Пользователь не найден' };
        }

        // Разблокируем во всех чатах (каналы + городские чаты)
        await subscriptionGuardService.unbanUserFromAllChats(telegram_id);

        // Восстанавливаем в десятку (если был участником)
        let decadeRestored = false;
        let decadeName: string | undefined;
        let decadeInviteLink: string | undefined;
        try {
          const restoreResult = await decadesService.restoreUserToDecade(user.id, telegram_id);
          if (restoreResult.restored) {
            decadeRestored = true;
            decadeName = restoreResult.decadeName;
            decadeInviteLink = restoreResult.inviteLink;
            logger.info(
              { telegram_id, decadeName: restoreResult.decadeName },
              'User restored to decade after admin unban'
            );
            // фиктивный отчёт чтоб крон не выкинул на следующий день
            try {
              await energiesService.award(user.id, 50, 'Ежедневный отчет', { source: 'admin_restore' });
            } catch (e) {
              logger.warn({ e, telegram_id }, 'Failed to award fake report energy after unban restore');
            }
          }
        } catch (decadeError) {
          logger.warn({ error: decadeError, telegram_id }, 'Failed to restore decade after admin unban');
        }

        logger.info(
          { telegram_id, username: user.username, city: user.city },
          'User unbanned from all chats by admin'
        );

        return {
          success: true,
          message: `Пользователь ${telegram_id} разблокирован во всех каналах и чатах`,
          user: {
            id: user.id,
            telegram_id: user.telegramId,
            username: user.username,
            city: user.city,
          },
          decade: {
            restored: decadeRestored,
            name: decadeName,
            invite_link: decadeInviteLink,
          },
        };
      } catch (error: any) {
        logger.error({ error, telegram_id }, 'Failed to unban user');
        set.status = 500;
        return { success: false, error: error.message };
      }
    },
    {
      body: t.Object({
        telegram_id: t.Union([t.Number(), t.String()], { description: 'Telegram ID пользователя' }),
      }),
      detail: {
        summary: 'Разблокировать пользователя',
        description: 'Разблокирует пользователя во всех защищённых каналах и городских чатах',
      },
    }
  )

  /**
   * 🔄 Принудительно мигрировать чат десятки и обнаружить новый ID
   */
  .post(
    '/force-migrate-decade',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const { decade_id } = body;
      const result = await decadesService.forceMigrateAndDiscover(decade_id);
      if (!result.success) {
        set.status = 400;
      }
      return result;
    },
    {
      body: t.Object({
        decade_id: t.String({ description: 'ID десятки' }),
      }),
      detail: {
        summary: 'Принудительно мигрировать десятку',
        description: 'Пытается вызвать миграцию group→supergroup и обнаружить новый chat_id',
      },
    }
  )

  /**
   * 🔍 Сканировать все десятки на мигрированные чаты
   */
  .post(
    '/scan-migrated-decades',
    async ({ headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const result = await decadesService.scanMigratedChats();
      return {
        success: true,
        ok_count: result.ok.length,
        migrated_count: result.migrated.length,
        error_count: result.errors.length,
        ...result,
      };
    },
    {
      detail: {
        summary: 'Сканировать мигрированные десятки',
        description: 'Проверяет все активные десятки на миграцию group→supergroup и обновляет chat_id',
      },
    }
  )

  /**
   * 🔍 Получить информацию о чате
   */
  .post(
    '/get-chat-info',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const { chat_id } = body;
      const chatIdNum = typeof chat_id === 'string' ? parseInt(chat_id, 10) : chat_id;

      const result = await decadesService.getChatInfo(chatIdNum);
      if (!result.success) {
        set.status = 400;
      }
      return result;
    },
    {
      body: t.Object({
        chat_id: t.Union([t.Number(), t.String()], { description: 'Telegram Chat ID' }),
      }),
    }
  )

  /**
   * 🔗 Обновить инвайт-ссылку десятки
   */
  .post(
    '/refresh-decade-link',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const { decade_id, new_chat_id } = body;

      try {
        // Если передан новый chat_id — сначала обновляем его (миграция group->supergroup)
        if (new_chat_id) {
          const chatIdNum = typeof new_chat_id === 'string' ? parseInt(new_chat_id, 10) : new_chat_id;
          const updateResult = await decadesService.updateChatId(decade_id, chatIdNum);
          if (!updateResult.success) {
            set.status = 400;
            return updateResult;
          }
        }

        const result = await decadesService.refreshInviteLink(decade_id);

        if (!result.success) {
          set.status = 400;
          return result;
        }

        return {
          success: true,
          message: `Ссылка обновлена`,
          inviteLink: result.inviteLink,
        };
      } catch (error: any) {
        logger.error({ error, decade_id }, 'Failed to refresh decade link');
        set.status = 500;
        return { success: false, error: error.message };
      }
    },
    {
      body: t.Object({
        decade_id: t.String({ description: 'ID десятки' }),
        new_chat_id: t.Optional(t.Union([t.Number(), t.String()], { description: 'Новый Telegram chat ID (если чат мигрировал в супергруппу)' })),
      }),
        detail: {
        summary: 'Обновить инвайт-ссылку десятки',
        description: 'Создаёт новую инвайт-ссылку для чата десятки через Telegram API. Можно передать new_chat_id при миграции.',
      },
    }
  )

  /**
   * 🔟 Ручной запуск синхронизации состава десяток с Telegram
   */
  .post(
    '/sync-decade-membership',
    async ({ headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      logger.info('Admin triggered decade membership sync');
      try {
        const result = await decadesService.syncDecadeMembership();
        logger.info({ result }, 'Admin-triggered decade sync completed');
        return {
          success: true,
          message: `Синхронизация завершена: проверено ${result.checked}, исправлено ${result.fixed}, ошибок ${result.errors}`,
          result,
        };
      } catch (error: any) {
        logger.error({ error }, 'Admin-triggered decade sync failed');
        set.status = 500;
        return { success: false, error: error?.message || 'Unknown error' };
      }
    },
    {
      detail: {
        summary: 'Синхронизировать состав десяток с Telegram',
        description: 'Проверяет реальный статус каждого участника в Telegram-чате и убирает из БД тех, кто уже вышел.',
      },
    }
  )

  /**
   * ⚡ Начислить Энергию пользователю вручную
   */
  .post(
    '/award-energy',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const { telegram_id: rawTelegramId, amount, reason = 'Ручное начисление администратором' } = body;
      const telegram_id = typeof rawTelegramId === 'string' ? parseInt(rawTelegramId, 10) : rawTelegramId;

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, telegram_id))
        .limit(1);

      if (!user) {
        set.status = 404;
        return { success: false, error: 'Пользователь не найден' };
      }

      try {
        await energiesService.award(user.id, amount, reason, { source: 'admin_manual' });
        const newBalance = await energiesService.getBalance(user.id);

        logger.info({ telegram_id, amount, reason, newBalance }, 'Admin awarded energy');

        return {
          success: true,
          message: `Начислено ${amount} энергии пользователю ${telegram_id}`,
          new_balance: newBalance,
        };
      } catch (error: any) {
        logger.error({ error, telegram_id }, 'Failed to award energy');
        set.status = 500;
        return { success: false, error: error.message };
      }
    },
    {
      body: t.Object({
        telegram_id: t.Union([t.Number(), t.String()], { description: 'Telegram ID пользователя' }),
        amount: t.Number({ description: 'Количество энергии для начисления' }),
        reason: t.Optional(t.String({ description: 'Причина начисления' })),
      }),
      detail: {
        summary: 'Начислить Энергию вручную',
        description: 'Начисляет указанное количество Энергии пользователю. Учитывается множитель x2 для лидеров.',
      },
    }
  )

  /**
   * ⚡ Начислить 500 за последнее продление (с проверкой дубля)
   */
  .post(
    '/award-renewal-energy',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const { telegram_id: rawTelegramId } = body;
      const telegram_id = typeof rawTelegramId === 'string' ? parseInt(rawTelegramId, 10) : rawTelegramId;

      const [user] = await db.select().from(users).where(eq(users.telegramId, telegram_id)).limit(1);
      if (!user) {
        set.status = 404;
        return { success: false, error: 'Пользователь не найден' };
      }

      // Последний платёж
      const [lastPayment] = await db
        .select()
        .from(payments)
        .where(and(eq(payments.userId, user.id), eq(payments.status, 'completed')))
        .orderBy(desc(payments.createdAt))
        .limit(1);

      if (!lastPayment) {
        set.status = 404;
        return { success: false, error: 'Нет завершённых платежей у пользователя' };
      }

      // Проверяем — было ли начисление за этот платёж (в течение 24ч от даты платежа)
      const paymentDate = new Date(lastPayment.createdAt);
      const windowStart = new Date(paymentDate.getTime() - 24 * 60 * 60 * 1000);
      const windowEnd = new Date(paymentDate.getTime() + 24 * 60 * 60 * 1000);

      const [existing] = await db
        .select()
        .from(energyTransactions)
        .where(
          and(
            eq(energyTransactions.userId, user.id),
            eq(energyTransactions.reason, 'Продление подписки'),
            gte(energyTransactions.createdAt, windowStart),
            lte(energyTransactions.createdAt, windowEnd),
          )
        )
        .limit(1);

      if (existing) {
        return {
          success: false,
          already_awarded: true,
          error: `Энергия за это продление уже начислена (${existing.amount} EP, ${existing.createdAt})`,
          payment_date: lastPayment.createdAt,
        };
      }

      // Начисляем — лидеры получают x2
      const [leaderCheck] = await db
        .select()
        .from(decadeMembers)
        .where(and(eq(decadeMembers.userId, user.id), isNull(decadeMembers.leftAt), eq(decadeMembers.isLeader, true)))
        .limit(1);

      const baseAmount = 500;
      const amount = leaderCheck ? baseAmount * 2 : baseAmount;

      await energiesService.award(user.id, baseAmount, 'Продление подписки', {
        source: 'admin_manual_renewal',
        payment_id: lastPayment.id,
      });

      const newBalance = await energiesService.getBalance(user.id);

      logger.info({ telegram_id, amount, isLeader: !!leaderCheck, paymentId: lastPayment.id }, 'Admin awarded renewal energy');

      return {
        success: true,
        already_awarded: false,
        awarded: amount,
        is_leader: !!leaderCheck,
        new_balance: newBalance,
        payment_date: lastPayment.createdAt,
      };
    },
    {
      body: t.Object({
        telegram_id: t.Union([t.Number(), t.String()]),
      }),
      detail: {
        summary: 'Начислить энергию за последнее продление',
        description: 'Проверяет было ли уже начислено за последний платёж. Если нет — начисляет 500 EP (1000 для лидеров).',
      },
    }
  )

  /**
   * 📅 Установить точную дату окончания подписки
   */
  .post(
    '/set-subscription-date',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const { telegram_id: rawTelegramId, expires_at } = body;
      const telegram_id = typeof rawTelegramId === 'string' ? parseInt(rawTelegramId, 10) : rawTelegramId;

      // Валидация: дата не может быть раньше сегодня
      const newDate = new Date(expires_at);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (newDate < today) {
        set.status = 400;
        return { success: false, error: 'Дата не может быть раньше сегодняшнего дня' };
      }

      const [user] = await db.select().from(users).where(eq(users.telegramId, telegram_id)).limit(1);
      if (!user) {
        set.status = 404;
        return { success: false, error: 'Пользователь не найден' };
      }

      // Был ли без активной подписки — для запуска онбординга
      const wasNotPro = !user.isPro || !user.subscriptionExpires || user.subscriptionExpires < new Date();

      await db.update(users)
        .set({ subscriptionExpires: newDate, isPro: true, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      logger.info({ telegram_id, expires_at }, 'Admin set subscription date');

      // Запускаем онбординг если до этого подписки не было
      if (wasNotPro) {
        try {
          await startOnboardingAfterPayment(user.id, telegram_id);
        } catch (e) {
          logger.warn({ e, telegram_id }, 'Failed to start onboarding after set-subscription-date');
        }
      }

      return {
        success: true,
        message: `Дата подписки установлена: ${newDate.toLocaleDateString('ru-RU')}`,
        expires_at: newDate.toISOString(),
        onboarding_sent: wasNotPro,
      };
    },
    {
      body: t.Object({
        telegram_id: t.Union([t.Number(), t.String()]),
        expires_at: t.String({ description: 'ISO дата окончания подписки (не раньше сегодня)' }),
      }),
    }
  )

  /**
   * 🎓 Пометить / снять метку ученика
   */
  .post(
    '/toggle-student',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const { telegram_id: rawTelegramId, is_student } = body;
      const telegram_id = typeof rawTelegramId === 'string' ? parseInt(rawTelegramId, 10) : rawTelegramId;

      const [user] = await db.select().from(users).where(eq(users.telegramId, telegram_id)).limit(1);
      if (!user) {
        set.status = 404;
        return { success: false, error: 'Пользователь не найден' };
      }

      await db.update(users)
        .set({ isStudent: is_student, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      logger.info({ telegram_id, is_student }, 'Admin toggled student status');

      return {
        success: true,
        message: is_student ? `Пользователь ${telegram_id} помечен как ученик` : `Метка ученика снята`,
        is_student,
      };
    },
    {
      body: t.Object({
        telegram_id: t.Union([t.Number(), t.String()]),
        is_student: t.Boolean(),
      }),
    }
  )

  /**
   * 🔄 Восстановить пользователя в десятку (после оплаты)
   */
  .post(
    '/restore-to-decade',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const { telegram_id: rawTelegramId } = body;
      const telegram_id = typeof rawTelegramId === 'string' ? parseInt(rawTelegramId, 10) : rawTelegramId;

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, telegram_id))
        .limit(1);

      if (!user) {
        set.status = 404;
        return { success: false, error: 'Пользователь не найден' };
      }

      // Разблокировать во всех чатах сначала
      try {
        await subscriptionGuardService.unbanUserFromAllChats(telegram_id);
      } catch (error) {
        logger.warn({ error, telegram_id }, 'Failed to unban user from chats during restore');
      }

      // Попробовать восстановить в десятку
      const restoreResult = await decadesService.restoreUserToDecade(user.id, telegram_id);

      const botToken = process.env.TELEGRAM_BOT_TOKEN;

      const sendInviteMessage = async (inviteLink: string, decadeName: string) => {
        if (!botToken || !inviteLink) return;
        try {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: telegram_id,
              text: `✅ Вас восстановили в ${decadeName}!\n\nСсылка для входа в чат десятки:\n${inviteLink}`,
              disable_web_page_preview: true,
            }),
          });
        } catch (e) {
          logger.warn({ e, telegram_id }, 'restore-to-decade: failed to send invite message');
        }
      };

      if (restoreResult.restored) {
        logger.info({ telegram_id, decadeName: restoreResult.decadeName }, 'Admin restored user to decade');
        await sendInviteMessage(restoreResult.inviteLink || '', restoreResult.decadeName || '');
        // фиктивный отчёт чтоб крон не выкинул на следующий день
        try {
          await energiesService.award(user.id, 50, 'Ежедневный отчет', { source: 'admin_restore' });
        } catch (e) {
          logger.warn({ e, telegram_id }, 'Failed to award fake report energy after restore');
        }
        return {
          success: true,
          message: `Пользователь ${telegram_id} восстановлен в ${restoreResult.decadeName}`,
          decade_name: restoreResult.decadeName,
          invite_link: restoreResult.inviteLink,
        };
      }

      // Если не получилось восстановить (нет предыдущего членства или десятка заполнена)
      logger.info({ telegram_id, error: restoreResult.error }, 'Could not restore to previous decade, trying assignment');

      // Попробовать назначить в любую доступную десятку в городе
      const assignResult = await decadesService.assignUserToDecade(telegram_id);
      if (assignResult.success) {
        await sendInviteMessage(assignResult.inviteLink || '', assignResult.decadeName || '');
        // фиктивный отчёт чтоб крон не выкинул на следующий день
        try {
          await energiesService.award(user.id, 50, 'Ежедневный отчет', { source: 'admin_restore' });
        } catch (e) {
          logger.warn({ e, telegram_id }, 'Failed to award fake report energy after assign');
        }
        return {
          success: true,
          message: `Пользователь ${telegram_id} назначен в ${assignResult.decadeName}`,
          decade_name: assignResult.decadeName,
          invite_link: assignResult.inviteLink,
        };
      }

      return {
        success: false,
        error: `Не удалось восстановить: ${restoreResult.error}. Назначение: ${assignResult.error}`,
      };
    },
    {
      body: t.Object({
        telegram_id: t.Union([t.Number(), t.String()], { description: 'Telegram ID пользователя' }),
      }),
      detail: {
        summary: 'Восстановить пользователя в десятку',
        description: 'Пробует восстановить пользователя в его предыдущую десятку (если место есть) или назначает в новую свободную.',
      },
    }
  )

  /**
   * 🗑️ Удалить участника из десятки
   */
  .post(
    '/remove-decade-member',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const { telegram_id: rawTelegramId, kick_from_chat = true } = body;
      const telegram_id = typeof rawTelegramId === 'string' ? parseInt(rawTelegramId, 10) : rawTelegramId;

      // Найти активное членство (для отображения в ответе)
      const [membership] = await db
        .select()
        .from(decadeMembers)
        .where(and(eq(decadeMembers.telegramId, telegram_id), isNull(decadeMembers.leftAt)))
        .limit(1);

      if (!membership) {
        return { success: false, error: 'Активное членство в десятке не найдено' };
      }

      const [decade] = await db
        .select()
        .from(decades)
        .where(eq(decades.id, membership.decadeId))
        .limit(1);

      if (!decade) {
        return { success: false, error: 'Десятка не найдена' };
      }

      // Использовать decadesService для корректного закрытия членства + кика
      // (он обновит DB и при kick_from_chat выгонит из Telegram)
      if (kick_from_chat) {
        await decadesService.removeUserFromDecade(telegram_id);
      } else {
        // Только закрыть в DB без кика
        const [user] = await db.select({ isAmbassador: users.isAmbassador }).from(users).where(eq(users.telegramId, telegram_id)).limit(1);

        await db
          .update(decadeMembers)
          .set({ leftAt: new Date() })
          .where(eq(decadeMembers.id, membership.id));

        if (!user?.isAmbassador) {
          const newCount = Math.max(0, decade.currentMembers - 1);
          await db
            .update(decades)
            .set({ currentMembers: newCount, isFull: false, updatedAt: new Date() })
            .where(eq(decades.id, decade.id));
        }
      }

      logger.info({ telegram_id, decadeId: decade.id, city: decade.city, number: decade.number, kick_from_chat }, 'Admin removed user from decade');

      return {
        success: true,
        message: `Пользователь ${telegram_id} удалён из десятки №${decade.number} (${decade.city})${kick_from_chat ? ' и выгнан из чата' : ''}`,
        decade: { id: decade.id, city: decade.city, number: decade.number },
      };
    },
    {
      body: t.Object({
        telegram_id: t.Union([t.Number(), t.String()], { description: 'Telegram ID участника для удаления' }),
        kick_from_chat: t.Optional(t.Boolean({ description: 'Выгнать из Telegram-чата (по умолчанию true)' })),
      }),
      detail: {
        summary: 'Удалить участника из десятки',
        description: 'Закрывает членство пользователя в его текущей десятке и (опционально) выгоняет из Telegram-чата.',
      },
    }
  )

  /**
   * ➕ Принудительно добавить пользователя в конкретную десятку
   */
  .post(
    '/force-add-to-decade',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const { telegram_id: rawTelegramId, decade_city, decade_number } = body;
      const telegram_id = typeof rawTelegramId === 'string' ? parseInt(rawTelegramId, 10) : rawTelegramId;

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, telegram_id))
        .limit(1);

      if (!user) {
        set.status = 404;
        return { success: false, error: 'Пользователь не найден' };
      }

      // Найти десятку по городу и номеру
      const [decade] = await db
        .select()
        .from(decades)
        .where(and(eq(decades.city, decade_city), eq(decades.number, decade_number), eq(decades.isActive, true)))
        .limit(1);

      if (!decade) {
        set.status = 404;
        return { success: false, error: `Десятка №${decade_number} в городе ${decade_city} не найдена или неактивна` };
      }

      // Проверить нет ли уже активного членства
      const [existingMembership] = await db
        .select()
        .from(decadeMembers)
        .where(and(eq(decadeMembers.userId, user.id), isNull(decadeMembers.leftAt)))
        .limit(1);

      if (existingMembership) {
        return { success: false, error: `Пользователь уже состоит в десятке (ID: ${existingMembership.decadeId})` };
      }

      // Проверить нет ли исторической записи для этой же (decade_id, user_id) — unique constraint
      // Если есть — реактивируем её, иначе вставляем новую
      const [historicalMembership] = await db
        .select()
        .from(decadeMembers)
        .where(and(eq(decadeMembers.userId, user.id), eq(decadeMembers.decadeId, decade.id)))
        .limit(1);

      if (historicalMembership) {
        // Реактивируем: снимаем left_at
        await db
          .update(decadeMembers)
          .set({ leftAt: null, joinedAt: new Date() })
          .where(eq(decadeMembers.id, historicalMembership.id));
      } else {
        // Новая запись
        await db.insert(decadeMembers).values({
          decadeId: decade.id,
          userId: user.id,
          telegramId: telegram_id,
          isLeader: false,
        });
      }

      // Обновить счётчик (только если не амбассадор)
      if (!user.isAmbassador) {
        const newCount = decade.currentMembers + 1;
        await db
          .update(decades)
          .set({
            currentMembers: newCount,
            isFull: newCount >= decade.maxMembers,
            updatedAt: new Date(),
          })
          .where(eq(decades.id, decade.id));
      }

      logger.info({ telegram_id, decadeId: decade.id, city: decade_city, number: decade_number }, 'Admin force-added user to decade');

      return {
        success: true,
        message: `Пользователь ${telegram_id} добавлен в десятку №${decade_number} (${decade_city})`,
        invite_link: decade.inviteLink || null,
        decade: { id: decade.id, city: decade.city, number: decade.number },
      };
    },
    {
      body: t.Object({
        telegram_id: t.Union([t.Number(), t.String()], { description: 'Telegram ID участника' }),
        decade_city: t.String({ description: 'Город десятки' }),
        decade_number: t.Number({ description: 'Номер десятки в городе' }),
      }),
      detail: {
        summary: 'Принудительно добавить в десятку',
        description: 'Добавляет пользователя в указанную десятку по городу и номеру (без проверки лимита). Возвращает инвайт-ссылку.',
      },
    }
  )

  /**
   * 👑 Сменить лидера десятки
   */
  .post(
    '/replace-leader',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const {
        decade_city,
        decade_number,
        new_leader_telegram_id: rawNewLeader,
        keep_old_leader_as_participant = true,
      } = body;

      const new_leader_telegram_id = typeof rawNewLeader === 'string' ? parseInt(rawNewLeader, 10) : rawNewLeader;

      // Найти десятку
      const [decade] = await db
        .select()
        .from(decades)
        .where(and(eq(decades.city, decade_city), eq(decades.number, decade_number), eq(decades.isActive, true)))
        .limit(1);

      if (!decade) {
        set.status = 404;
        return { success: false, error: `Десятка №${decade_number} в городе ${decade_city} не найдена` };
      }

      // Найти нового лидера
      const [newLeaderUser] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, new_leader_telegram_id))
        .limit(1);

      if (!newLeaderUser) {
        set.status = 404;
        return { success: false, error: `Новый лидер (tg_id: ${new_leader_telegram_id}) не найден` };
      }

      await db.transaction(async tx => {
        // 1. Убрать флаг лидера со старого лидера
        await tx
          .update(decadeMembers)
          .set({ isLeader: false })
          .where(and(eq(decadeMembers.decadeId, decade.id), eq(decadeMembers.isLeader, true), isNull(decadeMembers.leftAt)));

        // 2. Если старый лидер не остаётся - закрыть его членство
        if (!keep_old_leader_as_participant && decade.leaderTelegramId) {
          await tx
            .update(decadeMembers)
            .set({ leftAt: new Date() })
            .where(
              and(
                eq(decadeMembers.decadeId, decade.id),
                eq(decadeMembers.telegramId, decade.leaderTelegramId),
                isNull(decadeMembers.leftAt)
              )
            );
          // Обновить счётчик
          const newCount = Math.max(0, decade.currentMembers - 1);
          await tx.update(decades).set({ currentMembers: newCount, updatedAt: new Date() }).where(eq(decades.id, decade.id));
        }

        // 3. Найти или создать членство нового лидера
        const [existingNewLeaderMembership] = await tx
          .select()
          .from(decadeMembers)
          .where(and(eq(decadeMembers.userId, newLeaderUser.id), eq(decadeMembers.decadeId, decade.id), isNull(decadeMembers.leftAt)))
          .limit(1);

        if (existingNewLeaderMembership) {
          // Уже участник - просто повысить до лидера
          await tx
            .update(decadeMembers)
            .set({ isLeader: true })
            .where(eq(decadeMembers.id, existingNewLeaderMembership.id));
        } else {
          // Не участник - добавить как лидера (без изменения счётчика если амбассадор, иначе +1)
          await tx.insert(decadeMembers).values({
            decadeId: decade.id,
            userId: newLeaderUser.id,
            telegramId: new_leader_telegram_id,
            isLeader: true,
          });
          if (!newLeaderUser.isAmbassador) {
            await tx
              .update(decades)
              .set({ currentMembers: decade.currentMembers + 1, updatedAt: new Date() })
              .where(eq(decades.id, decade.id));
          }
        }

        // 4. Обновить десятку
        await tx
          .update(decades)
          .set({
            leaderUserId: newLeaderUser.id,
            leaderTelegramId: new_leader_telegram_id,
            updatedAt: new Date(),
          })
          .where(eq(decades.id, decade.id));
      });

      // 5. Сбросить кэш энергий лидеров
      if (decade.leaderTelegramId) {
        const [oldLeaderUser] = await db.select({ id: users.id }).from(users).where(eq(users.telegramId, decade.leaderTelegramId)).limit(1);
        if (oldLeaderUser) energiesService.clearLeaderCache(oldLeaderUser.id);
      }
      energiesService.clearLeaderCache(newLeaderUser.id);

      logger.info(
        { decadeId: decade.id, city: decade_city, number: decade_number, oldLeader: decade.leaderTelegramId, newLeader: new_leader_telegram_id },
        'Admin replaced decade leader'
      );

      return {
        success: true,
        message: `Лидер десятки №${decade_number} (${decade_city}) изменён на tg_id ${new_leader_telegram_id}`,
        decade: { id: decade.id, city: decade.city, number: decade.number },
        new_leader: { telegram_id: new_leader_telegram_id, username: newLeaderUser.username },
      };
    },
    {
      body: t.Object({
        decade_city: t.String({ description: 'Город десятки' }),
        decade_number: t.Number({ description: 'Номер десятки в городе' }),
        new_leader_telegram_id: t.Union([t.Number(), t.String()], { description: 'Telegram ID нового лидера' }),
        keep_old_leader_as_participant: t.Optional(t.Boolean({ description: 'Оставить старого лидера как участника (по умолчанию true)' })),
      }),
      detail: {
        summary: 'Сменить лидера десятки',
        description: 'Переназначает лидера десятки. Старый лидер может остаться как обычный участник. Сбрасывает кэш x2 энергии.',
      },
    }
  )

  /**
   * 🏅 Установить/снять статус амбассадора
   */
  .post(
    '/set-ambassador',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const { telegram_id: rawTelegramId, is_ambassador, kick_from_chats = false } = body;
      const telegram_id = typeof rawTelegramId === 'string' ? parseInt(rawTelegramId, 10) : rawTelegramId;

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, telegram_id))
        .limit(1);

      if (!user) {
        set.status = 404;
        return { success: false, error: 'Пользователь не найден' };
      }

      await db
        .update(users)
        .set({ isAmbassador: is_ambassador, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      // Если снимаем статус и нужно выгнать из чатов
      if (!is_ambassador && kick_from_chats) {
        try {
          await decadesService.removeUserFromDecade(telegram_id);
          await subscriptionGuardService.unbanUserFromAllChats(telegram_id);
        } catch (error) {
          logger.warn({ error, telegram_id }, 'Failed to kick ex-ambassador from chats');
        }
      }

      logger.info({ telegram_id, is_ambassador, kick_from_chats }, 'Admin set ambassador status');

      return {
        success: true,
        message: `Статус амбассадора для ${telegram_id}: ${is_ambassador ? 'установлен' : 'снят'}`,
        user: { telegram_id, username: user.username, is_ambassador },
      };
    },
    {
      body: t.Object({
        telegram_id: t.Union([t.Number(), t.String()], { description: 'Telegram ID пользователя' }),
        is_ambassador: t.Boolean({ description: 'true - назначить амбассадором, false - снять' }),
        kick_from_chats: t.Optional(t.Boolean({ description: 'Выгнать из всех чатов при снятии статуса (по умолчанию false)' })),
      }),
      detail: {
        summary: 'Установить статус амбассадора',
        description: 'Устанавливает или снимает статус амбассадора. Амбассадоры могут входить в любые десятки без учёта лимита.',
      },
    }
  )

  /**
   * 🎁 Активировать подарочную подписку
   */
  .post(
    '/activate-gift',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const {
        recipient_telegram_id: rawRecipient,
        gifter_telegram_id: rawGifter,
        days = 30,
      } = body;

      const recipient_telegram_id = typeof rawRecipient === 'string' ? parseInt(rawRecipient, 10) : rawRecipient;
      const gifter_telegram_id = rawGifter
        ? (typeof rawGifter === 'string' ? parseInt(rawGifter, 10) : rawGifter)
        : null;

      // Найти или создать получателя
      let [recipientUser] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, recipient_telegram_id))
        .limit(1);

      const subscriptionExpires = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

      if (!recipientUser) {
        const [newUser] = await db
          .insert(users)
          .values({
            telegramId: recipient_telegram_id,
            isPro: true,
            subscriptionExpires,
            gifted: true,
            firstPurchaseDate: new Date(),
            metadata: { source: 'admin_gift' },
          })
          .returning();
        recipientUser = newUser;
      } else {
        const [updated] = await db
          .update(users)
          .set({
            isPro: true,
            subscriptionExpires,
            gifted: true,
            firstPurchaseDate: recipientUser.firstPurchaseDate || new Date(),
            updatedAt: new Date(),
          })
          .where(eq(users.id, recipientUser.id))
          .returning();
        recipientUser = updated;
      }

      // Установить giftedBy если указан даритель (giftedBy хранит telegram_id дарителя)
      if (gifter_telegram_id) {
        await db
          .update(users)
          .set({ giftedBy: gifter_telegram_id, updatedAt: new Date() })
          .where(eq(users.id, recipientUser.id));
      }

      // Разблокировать в чатах
      try {
        await subscriptionGuardService.unbanUserFromAllChats(recipient_telegram_id);
      } catch (error) {
        logger.warn({ error, recipient_telegram_id }, 'Failed to unban gift recipient');
      }

      // Начислить 500 энергии
      try {
        await energiesService.award(recipientUser.id, 500, 'Продление подписки', { source: 'admin_gift' });
      } catch (error) {
        logger.warn({ error }, 'Failed to award gift energy');
      }

      // Запустить онбординг
      let onboardingSent = false;
      try {
        await startOnboardingAfterPayment(recipientUser.id, recipient_telegram_id);
        onboardingSent = true;
      } catch (error) {
        logger.warn({ error, recipient_telegram_id }, 'Failed to send gift onboarding');
      }

      logger.info({ recipient_telegram_id, gifter_telegram_id, days }, 'Admin activated gift subscription');

      return {
        success: true,
        message: `Подарочная подписка активирована для ${recipient_telegram_id} на ${days} дней`,
        onboarding_sent: onboardingSent,
        user: {
          id: recipientUser.id,
          telegram_id: recipientUser.telegramId,
          subscription_expires: subscriptionExpires,
        },
      };
    },
    {
      body: t.Object({
        recipient_telegram_id: t.Union([t.Number(), t.String()], { description: 'Telegram ID получателя подарка' }),
        gifter_telegram_id: t.Optional(t.Union([t.Number(), t.String()], { description: 'Telegram ID дарителя (опционально)' })),
        days: t.Optional(t.Number({ description: 'Количество дней подписки (по умолчанию 30)' })),
      }),
      detail: {
        summary: 'Активировать подарочную подписку',
        description: 'Активирует подарочную подписку для получателя, начисляет 500 энергии и запускает онбординг.',
      },
    }
  )

  /**
   * 🌍 Сменить город пользователя
   */
  .post(
    '/change-city',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const { telegram_id: rawTelegramId, city } = body;
      const telegram_id = typeof rawTelegramId === 'string' ? parseInt(rawTelegramId, 10) : rawTelegramId;

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, telegram_id))
        .limit(1);

      if (!user) {
        set.status = 404;
        return { success: false, error: 'Пользователь не найден' };
      }

      const oldCity = user.city;

      await db
        .update(users)
        .set({ city, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      logger.info({ telegram_id, oldCity, newCity: city }, 'Admin changed user city');

      return {
        success: true,
        message: `Город пользователя ${telegram_id} изменён: ${oldCity || '(не задан)'} → ${city}`,
        user: { telegram_id, old_city: oldCity, new_city: city },
      };
    },
    {
      body: t.Object({
        telegram_id: t.Union([t.Number(), t.String()], { description: 'Telegram ID пользователя' }),
        city: t.String({ description: 'Новый город' }),
      }),
      detail: {
        summary: 'Сменить город пользователя',
        description: 'Меняет город пользователя в базе данных. Важно: не переносит из десятки автоматически.',
      },
    }
  )

  /**
   * 🔧 Пересчитать счётчики участников всех десяток
   */
  .post(
    '/sync-telegram-names',
    async ({ headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!botToken) {
        set.status = 500;
        return { success: false, error: 'TELEGRAM_BOT_TOKEN not set' };
      }

      try {
        const krisoneUsers = await db
          .select({ id: users.id, telegramId: users.telegramId, username: users.username, firstName: users.firstName })
          .from(users)
          .where(sql`first_name ILIKE 'krisone%'`);

        const results: { telegramId: string; old: string | null; new: string | null; status: string }[] = [];

        for (const user of krisoneUsers) {
          try {
            const res = await fetch(`https://api.telegram.org/bot${botToken}/getChat?chat_id=${user.telegramId}`);
            const data = await res.json() as any;
            if (data.ok && data.result?.first_name) {
              const newName = data.result.first_name;
              await db.update(users).set({ firstName: newName }).where(eq(users.id, user.id));
              results.push({ telegramId: user.telegramId!, old: user.firstName, new: newName, status: 'updated' });
            } else {
              results.push({ telegramId: user.telegramId!, old: user.firstName, new: null, status: 'not_found' });
            }
          } catch (e: any) {
            results.push({ telegramId: user.telegramId!, old: user.firstName, new: null, status: `error: ${e.message}` });
          }
        }

        logger.info({ count: results.length }, 'Admin synced telegram names');
        return { success: true, results };
      } catch (error: any) {
        logger.error({ error }, 'Failed to sync telegram names');
        set.status = 500;
        return { success: false, error: error.message };
      }
    },
    {
      detail: {
        summary: 'Синхронизировать имена из Telegram',
        description: 'Обновляет first_name пользователей с krisone_* из реального Telegram профиля.',
      },
    }
  )
  .post(
    '/fix-decade-counters',
    async ({ headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      try {
        const result = await decadesService.fixAllDecadeCounters();
        logger.info(result, 'Admin fixed decade counters');
        return {
          success: true,
          message: `Счётчики пересчитаны. Исправлено десяток: ${result.countersFixed}`,
          counters_fixed: result.countersFixed,
        };
      } catch (error: any) {
        logger.error({ error }, 'Failed to fix decade counters');
        set.status = 500;
        return { success: false, error: error.message };
      }
    },
    {
      detail: {
        summary: 'Пересчитать счётчики десяток',
        description: 'Пересчитывает current_members и is_full для всех десяток по фактическому составу. Амбассадоры не учитываются.',
      },
    }
  )

  /**
   * 🧹 Чистка неактивных участников десяток
   * Условия удаления:
   *   - Нет #отчет (energy_transactions reason='Ежедневный отчет') за последние 30 дней
   *   - ИЛИ никогда не сдавал отчет И в десятке уже 30+ дней
   * Лидеры и пользователи без подписки не затрагиваются.
   * dry_run=true (по умолчанию) — только показать список, не удалять.
   * dry_run=false — реально кикнуть из десятки + Telegram-чата.
   */
  .post(
    '/cleanup-inactive-decade-members',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers as Record<string, string | undefined>)) {
        set.status = 401;
        return { success: false, error: 'Unauthorized' };
      }

      const { dry_run = true } = body as { dry_run?: boolean };

      try {
        const result = await subscriptionGuardService.removeInactiveDecadeMembers(dry_run);

        return {
          success: true,
          dry_run: result.dryRun,
          total: result.total,
          message: result.dryRun
            ? `Найдено ${result.total} неактивных участников (dry_run=true, удаление не выполнено)`
            : `Удалено ${result.total} неактивных участников из десяток`,
          members: result.members,
        };
      } catch (error: any) {
        logger.error({ error }, 'Failed to cleanup inactive decade members');
        set.status = 500;
        return { success: false, error: error.message };
      }
    },
    {
      detail: {
        summary: 'Чистка неактивных участников десяток',
        description: 'Находит и удаляет участников без #отчет за 30 дней. dry_run=true — только просмотр.',
      },
    }
  )

  /**
   * 📨 Массовая рассылка invite-ссылок в десятки восстановленным участникам
   * Используется после аварийного восстановления, когда людей физически выкинули из Telegram-чата.
   * dry_run=true (по умолчанию) — только показывает кому будет отправлено, без отправки.
   */
  .post(
    '/send-decade-reinvites',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const {
        dry_run = true,
        kicked_after = '2026-03-11T03:20:00Z',
        kicked_before = '2026-03-11T03:35:00Z',
        telegram_ids,
        mode = 'time-window',
      } = body as {
        dry_run?: boolean;
        kicked_after?: string;
        kicked_before?: string;
        telegram_ids?: string[];
        /**
         * mode:
         *   "time-window"       — искать по joined_at < kicked_after - 30 дней (старый режим)
         *   "explicit-ids"      — явный список telegram_ids
         *   "incorrectly-kicked" — все активные участники с joined_at > 30 дней назад И имеющие
         *                          'Ежедневный отчет' за последние 30 дней (ошибочно выкинутые багом)
         */
        mode?: 'time-window' | 'explicit-ids' | 'incorrectly-kicked';
      };

      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!botToken) {
        set.status = 503;
        return { success: false, error: 'TELEGRAM_BOT_TOKEN не настроен' };
      }

      let affected: {
        telegram_id: string;
        first_name: string | null;
        username: string | null;
        city: string;
        number: number;
        invite_link: string | null;
        tg_chat_id: string | null;
      }[];

      if (mode === 'incorrectly-kicked') {
        // Режим: ошибочно выкинутые багом cron.
        // Определение: сейчас активны в десятке (left_at IS NULL) + вступили 30+ дней назад
        // + есть 'Ежедневный отчет' за последние 30 дней (= были активны, но всё равно выкинуты).
        // Включает всех жертв бага с Feb 24 по March 11 которые уже восстановлены.
        affected = await rawDb<typeof affected>`
          SELECT
            dm.telegram_id::text,
            u.first_name,
            u.username,
            d.city,
            d.number,
            d.invite_link,
            d.tg_chat_id::text
          FROM decade_members dm
          JOIN users u ON u.id = dm.user_id
          JOIN decades d ON d.id = dm.decade_id
          WHERE dm.left_at IS NULL
            AND dm.is_leader = false
            AND u.is_pro = true
            AND d.is_active = true
            AND d.invite_link IS NOT NULL
            AND dm.joined_at < NOW() - INTERVAL '30 days'
            AND EXISTS (
              SELECT 1 FROM energy_transactions et
              WHERE et.user_id = dm.user_id
                AND et.reason = 'Ежедневный отчет'
                AND et.created_at >= NOW() - INTERVAL '30 days'
            )
          ORDER BY d.city, d.number
        `;
      } else if (mode === 'explicit-ids' || (telegram_ids && telegram_ids.length > 0)) {
        // Режим: явный список telegram_id (для точечной рассылки)
        if (!telegram_ids || telegram_ids.length === 0) {
          set.status = 400;
          return { success: false, error: 'telegram_ids обязателен для mode=explicit-ids' };
        }
        const idsStr = telegram_ids.map(id => `'${id.replace(/'/g, '')}'`).join(',');
        affected = await rawDb<typeof affected>`
          SELECT
            dm.telegram_id::text,
            u.first_name,
            u.username,
            d.city,
            d.number,
            d.invite_link,
            d.tg_chat_id::text
          FROM decade_members dm
          JOIN users u ON u.id = dm.user_id
          JOIN decades d ON d.id = dm.decade_id
          WHERE dm.left_at IS NULL
            AND dm.is_leader = false
            AND d.is_active = true
            AND d.invite_link IS NOT NULL
            AND dm.telegram_id::text = ANY(ARRAY[${rawDb.unsafe(idsStr)}])
          ORDER BY d.city, d.number
        `;
      } else {
        // Режим: поиск по временному окну выкидывания (kicked_after/kicked_before)
        // (joined_at < kicked_after - 30 дней = они точно попали под баговый cron)
        const cutoff = new Date(new Date(kicked_after).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        logger.info({ cutoff, kicked_after, kicked_before }, 'send-decade-reinvites: using time-window mode');

        affected = await rawDb<typeof affected>`
          SELECT
            dm.telegram_id::text,
            u.first_name,
            u.username,
            d.city,
            d.number,
            d.invite_link,
            d.tg_chat_id::text
          FROM decade_members dm
          JOIN users u ON u.id = dm.user_id
          JOIN decades d ON d.id = dm.decade_id
          WHERE dm.left_at IS NULL
            AND dm.is_leader = false
            AND u.is_pro = true
            AND d.is_active = true
            AND d.invite_link IS NOT NULL
            AND dm.joined_at < ${cutoff}
          ORDER BY d.city, d.number
        `;
      }

      logger.info({ total: affected.length, dry_run, mode }, 'send-decade-reinvites: found affected members');

      if (dry_run) {
        return {
          success: true,
          dry_run: true,
          total: affected.length,
          message: `dry_run=true. Будет отправлено ${affected.length} приглашений. Запусти с dry_run=false для реальной отправки.`,
          sample: affected.slice(0, 10).map(m => ({
            telegram_id: m.telegram_id,
            name: m.first_name,
            city: m.city,
            decade: m.number,
          })),
        };
      }

      // Реальная рассылка
      let sent = 0;
      let failed = 0;
      let unbanned = 0;
      const errors: string[] = [];

      for (const member of affected) {
        if (!member.invite_link) continue;

        // Шаг 1: разбанить в чате десятки (safety — на случай если unban при kick не прошёл)
        if (member.tg_chat_id) {
          try {
            await fetch(`https://api.telegram.org/bot${botToken}/unbanChatMember`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: Number(member.tg_chat_id),
                user_id: Number(member.telegram_id),
                only_if_banned: true,
              }),
            });
            unbanned++;
          } catch {
            // Не критично, логируем и продолжаем
          }
        }

        // Шаг 2: отправить сообщение с invite-ссылкой
        const text = `⚠️ Из-за технической ошибки вы были случайно исключены из вашей Десятки №${member.number} (${member.city}).\n\nПриносим свои извинения! Вернитесь по ссылке:\n${member.invite_link}`;

        try {
          const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: Number(member.telegram_id),
              text,
              disable_web_page_preview: true,
            }),
          });

          const json = await res.json() as { ok: boolean; description?: string };
          if (json.ok) {
            sent++;
          } else {
            failed++;
            errors.push(`${member.telegram_id}: ${json.description}`);
          }
        } catch (e: any) {
          failed++;
          errors.push(`${member.telegram_id}: ${e.message}`);
        }

        // Задержка чтобы не попасть под rate limit Telegram (30 msg/sec)
        await new Promise(r => setTimeout(r, 40));
      }

      logger.info({ sent, failed, unbanned, total: affected.length }, 'send-decade-reinvites: done');

      return {
        success: true,
        dry_run: false,
        total: affected.length,
        sent,
        failed,
        unbanned,
        errors: errors.slice(0, 20),
        message: `Разбанено: ${unbanned}. Отправлено ${sent} из ${affected.length}. Ошибок: ${failed}.`,
      };
    },
    {
      detail: {
        summary: 'Разослать invite-ссылки восстановленным участникам десяток',
        description: 'После аварийного восстановления отправляет каждому участнику ссылку на вход в его десятку. dry_run=true (по умолчанию) — только предпросмотр.',
      },
    }
  )

  // ============================================================================
  // 💳 LAVATOP OFFERS — CRUD без деплоя
  // ============================================================================

  /**
   * 📋 Список всех офферов LavaTop
   */
  .get(
    '/lavatop-offers',
    async ({ headers, set, query }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const onlyActive = (query as any)?.active === 'true';

      const offers = await db
        .select()
        .from(lavatopOffers)
        .orderBy(lavatopOffers.createdAt);

      const filtered = onlyActive ? offers.filter(o => o.isActive) : offers;

      return { success: true, offers: filtered };
    },
    {
      detail: {
        summary: 'Список офферов LavaTop',
        description: 'Возвращает все офферы. ?active=true — только активные.',
      },
    }
  )

  /**
   * ➕ Создать оффер LavaTop
   */
  .post(
    '/lavatop-offers',
    async ({ body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const { key, offer_id, label, currency = 'RUB', periodicity = 'ONE_TIME', amount, is_gift = false } = body;

      // Проверяем уникальность ключа
      const [existing] = await db
        .select({ id: lavatopOffers.id })
        .from(lavatopOffers)
        .where(eq(lavatopOffers.key, key))
        .limit(1);

      if (existing) {
        set.status = 409;
        return { success: false, error: `Оффер с ключом '${key}' уже существует.` };
      }

      const [created] = await db
        .insert(lavatopOffers)
        .values({
          key,
          offerId: offer_id,
          label,
          currency,
          periodicity,
          amount: amount ? String(amount) : null,
          isGift: is_gift,
        })
        .returning();

      logger.info({ key, offer_id, label }, 'Admin created LavaTop offer');

      return { success: true, offer: created };
    },
    {
      body: t.Object({
        key: t.String({ description: 'Уникальный slug, например: monthly_rub_2000, gift_rub_990' }),
        offer_id: t.String({ description: 'UUID оффера из ЛК LavaTop' }),
        label: t.String({ description: 'Человекочитаемое название: "Подписка 1 месяц (2000 ₽)"' }),
        currency: t.Optional(t.String({ description: 'RUB | USD | EUR. По умолчанию RUB' })),
        periodicity: t.Optional(t.String({ description: 'ONE_TIME | MONTHLY | PERIOD_90_DAYS | PERIOD_180_DAYS. По умолчанию ONE_TIME' })),
        amount: t.Optional(t.Union([t.Number(), t.String()], { description: 'Сумма для отображения (справочно)' })),
        is_gift: t.Optional(t.Boolean({ description: 'Это подарочный оффер? По умолчанию false' })),
      }),
      detail: {
        summary: 'Создать оффер LavaTop',
        description: 'Добавляет новый оффер. offer_id берётся из ЛК LavaTop → Products/Offers.',
      },
    }
  )

  /**
   * ✏️ Обновить оффер LavaTop
   */
  .patch(
    '/lavatop-offers/:key',
    async ({ params, body, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const { key } = params;
      const [existing] = await db
        .select()
        .from(lavatopOffers)
        .where(eq(lavatopOffers.key, key))
        .limit(1);

      if (!existing) {
        set.status = 404;
        return { success: false, error: `Оффер '${key}' не найден.` };
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      const b = body as Record<string, any>;

      if (b.offer_id !== undefined) updates.offerId = b.offer_id;
      if (b.label !== undefined) updates.label = b.label;
      if (b.currency !== undefined) updates.currency = b.currency;
      if (b.periodicity !== undefined) updates.periodicity = b.periodicity;
      if (b.amount !== undefined) updates.amount = b.amount !== null ? String(b.amount) : null;
      if (b.is_active !== undefined) updates.isActive = b.is_active;
      if (b.is_gift !== undefined) updates.isGift = b.is_gift;

      const [updated] = await db
        .update(lavatopOffers)
        .set(updates)
        .where(eq(lavatopOffers.key, key))
        .returning();

      logger.info({ key, updates }, 'Admin updated LavaTop offer');

      return { success: true, offer: updated };
    },
    {
      params: t.Object({ key: t.String({ description: 'Ключ оффера' }) }),
      body: t.Object({
        offer_id: t.Optional(t.String()),
        label: t.Optional(t.String()),
        currency: t.Optional(t.String()),
        periodicity: t.Optional(t.String()),
        amount: t.Optional(t.Union([t.Number(), t.String(), t.Null()])),
        is_active: t.Optional(t.Boolean()),
        is_gift: t.Optional(t.Boolean()),
      }),
      detail: {
        summary: 'Обновить оффер LavaTop',
        description: 'Обновляет поля оффера. is_active=false — деактивация без удаления.',
      },
    }
  )

  /**
   * 🗑️ Удалить оффер LavaTop
   */
  .delete(
    '/lavatop-offers/:key',
    async ({ params, headers, set }) => {
      if (!checkAdminAuth(headers)) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const { key } = params;
      const deleted = await db
        .delete(lavatopOffers)
        .where(eq(lavatopOffers.key, key))
        .returning();

      if (deleted.length === 0) {
        set.status = 404;
        return { success: false, error: `Оффер '${key}' не найден.` };
      }

      logger.info({ key }, 'Admin deleted LavaTop offer');

      return { success: true, message: `Оффер '${key}' удалён.` };
    },
    {
      params: t.Object({ key: t.String({ description: 'Ключ оффера' }) }),
      detail: {
        summary: 'Удалить оффер LavaTop',
        description: 'Полное удаление оффера. Рекомендуется использовать PATCH is_active=false вместо удаления.',
      },
    }
  );
