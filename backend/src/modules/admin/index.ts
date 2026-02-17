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
import { db } from '@/db';
import { users, paymentAnalytics, clubFunnelProgress, videos, contentItems, decades, decadeMembers, leaderTestResults } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { logger } from '@/utils/logger';
import { startOnboardingAfterPayment } from '@/modules/bot/post-payment-funnels';
import { subscriptionGuardService } from '@/services/subscription-guard.service';
import { decadesService } from '@/services/decades.service';

// n8n webhook для генерации ссылки на оплату Lava
const N8N_LAVA_WEBHOOK_URL = 'https://n8n4.daniillepekhin.ru/webhook/lava_club2';

// Хелпер для проверки авторизации
const checkAdminAuth = (headers: Record<string, string | undefined>) => {
  const adminSecret = headers['x-admin-secret'];
  return adminSecret === process.env.ADMIN_SECRET || adminSecret === 'local-dev-secret';
};

export const adminRoutes = new Elysia({ prefix: '/admin' })
  /**
   * 📝 Генерация ссылки на оплату (БЕЗ АВТОРИЗАЦИИ)
   * Создает payment_attempt и возвращает ссылку на виджет Lava
   */
  .post(
    '/generate-payment-link',
    async ({ body }) => {
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

      // 🔄 Восстановить в десятку, если пользователь был исключён
      try {
        const [previousMembership] = await db
          .select()
          .from(decadeMembers)
          .where(eq(decadeMembers.userId, user.id))
          .orderBy(desc(decadeMembers.joinedAt))
          .limit(1);

        if (previousMembership && previousMembership.leftAt) {
          // Пользователь был в десятке, но вышел - восстанавливаем его
          await db
            .update(decadeMembers)
            .set({ leftAt: null })
            .where(eq(decadeMembers.id, previousMembership.id));
          
          logger.info(
            { 
              telegram_id, 
              userId: user.id, 
              decadeId: previousMembership.decadeId 
            }, 
            'Restored user to previous decade after payment'
          );
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

      // Разрешаем только безопасные ALTER TABLE операции
      const safePrefixes = ['ALTER TABLE', 'SELECT'];
      const isSafe = safePrefixes.some(prefix => sqlQuery.toUpperCase().trim().startsWith(prefix));

      if (!isSafe) {
        set.status = 400;
        return { success: false, error: 'Только ALTER TABLE и SELECT запросы разрешены' };
      }

      try {
        const result = await db.execute(sqlQuery);
        logger.info({ sql: sqlQuery }, 'Admin executed SQL');
        return { success: true, result };
      } catch (error: any) {
        logger.error({ error, sql: sqlQuery }, 'Admin SQL execution failed');
        return { success: false, error: error.message };
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
  );
