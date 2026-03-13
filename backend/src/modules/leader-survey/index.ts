/**
 * 🚦 Leader Survey (Светофор) API
 * Еженедельные опросы для лидеров десяток
 */

import { Elysia, t } from 'elysia';
import { db } from '@/db';
import { leaderSurveyQuestions, leaderSurveyVotes, decadeMembers } from '@/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { logger } from '@/utils/logger';
import { authMiddleware } from '@/middlewares/auth';

// Получить начало текущей недели (Пн 00:00 МСК)
function getCurrentWeekStart(): Date {
  const now = new Date();
  // Переводим в МСК (UTC+3)
  const mskOffset = 3 * 60 * 60 * 1000;
  const mskNow = new Date(now.getTime() + mskOffset);

  // Найти понедельник
  const day = mskNow.getUTCDay(); // 0=Sun, 1=Mon, ...
  const daysFromMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(mskNow);
  monday.setUTCDate(monday.getUTCDate() - daysFromMonday);
  monday.setUTCHours(0, 0, 0, 0);

  // Обратно в UTC
  return new Date(monday.getTime() - mskOffset);
}

// Проверить, является ли пользователь лидером десятки
async function isUserLeader(userId: string): Promise<boolean> {
  const [membership] = await db
    .select({ id: decadeMembers.id })
    .from(decadeMembers)
    .where(and(
      eq(decadeMembers.userId, userId),
      eq(decadeMembers.isLeader, true),
      isNull(decadeMembers.leftAt),
    ))
    .limit(1);
  return !!membership;
}

export const leaderSurveyRoutes = new Elysia({ prefix: '/leader-survey' })
  .use(authMiddleware)

  /**
   * GET /current — получить текущий опрос и голоса пользователя за эту неделю
   */
  .get(
    '/current',
    async ({ user, set }) => {
      try {
        // Используем пользователя из JWT (игнорируем telegram_id из query)

        // Проверить, лидер ли
        const leader = await isUserLeader(user!.id);
        if (!leader) {
          return { success: true, isLeader: false, questions: [], votes: [] };
        }

        // Получить активные вопросы
        const questions = await db
          .select()
          .from(leaderSurveyQuestions)
          .where(eq(leaderSurveyQuestions.isActive, true))
          .orderBy(leaderSurveyQuestions.orderIndex);

        // Получить голоса за текущую неделю
        const weekStart = getCurrentWeekStart();
        const votes = await db
          .select()
          .from(leaderSurveyVotes)
          .where(
            and(
              eq(leaderSurveyVotes.userId, user!.id),
              eq(leaderSurveyVotes.weekStart, weekStart),
            )
          );

        // Маппинг голосов: questionId -> answer
        const votesMap: Record<string, string> = {};
        for (const vote of votes) {
          votesMap[vote.questionId] = vote.answer;
        }

        return {
          success: true,
          isLeader: true,
          weekStart: weekStart.toISOString(),
          questions: questions.map(q => ({
            id: q.id,
            text: q.text,
            options: q.options,
            orderIndex: q.orderIndex,
          })),
          votes: votesMap,
        };
      } catch (error) {
        logger.error({ error }, 'Failed to get leader survey');
        set.status = 500;
        return { success: false, error: 'Internal error' };
      }
    },
    {
      // telegram_id в query больше не используется — пользователь берётся из JWT
      query: t.Optional(t.Object({
        telegram_id: t.Optional(t.String()),
      })),
    }
  )

  /**
   * POST /vote — проголосовать за вопрос (требует JWT)
   */
  .post(
    '/vote',
    async ({ body, user, set }) => {
      try {
        const { question_id, answer } = body;

        // Проверить, лидер ли
        const leader = await isUserLeader(user!.id);
        if (!leader) {
          set.status = 403;
          return { success: false, error: 'Not a leader' };
        }

        // Проверить, существует ли вопрос
        const question = await db.query.leaderSurveyQuestions.findFirst({
          where: and(
            eq(leaderSurveyQuestions.id, question_id),
            eq(leaderSurveyQuestions.isActive, true),
          ),
        });

        if (!question) {
          set.status = 404;
          return { success: false, error: 'Question not found' };
        }

        // Проверить, что answer валиден
        const options = question.options as Array<{ key: string }>;
        const validKeys = options.map(o => o.key);
        if (!validKeys.includes(answer)) {
          set.status = 400;
          return { success: false, error: 'Invalid answer' };
        }

        const weekStart = getCurrentWeekStart();

        // Проверить, не голосовал ли уже
        const existingVote = await db.query.leaderSurveyVotes.findFirst({
          where: and(
            eq(leaderSurveyVotes.userId, user!.id),
            eq(leaderSurveyVotes.questionId, question_id),
            eq(leaderSurveyVotes.weekStart, weekStart),
          ),
        });

        if (existingVote) {
          set.status = 409;
          return { success: false, error: 'Already voted this week', existingAnswer: existingVote.answer };
        }

        // Сохранить голос
        const [vote] = await db
          .insert(leaderSurveyVotes)
          .values({
            userId: user!.id,
            questionId: question_id,
            answer,
            weekStart,
          })
          .returning();

        logger.info({ userId: user!.id, telegramId: user!.telegramId, questionId: question_id, answer, weekStart }, 'Leader survey vote recorded');

        return {
          success: true,
          vote: {
            id: vote.id,
            questionId: vote.questionId,
            answer: vote.answer,
            weekStart: vote.weekStart.toISOString(),
          },
        };
      } catch (error: any) {
        // Unique constraint violation — уже голосовал
        if (error?.code === '23505') {
          set.status = 409;
          return { success: false, error: 'Already voted this week' };
        }
        logger.error({ error }, 'Failed to record leader survey vote');
        set.status = 500;
        return { success: false, error: 'Internal error' };
      }
    },
    {
      // telegram_id убран из body — пользователь берётся из JWT
      body: t.Object({
        question_id: t.String(),
        answer: t.String(),
      }),
    }
  );
