/**
 * Leader Test Module
 * Сохранение и получение результатов теста на Лидера десятки
 */

import { Elysia, t } from 'elysia';
import { db } from '@/db';
import { leaderTestResults, leaderTestStarts, leaderTestClosedCities, leaderTestCityQuotas, users } from '@/db/schema';
import { eq, desc, count, sql, and } from 'drizzle-orm';
import { logger } from '@/utils/logger';
import { authMiddleware, validateTelegramInitData, parseTelegramUser } from '@/middlewares/auth';

// Функция для проверки квоты города
async function checkCityQuota(city: string | null): Promise<{ available: boolean; current: number; max: number | null; reason?: string }> {
  if (!city) {
    return { available: true, current: 0, max: null };
  }

  // Получаем квоту для города
  const [quota] = await db
    .select()
    .from(leaderTestCityQuotas)
    .where(eq(leaderTestCityQuotas.city, city))
    .limit(1);

  if (!quota) {
    // Нет квоты для города - разрешаем (можно изменить на запрет)
    return { available: true, current: 0, max: null };
  }

  // Считаем сколько уже успешно прошли тест в этом городе
  const [passedCount] = await db
    .select({ count: sql<number>`count(distinct ${leaderTestResults.userId})` })
    .from(leaderTestResults)
    .where(and(
      eq(leaderTestResults.city, city),
      eq(leaderTestResults.passed, true)
    ));

  const current = Number(passedCount?.count) || 0;
  const max = quota.maxPassed;

  if (current >= max) {
    return {
      available: false,
      current,
      max,
      reason: `Набор лидеров в городе "${city}" завершён (${current}/${max})`,
    };
  }

  return { available: true, current, max };
}

