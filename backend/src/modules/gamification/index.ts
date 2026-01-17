import { Elysia, t } from 'elysia';
import { authMiddleware } from '@/middlewares/auth';
import { gamificationService } from './service';

export const gamificationModule = new Elysia({ prefix: '/gamification', tags: ['Gamification'] })
  .use(authMiddleware)
  // Get user gamification stats
  .get(
    '/stats',
    async ({ user, set }) => {
      if (!user) {
        set.status = 401;
        return { success: false, error: 'Unauthorized' };
      }

      const stats = await gamificationService.getUserStats(user.id);

      if (!stats) {
        return {
          success: false,
          error: 'Stats not found',
        };
      }

      return {
        success: true,
        stats,
      };
    },
    {
      detail: {
        summary: 'Get gamification stats',
        description: 'Returns user level, XP, streak and progress',
      },
    }
  )
  // Get XP history
  .get(
    '/xp-history',
    async ({ user, query, set }) => {
      if (!user) {
        set.status = 401;
        return { success: false, error: 'Unauthorized' };
      }

      const { days = 7 } = query;

      const history = await gamificationService.getXPHistory(user.id, 100);

      // Filter by days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const filteredHistory = history.filter(
        (h) => new Date(h.createdAt) >= cutoffDate
      );

      // Group by day
      const byDay: Record<string, number> = {};

      filteredHistory.forEach((h) => {
        const day = new Date(h.createdAt).toISOString().split('T')[0];
        byDay[day] = (byDay[day] || 0) + h.amount;
      });

      return {
        success: true,
        history: filteredHistory,
        byDay,
        total: filteredHistory.reduce((sum, h) => sum + h.amount, 0),
      };
    },
    {
      query: t.Object({
        days: t.Optional(t.Number()),
      }),
      detail: {
        summary: 'Get XP history',
      },
    }
  )
  // Get achievements
  .get(
    '/achievements',
    async ({ user, set }) => {
      if (!user) {
        set.status = 401;
        return { success: false, error: 'Unauthorized' };
      }

      const achievements = await gamificationService.getUserAchievements(user.id);

      return {
        success: true,
        achievements,
      };
    },
    {
      detail: {
        summary: 'Get user achievements',
      },
    }
  )
  // Manual XP add (for testing)
  .post(
    '/add-xp',
    async ({ user, body, set }) => {
      if (!user) {
        set.status = 401;
        return { success: false, error: 'Unauthorized' };
      }

      const { amount, reason } = body;

      const result = await gamificationService.addXP(user.id, amount, reason);

      return {
        success: true,
        ...result,
      };
    },
    {
      body: t.Object({
        amount: t.Number({ minimum: 1, maximum: 1000 }),
        reason: t.String(),
      }),
      detail: {
        summary: 'Add XP (testing)',
        description: 'Manually add XP to user (for testing purposes)',
      },
    }
  )
  // Get leaderboard
  .get(
    '/leaderboard',
    async ({ query }) => {
      const { limit = 10 } = query;

      // Import here to avoid circular dependency
      const { db, users } = await import('@/db');
      const { desc, eq } = await import('drizzle-orm');

      // Only show users with active subscription (isPro = true)
      const leaderboard = await db
        .select({
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          photoUrl: users.photoUrl,
          level: users.level,
          experience: users.experience,
          streak: users.streak,
        })
        .from(users)
        .where(eq(users.isPro, true))
        .orderBy(desc(users.experience))
        .limit(limit);

      return {
        success: true,
        leaderboard: leaderboard.map((user, index) => ({
          rank: index + 1,
          ...user,
        })),
      };
    },
    {
      query: t.Object({
        limit: t.Optional(t.Number()),
      }),
      detail: {
        summary: 'Get leaderboard',
      },
    }
  );
