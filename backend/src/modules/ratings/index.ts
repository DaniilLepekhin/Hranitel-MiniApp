import { Elysia, t } from 'elysia';
import { ratingsService } from './service';
import { logger } from '@/utils/logger';
import { energiesApi } from '@/modules/energy-points';
import { db } from '@/db';
import { users, energyTransactions } from '@/db/schema';
import { eq, desc, isNotNull } from 'drizzle-orm';

export const ratingsRoutes = new Elysia({ prefix: '/ratings' })
  /**
   * ⚡ OPTIMIZED: GET /api/v1/ratings/all-data
   * Batch endpoint - все данные рейтингов в одном запросе
   * Заменяет 8 отдельных запросов → 1 запрос
   */
  .get(
    '/all-data',
    async ({ query }) => {
      try {
        const userId = query.userId;
        
        if (!userId) {
          return {
            success: false,
            error: 'userId is required',
          };
        }

        logger.info({ userId }, '[Ratings API] Fetching all ratings data (optimized batch)');

        // Параллельное выполнение всех запросов
        const [
          balance,
          history,
          personalRating,
          cityRatings,
          teamRatings,
          userPosition,
        ] = await Promise.all([
          // 1. Balance (энергия пользователя)
          db
            .select({ energies: users.energies })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1)
            .then((r) => r[0]?.energies || 0),

          // 2. History (последние 20 транзакций)
          db
            .select()
            .from(energyTransactions)
            .where(eq(energyTransactions.userId, userId))
            .orderBy(desc(energyTransactions.createdAt))
            .limit(20),

          // 3. Personal Rating (leaderboard)
          ratingsService.getPersonalRating(userId),

          // 4. City Ratings
          ratingsService.getCityRatings(50),

          // 5. Team Ratings
          ratingsService.getTeamRatings(50),

          // 6. User Position
          ratingsService.getUserPosition(userId),
        ]);

        logger.info(
          { userId, hasHistory: history.length > 0 },
          '[Ratings API] Successfully fetched all data'
        );

        return {
          success: true,
          data: {
            balance,
            history,
            leaderboard: personalRating,
            cityRatings,
            teamRatings,
            userPosition,
          },
        };
      } catch (error) {
        logger.error({ error }, '[Ratings API] Error in batch all-data endpoint');
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch ratings data',
        };
      }
    },
    {
      query: t.Object({
        userId: t.String(),
      }),
      detail: {
        tags: ['Ratings'],
        summary: '⚡ Get all ratings data (OPTIMIZED)',
        description:
          'Batch endpoint that returns balance, history, leaderboard, city ratings, team ratings, and user position in a single request. Replaces 8 separate API calls.',
      },
    }
  )

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