export const leaderTestModule = new Elysia({ prefix: '/leader-test', tags: ['Leader Test'] })
  /**
   * Публичный endpoint для проверки, проходил ли пользователь тест
   * Также проверяет доступность теста по квоте города
   * Валидирует пользователя через Telegram initData
   */
  .post(
    '/check-completed',
    async ({ body, set }) => {
      const { initData } = body;

      // Валидируем initData
      if (!validateTelegramInitData(initData)) {
        set.status = 401;
        return { success: false, error: 'Invalid Telegram data' };
      }

      // Парсим данные пользователя
      const tgUser = parseTelegramUser(initData);
      if (!tgUser || !tgUser.id) {
        set.status = 401;
        return { success: false, error: 'Could not parse user data' };
      }

      try {
        // Находим пользователя по telegramId
        const [dbUser] = await db
          .select()
          .from(users)
          .where(eq(users.telegramId, tgUser.id))
          .limit(1);

        if (!dbUser) {
          logger.info({ telegramId: tgUser.id }, 'Leader test: user not found');
          return { success: true, hasCompleted: false, hasPassed: false, quotaExceeded: false, hasAccess: false };
        }

        // Проверяем доступ: isPro и в клубе >= 3 месяцев
        // Используем created_at как дату регистрации в системе
        let hasAccess = false;
        if (dbUser.isPro && dbUser.createdAt) {
          const memberSince = new Date(dbUser.createdAt);
          const now = new Date();
          const diffMonths = (now.getTime() - memberSince.getTime()) / (30 * 24 * 60 * 60 * 1000);
          hasAccess = diffMonths >= 3;
          logger.info({
            telegramId: tgUser.id,
            isPro: dbUser.isPro,
            createdAt: dbUser.createdAt,
            diffMonths,
            hasAccess
          }, 'Leader test: access check');
        } else {
          logger.info({
            telegramId: tgUser.id,
            isPro: dbUser.isPro,
            createdAt: dbUser.createdAt,
          }, 'Leader test: no access (missing isPro or createdAt)');
        }

        // Если нет доступа - возвращаем сразу
        if (!hasAccess) {
          return {
            success: true,
            hasCompleted: false,
            hasPassed: false,
            quotaExceeded: false,
            hasAccess: false,
            city: dbUser.city,
          };
        }

        // Проверяем, есть ли результаты теста
        const results = await db
          .select({
            passed: leaderTestResults.passed,
          })
          .from(leaderTestResults)
          .where(eq(leaderTestResults.userId, dbUser.id))
          .limit(1);

        const hasCompleted = results.length > 0;
        const hasPassed = results.some(r => r.passed);

        // Проверяем квоту города (только если тест ещё не пройден)
        let quotaExceeded = false;
        let quotaReason: string | undefined;
        let quotaInfo: { current: number; max: number | null } | undefined;

        if (!hasCompleted && dbUser.city) {
          const quotaCheck = await checkCityQuota(dbUser.city);
          quotaExceeded = !quotaCheck.available;
          quotaReason = quotaCheck.reason;
          if (quotaCheck.max !== null) {
            quotaInfo = { current: quotaCheck.current, max: quotaCheck.max };
          }
        }

        return {
          success: true,
          hasCompleted,
          hasPassed,
          quotaExceeded,
          quotaReason,
          quotaInfo,
          city: dbUser.city,
          hasAccess: true,
        };
      } catch (error) {
        logger.error({ error, telegramId: tgUser.id }, 'Failed to check leader test completion');
        return { success: true, hasCompleted: false, hasPassed: false, quotaExceeded: false, hasAccess: false };
      }
    },
    {
      body: t.Object({
        initData: t.String({ description: 'Telegram WebApp initData для валидации' }),
      }),
      detail: {
        summary: 'Проверить, проходил ли пользователь тест',
        description: 'Проверяет, есть ли у пользователя результаты теста и доступна ли квота города (публичный endpoint)',
      },
    }
  )

  /**
   * Публичный endpoint для сохранения результата теста
   * Валидирует пользователя через Telegram initData напрямую
   * Не требует JWT токена - для обхода проблем с кешем WebApp
   */
  .post(
    '/submit-public',
    async ({ body, set }) => {
      const { initData, passed, score, totalQuestions, stopReason, answers } = body;

      // Валидируем initData
      if (!validateTelegramInitData(initData)) {
        logger.warn({ initData: initData?.substring(0, 100) }, 'Invalid initData for leader test submit');
        set.status = 401;
        return { success: false, error: 'Invalid Telegram data' };
      }

      // Парсим данные пользователя
      const tgUser = parseTelegramUser(initData);
      if (!tgUser || !tgUser.id) {
        set.status = 401;
        return { success: false, error: 'Could not parse user data' };
      }

      try {
        // Находим пользователя по telegramId
        const [dbUser] = await db
          .select()
          .from(users)
          .where(eq(users.telegramId, tgUser.id))
          .limit(1);

        if (!dbUser) {
          logger.warn({ telegramId: tgUser.id }, 'User not found for leader test submit');
          set.status = 404;
          return { success: false, error: 'User not found' };
        }

        // 🏙️ Проверяем, выбран ли городской чат - без него нельзя проходить тест
        if (!dbUser.cityChatId) {
          logger.warn({ telegramId: tgUser.id }, 'Leader test submit rejected: no city chat selected');
          set.status = 400;
          return {
            success: false,
            error: 'City chat required',
            message: 'Выберите чат города в профиле перед прохождением теста'
          };
        }

        // Проверяем, указан ли город
        if (!dbUser.city || dbUser.city.trim() === '') {
          logger.warn({ telegramId: tgUser.id }, 'Leader test submit rejected: no city');
          set.status = 400;
          return {
            success: false,
            error: 'City required',
            message: 'Укажите город в профиле перед прохождением теста'
          };
        }

        // Сохраняем результат
        const [result] = await db
          .insert(leaderTestResults)
          .values({
            userId: dbUser.id,
            telegramId: tgUser.id,
            passed,
            score,
            totalQuestions,
            stopReason: stopReason || null,
            answers,
            city: dbUser.city,
          })
          .returning();

        logger.info({
          userId: dbUser.id,
          telegramId: tgUser.id,
          passed,
          score,
          totalQuestions,
          city: dbUser.city,
        }, 'Leader test result saved (public endpoint)');

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
        logger.error({ error, telegramId: tgUser.id }, 'Failed to save leader test result (public)');
        set.status = 500;
        return { success: false, error: 'Failed to save test result' };
      }
    },
    {
      body: t.Object({
        initData: t.String({ description: 'Telegram WebApp initData для валидации' }),
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
        summary: 'Сохранить результат теста (публичный)',
        description: 'Сохраняет результаты теста с валидацией через Telegram initData',
      },
    }
  )

  .use(authMiddleware)

  /**
   * Проверка доступности теста для пользователя
   */
  .get(
    '/availability',
    async ({ user, set }) => {
      if (!user) {
        set.status = 401;
        return { success: false, error: 'Unauthorized' };
      }

      try {
        // Получаем город пользователя
        const [userData] = await db
          .select({ city: users.city })
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1);

        const userCity = userData?.city;

        // Проверяем, закрыт ли город
        let isCityClosed = false;
        if (userCity) {
          const [closedCity] = await db
            .select()
            .from(leaderTestClosedCities)
            .where(eq(leaderTestClosedCities.city, userCity))
            .limit(1);

          isCityClosed = !!closedCity;
        }

        return {
          success: true,
          available: !isCityClosed,
          city: userCity || null,
          reason: isCityClosed ? 'Набор лидеров в вашем городе закрыт' : null,
        };
      } catch (error) {
        logger.error({ error, userId: user.id }, 'Failed to check leader test availability');
        return { success: true, available: true, city: null }; // В случае ошибки разрешаем
      }
    },
    {
      detail: {
        summary: 'Проверка доступности теста',
        description: 'Проверяет, доступен ли тест для города пользователя',
      },
    }
  )

  /**
   * Трекинг начала теста (открыл страницу)
   */
  .post(
    '/start',
    async ({ user, set }) => {
      if (!user) {
        set.status = 401;
        return { success: false, error: 'Unauthorized' };
      }

      try {
        // Получаем город пользователя
        const [userData] = await db
          .select({ city: users.city })
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1);

        // Сохраняем старт теста
        await db.insert(leaderTestStarts).values({
          userId: user.id,
          telegramId: user.telegramId,
          city: userData?.city || null,
        });

        logger.info({
          userId: user.id,
          telegramId: user.telegramId,
          city: userData?.city,
        }, 'Leader test started');

        return { success: true };
      } catch (error) {
        logger.error({ error, userId: user.id }, 'Failed to track leader test start');
        // Не возвращаем ошибку - трекинг не должен блокировать пользователя
        return { success: true };
      }
    },
    {
      detail: {
        summary: 'Трекинг начала теста',
        description: 'Записывает, что пользователь открыл страницу теста',
      },
    }
  )

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
        // Получаем данные пользователя (город и cityChatId)
        const [userData] = await db
          .select({ city: users.city, cityChatId: users.cityChatId })
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1);

        // 🏙️ Проверяем, выбран ли городской чат - без него нельзя проходить тест
        if (!userData?.cityChatId) {
          logger.warn({ userId: user.id, telegramId: user.telegramId }, 'Leader test submit rejected: no city chat selected');
          set.status = 400;
          return {
            success: false,
            error: 'City chat required',
            message: 'Выберите чат города в профиле перед прохождением теста'
          };
        }

        // Проверяем, указан ли город
        const userCity = userData?.city?.trim();
        if (!userCity) {
          logger.warn({ userId: user.id, telegramId: user.telegramId }, 'Leader test submit rejected: no city');
          set.status = 400;
          return {
            success: false,
            error: 'City required',
            message: 'Укажите город в профиле перед прохождением теста'
          };
        }

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
            city: userCity,
          })
          .returning();

        logger.info({
          userId: user.id,
          telegramId: user.telegramId,
          passed,
          score,
          totalQuestions,
          city: userCity,
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
  )

  /**
   * Получить статистику теста (для админки)
   */
  .get(
    '/stats',
    async ({ user, set }) => {
      if (!user) {
        set.status = 401;
        return { success: false, error: 'Unauthorized' };
      }

      // Только для определённых пользователей (админ)
      const allowedTgIds = [389209990];
      if (!allowedTgIds.includes(user.telegramId)) {
        set.status = 403;
        return { success: false, error: 'Forbidden' };
      }

      try {
        // Сколько начало тест (уникальных пользователей)
        const [startsCount] = await db
          .select({ count: sql<number>`count(distinct ${leaderTestStarts.userId})` })
          .from(leaderTestStarts);

        // Всего стартов (включая повторные)
        const [totalStarts] = await db
          .select({ count: count() })
          .from(leaderTestStarts);

        // Сколько прошло тест
        const [passedCount] = await db
          .select({ count: sql<number>`count(distinct ${leaderTestResults.userId})` })
          .from(leaderTestResults)
          .where(eq(leaderTestResults.passed, true));

        // Сколько провалило тест
        const [failedCount] = await db
          .select({ count: sql<number>`count(distinct ${leaderTestResults.userId})` })
          .from(leaderTestResults)
          .where(eq(leaderTestResults.passed, false));

        // Всего завершённых тестов
        const [totalResults] = await db
          .select({ count: count() })
          .from(leaderTestResults);

        // Последние 50 результатов с деталями
        const recentResults = await db
          .select({
            id: leaderTestResults.id,
            telegramId: leaderTestResults.telegramId,
            passed: leaderTestResults.passed,
            score: leaderTestResults.score,
            totalQuestions: leaderTestResults.totalQuestions,
            stopReason: leaderTestResults.stopReason,
            answers: leaderTestResults.answers,
            city: leaderTestResults.city,
            createdAt: leaderTestResults.createdAt,
            firstName: users.firstName,
            lastName: users.lastName,
          })
          .from(leaderTestResults)
          .leftJoin(users, eq(leaderTestResults.userId, users.id))
          .orderBy(desc(leaderTestResults.createdAt))
          .limit(50);

        return {
          success: true,
          stats: {
            uniqueStarts: Number(startsCount?.count) || 0,
            totalStarts: Number(totalStarts?.count) || 0,
            uniquePassed: Number(passedCount?.count) || 0,
            uniqueFailed: Number(failedCount?.count) || 0,
            totalResults: Number(totalResults?.count) || 0,
          },
          recentResults,
        };
      } catch (error) {
        logger.error({ error }, 'Failed to get leader test stats');
        set.status = 500;
        return { success: false, error: 'Failed to get stats' };
      }
    },
    {
      detail: {
        summary: 'Статистика теста (админ)',
        description: 'Возвращает статистику по тесту: сколько начало, прошло, провалило',
      },
    }
  )

  /**
   * Получить список закрытых городов (админ)
   */
  .get(
    '/closed-cities',
    async ({ user, set }) => {
      if (!user) {
        set.status = 401;
        return { success: false, error: 'Unauthorized' };
      }

      const allowedTgIds = [389209990];
      if (!allowedTgIds.includes(user.telegramId)) {
        set.status = 403;
        return { success: false, error: 'Forbidden' };
      }

      try {
        const cities = await db
          .select()
          .from(leaderTestClosedCities)
          .orderBy(leaderTestClosedCities.city);

        return { success: true, cities };
      } catch (error) {
        logger.error({ error }, 'Failed to get closed cities');
        set.status = 500;
        return { success: false, error: 'Failed to get closed cities' };
      }
    },
    {
      detail: {
        summary: 'Список закрытых городов (админ)',
        description: 'Возвращает список городов, для которых тест закрыт',
      },
    }
  )

  /**
   * Добавить город в закрытые (админ)
   */
  .post(
    '/closed-cities',
    async ({ body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { success: false, error: 'Unauthorized' };
      }

      const allowedTgIds = [389209990];
      if (!allowedTgIds.includes(user.telegramId)) {
        set.status = 403;
        return { success: false, error: 'Forbidden' };
      }

      try {
        const [city] = await db
          .insert(leaderTestClosedCities)
          .values({
            city: body.city,
            reason: body.reason || null,
          })
          .returning();

        logger.info({ city: body.city, adminId: user.id }, 'City closed for leader test');

        return { success: true, city };
      } catch (error) {
        logger.error({ error, city: body.city }, 'Failed to close city');
        set.status = 500;
        return { success: false, error: 'Failed to close city' };
      }
    },
    {
      body: t.Object({
        city: t.String({ description: 'Название города' }),
        reason: t.Optional(t.String({ description: 'Причина закрытия' })),
      }),
      detail: {
        summary: 'Закрыть город (админ)',
        description: 'Добавляет город в список закрытых для теста',
      },
    }
  )

  /**
   * Удалить город из закрытых (админ)
   */
  .delete(
    '/closed-cities/:city',
    async ({ params, user, set }) => {
      if (!user) {
        set.status = 401;
        return { success: false, error: 'Unauthorized' };
      }

      const allowedTgIds = [389209990];
      if (!allowedTgIds.includes(user.telegramId)) {
        set.status = 403;
        return { success: false, error: 'Forbidden' };
      }

      try {
        await db
          .delete(leaderTestClosedCities)
          .where(eq(leaderTestClosedCities.city, decodeURIComponent(params.city)));

        logger.info({ city: params.city, adminId: user.id }, 'City opened for leader test');

        return { success: true };
      } catch (error) {
        logger.error({ error, city: params.city }, 'Failed to open city');
        set.status = 500;
        return { success: false, error: 'Failed to open city' };
      }
    },
    {
      detail: {
        summary: 'Открыть город (админ)',
        description: 'Удаляет город из списка закрытых',
      },
    }
  )

  /**
   * Получить все квоты городов (админ)
   */
  .get(
    '/city-quotas',
    async ({ user, set }) => {
      if (!user) {
        set.status = 401;
        return { success: false, error: 'Unauthorized' };
      }

      const allowedTgIds = [389209990];
      if (!allowedTgIds.includes(user.telegramId)) {
        set.status = 403;
        return { success: false, error: 'Forbidden' };
      }

      try {
        // Получаем все квоты с подсчётом текущих прохождений
        const quotas = await db
          .select()
          .from(leaderTestCityQuotas)
          .orderBy(leaderTestCityQuotas.city);

        // Добавляем текущее количество прошедших для каждого города
        const quotasWithCurrent = await Promise.all(
          quotas.map(async (quota) => {
            const [passedCount] = await db
              .select({ count: sql<number>`count(distinct ${leaderTestResults.userId})` })
              .from(leaderTestResults)
              .where(and(
                eq(leaderTestResults.city, quota.city),
                eq(leaderTestResults.passed, true)
              ));

            return {
              ...quota,
              currentPassed: Number(passedCount?.count) || 0,
            };
          })
        );

        return { success: true, quotas: quotasWithCurrent };
      } catch (error) {
        logger.error({ error }, 'Failed to get city quotas');
        set.status = 500;
        return { success: false, error: 'Failed to get city quotas' };
      }
    },
    {
      detail: {
        summary: 'Получить все квоты городов (админ)',
        description: 'Возвращает список всех квот с текущим количеством прохождений',
      },
    }
  )

  /**
   * Массовое добавление/обновление квот городов (админ)
   */
  .post(
    '/city-quotas/bulk',
    async ({ body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { success: false, error: 'Unauthorized' };
      }

      const allowedTgIds = [389209990];
      if (!allowedTgIds.includes(user.telegramId)) {
        set.status = 403;
        return { success: false, error: 'Forbidden' };
      }

      try {
        const { quotas } = body;
        let inserted = 0;
        let updated = 0;

        for (const quota of quotas) {
          // Проверяем, существует ли уже квота для этого города
          const [existing] = await db
            .select()
            .from(leaderTestCityQuotas)
            .where(eq(leaderTestCityQuotas.city, quota.city))
            .limit(1);

          if (existing) {
            // Обновляем
            await db
              .update(leaderTestCityQuotas)
              .set({ maxPassed: quota.maxPassed, updatedAt: new Date() })
              .where(eq(leaderTestCityQuotas.city, quota.city));
            updated++;
          } else {
            // Вставляем новую
            await db
              .insert(leaderTestCityQuotas)
              .values({
                city: quota.city,
                maxPassed: quota.maxPassed,
              });
            inserted++;
          }
        }

        logger.info({
          adminId: user.id,
          inserted,
          updated,
          total: quotas.length,
        }, 'City quotas bulk updated');

        return { success: true, inserted, updated };
      } catch (error) {
        logger.error({ error }, 'Failed to bulk update city quotas');
        set.status = 500;
        return { success: false, error: 'Failed to bulk update city quotas' };
      }
    },
    {
      body: t.Object({
        quotas: t.Array(
          t.Object({
            city: t.String({ description: 'Название города' }),
            maxPassed: t.Number({ description: 'Максимум успешных прохождений' }),
          })
        ),
      }),
      detail: {
        summary: 'Массовое добавление квот (админ)',
        description: 'Добавляет или обновляет квоты для нескольких городов',
      },
    }
  )

  /**
   * Удалить квоту города (админ)
   */
  .delete(
    '/city-quotas/:city',
    async ({ params, user, set }) => {
      if (!user) {
        set.status = 401;
        return { success: false, error: 'Unauthorized' };
      }

      const allowedTgIds = [389209990];
      if (!allowedTgIds.includes(user.telegramId)) {
        set.status = 403;
        return { success: false, error: 'Forbidden' };
      }

      try {
        await db
          .delete(leaderTestCityQuotas)
          .where(eq(leaderTestCityQuotas.city, decodeURIComponent(params.city)));

        logger.info({ city: params.city, adminId: user.id }, 'City quota deleted');

        return { success: true };
      } catch (error) {
        logger.error({ error, city: params.city }, 'Failed to delete city quota');
        set.status = 500;
        return { success: false, error: 'Failed to delete city quota' };
      }
    },
    {
      detail: {
        summary: 'Удалить квоту города (админ)',
        description: 'Удаляет квоту для города (тест станет доступен без ограничений)',
      },
    }
  );
