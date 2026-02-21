import { Elysia, t } from 'elysia';
import { energiesService as energyPointsService } from './service';
import { logger } from '@/utils/logger';
import { authMiddleware, getUserFromToken } from '@/middlewares/auth';
import { db } from '@/db';
import { energyTransactions } from '@/db/schema';
import { eq, and, gte } from 'drizzle-orm';

// Хелпер для проверки admin-секрета (как в admin/index.ts)
const checkAdminAuth = (headers: Record<string, string | undefined>) => {
  const adminSecret = headers['x-admin-secret'];
  return adminSecret === process.env.ADMIN_SECRET || adminSecret === 'local-dev-secret';
};

export const energyPointsRoutes = new Elysia({ prefix: '/api/v1/energies', tags: ['Energy Points'] })
  // Protected routes - require authentication
  .use(authMiddleware)
  
  /**
   * GET /api/v1/energies/balance
   * Получить баланс Энергии текущего пользователя
   * Доступно авторизованному пользователю (свой баланс)
   */
  .get(
    '/balance',
    async ({ user }) => {
      try {
        if (!user) {
          return {
            success: false,
            error: 'User not authenticated',
          };
        }

        const balance = await energyPointsService.getBalance(user.id);
        
        logger.info(`[Energies API] Balance for user ${user.username}: ${balance}`);

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
   * Доступно авторизованному пользователю (своя история)
   */
  .get(
    '/history',
    async ({ user, query }) => {
      try {
        if (!user) {
          return {
            success: false,
            error: 'User not authenticated',
          };
        }
        
        const { limit } = query;

        const history = await energyPointsService.getHistory(
          user.id,
          limit ? parseInt(limit) : 50
        );
        
        logger.info(`[Energies API] History for user ${user.username}: ${history.length} transactions`);

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
   * POST /api/v1/energies/award
   * Начислить Энергии (только для admin — требует x-admin-secret)
   */
  .post(
    '/award',
    async ({ body, headers, set }) => {
      try {
        if (!checkAdminAuth(headers)) {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden: admin access required',
          };
        }

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
   * POST /api/v1/energies/spend
   * Списать Энергии (только для admin — требует x-admin-secret)
   */
  .post(
    '/spend',
    async ({ body, headers, set }) => {
      try {
        if (!checkAdminAuth(headers)) {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden: admin access required',
          };
        }

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
   * POST /api/v1/energies/triggers/daily-login
   * Триггер: Ежедневный вход (+10 Энергии)
   * Только для admin — требует x-admin-secret
   */
  .post(
    '/triggers/daily-login',
    async ({ body, headers, set }) => {
      try {
        if (!checkAdminAuth(headers)) {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden: admin access required',
          };
        }

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
   * POST /api/v1/energies/triggers/lesson-view
   * Триггер: Просмотр урока (+50 Энергии)
   * Только для admin — требует x-admin-secret
   */
   .post(
    '/triggers/lesson-view',
    async ({ body, headers, set }) => {
      try {
        if (!checkAdminAuth(headers)) {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden: admin access required',
          };
        }

        const { userId, lessonId, lessonTitle } = body;
        const result = await energyPointsService.awardLessonView(userId, lessonId, lessonTitle);
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
        lessonTitle: t.Optional(t.String()),
      }),
    }
  )

  /**
   * POST /api/v1/energies/triggers/sunday-practice
   * Триггер: Воскресная практика (+50 Энергии)
   * Только для admin — требует x-admin-secret
   */
  .post(
    '/triggers/sunday-practice',
    async ({ body, headers, set }) => {
      try {
        if (!checkAdminAuth(headers)) {
          set.status = 403;
          return {
            success: false,
            error: 'Forbidden: admin access required',
          };
        }

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
  )

  /**
   * GET /api/v1/energies/weekly-progress
   * Получить недельный прогресс по хэштегам для текущего пользователя
   * Возвращает сколько раз каждый хэштег использован на этой неделе (Пн-Вс МСК)
   */
  .get(
    '/weekly-progress',
    async ({ user }) => {
      try {
        if (!user) {
          return { success: false, error: 'User not authenticated' };
        }

        // Понедельник 00:00 МСК текущей недели
        const now = new Date();
        const moscowNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
        let daysSinceMonday = moscowNow.getUTCDay() - 1;
        if (daysSinceMonday < 0) daysSinceMonday = 6;
        moscowNow.setUTCHours(0, 0, 0, 0);
        moscowNow.setUTCDate(moscowNow.getUTCDate() - daysSinceMonday);
        const weekStart = new Date(moscowNow.getTime() - 3 * 60 * 60 * 1000);

        // Сегодня 00:00 МСК
        const todayNow = new Date();
        const todayMoscow = new Date(todayNow.getTime() + 3 * 60 * 60 * 1000);
        todayMoscow.setUTCHours(0, 0, 0, 0);
        const todayMidnight = new Date(todayMoscow.getTime() - 3 * 60 * 60 * 1000);

        // Получаем все транзакции за эту неделю
        const weekTransactions = await db
          .select({
            reason: energyTransactions.reason,
            createdAt: energyTransactions.createdAt,
          })
          .from(energyTransactions)
          .where(
            and(
              eq(energyTransactions.userId, user.id),
              eq(energyTransactions.type, 'income'),
              gte(energyTransactions.createdAt, weekStart)
            )
          );

        // Подсчитываем по reason (совпадает с description в hashtag-parser)
        const reasonCounts: Record<string, number> = {};
        const todayReasonCounts: Record<string, number> = {};
        for (const tx of weekTransactions) {
          reasonCounts[tx.reason] = (reasonCounts[tx.reason] || 0) + 1;
          if (tx.createdAt && tx.createdAt >= todayMidnight) {
            todayReasonCounts[tx.reason] = (todayReasonCounts[tx.reason] || 0) + 1;
          }
        }

        // Формируем прогресс по каждому типу хэштега
        // reason-ы из hashtag-parser.service.ts:
        // "Ежедневный отчет" — daily, десятка
        // "Субботняя практика" — weekly, город, Сб/Вс
        // "Инсайт / Отзыв" — weekly_max 3, город
        // "Участие в Созвоне" — weekly_max 3, город
        // "Отметка в Stories" — weekly_max 3, город
        // "Созвон + Stories" — weekly_max 3, город (комбо)

        const progress = {
          otchet: {
            hashtags: ['#отчет', '#дз'],
            used: todayReasonCounts['Ежедневный отчет'] || 0,
            max: 1,
            period: 'daily' as const,
            reward: 50,
            chat: 'decade' as const,
            description: 'Ежедневный отчет',
          },
          praktika: {
            hashtags: ['#практика'],
            used: reasonCounts['Субботняя практика'] || 0,
            max: 1,
            period: 'weekly' as const,
            reward: 50,
            chat: 'city' as const,
            requiresMedia: true,
            weekendOnly: true,
            description: 'Субботняя практика',
          },
          insight: {
            hashtags: ['#инсайт'],
            used: reasonCounts['Инсайт / Отзыв'] || 0,
            max: 3,
            period: 'weekly' as const,
            reward: 40,
            chat: 'city' as const,
            description: 'Инсайт / Отзыв',
          },
          sozvon: {
            hashtags: ['#созвон'],
            used: reasonCounts['Участие в Созвоне'] || 0,
            max: 3,
            period: 'weekly' as const,
            reward: 100,
            chat: 'city' as const,
            requiresMedia: true,
            description: 'Участие в Созвоне',
          },
          storis: {
            hashtags: ['#сторис'],
            used: reasonCounts['Отметка в Stories'] || 0,
            max: 3,
            period: 'weekly' as const,
            reward: 200,
            chat: 'city' as const,
            requiresMedia: true,
            description: 'Отметка в Stories',
          },
          combo: {
            hashtags: ['#созвон + #сторис'],
            used: reasonCounts['Созвон + Stories'] || 0,
            max: 3,
            period: 'weekly' as const,
            reward: 300,
            chat: 'city' as const,
            requiresMedia: true,
            description: 'Созвон + Stories (комбо)',
          },
        };

        // Проверяем, является ли пользователь лидером (x2 множитель)
        const isLeader = await energyPointsService.isDecadeLeader(user.id);

        return {
          success: true,
          progress,
          isLeader,
          weekStartMsk: weekStart.toISOString(),
        };
      } catch (error) {
        logger.error('[Energies API] Error getting weekly progress:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get weekly progress',
        };
      }
    },
    {
      detail: {
        summary: 'Get weekly hashtag progress',
        description: 'Returns how many times each hashtag was used this week (Mon-Sun MSK)',
      },
    }
  );
