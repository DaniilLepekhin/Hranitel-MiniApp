import { Elysia, t } from 'elysia';
import { streamsService } from './service';
import { logger } from '@/utils/logger';

export const streamsRoutes = new Elysia({ prefix: '/api/streams' })
  /**
   * GET /api/streams/upcoming
   * Получить последние записи эфиров (замена "предстоящие")
   */
  .get(
    '/upcoming',
    async ({ query }) => {
      try {
        const { limit } = query;

        const streams = await streamsService.getRecentRecordings(
          limit ? parseInt(limit) : 10
        );

        return {
          success: true,
          streams,
        };
      } catch (error) {
        logger.error('[Streams API] Error getting recent recordings:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get recordings',
        };
      }
    },
    {
      query: t.Object({
        limit: t.Optional(t.String()),
      }),
    }
  )

  /**
   * GET /api/streams/next
   * Получить последнюю опубликованную запись
   */
  .get('/next', async () => {
    try {
      const recordings = await streamsService.getRecentRecordings(1);
      const stream = recordings.length > 0 ? recordings[0] : null;

      return {
        success: true,
        stream,
      };
    } catch (error) {
      logger.error('[Streams API] Error getting latest recording:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get latest recording',
      };
    }
  })

  /**
   * GET /api/streams
   * Получить все записи эфиров
   */
  .get(
    '/',
    async ({ query }) => {
      try {
        const { status, category } = query;

        const streams = await streamsService.getAllRecordings({
          category: category || undefined,
          isPublished: true,
        });

        return {
          success: true,
          streams,
        };
      } catch (error) {
        logger.error('[Streams API] Error getting all recordings:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get recordings',
        };
      }
    },
    {
      query: t.Object({
        status: t.Optional(t.Union([t.Literal('scheduled'), t.Literal('live'), t.Literal('ended')])),
        category: t.Optional(t.String()),
      }),
    }
  )

  /**
   * GET /api/streams/:id
   * Получить запись по ID
   */
  .get(
    '/:id',
    async ({ params }) => {
      try {
        const stream = await streamsService.getRecordingById(params.id);

        return {
          success: true,
          stream,
        };
      } catch (error) {
        logger.error('[Streams API] Error getting recording:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get recording',
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
   * POST /api/streams/:id/attend
   * Отметить просмотр записи (начисляет энергии)
   */
  .post(
    '/:id/attend',
    async ({ params, body }) => {
      try {
        const { userId } = body;

        const result = await streamsService.markWatched(
          userId,
          params.id
        );

        return result;
      } catch (error) {
        logger.error('[Streams API] Error marking watched:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to mark watched',
        };
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        userId: t.String(),
        watchedOnline: t.Optional(t.Boolean()),
      }),
    }
  )

  /**
   * GET /api/streams/:id/attendees
   * Получить зрителей записи
   */
  .get(
    '/:id/attendees',
    async ({ params }) => {
      try {
        const attendees = await streamsService.getRecordingViewers(params.id);

        return {
          success: true,
          attendees,
        };
      } catch (error) {
        logger.error('[Streams API] Error getting viewers:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get viewers',
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
   * GET /api/streams/:id/stats
   * Получить статистику записи
   */
  .get(
    '/:id/stats',
    async ({ params }) => {
      try {
        const stats = await streamsService.getRecordingStats(params.id);

        return {
          success: true,
          stats,
        };
      } catch (error) {
        logger.error('[Streams API] Error getting recording stats:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get recording stats',
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
   * GET /api/streams/attendance/my
   * Получить историю просмотров пользователя
   */
  .get(
    '/attendance/my',
    async ({ query }) => {
      try {
        const { userId } = query;

        if (!userId) {
          return {
            success: false,
            error: 'User ID is required',
          };
        }

        const attendance = await streamsService.getUserWatchHistory(userId);

        return {
          success: true,
          attendance,
        };
      } catch (error) {
        logger.error('[Streams API] Error getting user watch history:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get watch history',
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
   * GET /api/streams/attendance/stats
   * Получить статистику просмотров пользователя
   */
  .get(
    '/attendance/stats',
    async ({ query }) => {
      try {
        const { userId } = query;

        if (!userId) {
          return {
            success: false,
            error: 'User ID is required',
          };
        }

        const stats = await streamsService.getUserWatchStats(userId);

        return {
          success: true,
          stats,
        };
      } catch (error) {
        logger.error('[Streams API] Error getting watch stats:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get watch stats',
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
   * POST /api/streams
   * Создать новую запись эфира (admin only)
   */
  .post(
    '/',
    async ({ body }) => {
      try {
        const { title, scheduledAt, host, description, streamUrl, epReward } = body;

        const stream = await streamsService.createRecording({
          title,
          recordedAt: new Date(scheduledAt),
          host,
          description,
          videoUrl: streamUrl || '',
          energiesReward: epReward,
        });

        return {
          success: true,
          stream,
        };
      } catch (error) {
        logger.error('[Streams API] Error creating recording:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create recording',
        };
      }
    },
    {
      body: t.Object({
        title: t.String(),
        scheduledAt: t.String(),
        host: t.String(),
        description: t.Optional(t.String()),
        streamUrl: t.Optional(t.String()),
        epReward: t.Optional(t.Number()),
      }),
    }
  )

  /**
   * PATCH /api/streams/:id/status
   * Обновить запись эфира (admin only)
   */
  .patch(
    '/:id/status',
    async ({ params, body }) => {
      try {
        const { status } = body;

        const result = await streamsService.updateRecording(params.id, {
          isPublished: status === 'ended',
        });

        return result;
      } catch (error) {
        logger.error('[Streams API] Error updating recording:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update recording',
        };
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        status: t.Union([t.Literal('scheduled'), t.Literal('live'), t.Literal('ended')]),
      }),
    }
  );
