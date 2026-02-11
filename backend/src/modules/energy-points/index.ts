import { Elysia, t } from 'elysia';
import { energiesService as energyPointsService } from './service';
import { logger } from '@/utils/logger';
import { authMiddleware } from '@/middlewares/auth';

export const energyPointsRoutes = new Elysia({ prefix: '/api/v1/energies', tags: ['Energy Points'] })
  // Protected routes - require authentication
  .use(authMiddleware)
  
  /**
   * GET /api/v1/energies/balance
   * Получить баланс Энергии текущего пользователя
   */
  .get(
    '/balance',
    async ({ user }) => {
      try {
        const balance = await energyPointsService.getBalance(user!.id);

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
   */
  .get(
    '/history',
    async ({ user, query }) => {
      try {
        const { limit } = query;

        const history = await energyPointsService.getHistory(
          user!.id,
          limit ? parseInt(limit) : 50
        );

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
   * POST /api/energies/award
   * Начислить Энергии (только для внутреннего использования)
   */
  .post(
    '/award',
    async ({ body }) => {
      try {
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
   * POST /api/energies/spend
   * Списать Энергии (только для внутреннего использования)
   */
  .post(
    '/spend',
    async ({ body }) => {
      try {
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
   * POST /api/energies/triggers/daily-login
   * Триггер: Ежедневный вход (+10 Энергии)
   */
  .post(
    '/triggers/daily-login',
    async ({ body }) => {
      try {
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
   * POST /api/energies/triggers/lesson-view
   * Триггер: Просмотр урока (+50 Энергии)
   */
  .post(
    '/triggers/lesson-view',
    async ({ body }) => {
      try {
        const { userId, lessonId } = body;
        const result = await energyPointsService.awardLessonView(userId, lessonId);
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
      }),
    }
  )

  /**
   * POST /api/energies/triggers/sunday-practice
   * Триггер: Воскресная практика (+50 Энергии)
   */
  .post(
    '/triggers/sunday-practice',
    async ({ body }) => {
      try {
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
