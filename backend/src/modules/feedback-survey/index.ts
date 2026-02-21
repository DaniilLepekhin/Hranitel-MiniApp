import { Elysia, t } from 'elysia';
import { db } from '@/db';
import { feedbackSurveyResponses, decadeMembers } from '@/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { energiesService } from '@/modules/energy-points/service';
import { logger } from '@/utils/logger';
import { authMiddleware } from '@/middlewares/auth';

/** Текущий активный опрос: месяц + дата открытия */
const CURRENT_SURVEY = {
  month: '2026-02',
  title: 'Анкета обратной связи',
  subtitle: 'Февраль 2026',
  // Доступна с 23.02.2026 00:00:00 МСК (= 22.02.2026 21:00:00 UTC)
  opensAt: new Date('2026-02-22T21:00:00.000Z'),
  // Закрывается 28.02.2026 23:59:59 МСК (= 28.02.2026 20:59:59 UTC)
  closesAt: new Date('2026-02-28T20:59:59.000Z'),
  energyReward: 300,
};

export const feedbackSurveyRoutes = new Elysia({
  prefix: '/feedback-survey',
  tags: ['Feedback Survey'],
})
  .use(authMiddleware)

  /**
   * GET /api/v1/feedback-survey/current
   * Возвращает текущий опрос, статус (доступен/уже заполнен/ещё не открыт)
   */
  .get('/current', async (ctx) => {
    const user = (ctx as any).user;
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    const now = new Date();
    const survey = CURRENT_SURVEY;

    // Проверяем, заполнял ли уже
    const [existing] = await db
      .select()
      .from(feedbackSurveyResponses)
      .where(
        and(
          eq(feedbackSurveyResponses.userId, user.id),
          eq(feedbackSurveyResponses.surveyMonth, survey.month)
        )
      )
      .limit(1);

    // Проверяем, состоит ли в десятке
    const [decadeMembership] = await db
      .select({ id: decadeMembers.id })
      .from(decadeMembers)
      .where(
        and(
          eq(decadeMembers.userId, user.id),
          isNull(decadeMembers.leftAt)
        )
      )
      .limit(1);

    const isInDecade = !!decadeMembership;
    const isOpen = now >= survey.opensAt && now <= survey.closesAt;
    const isCompleted = !!existing;

    return {
      success: true,
      survey: {
        month: survey.month,
        title: survey.title,
        subtitle: survey.subtitle,
        opensAt: survey.opensAt.toISOString(),
        closesAt: survey.closesAt.toISOString(),
        energyReward: survey.energyReward,
        isOpen,
        isCompleted,
        isInDecade,
      },
    };
  })

  /**
   * POST /api/v1/feedback-survey/submit
   * Отправка ответов
   */
  .post(
    '/submit',
    async (ctx) => {
      const user = (ctx as any).user;
      const set = ctx.set;
      const body = ctx.body as any;

      if (!user) {
        set.status = 401;
        return { success: false, error: 'Unauthorized' };
      }

      const now = new Date();
      const survey = CURRENT_SURVEY;

      // Проверяем, открыт ли опрос
      if (now < survey.opensAt) {
        set.status = 400;
        return { success: false, error: 'Опрос ещё не открыт' };
      }
      if (now > survey.closesAt) {
        set.status = 400;
        return { success: false, error: 'Опрос уже закрыт' };
      }

      // Проверяем, не заполнял ли уже
      const [existing] = await db
        .select()
        .from(feedbackSurveyResponses)
        .where(
          and(
            eq(feedbackSurveyResponses.userId, user.id),
            eq(feedbackSurveyResponses.surveyMonth, survey.month)
          )
        )
        .limit(1);

      if (existing) {
        set.status = 400;
        return { success: false, error: 'Вы уже заполнили анкету за этот месяц' };
      }

      const { q1Useful, q2Involved, q3Ambassador, q4Decade, q5Nps, q6Valuable, q7Improve } = body;

      // Сохраняем ответы (UNIQUE INDEX защищает от дублей при race condition)
      try {
        await db.insert(feedbackSurveyResponses).values({
          userId: user.id,
          surveyMonth: survey.month,
          q1Useful,
          q2Involved,
          q3Ambassador,
          q4Decade: q4Decade ?? null,
          q5Nps,
          q6Valuable: q6Valuable || null,
          q7Improve: q7Improve || null,
          energyAwarded: true,
        });
      } catch (insertError: any) {
        // Duplicate key = уже заполнено (race condition)
        if (insertError?.message?.includes('unique') || insertError?.code === '23505') {
          set.status = 400;
          return { success: false, error: 'Вы уже заполнили анкету за этот месяц' };
        }
        throw insertError;
      }

      // Начисляем энергию (только если INSERT прошёл — гарантия однократности)
      await energiesService.award(user.id, survey.energyReward, 'Анкета обратной связи', {
        surveyMonth: survey.month,
      });

      logger.info(
        { userId: user.id, username: user.username, surveyMonth: survey.month },
        'Feedback survey submitted, awarded energy'
      );

      return {
        success: true,
        message: 'Спасибо за обратную связь!',
        energyAwarded: survey.energyReward,
      };
    },
    {
      body: t.Object({
        q1Useful: t.Number({ minimum: 1, maximum: 5 }),
        q2Involved: t.Number({ minimum: 1, maximum: 5 }),
        q3Ambassador: t.Number({ minimum: 1, maximum: 5 }),
        q4Decade: t.Optional(t.Union([t.Number({ minimum: 1, maximum: 5 }), t.Null()])),
        q5Nps: t.Number({ minimum: 0, maximum: 10 }),
        q6Valuable: t.Optional(t.Union([t.String(), t.Null()])),
        q7Improve: t.Optional(t.Union([t.String(), t.Null()])),
      }),
    }
  );
