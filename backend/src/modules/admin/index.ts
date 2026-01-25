/**
 * 🔐 ADMIN API
 * API для административных операций
 *
 * Документация:
 * - POST /admin/generate-payment-link - Генерация ссылки на оплату
 * - POST /admin/reset-user-funnel - Сброс воронки пользователя
 * - POST /admin/revoke-subscription - Отзыв подписки
 * - GET /admin/user/:telegram_id - Информация о пользователе
 */

import { Elysia, t } from 'elysia';
import { db } from '@/db';
import { users, paymentAnalytics, clubFunnelProgress } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/utils/logger';

// Lava виджет URL (замените на реальный)
const LAVA_WIDGET_BASE_URL = process.env.LAVA_WIDGET_URL || 'https://link.lava.ru/qEPKZ';

export const adminRoutes = new Elysia({ prefix: '/admin' })
  // Простая авторизация через секретный заголовок
  .derive(({ headers, set }) => {
    const adminSecret = headers['x-admin-secret'];
    if (adminSecret !== process.env.ADMIN_SECRET && adminSecret !== 'local-dev-secret') {
      set.status = 401;
      throw new Error('Unauthorized');
    }
    return {};
  })

  /**
   * 📝 Генерация ссылки на оплату
   * Создает payment_attempt и возвращает ссылку на виджет Lava
   */
  .post(
    '/generate-payment-link',
    async ({ body }) => {
      const {
        telegram_id,
        email,
        name,
        phone,
        currency = 'RUB',
        amount = '2000',
        utm_source = 'admin',
        utm_campaign = 'manual',
      } = body;

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

      // Формируем URL с предзаполненными данными
      const params = new URLSearchParams();
      if (email) params.set('email', email.toLowerCase().trim());
      if (name) params.set('name', name);
      if (phone) params.set('phone', phone);
      params.set('amount', amount);
      params.set('currency', currency);

      const paymentUrl = `${LAVA_WIDGET_BASE_URL}?${params.toString()}`;

      logger.info(
        {
          telegram_id,
          email,
          name,
          phone,
          amount,
          currency,
        },
        'Admin generated payment link'
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
        telegram_id: t.Number({ description: 'Telegram ID пользователя' }),
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
   * 🔄 Сброс воронки пользователя
   * Удаляет прогресс воронки, чтобы пользователь прошел её заново
   */
  .post(
    '/reset-user-funnel',
    async ({ body }) => {
      const { telegram_id } = body;

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
        telegram_id: t.Number({ description: 'Telegram ID пользователя' }),
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
    async ({ body }) => {
      const { telegram_id, kick_immediately = false } = body;

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
        telegram_id: t.Number({ description: 'Telegram ID пользователя' }),
        kick_immediately: t.Optional(t.Boolean({ description: 'Удалить из каналов сразу (по умолчанию false)' })),
      }),
      detail: {
        summary: 'Отзыв подписки',
        description: 'Устанавливает дату окончания подписки в прошлое. Пользователь будет удален из всех каналов и чатов при следующем cron (6:00 МСК) или сразу, если kick_immediately=true.',
      },
    }
  )

  /**
   * 👤 Информация о пользователе
   */
  .get(
    '/user/:telegram_id',
    async ({ params }) => {
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
          created_at: user.createdAt,
          level: user.level,
          experience: user.experience,
          streak: user.streak,
        },
        funnel: funnel ? {
          current_step: funnel.currentStep,
          birth_date: funnel.birthDate,
          archetype: funnel.archetype,
          style: funnel.style,
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
   * ➕ Выдать подписку вручную
   */
  .post(
    '/grant-subscription',
    async ({ body }) => {
      const { telegram_id, days = 30, source = 'admin_grant' } = body;

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
        telegram_id: t.Number({ description: 'Telegram ID пользователя' }),
        days: t.Optional(t.Number({ description: 'Количество дней подписки (по умолчанию 30)' })),
        source: t.Optional(t.String({ description: 'Источник выдачи' })),
      }),
      detail: {
        summary: 'Выдать подписку вручную',
        description: 'Выдает подписку пользователю на указанное количество дней. Если пользователь не существует, он будет создан.',
      },
    }
  );
