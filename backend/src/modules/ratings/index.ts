import { Elysia, t } from 'elysia';
import { ratingsService } from './service';
import { logger } from '@/utils/logger';

export const ratingsRoutes = new Elysia({ prefix: '/ratings' })
  /**
   * GET /api/v1/ratings/cities
   */
  .get(
    '/cities',
    async ({ request }) => {
      try {
        const url = new URL(request.url);
        const limit = Number(url.searchParams.get('limit')) || 50;
        const ratings = await ratingsService.getCityRatings(Math.min(limit, 100));

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
    }
  )

  /**
   * GET /api/v1/ratings/teams
   */
  .get(
    '/teams',
    async ({ request }) => {
      try {
        const url = new URL(request.url);
        const limit = Number(url.searchParams.get('limit')) || 50;
        const ratings = await ratingsService.getTeamRatings(Math.min(limit, 100));

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
    }
  )

  /**
   * GET /api/v1/ratings/user-position
   */
  .get(
    '/user-position',
    async ({ request }) => {
      try {
        const url = new URL(request.url);
        const userId = url.searchParams.get('userId') || '';

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
    }
  )

  /**
   * GET /api/v1/ratings/personal
   */
  .get(
    '/personal',
    async ({ request }) => {
      try {
        const url = new URL(request.url);
        const userId = url.searchParams.get('userId') || '';

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
    }
  );
