import { Elysia, t } from 'elysia';
import { eq, desc, asc, and } from 'drizzle-orm';
import { db, meditations, meditationHistory } from '@/db';
import { authMiddleware, optionalAuthMiddleware } from '@/middlewares/auth';
import { logger } from '@/utils/logger';
import { cache } from '@/utils/redis';
import { gamificationService } from '@/modules/gamification/service';

const MEDITATIONS_CACHE_TTL = 300; // 5 minutes

export const meditationsModule = new Elysia({ prefix: '/meditations', tags: ['Meditations'] })
  // Get all meditations (public)
  .use(optionalAuthMiddleware)
  .get(
    '/',
    async ({ user, query }) => {
      const { category } = query;

      // Try cache first
      const cacheKey = `meditations:list:${category || 'all'}`;
      const cached = await cache.get<typeof meditations.$inferSelect[]>(cacheKey);

      let meditationsList: typeof meditations.$inferSelect[];

      if (cached) {
        meditationsList = cached;
      } else {
        const conditions = [];

        if (category && category !== 'all') {
          conditions.push(eq(meditations.category, category));
        }

        meditationsList = await db
          .select()
          .from(meditations)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(asc(meditations.sortOrder), desc(meditations.createdAt));

        await cache.set(cacheKey, meditationsList, MEDITATIONS_CACHE_TTL);
      }

      // Map meditations with access info
      const meditationsWithAccess = meditationsList.map((meditation) => ({
        ...meditation,
        // Hide premium content for non-pro users
        audioUrl: meditation.isPremium && !user?.isPro ? null : meditation.audioUrl,
        audioSeries: meditation.isPremium && !user?.isPro ? [] : meditation.audioSeries,
        isLocked: meditation.isPremium && !user?.isPro,
      }));

      return {
        success: true,
        meditations: meditationsWithAccess,
      };
    },
    {
      query: t.Object({
        category: t.Optional(t.String()),
      }),
      detail: {
        summary: 'Get all meditations',
      },
    }
  )
  // Get single meditation
  .get(
    '/:id',
    async ({ params, user }) => {
      const { id } = params;

      const [meditation] = await db
        .select()
        .from(meditations)
        .where(eq(meditations.id, id))
        .limit(1);

      if (!meditation) {
        return {
          success: false,
          error: 'Meditation not found',
        };
      }

      // Check access
      if (meditation.isPremium && !user?.isPro) {
        return {
          success: true,
          meditation: {
            ...meditation,
            audioUrl: null,
            audioSeries: [],
            isLocked: true,
          },
        };
      }

      return {
        success: true,
        meditation: {
          ...meditation,
          isLocked: false,
        },
      };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        summary: 'Get meditation details',
      },
    }
  )
  // Protected routes
  .use(authMiddleware)
  // Log meditation session
  .post(
    '/:id/session',
    async ({ params, body, user }) => {
      const { id } = params;
      const { durationListened, completed } = body;

      // Check if meditation exists
      const [meditation] = await db
        .select()
        .from(meditations)
        .where(eq(meditations.id, id))
        .limit(1);

      if (!meditation) {
        return {
          success: false,
          error: 'Meditation not found',
        };
      }

      // Log the session
      await db.insert(meditationHistory).values({
        userId: user!.id,
        meditationId: id,
        durationListened,
        completed: completed || false,
      });

      // Award XP for meditation
      let xpAwarded = 0;

      if (completed) {
        // Full meditation completed
        xpAwarded = 50;
        await gamificationService.addXP(user!.id, 50, 'meditation_completed', {
          meditationId: id,
          meditationTitle: meditation.title,
        });

        // Update streak
        await gamificationService.updateStreak(user!.id);
      } else if (durationListened >= 60) {
        // Partial meditation (at least 1 minute)
        xpAwarded = Math.min(25, Math.floor(durationListened / 60) * 5);
        await gamificationService.addXP(user!.id, xpAwarded, 'meditation_partial', {
          meditationId: id,
          durationListened,
        });
      }

      return {
        success: true,
        message: 'Session logged',
        xpAwarded,
      };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        durationListened: t.Number(),
        completed: t.Optional(t.Boolean()),
      }),
      detail: {
        summary: 'Log meditation session',
      },
    }
  )
  // Get user meditation history
  .get(
    '/history/list',
    async ({ user, query }) => {
      const { limit = 20, offset = 0 } = query;

      const history = await db
        .select({
          id: meditationHistory.id,
          durationListened: meditationHistory.durationListened,
          completed: meditationHistory.completed,
          createdAt: meditationHistory.createdAt,
          meditation: {
            id: meditations.id,
            title: meditations.title,
            duration: meditations.duration,
            coverUrl: meditations.coverUrl,
          },
        })
        .from(meditationHistory)
        .innerJoin(meditations, eq(meditationHistory.meditationId, meditations.id))
        .where(eq(meditationHistory.userId, user!.id))
        .orderBy(desc(meditationHistory.createdAt))
        .limit(limit)
        .offset(offset);

      return {
        success: true,
        history,
      };
    },
    {
      query: t.Object({
        limit: t.Optional(t.Number()),
        offset: t.Optional(t.Number()),
      }),
      detail: {
        summary: 'Get meditation history',
      },
    }
  )
  // Get meditation stats
  .get(
    '/stats/summary',
    async ({ user }) => {
      const history = await db
        .select({
          durationListened: meditationHistory.durationListened,
          completed: meditationHistory.completed,
        })
        .from(meditationHistory)
        .where(eq(meditationHistory.userId, user!.id));

      const totalSessions = history.length;
      const completedSessions = history.filter((h) => h.completed).length;
      const totalDuration = history.reduce((sum, h) => sum + h.durationListened, 0);

      return {
        success: true,
        stats: {
          totalSessions,
          completedSessions,
          totalDurationMinutes: Math.floor(totalDuration / 60),
          averageDurationMinutes: totalSessions > 0 ? Math.floor(totalDuration / totalSessions / 60) : 0,
        },
      };
    },
    {
      detail: {
        summary: 'Get meditation stats',
      },
    }
  );
