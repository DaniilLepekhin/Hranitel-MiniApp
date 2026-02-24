import { Elysia, t } from 'elysia';
import { db } from '@/db';
import { geographySurveyResponses, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/utils/logger';
import { getUserFromToken } from '@/middlewares/auth';

export const geographySurveyRoutes = new Elysia({
  prefix: '/geography-survey',
  tags: ['Geography Survey'],
})

  /**
   * GET /api/v1/geography-survey/my
   * Возвращает текущий ответ пользователя (если есть)
   */
  .get('/my', async ({ headers, set }) => {
    const user = await getUserFromToken(headers.authorization);
    if (!user) {
      set.status = 401;
      return { success: false, error: 'Unauthorized' };
    }

    const [existing] = await db
      .select()
      .from(geographySurveyResponses)
      .where(eq(geographySurveyResponses.userId, user.id))
      .limit(1);

    return {
      success: true,
      response: existing ? { city: existing.city, updatedAt: existing.updatedAt } : null,
    };
  })

  /**
   * POST /api/v1/geography-survey/submit
   * Создаёт или обновляет ответ пользователя
   */
  .post(
    '/submit',
    async ({ headers, body, set }) => {
      const user = await getUserFromToken(headers.authorization);
      if (!user) {
        set.status = 401;
        return { success: false, error: 'Unauthorized' };
      }

      const city = body.city.trim();
      if (!city) {
        set.status = 400;
        return { success: false, error: 'City is required' };
      }

      // Upsert — создаём или обновляем
      const [existing] = await db
        .select()
        .from(geographySurveyResponses)
        .where(eq(geographySurveyResponses.userId, user.id))
        .limit(1);

      if (existing) {
        await db
          .update(geographySurveyResponses)
          .set({ city, updatedAt: new Date() })
          .where(eq(geographySurveyResponses.userId, user.id));
        logger.info({ userId: user.id, city }, 'Geography survey updated');
      } else {
        await db
          .insert(geographySurveyResponses)
          .values({ userId: user.id, city });
        logger.info({ userId: user.id, city }, 'Geography survey submitted');
      }

      return { success: true, city };
    },
    {
      body: t.Object({
        city: t.String({ minLength: 1 }),
      }),
    }
  );
