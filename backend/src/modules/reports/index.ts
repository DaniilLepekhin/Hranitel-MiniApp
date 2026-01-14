import { Elysia, t } from 'elysia';
import { reportsService } from './service';
import { logger } from '@/utils/logger';

export const reportsRoutes = new Elysia({ prefix: '/api/reports' })
  /**
   * POST /api/reports/submit
   * Сдать отчет недели
   */
  .post(
    '/submit',
    async ({ body }) => {
      try {
        const { userId, content } = body;

        const result = await reportsService.submitReport(userId, content);

        return result;
      } catch (error) {
        logger.error('[Reports API] Error submitting report:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to submit report',
        };
      }
    },
    {
      body: t.Object({
        userId: t.String(),
        content: t.String(),
      }),
    }
  )

  /**
   * GET /api/reports/my
   * Получить отчеты пользователя
   */
  .get(
    '/my',
    async ({ query }) => {
      try {
        const { userId, limit } = query;

        if (!userId) {
          return {
            success: false,
            error: 'User ID is required',
          };
        }

        const reports = await reportsService.getUserReports(
          userId,
          limit ? parseInt(limit) : 50
        );

        return {
          success: true,
          reports,
        };
      } catch (error) {
        logger.error('[Reports API] Error getting user reports:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get user reports',
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
   * GET /api/reports/:id
   * Получить отчет по ID
   */
  .get(
    '/:id',
    async ({ params }) => {
      try {
        const report = await reportsService.getReportById(params.id);

        return {
          success: true,
          report,
        };
      } catch (error) {
        logger.error('[Reports API] Error getting report:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get report',
        };
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    }
  )

  /**
   * GET /api/reports/deadline
   * Получить дедлайн текущей недели
   */
  .get('/deadline', () => {
    try {
      const deadline = reportsService.getWeekDeadline();
      const hoursRemaining = reportsService.getHoursUntilDeadline();
      const isDeadlinePassed = reportsService.isDeadlinePassed();

      return {
        success: true,
        deadline,
        hoursRemaining,
        isDeadlinePassed,
      };
    } catch (error) {
      logger.error('[Reports API] Error getting deadline:', error);
      return {
        success: false,
        error: 'Failed to get deadline',
      };
    }
  })

  /**
   * GET /api/reports/current
   * Получить отчет текущей недели пользователя
   */
  .get(
    '/current',
    async ({ query }) => {
      try {
        const { userId } = query;

        if (!userId) {
          return {
            success: false,
            error: 'User ID is required',
          };
        }

        const report = await reportsService.getCurrentWeekReport(userId);

        return {
          success: true,
          report,
        };
      } catch (error) {
        logger.error('[Reports API] Error getting current week report:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get current week report',
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
   * GET /api/reports/stats/my
   * Получить статистику отчетов пользователя
   */
  .get(
    '/stats/my',
    async ({ query }) => {
      try {
        const { userId } = query;

        if (!userId) {
          return {
            success: false,
            error: 'User ID is required',
          };
        }

        const stats = await reportsService.getUserReportStats(userId);

        return {
          success: true,
          stats,
        };
      } catch (error) {
        logger.error('[Reports API] Error getting user report stats:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get user report stats',
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
   * GET /api/reports/week/:weekNumber
   * Получить все отчеты за конкретную неделю (admin only)
   */
  .get(
    '/week/:weekNumber',
    async ({ params }) => {
      try {
        const weekNumber = parseInt(params.weekNumber);

        const reports = await reportsService.getReportsByWeek(weekNumber);

        return {
          success: true,
          reports,
        };
      } catch (error) {
        logger.error('[Reports API] Error getting reports by week:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get reports by week',
        };
      }
    },
    {
      params: t.Object({
        weekNumber: t.String(),
      }),
    }
  )

  /**
   * GET /api/reports/stats/global
   * Получить глобальную статистику по отчетам (admin only)
   */
  .get('/stats/global', async () => {
    try {
      const stats = await reportsService.getGlobalReportStats();

      return {
        success: true,
        stats,
      };
    } catch (error) {
      logger.error('[Reports API] Error getting global stats:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get global stats',
      };
    }
  })

  /**
   * DELETE /api/reports/:id
   * Удалить отчет (только если не прошло 24 часа)
   */
  .delete(
    '/:id',
    async ({ params, body }) => {
      try {
        const { userId } = body;

        const result = await reportsService.deleteReport(params.id, userId);

        return result;
      } catch (error) {
        logger.error('[Reports API] Error deleting report:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to delete report',
        };
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        userId: t.String(),
      }),
    }
  );
