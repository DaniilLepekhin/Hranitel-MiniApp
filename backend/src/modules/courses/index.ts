import { Elysia, t } from 'elysia';
import { eq, desc, asc, and, sql } from 'drizzle-orm';
import { db, courses, courseDays, courseProgress, favorites, users, type CourseProgress } from '@/db';
import { authMiddleware, optionalAuthMiddleware, getUserFromToken, validateTelegramInitData, parseTelegramUser } from '@/middlewares/auth';
import { logger } from '@/utils/logger';
import { cache } from '@/utils/redis';
import { energiesService } from '@/modules/energy-points/service';

const COURSES_CACHE_TTL = 300; // 5 minutes

export const coursesModule = new Elysia({ prefix: '/courses', tags: ['Courses'] })
  .onRequest(({ request, path }) => {
    if (path.includes('/progress')) {
      logger.info({
        method: request.method,
        path,
        url: request.url,
        contentType: request.headers.get('content-type'),
      }, '[COURSES ONREQUEST] Progress request detected');
    }
  })
  // Get all courses (public)
  .use(optionalAuthMiddleware)
  .get(
    '/',
    async ({ user, query }) => {
      const { category } = query;

      // Try cache first
      const cacheKey = `courses:list:${category || 'all'}`;
      const cached = await cache.get<typeof courses.$inferSelect[]>(cacheKey);

      let coursesList: typeof courses.$inferSelect[];

      if (cached) {
        coursesList = cached;
      } else {
        const conditions = [eq(courses.isActive, true)];

        if (category && category !== 'all') {
          conditions.push(eq(courses.category, category as 'mindset' | 'spiritual' | 'esoteric' | 'health'));
        }

        coursesList = await db
          .select()
          .from(courses)
          .where(and(...conditions))
          .orderBy(asc(courses.sortOrder), desc(courses.createdAt));

        await cache.set(cacheKey, coursesList, COURSES_CACHE_TTL);
      }

      // Get user progress and favorites if authenticated
      let userProgress: CourseProgress[] = [];
      let userFavorites: string[] = [];

      if (user) {
        const [progress, favs] = await Promise.all([
          db
            .select()
            .from(courseProgress)
            .where(eq(courseProgress.userId, user.id)),
          db
            .select({ courseId: favorites.courseId })
            .from(favorites)
            .where(eq(favorites.userId, user.id)),
        ]);

        userProgress = progress;
        userFavorites = favs.map((f) => f.courseId);
      }

      // Map courses with user data
      const coursesWithProgress = coursesList.map((course) => {
        const progress = userProgress.find((p) => p.courseId === course.id);
        const isFavorite = userFavorites.includes(course.id);

        return {
          ...course,
          progress: progress
            ? {
                currentDay: progress.currentDay,
                completedDays: progress.completedDays,
                lastAccessedAt: progress.lastAccessedAt,
              }
            : null,
          isFavorite,
          // Hide premium content for non-pro users
          isLocked: course.isPremium && !user?.isPro,
        };
      });

      return {
        success: true,
        courses: coursesWithProgress,
      };
    },
    {
      query: t.Object({
        category: t.Optional(t.String()),
      }),
      detail: {
        summary: 'Get all courses',
        description: 'Returns list of all active courses with user progress if authenticated',
      },
    }
  )
  // Get single course with days
  .get(
    '/:id',
    async ({ params, user }) => {
      const { id } = params;

      const [course] = await db
        .select()
        .from(courses)
        .where(eq(courses.id, id))
        .limit(1);

      if (!course) {
        return {
          success: false,
          error: 'Course not found',
        };
      }

      // Check access
      if (course.isPremium && !user?.isPro) {
        return {
          success: true,
          course: {
            ...course,
            isLocked: true,
            days: [],
          },
        };
      }

      // Get course days
      const days = await db
        .select()
        .from(courseDays)
        .where(eq(courseDays.courseId, id))
        .orderBy(asc(courseDays.dayNumber));

      // Get user progress
      let progress = null;
      let isFavorite = false;

      if (user) {
        const [userProgress] = await db
          .select()
          .from(courseProgress)
          .where(
            and(
              eq(courseProgress.userId, user.id),
              eq(courseProgress.courseId, id)
            )
          )
          .limit(1);

        progress = userProgress;

        const [fav] = await db
          .select()
          .from(favorites)
          .where(
            and(
              eq(favorites.userId, user.id),
              eq(favorites.courseId, id)
            )
          )
          .limit(1);

        isFavorite = !!fav;
      }

      return {
        success: true,
        course: {
          ...course,
          days: days.map((day) => ({
            ...day,
            // Hide premium day content for non-pro users
            content: day.isPremium && !user?.isPro ? null : day.content,
            isLocked: day.isPremium && !user?.isPro,
          })),
          progress,
          isFavorite,
          isLocked: false,
        },
      };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        summary: 'Get course details',
        description: 'Returns course with all days',
      },
    }
  )
  // Update course progress (requires authentication)
  .post(
    '/:id/progress',
    async ({ params, body, set, headers }) => {
      const { id } = params;
      const { currentDay, completedDay } = body;
      
      // Get user from JWT manually
      const user = await getUserFromToken(headers.authorization);
      
      if (!user) {
        logger.error({ courseId: id }, 'Progress update failed: no user');
        set.status = 401;
        return {
          success: false,
          error: 'Unauthorized',
          message: 'Authentication required',
        };
      }
      
      logger.info({ 
        userId: user.id,
        courseId: id, 
        currentDay, 
        completedDay,
      }, 'Progress update requested');

      // Check if course exists
      const [course] = await db
        .select()
        .from(courses)
        .where(eq(courses.id, id))
        .limit(1);

      if (!course) {
        set.status = 404;
        return {
          success: false,
          error: 'Course not found',
        };
      }

      // Check access
      if (course.isPremium && !user.isPro) {
        set.status = 403;
        return {
          success: false,
          error: 'Premium content requires PRO subscription',
        };
      }

      // Get total days for this course
      const [totalDaysResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(courseDays)
        .where(eq(courseDays.courseId, id));

      const totalDays = totalDaysResult?.count || 0;

      // Validate bounds on completedDay
      if (completedDay !== undefined) {
        if (completedDay < 1 || (totalDays > 0 && completedDay > totalDays)) {
          set.status = 400;
          return {
            success: false,
            error: `Invalid completedDay: must be between 1 and ${totalDays}`,
          };
        }
      }

      // Validate bounds on currentDay
      if (currentDay !== undefined) {
        if (currentDay < 1 || (totalDays > 0 && currentDay > totalDays)) {
          set.status = 400;
          return {
            success: false,
            error: `Invalid currentDay: must be between 1 and ${totalDays}`,
          };
        }
      }

      // Get existing progress
      const [existingProgress] = await db
        .select()
        .from(courseProgress)
        .where(
          and(
            eq(courseProgress.userId, user.id),
            eq(courseProgress.courseId, id)
          )
        )
        .limit(1);

      let completedDays = existingProgress?.completedDays || [];
      let isNewCompletion = false;

      if (completedDay && !completedDays.includes(completedDay)) {
        completedDays = [...completedDays, completedDay].sort((a, b) => a - b);
        isNewCompletion = true;
      }

      if (existingProgress) {
        // Update
        await db
          .update(courseProgress)
          .set({
            currentDay: currentDay || existingProgress.currentDay,
            completedDays,
            lastAccessedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(courseProgress.id, existingProgress.id));
      } else {
        // Create
        await db.insert(courseProgress).values({
          userId: user.id,
          courseId: id,
          currentDay: currentDay || 1,
          completedDays,
          lastAccessedAt: new Date(),
        });
      }

      // 🎁 ГЕЙМИФИКАЦИЯ: Начислить +20 Энергии за просмотр урока
      if (isNewCompletion && completedDay) {
        try {
          const lessonId = `${id}:day${completedDay}`;
          await energiesService.awardLessonView(user.id, lessonId);
          logger.info(
            { userId: user.id, courseId: id, dayNumber: completedDay },
            'Awarded 20 energy for lesson completion'
          );
        } catch (error) {
          // Не падаем, если начисление не удалось
          logger.error(
            { error, userId: user.id, courseId: id, dayNumber: completedDay },
            'Failed to award energy for lesson'
          );
        }
      }

      return {
        success: true,
        message: 'Progress updated',
      };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        currentDay: t.Optional(t.Number()),
        completedDay: t.Optional(t.Number()),
      }),
      detail: {
        summary: 'Update course progress',
      },
    }
  )
  // Toggle favorite
  .post(
    '/:id/favorite',
    async ({ params, user }) => {
      const { id } = params;

      // Check if already favorite
      const [existing] = await db
        .select()
        .from(favorites)
        .where(
          and(
            eq(favorites.userId, user.id),
            eq(favorites.courseId, id)
          )
        )
        .limit(1);

      if (existing) {
        // Remove from favorites
        await db.delete(favorites).where(eq(favorites.id, existing.id));

        return {
          success: true,
          isFavorite: false,
          message: 'Removed from favorites',
        };
      } else {
        // Add to favorites
        await db.insert(favorites).values({
          userId: user.id,
          courseId: id,
        });

        return {
          success: true,
          isFavorite: true,
          message: 'Added to favorites',
        };
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        summary: 'Toggle course favorite',
      },
    }
  )
  // Get user favorites
  .get(
    '/favorites/list',
    async ({ user }) => {
      const userFavorites = await db
        .select({
          course: courses,
          progress: courseProgress,
        })
        .from(favorites)
        .innerJoin(courses, eq(favorites.courseId, courses.id))
        .leftJoin(
          courseProgress,
          and(
            eq(courseProgress.courseId, courses.id),
            eq(courseProgress.userId, user.id)
          )
        )
        .where(eq(favorites.userId, user.id));

      return {
        success: true,
        favorites: userFavorites.map(({ course, progress }) => ({
          ...course,
          progress: progress
            ? {
                currentDay: progress.currentDay,
                completedDays: progress.completedDays,
                lastAccessedAt: progress.lastAccessedAt,
              }
            : null,
          isFavorite: true,
        })),
      };
    },
    {
      detail: {
        summary: 'Get user favorites',
      },
    }
  );
