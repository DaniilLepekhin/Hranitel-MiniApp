import { Elysia, t } from 'elysia';
import { streamsService } from './service';
import { logger } from '@/utils/logger';

export const streamsRoutes = new Elysia({ prefix: '/api/streams' })
  /**
   * GET /api/streams/upcoming
   * Получить предстоящие эфиры
   */
  .get(
    '/upcoming',
    async ({ query }) => {
      try {
        const { limit } = query;

        const streams = await streamsService.getUpcomingStreams(
          limit ? parseInt(limit) : 10
        );

        return {
          success: true,
          streams,
        };
      } catch (error) {
        logger.error('[Streams API] Error getting upcoming streams:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get upcoming streams',
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
   * Получить ближайший эфир
   */
  .get('/next', async () => {
    try {
      const stream = await streamsService.getNextStream();

      return {
        success: true,
        stream,
      };
    } catch (error) {
      logger.error('[Streams API] Error getting next stream:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get next stream',
      };
    }
  })

  /**
   * GET /api/streams
   * Получить все эфиры
   */
  .get(
    '/',
    async ({ query }) => {
      try {
        const { status } = query;

        const streams = await streamsService.getAllStreams(
          status as 'scheduled' | 'live' | 'ended' | undefined
        );

        return {
          success: true,
          streams,
        };
      } catch (error) {
        logger.error('[Streams API] Error getting all streams:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get streams',
        };
      }
    },
    {
      query: t.Object({
        status: t.Optional(t.Union([t.Literal('scheduled'), t.Literal('live'), t.Literal('ended')])),
      }),
    }
  )

  /**
   * GET /api/streams/:id
   * Получить эфир по ID
   */
  .get(
    '/:id',
    async ({ params }) => {
      try {
        const stream = await streamsService.getStreamById(params.id);

        return {
          success: true,
          stream,
        };
      } catch (error) {
        logger.error('[Streams API] Error getting stream:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get stream',
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
   * Отметить посещение эфира
   */
  .post(
    '/:id/attend',
    async ({ params, body }) => {
      try {
        const { userId, watchedOnline } = body;

        const result = await streamsService.markAttendance(
          userId,
          params.id,
          watchedOnline
        );

        return result;
      } catch (error) {
        logger.error('[Streams API] Error marking attendance:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to mark attendance',
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
   * Получить участников эфира
   */
  .get(
    '/:id/attendees',
    async ({ params }) => {
      try {
        const attendees = await streamsService.getStreamAttendees(params.id);

        return {
          success: true,
          attendees,
        };
      } catch (error) {
        logger.error('[Streams API] Error getting attendees:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get attendees',
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
   * Получить статистику эфира
   */
  .get(
    '/:id/stats',
    async ({ params }) => {
      try {
        const stats = await streamsService.getStreamStats(params.id);

        return {
          success: true,
          stats,
        };
      } catch (error) {
        logger.error('[Streams API] Error getting stream stats:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get stream stats',
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
   * Получить историю посещений пользователя
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

        const attendance = await streamsService.getUserAttendance(userId);

        return {
          success: true,
          attendance,
        };
      } catch (error) {
        logger.error('[Streams API] Error getting user attendance:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get user attendance',
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
   * Получить статистику посещений пользователя
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

        const stats = await streamsService.getUserAttendanceStats(userId);

        return {
          success: true,
          stats,
        };
      } catch (error) {
        logger.error('[Streams API] Error getting attendance stats:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get attendance stats',
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
   * Создать новый эфир (admin only)
   */
  .post(
    '/',
    async ({ body }) => {
      try {
        const { title, scheduledAt, host, description, streamUrl, epReward } = body;

        const stream = await streamsService.createStream(
          title,
          new Date(scheduledAt),
          host,
          description,
          streamUrl,
          epReward
        );

        return {
          success: true,
          stream,
        };
      } catch (error) {
        logger.error('[Streams API] Error creating stream:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create stream',
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
   * Обновить статус эфира (admin only)
   */
  .patch(
    '/:id/status',
    async ({ params, body }) => {
      try {
        const { status } = body;

        const result = await streamsService.updateStreamStatus(params.id, status);

        return result;
      } catch (error) {
        logger.error('[Streams API] Error updating stream status:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update stream status',
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
