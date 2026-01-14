import { Elysia, t } from 'elysia';
import { energyPointsService } from './service';
import { logger } from '@/utils/logger';

export const energyPointsRoutes = new Elysia({ prefix: '/api/energies' })
  /**
   * GET /api/energies/balance
   * Получить баланс Энергий
   */
  .get(
    '/balance',
    async ({ query }) => {
      try {
        const { userId } = query;

        if (!userId) {
          return {
            success: false,
            error: 'User ID is required',
          };
        }

        const balance = await energyPointsService.getBalance(userId);

        return {
          success: true,
          balance,
        };
      } catch (error) {
        logger.error('[EP API] Error getting balance:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get balance',
        };
      }
    },
    {
      query: t.Object({
        userId: t.String(),
      }),
    }
  )

  /**
   * GET /api/ep/history
   * Получить историю транзакций
   */
  .get(
    '/history',
    async ({ query }) => {
      try {
        const { userId, limit } = query;

        if (!userId) {
          return {
            success: false,
            error: 'User ID is required',
          };
        }

        const history = await energyPointsService.getHistory(
          userId,
          limit ? parseInt(limit) : 50
        );

        return {
          success: true,
          transactions: history,
        };
      } catch (error) {
        logger.error('[EP API] Error getting history:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get history',
        };
      }
    },
    {
      query: t.Object({
        userId: t.String(),
        limit: t.Optional(t.String()),
      }),
    }
  )

  /**
   * POST /api/ep/award
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
        logger.error('[EP API] Error awarding points:', error);
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
   * POST /api/ep/spend
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
        logger.error('[EP API] Error spending points:', error);
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
   * POST /api/ep/triggers/daily-login
   * Триггер: Ежедневный вход (+10 Энергий)
   */
  .post(
    '/triggers/daily-login',
    async ({ body }) => {
      try {
        const { userId } = body;
        const result = await energyPointsService.awardDailyLogin(userId);
        return result;
      } catch (error) {
        logger.error('[EP API] Error in daily login trigger:', error);
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
   * POST /api/ep/triggers/lesson-view
   * Триггер: Просмотр урока (+50 Энергий)
   */
  .post(
    '/triggers/lesson-view',
    async ({ body }) => {
      try {
        const { userId, lessonId } = body;
        const result = await energyPointsService.awardLessonView(userId, lessonId);
        return result;
      } catch (error) {
        logger.error('[EP API] Error in lesson view trigger:', error);
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
   * POST /api/ep/triggers/sunday-practice
   * Триггер: Воскресная практика (+50 Энергий)
   */
  .post(
    '/triggers/sunday-practice',
    async ({ body }) => {
      try {
        const { userId, practiceId } = body;
        const result = await energyPointsService.awardSundayPractice(userId, practiceId);
        return result;
      } catch (error) {
        logger.error('[EP API] Error in sunday practice trigger:', error);
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
