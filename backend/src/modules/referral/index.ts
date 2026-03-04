/**
 * 🤝 REFERRAL MODULE — API для реферальной программы
 * Эндпоинты для личного кабинета агента в webapp
 */

import { Elysia } from 'elysia';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { referralAgents, referralPayments } from '@/db/schema';
import { authMiddleware } from '@/middlewares/auth';
import { logger } from '@/utils/logger';

export const referralModule = new Elysia({ prefix: '/referral', tags: ['Referral'] })
  .use(authMiddleware)

  // GET /referral/my-agent — данные агента текущего пользователя
  .get('/my-agent', async ({ user, set }) => {
    if (!user) {
      set.status = 401;
      return { error: 'Unauthorized' };
    }

    try {
      const [agent] = await db
        .select()
        .from(referralAgents)
        .where(eq(referralAgents.userId, user.id))
        .limit(1);

      return { agent: agent || null };
    } catch (error) {
      logger.error({ error, userId: user.id }, 'Failed to get referral agent');
      set.status = 500;
      return { error: 'Internal server error' };
    }
  })

  // GET /referral/my-referrals — список рефералов агента
  .get('/my-referrals', async ({ user, set }) => {
    if (!user) {
      set.status = 401;
      return { error: 'Unauthorized' };
    }

    try {
      const [agent] = await db
        .select({ id: referralAgents.id })
        .from(referralAgents)
        .where(eq(referralAgents.userId, user.id))
        .limit(1);

      if (!agent) {
        return { referrals: [] };
      }

      const referrals = await db
        .select()
        .from(referralPayments)
        .where(eq(referralPayments.agentId, agent.id))
        .orderBy(referralPayments.createdAt);

      return { referrals };
    } catch (error) {
      logger.error({ error, userId: user.id }, 'Failed to get referrals');
      set.status = 500;
      return { error: 'Internal server error' };
    }
  });
