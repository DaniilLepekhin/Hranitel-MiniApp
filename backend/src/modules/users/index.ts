import { Elysia, t } from 'elysia';
import { eq, and, desc } from 'drizzle-orm';
import { db, users } from '@/db';
import { payments } from '@/db/schema';
import { getUserFromToken } from '@/middlewares/auth';
import { logger } from '@/utils/logger';
import { lavaTopService } from '@/services/lavatop.service';

// N8N webhook for old Lava subscription cancellation (legacy users with lavaContactId)
const CANCEL_SUBSCRIPTION_WEBHOOK = 'https://n8n4.daniillepekhin.ru/webhook/deletelava_miniapp';

// CloudPayments API for subscription cancellation
const CP_API_BASE = 'https://api.cloudpayments.ru';

export const usersModule = new Elysia({ prefix: '/users', tags: ['Users'] })
  // Get current user profile
  .get(
    '/me',
    async ({ headers, set }) => {
      // ✅ ПРЯМАЯ ПРОВЕРКА - работает всегда (authMiddleware дедуплицируется Elysia)
      const user = await getUserFromToken(headers.authorization);

      if (!user) {
        set.status = 401;
        return { success: false, error: 'Unauthorized' };
      }

      return {
        success: true,
        user: {
          id: user.id,
          telegramId: user.telegramId,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          photoUrl: user.photoUrl,
          languageCode: user.languageCode,
          level: user.level,
          experience: user.experience,
          streak: user.streak,
          lastActiveDate: user.lastActiveDate,
          isPro: user.isPro,
          subscriptionExpires: user.subscriptionExpires,
          autoRenewalEnabled: user.autoRenewalEnabled,
          settings: user.settings,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      };
    },
    {
      detail: {
        summary: 'Get current user profile',
      },
    }
  )
  // Update user profile
  .patch(
    '/me',
    async ({ body, headers, set }) => {
      // ✅ ПРЯМАЯ ПРОВЕРКА - работает всегда
      const user = await getUserFromToken(headers.authorization);

      if (!user) {
        set.status = 401;
        return { success: false, error: 'Unauthorized' };
      }

      const { settings, languageCode, firstName, lastName, city } = body;

      const updateData: Partial<typeof users.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (settings !== undefined) {
        updateData.settings = {
          ...(user!.settings as Record<string, unknown> || {}),
          ...settings,
        };
      }

      if (languageCode !== undefined) {
        updateData.languageCode = languageCode;
      }

      if (firstName !== undefined) {
        updateData.firstName = firstName;
      }

      if (lastName !== undefined) {
        updateData.lastName = lastName;
      }

      if (city !== undefined) {
        updateData.city = city;
      }

      const [updatedUser] = await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, user.id))
        .returning();

      logger.info({ userId: user.id, updates: Object.keys(updateData) }, 'User profile updated');

      return {
        success: true,
        user: {
          id: updatedUser.id,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          city: updatedUser.city,
          settings: updatedUser.settings,
          languageCode: updatedUser.languageCode,
        },
      };
    },
    {
      body: t.Object({
        settings: t.Optional(t.Record(t.String(), t.Unknown())),
        languageCode: t.Optional(t.String()),
        firstName: t.Optional(t.String()),
        lastName: t.Optional(t.String()),
        city: t.Optional(t.String()),
      }),
      detail: {
        summary: 'Update user profile (firstName, lastName, city, settings, languageCode)',
      },
    }
  )
  // Get user by ID (public profile)
  .get(
    '/:id',
    async ({ params, set }) => {
      const { id } = params;

      const [user] = await db
        .select({
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          photoUrl: users.photoUrl,
          level: users.level,
          streak: users.streak,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!user) {
        set.status = 404;
        return {
          success: false,
          error: 'User not found',
        };
      }

      return {
        success: true,
        user,
      };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        summary: 'Get user public profile',
      },
    }
  )
  // Cancel subscription
  .post(
    '/cancel-subscription',
    async ({ headers, set }) => {
      const user = await getUserFromToken(headers.authorization);

      if (!user) {
        set.status = 401;
        return { success: false, error: 'Unauthorized' };
      }

      if (!user.isPro) {
        set.status = 400;
        return { success: false, error: 'У вас нет активной подписки' };
      }

      if (!user.email) {
        set.status = 400;
        return { success: false, error: 'Email не указан. Обратитесь в службу поддержки.' };
      }

      try {
        const cpSubscriptionId = (user as any).cloudpaymentsSubscriptionId as string | null;

        // Определяем провайдера:
        // 1. CloudPayments — есть cloudpaymentsSubscriptionId
        // 2. LavaTop — есть платёж provider=lavatop с isFirstPaymentOfSubscription=true
        // 3. Lava (старый) — fallback через n8n

        // Ищем LavaTop contractId первого платежа подписки (isFirstPaymentOfSubscription=true)
        // Это тот contractId, который нужно передать в LavaTop API для отмены
        const lavatopRows = await db
          .select({ externalPaymentId: payments.externalPaymentId, metadata: payments.metadata })
          .from(payments)
          .where(
            and(
              eq(payments.userId, user.id),
              eq(payments.paymentProvider, 'lavatop'),
              eq(payments.status, 'completed')
            )
          )
          .orderBy(desc(payments.completedAt))
          .limit(50);

        const lavatopFirstPayment = lavatopRows.find(r => {
          const meta = r.metadata as Record<string, any> | null;
          return meta?.isFirstPaymentOfSubscription === true;
        });

        const provider = cpSubscriptionId ? 'cloudpayments'
          : lavatopFirstPayment ? 'lavatop'
          : 'lava';

        if (provider === 'cloudpayments') {
          // --- CloudPayments: отменяем рекуррентную подписку через API ---
          const { config } = await import('@/config');
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
              { userId: user.id, telegramId: user.telegramId, cpSubscriptionId, error: errorText },
              'Failed to cancel CloudPayments subscription'
            );
            set.status = 500;
            return { success: false, error: 'Ошибка при отмене подписки. Попробуйте позже.' };
          }

          logger.info(
            { userId: user.id, telegramId: user.telegramId, cpSubscriptionId },
            'CloudPayments subscription cancellation requested'
          );

        } else if (provider === 'lavatop') {
          // --- LavaTop: отменяем через LavaTop API напрямую ---
          const contractId = lavatopFirstPayment.externalPaymentId!;
          const email = user.email.toLowerCase();

          await lavaTopService.cancelSubscription(contractId, email);

          logger.info(
            { userId: user.id, telegramId: user.telegramId, contractId, email },
            'LavaTop subscription cancellation requested'
          );

        } else {
          // --- Lava (старый): отменяем через n8n webhook ---
          const response = await fetch(CANCEL_SUBSCRIPTION_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: user.email.toLowerCase(),
              contactid: (user as any).lavaContactId || '',
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            logger.error(
              { userId: user.id, telegramId: user.telegramId, error: errorText },
              'Failed to cancel Lava subscription via webhook'
            );
            set.status = 500;
            return { success: false, error: 'Ошибка при отмене подписки. Попробуйте позже.' };
          }

          logger.info(
            { userId: user.id, telegramId: user.telegramId, email: user.email },
            'Lava subscription cancellation requested via n8n'
          );
        }

        // Обновляем флаг в БД
        await db
          .update(users)
          .set({ autoRenewalEnabled: false, updatedAt: new Date() })
          .where(eq(users.id, user.id));

        return {
          success: true,
          provider,
        };
      } catch (error) {
        logger.error(
          { error, userId: user.id, telegramId: user.telegramId },
          'Error cancelling subscription'
        );
        set.status = 500;
        return { success: false, error: 'Ошибка при отмене подписки. Попробуйте позже.' };
      }
    },
    {
      detail: {
        summary: 'Cancel user subscription',
      },
    }
  );
