import { Elysia, t } from 'elysia';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { userSessions, users } from '@/db/schema';
import { authMiddleware } from '@/middlewares/auth';
import { logger } from '@/utils/logger';

export const sessionsModule = new Elysia({ prefix: '/sessions', tags: ['Sessions'] })
  .use(authMiddleware)

  // POST /sessions/start — начало сессии
  .post(
    '/start',
    async ({ body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }

      try {
        const { session_id } = body;

        // Закрываем незавершённые сессии этого пользователя (на случай если предыдущая не была закрыта)
        const openSessions = await db
          .select({ id: userSessions.id, startedAt: userSessions.startedAt })
          .from(userSessions)
          .where(
            and(
              eq(userSessions.userId, user.id),
              isNull(userSessions.endedAt)
            )
          );

        if (openSessions.length > 0) {
          const now = new Date();
          for (const session of openSessions) {
            const duration = Math.round((now.getTime() - new Date(session.startedAt).getTime()) / 1000);
            await db
              .update(userSessions)
              .set({
                endedAt: now,
                durationSeconds: Math.min(duration, 7200), // cap at 2 hours
              })
              .where(eq(userSessions.id, session.id));
          }
        }

        // Создаём новую сессию
        const [newSession] = await db
          .insert(userSessions)
          .values({
            userId: user.id,
            telegramId: user.telegramId,
            sessionId: session_id,
            startedAt: new Date(),
          })
          .returning({ id: userSessions.id });

        return {
          success: true,
          session_db_id: newSession.id,
        };
      } catch (error) {
        logger.error({ error, userId: user.id }, 'Failed to start session');
        set.status = 500;
        return { error: 'Failed to start session' };
      }
    },
    {
      body: t.Object({
        session_id: t.String(),
      }),
    }
  )

  // POST /sessions/heartbeat — обновление сессии (фронтенд шлёт каждые 30 сек)
  .post(
    '/heartbeat',
    async ({ body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }

      try {
        const { session_id, pages_visited } = body;

        // Находим открытую сессию
        const [session] = await db
          .select({ id: userSessions.id, startedAt: userSessions.startedAt })
          .from(userSessions)
          .where(
            and(
              eq(userSessions.userId, user.id),
              eq(userSessions.sessionId, session_id),
              isNull(userSessions.endedAt)
            )
          )
          .limit(1);

        if (!session) {
          // Сессия не найдена — создаём новую (на случай если бэкенд перезапустился)
          await db.insert(userSessions).values({
            userId: user.id,
            telegramId: user.telegramId,
            sessionId: session_id,
            startedAt: new Date(),
            pagesVisited: pages_visited || 0,
          });
          return { success: true, recreated: true };
        }

        // Обновляем pages_visited
        if (pages_visited !== undefined) {
          await db
            .update(userSessions)
            .set({ pagesVisited: pages_visited })
            .where(eq(userSessions.id, session.id));
        }

        return { success: true };
      } catch (error) {
        logger.error({ error, userId: user.id }, 'Failed to heartbeat session');
        set.status = 500;
        return { error: 'Failed to heartbeat' };
      }
    },
    {
      body: t.Object({
        session_id: t.String(),
        pages_visited: t.Optional(t.Number()),
      }),
    }
  )

  // POST /sessions/end — конец сессии
  .post(
    '/end',
    async ({ body, user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }

      try {
        const { session_id, duration_seconds, pages_visited } = body;

        const now = new Date();

        // Ищем открытую сессию
        const [session] = await db
          .select({ id: userSessions.id, startedAt: userSessions.startedAt })
          .from(userSessions)
          .where(
            and(
              eq(userSessions.userId, user.id),
              eq(userSessions.sessionId, session_id),
              isNull(userSessions.endedAt)
            )
          )
          .limit(1);

        if (!session) {
          // Нет открытой сессии — создаём завершённую запись
          const startedAt = new Date(now.getTime() - (duration_seconds || 0) * 1000);
          await db.insert(userSessions).values({
            userId: user.id,
            telegramId: user.telegramId,
            sessionId: session_id,
            startedAt,
            endedAt: now,
            durationSeconds: duration_seconds || 0,
            pagesVisited: pages_visited || 0,
          });
          return { success: true, created_closed: true };
        }

        // Вычисляем длительность из startedAt если клиент не прислал
        const serverDuration = Math.round((now.getTime() - new Date(session.startedAt).getTime()) / 1000);
        const finalDuration = duration_seconds || serverDuration;

        await db
          .update(userSessions)
          .set({
            endedAt: now,
            durationSeconds: Math.min(finalDuration, 7200), // cap 2 hours
            pagesVisited: pages_visited || undefined,
          })
          .where(eq(userSessions.id, session.id));

        return { success: true, duration: finalDuration };
      } catch (error) {
        logger.error({ error, userId: user.id }, 'Failed to end session');
        set.status = 500;
        return { error: 'Failed to end session' };
      }
    },
    {
      body: t.Object({
        session_id: t.String(),
        duration_seconds: t.Optional(t.Number()),
        pages_visited: t.Optional(t.Number()),
      }),
    }
  );
