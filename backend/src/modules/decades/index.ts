/**
 * 🔟 Decades API Module
 * Endpoints для работы с десятками
 */

import { Elysia, t } from 'elysia';
import { decadesService } from '@/services/decades.service';
import { db, decades, decadeMembers, leaderReports, users } from '@/db';
import { eq, and, isNull, desc, sql } from 'drizzle-orm';
import { logger } from '@/utils/logger';
import { validateTelegramInitData, parseTelegramUser } from '@/middlewares/auth';

export const decadesModule = new Elysia({ prefix: '/decades', tags: ['Decades'] })

  // ============================================================================
  // PUBLIC ENDPOINTS (с валидацией initData)
  // ============================================================================

  /**
   * Получить информацию о десятке пользователя
   */
  .post(
    '/my',
    async ({ body, set }) => {
      const { initData } = body;

      if (!validateTelegramInitData(initData)) {
        set.status = 401;
        return { success: false, error: 'Invalid Telegram data' };
      }

      const tgUser = parseTelegramUser(initData);
      if (!tgUser?.id) {
        set.status = 401;
        return { success: false, error: 'Could not parse user data' };
      }

      try {
        const { decade, membership } = await decadesService.getUserDecade(tgUser.id);

        if (!decade || !membership) {
          return { success: true, decade: null };
        }

        return {
          success: true,
          decade: {
            id: decade.id,
            city: decade.city,
            number: decade.number,
            name: `Десятка №${decade.number} ${decade.city}`,
            inviteLink: decade.inviteLink,
            currentMembers: decade.currentMembers,
            maxMembers: decade.maxMembers,
            isLeader: membership.isLeader,
            joinedAt: membership.joinedAt,
          },
        };
      } catch (error) {
        logger.error({ error, telegramId: tgUser.id }, 'Failed to get user decade');
        set.status = 500;
        return { success: false, error: 'Internal error' };
      }
    },
    {
      body: t.Object({
        initData: t.String(),
      }),
      detail: {
        summary: 'Get user decade info',
        description: 'Get information about the decade the user belongs to',
      },
    }
  )

  /**
   * Вступить в десятку (автоматический подбор по городу)
   */
  .post(
    '/join',
    async ({ body, set }) => {
      const { initData } = body;

      if (!validateTelegramInitData(initData)) {
        set.status = 401;
        return { success: false, error: 'Invalid Telegram data' };
      }

      const tgUser = parseTelegramUser(initData);
      if (!tgUser?.id) {
        set.status = 401;
        return { success: false, error: 'Could not parse user data' };
      }

      const result = await decadesService.assignUserToDecade(tgUser.id);
      return result;
    },
    {
      body: t.Object({
        initData: t.String(),
      }),
      detail: {
        summary: 'Join a decade',
        description: 'Assign user to a decade in their city',
      },
    }
  )

  /**
   * Проверить возможность создания десятки (для лидеров)
   */
  .post(
    '/can-create',
    async ({ body, set }) => {
      const { initData } = body;

      if (!validateTelegramInitData(initData)) {
        set.status = 401;
        return { success: false, error: 'Invalid Telegram data' };
      }

      const tgUser = parseTelegramUser(initData);
      if (!tgUser?.id) {
        set.status = 401;
        return { success: false, error: 'Could not parse user data' };
      }

      const result = await decadesService.canCreateDecade(tgUser.id);
      return { success: true, ...result };
    },
    {
      body: t.Object({
        initData: t.String(),
      }),
      detail: {
        summary: 'Check if user can create decade',
        description: 'Check if the user (leader) can create a new decade',
      },
    }
  )

  /**
   * Отправить отчёт светофора (только для лидеров)
   */
  .post(
    '/report',
    async ({ body, set }) => {
      const { initData, status, problemDescription } = body;

      if (!validateTelegramInitData(initData)) {
        set.status = 401;
        return { success: false, error: 'Invalid Telegram data' };
      }

      const tgUser = parseTelegramUser(initData);
      if (!tgUser?.id) {
        set.status = 401;
        return { success: false, error: 'Could not parse user data' };
      }

      // Проверить, можно ли отправить отчёт (пятница-воскресенье)
      if (!decadesService.canSubmitReport()) {
        return {
          success: false,
          error: 'Отчёт можно отправить только с пятницы по воскресенье',
        };
      }

      const result = await decadesService.submitLeaderReport(
        tgUser.id,
        status as 'green' | 'red',
        problemDescription
      );

      return result;
    },
    {
      body: t.Object({
        initData: t.String(),
        status: t.Union([t.Literal('green'), t.Literal('red')]),
        problemDescription: t.Optional(t.String()),
      }),
      detail: {
        summary: 'Submit leader report (traffic light)',
        description: 'Submit weekly status report for decade leaders',
      },
    }
  )

  /**
   * Проверить статус отчёта за текущую неделю
   */
  .post(
    '/report-status',
    async ({ body, set }) => {
      const { initData } = body;

      if (!validateTelegramInitData(initData)) {
        set.status = 401;
        return { success: false, error: 'Invalid Telegram data' };
      }

      const tgUser = parseTelegramUser(initData);
      if (!tgUser?.id) {
        set.status = 401;
        return { success: false, error: 'Could not parse user data' };
      }

      const hasReported = await decadesService.hasReportedThisWeek(tgUser.id);
      const weekInfo = decadesService.getWeekInfo();
      const canSubmit = decadesService.canSubmitReport();

      return {
        success: true,
        hasReported,
        canSubmit,
        weekNumber: weekInfo.weekNumber,
        weekStart: weekInfo.weekStart.toISOString(),
      };
    },
    {
      body: t.Object({
        initData: t.String(),
      }),
      detail: {
        summary: 'Get report status',
        description: 'Check if leader has submitted report for current week',
      },
    }
  )

  // ============================================================================
  // ADMIN ENDPOINTS
  // ============================================================================

  /**
   * Получить список всех десяток (админ)
   */
  .get(
    '/admin/all',
    async ({ query, headers, set }) => {
      // Простая проверка админ-ключа
      const adminKey = headers['x-admin-key'];
      if (adminKey !== 'klubhranitel2024') {
        set.status = 401;
        return { success: false, error: 'Unauthorized' };
      }

      const { city } = query;

      let decadesList;
      if (city) {
        decadesList = await db
          .select()
          .from(decades)
          .where(eq(decades.city, city))
          .orderBy(decades.number);
      } else {
        decadesList = await db.select().from(decades).orderBy(decades.city, decades.number);
      }

      return { success: true, decades: decadesList };
    },
    {
      query: t.Object({
        city: t.Optional(t.String()),
      }),
      detail: {
        summary: 'Get all decades (admin)',
        description: 'Admin endpoint to get all decades',
      },
    }
  )

  /**
   * Получить статистику по десяткам (админ)
   */
  .get(
    '/admin/stats',
    async ({ headers, set }) => {
      const adminKey = headers['x-admin-key'];
      if (adminKey !== 'klubhranitel2024') {
        set.status = 401;
        return { success: false, error: 'Unauthorized' };
      }

      // Статистика по городам
      const stats = await db.execute(sql`
        SELECT
          city,
          COUNT(*) as total_decades,
          SUM(current_members) as total_members,
          SUM(CASE WHEN is_full THEN 1 ELSE 0 END) as full_decades
        FROM decades
        WHERE is_active = true
        GROUP BY city
        ORDER BY total_members DESC
      `);

      return { success: true, stats };
    },
    {
      detail: {
        summary: 'Get decades statistics (admin)',
        description: 'Admin endpoint to get decades statistics by city',
      },
    }
  )

  /**
   * Получить отчёты светофора за неделю (админ)
   */
  .get(
    '/admin/reports',
    async ({ query, headers, set }) => {
      const adminKey = headers['x-admin-key'];
      if (adminKey !== 'klubhranitel2024') {
        set.status = 401;
        return { success: false, error: 'Unauthorized' };
      }

      const { weekNumber, year } = query;
      const currentWeek = decadesService.getWeekInfo();

      const reports = await db
        .select({
          id: leaderReports.id,
          decadeId: leaderReports.decadeId,
          status: leaderReports.status,
          problemDescription: leaderReports.problemDescription,
          submittedAt: leaderReports.submittedAt,
          weekNumber: leaderReports.weekNumber,
        })
        .from(leaderReports)
        .where(
          and(
            eq(
              leaderReports.weekNumber,
              weekNumber ? parseInt(weekNumber) : currentWeek.weekNumber
            ),
            eq(leaderReports.year, year ? parseInt(year) : currentWeek.year)
          )
        )
        .orderBy(desc(leaderReports.submittedAt));

      // Получить информацию о десятках
      const reportsWithDecades = await Promise.all(
        reports.map(async report => {
          const [decade] = await db
            .select({ city: decades.city, number: decades.number })
            .from(decades)
            .where(eq(decades.id, report.decadeId))
            .limit(1);

          return {
            ...report,
            decadeName: decade ? `Десятка №${decade.number} ${decade.city}` : 'Unknown',
          };
        })
      );

      return { success: true, reports: reportsWithDecades };
    },
    {
      query: t.Object({
        weekNumber: t.Optional(t.String()),
        year: t.Optional(t.String()),
      }),
      detail: {
        summary: 'Get leader reports (admin)',
        description: 'Admin endpoint to get weekly leader reports',
      },
    }
  )

  /**
   * Получить участников десятки (админ)
   */
  .get(
    '/admin/members/:decadeId',
    async ({ params, headers, set }) => {
      const adminKey = headers['x-admin-key'];
      if (adminKey !== 'klubhranitel2024') {
        set.status = 401;
        return { success: false, error: 'Unauthorized' };
      }

      const { decadeId } = params;

      const members = await db
        .select({
          id: decadeMembers.id,
          telegramId: decadeMembers.telegramId,
          isLeader: decadeMembers.isLeader,
          joinedAt: decadeMembers.joinedAt,
          leftAt: decadeMembers.leftAt,
          firstName: users.firstName,
          lastName: users.lastName,
          username: users.username,
        })
        .from(decadeMembers)
        .leftJoin(users, eq(decadeMembers.userId, users.id))
        .where(eq(decadeMembers.decadeId, decadeId))
        .orderBy(decadeMembers.isLeader, decadeMembers.joinedAt);

      return { success: true, members };
    },
    {
      params: t.Object({
        decadeId: t.String(),
      }),
      detail: {
        summary: 'Get decade members (admin)',
        description: 'Admin endpoint to get members of a specific decade',
      },
    }
  );
