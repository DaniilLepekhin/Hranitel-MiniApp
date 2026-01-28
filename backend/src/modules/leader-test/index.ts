/**
 * Leader Test Module
 * Сохранение и получение результатов теста на Лидера десятки
 */

import { Elysia, t } from 'elysia';
import { db } from '@/db';
import { leaderTestResults, users } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { logger } from '@/utils/logger';
import { authMiddleware } from '@/middlewares/auth';

export const leaderTestModule = new Elysia({ prefix: '/leader-test', tags: ['Leader Test'] })
  .use(authMiddleware)

  /**
   * Сохранить результат теста
   */
  .post(
    '/submit',
    async ({ body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { success: false, error: 'Unauthorized' };
      }

      const { passed, score, totalQuestions, stopReason, answers } = body;

      try {
        // Получаем город пользователя
        const [userData] = await db
          .select({ city: users.city })
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1);

        // Сохраняем результат
        const [result] = await db
          .insert(leaderTestResults)
          .values({
            userId: user.id,
            telegramId: user.telegramId,
            passed,
            score,
            totalQuestions,
            stopReason: stopReason || null,
            answers,
            city: userData?.city || null,
          })
          .returning();

        logger.info({
          userId: user.id,
          telegramId: user.telegramId,
          passed,
          score,
          totalQuestions,
          city: userData?.city,
        }, 'Leader test result saved');

        return {
          success: true,
          result: {
            id: result.id,
            passed: result.passed,
            score: result.score,
            totalQuestions: result.totalQuestions,
            createdAt: result.createdAt,
          },
        };
      } catch (error) {
        logger.error({ error, userId: user.id }, 'Failed to save leader test result');
        set.status = 500;
        return { success: false, error: 'Failed to save test result' };
      }
    },
    {
      body: t.Object({
        passed: t.Boolean({ description: 'Пройден ли тест' }),
        score: t.Number({ description: 'Количество правильных ответов' }),
        totalQuestions: t.Number({ description: 'Всего вопросов' }),
        stopReason: t.Optional(t.String({ description: 'Причина провала (стоп-ответ)' })),
        answers: t.Array(
          t.Object({
            questionId: t.Number(),
            selectedOptions: t.Array(t.String()),
          }),
          { description: 'Массив ответов пользователя' }
        ),
      }),
      detail: {
        summary: 'Сохранить результат теста на Лидера',
        description: 'Сохраняет результаты прохождения теста с ответами пользователя',
      },
    }
  )

  /**
   * Получить историю тестов пользователя
   */
  .get(
    '/history',
    async ({ user, set }) => {
      if (!user) {
        set.status = 401;
        return { success: false, error: 'Unauthorized' };
      }

      try {
        const results = await db
          .select({
            id: leaderTestResults.id,
            passed: leaderTestResults.passed,
            score: leaderTestResults.score,
            totalQuestions: leaderTestResults.totalQuestions,
            stopReason: leaderTestResults.stopReason,
            city: leaderTestResults.city,
            createdAt: leaderTestResults.createdAt,
          })
          .from(leaderTestResults)
          .where(eq(leaderTestResults.userId, user.id))
          .orderBy(desc(leaderTestResults.createdAt))
          .limit(10);

        return {
          success: true,
          results,
          hasPassedTest: results.some(r => r.passed),
        };
      } catch (error) {
        logger.error({ error, userId: user.id }, 'Failed to get leader test history');
        set.status = 500;
        return { success: false, error: 'Failed to get test history' };
      }
    },
    {
      detail: {
        summary: 'Получить историю тестов',
        description: 'Возвращает последние 10 результатов тестов пользователя',
      },
    }
  );
