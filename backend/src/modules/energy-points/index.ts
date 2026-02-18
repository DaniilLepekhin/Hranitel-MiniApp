import { Elysia, t } from 'elysia';
import { energiesService as energyPointsService } from './service';
import { logger } from '@/utils/logger';
import { authMiddleware, getUserFromToken } from '@/middlewares/auth';

// Хелпер для проверки admin-секрета (как в admin/index.ts)
const checkAdminAuth = (headers: Record<string, string | undefined>) => {
  const adminSecret = headers['x-admin-secret'];
  return adminSecret === process.env.ADMIN_SECRET || adminSecret === 'local-dev-secret';
};

export const energyPointsRoutes = new Elysia({ prefix: '/api/v1/energies', tags: ['Energy Points'] })
  // Protected routes - require authentication
  .use(authMiddleware)
  
  /**
   * GET /api/v1/energies/balance
   * Получить баланс Энергии текущего пользователя
   * Доступно авторизованному пользователю (свой баланс)
   */
  .get(
    '/balance',
    async ({ user }) => {
      try {
        if (!user) {
          return {
            success: false,
            error: 'User not authenticated',
          };
        }

        const balance = await energyPointsService.getBalance(user.id);
        
        logger.info(`[Energies API] Balance for user ${user.username}: ${balance}`);

        return {
          success: true,
          balance,
        };
      } catch (error) {
        logger.error('[Energies API] Error getting balance:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get balance',
        };
      }
    },
    {
      detail: {
        summary: 'Get energy balance',
        description: 'Returns current energy points balance for authenticated user',
      },
    }
  )

  /**
   * GET /api/v1/energies/history
   * Получить историю транзакций текущего пользователя
   * Доступно авторизованному пользователю (своя история)
   */
  .get(
    '/history',
    async ({ user, query }) => {
      try {
        if (!user) {
          return {
            success: false,
            error: 'User not authenticated',
          };
        }
        
        const { limit } = query;

        const history = await energyPointsService.getHistory(
          user.id,
          limit ? parseInt(limit) : 50
        );
        
        logger.info(`[Energies API] History for user ${user.username}: ${history.length} transactions`);

        return {
          success: true,
          transactions: history,
        };
      } catch (error) {
        logger.error('[Energies API] Error getting history:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get history',
        };
      }
    },
    {
      query: t.Object({
        limit: t.Optional(t.String()),
      }),
      detail: {
        summary: 'Get transaction history',
        description: 'Returns energy points transaction history for authenticated user',
      },
    }
  )

  /**
   * POST /api/v1/energies/award
   * Начислить Энергии (только для admin — требует x-admin-secret)
   */
  .post(
    '/award',
    async ({ body, headers, set }) => {
      try {
        if (!checkAdminAuth(headers)) {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden: admin access required',
          };
        }

        const { userId, amount, reason, metadata } = body;

        const result = await energyPointsService.award(userId, amount, reason, metadata);

        return result;
      } catch (error) {
        logger.error('[Energies API] Error awarding points:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to award points',
        };
      }
    },
    {
      body: t.Object({
        userId: t.String(),
        amount: t.Number(),
        reason: t.String(),
        metadata: t.Optional(t.Record(t.String(), t.Any())),
      }),
    }
  )

  /**
   * POST /api/v1/energies/spend
   * Списать Энергии (только для admin — требует x-admin-secret)
   */
  .post(
    '/spend',
    async ({ body, headers, set }) => {
      try {
        if (!checkAdminAuth(headers)) {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden: admin access required',
          };
        }

        const { userId, amount, reason, metadata } = body;

        const result = await energyPointsService.spend(userId, amount, reason, metadata);

        return result;
      } catch (error) {
        logger.error('[Energies API] Error spending points:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to spend points',
        };
      }
    },
    {
      body: t.Object({
        userId: t.String(),
        amount: t.Number(),
        reason: t.String(),
        metadata: t.Optional(t.Record(t.String(), t.Any())),
      }),
    }
  )

  /**
   * POST /api/v1/energies/triggers/daily-login
   * Триггер: Ежедневный вход (+10 Энергии)
   * Только для admin — требует x-admin-secret
   */
  .post(
    '/triggers/daily-login',
    async ({ body, headers, set }) => {
      try {
        if (!checkAdminAuth(headers)) {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden: admin access required',
          };
        }

        const { userId } = body;
        const result = await energyPointsService.awardDailyLogin(userId);
        return result;
      } catch (error) {
        logger.error('[Energies API] Error in daily login trigger:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to process trigger',
        };
      }
    },
    {
      body: t.Object({
        userId: t.String(),
      }),
    }
  )

  /**
   * POST /api/v1/energies/triggers/lesson-view
   * Триггер: Просмотр урока (+50 Энергии)
   * Только для admin — требует x-admin-secret
   */
   .post(
    '/triggers/lesson-view',
    async ({ body, headers, set }) => {
      try {
        if (!checkAdminAuth(headers)) {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden: admin access required',
          };
        }

        const { userId, lessonId, lessonTitle } = body;
        const result = await energyPointsService.awardLessonView(userId, lessonId, lessonTitle);
        return result;
      } catch (error) {
        logger.error('[Energies API] Error in lesson view trigger:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to process trigger',
        };
      }
    },
    {
      body: t.Object({
        userId: t.String(),
        lessonId: t.String(),
        lessonTitle: t.Optional(t.String()),
      }),
    }
  )

  /**
   * POST /api/v1/energies/triggers/sunday-practice
   * Триггер: Воскресная практика (+50 Энергии)
   * Только для admin — требует x-admin-secret
   */
  .post(
    '/triggers/sunday-practice',
    async ({ body, headers, set }) => {
      try {
        if (!checkAdminAuth(headers)) {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden: admin access required',
          };
        }

        const { userId, practiceId } = body;
        const result = await energyPointsService.awardSundayPractice(userId, practiceId);
        return result;
      } catch (error) {
        logger.error('[Energies API] Error in sunday practice trigger:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to process trigger',
        };
      }
    },
    {
      body: t.Object({
        userId: t.String(),
        practiceId: t.String(),
      }),
    }
  );
