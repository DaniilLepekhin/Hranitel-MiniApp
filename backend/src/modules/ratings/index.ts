import { Elysia, t } from 'elysia';
import { ratingsService } from './service';
import { logger } from '@/utils/logger';

export const ratingsRoutes = new Elysia({ prefix: '/ratings' })
  /**
   * GET /api/v1/ratings/cities
   * Получить рейтинг городов по энергиям
   */
  .get(
    '/cities',
    async ({ query }) => {
      try {
        const { limit } = query;
        const ratings = await ratingsService.getCityRatings(limit);

        return {
          success: true,
          ratings,
        };
      } catch (error) {
        logger.error('[Ratings API] Error getting city ratings:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get city ratings',
        };
      }
    },
    {
      query: t.Object({
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 50 })),
      }),
    }
  )

  /**
   * GET /api/v1/ratings/teams
   * Получить рейтинг команд (десяток) по энергиям
   */
  .get(
    '/teams',
    async ({ query }) => {
      try {
        const { limit } = query;
        const ratings = await ratingsService.getTeamRatings(limit);

        return {
          success: true,
          ratings,
        };
      } catch (error) {
        logger.error('[Ratings API] Error getting team ratings:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get team ratings',
        };
      }
    },
    {
      query: t.Object({
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 50 })),
      }),
    }
  )

  /**
   * GET /api/v1/ratings/user-position
   * Получить позицию пользователя в рейтингах
   */
  .get(
    '/user-position',
    async ({ query }) => {
      try {
        const { userId } = query;

        if (!userId) {
          return {
            success: false,
            error: 'User ID is required',
          };
        }

        const position = await ratingsService.getUserPosition(userId);

        return {
          success: true,
          position,
        };
      } catch (error) {
        logger.error('[Ratings API] Error getting user position:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get user position',
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
   * GET /api/v1/ratings/personal
   * Получить личный рейтинг пользователя + топ-100
   */
  .get(
    '/personal',
    async ({ query }) => {
      try {
        const { userId } = query;

        if (!userId) {
          return {
            success: false,
            error: 'User ID is required',
          };
        }

        const rating = await ratingsService.getPersonalRating(userId);

        return {
          success: true,
          ...rating,
        };
      } catch (error) {
        logger.error('[Ratings API] Error getting personal rating:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get personal rating',
        };
      }
    },
    {
      query: t.Object({
        userId: t.String(),
      }),
    }
  );
