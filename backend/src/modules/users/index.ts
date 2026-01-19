import { Elysia, t } from 'elysia';
import { eq } from 'drizzle-orm';
import { db, users } from '@/db';
import { authMiddleware, getUserFromToken } from '@/middlewares/auth';
import { logger } from '@/utils/logger';

export const usersModule = new Elysia({ prefix: '/users', tags: ['Users'] })
  .use(authMiddleware)
  // Get current user profile
  .get(
    '/me',
    async ({ user }) => {
      return {
        success: true,
        user: {
          id: user!.id,
          telegramId: user!.telegramId,
          username: user!.username,
          firstName: user!.firstName,
          lastName: user!.lastName,
          photoUrl: user!.photoUrl,
          languageCode: user!.languageCode,
          level: user!.level,
          experience: user!.experience,
          streak: user!.streak,
          lastActiveDate: user!.lastActiveDate,
          isPro: user!.isPro,
          subscriptionExpires: user!.subscriptionExpires,
          settings: user!.settings,
          createdAt: user!.createdAt,
          updatedAt: user!.updatedAt,
        },
      };
    },
    {
      detail: {
        summary: 'Get current user profile',
      },
    }
  )
  // Update user profile
  .patch(
    '/me',
    async ({ body, headers, set }) => {
      logger.info({ body, authHeader: headers.authorization }, 'PATCH /users/me received');

      // ✅ ПРЯМАЯ ПРОВЕРКА - работает всегда
      const user = await getUserFromToken(headers.authorization);

      if (!user) {
        logger.error('PATCH /users/me: authentication failed');
        set.status = 401;
        return { success: false, error: 'Unauthorized' };
      }

      logger.info({ userId: user.id }, 'PATCH /users/me: user authenticated');

      const { settings, languageCode, firstName, lastName, city } = body;

      const updateData: Partial<typeof users.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (settings !== undefined) {
        updateData.settings = {
          ...(user!.settings as Record<string, unknown> || {}),
          ...settings,
        };
      }

      if (languageCode !== undefined) {
        updateData.languageCode = languageCode;
      }

      if (firstName !== undefined) {
        updateData.firstName = firstName;
      }

      if (lastName !== undefined) {
        updateData.lastName = lastName;
      }

      if (city !== undefined) {
        updateData.city = city;
      }

      const [updatedUser] = await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, user.id))
        .returning();

      logger.info({ userId: user.id, updates: Object.keys(updateData) }, 'User profile updated');

      return {
        success: true,
        user: {
          id: updatedUser.id,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          city: updatedUser.city,
          settings: updatedUser.settings,
          languageCode: updatedUser.languageCode,
        },
      };
    },
    {
      body: t.Object({
        settings: t.Optional(t.Record(t.String(), t.Unknown())),
        languageCode: t.Optional(t.String()),
        firstName: t.Optional(t.String()),
        lastName: t.Optional(t.String()),
        city: t.Optional(t.String()),
      }),
      detail: {
        summary: 'Update user profile (firstName, lastName, city, settings, languageCode)',
      },
    }
  )
  // Get user by ID (public profile)
  .get(
    '/:id',
    async ({ params, set }) => {
      const { id } = params;

      const [user] = await db
        .select({
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          photoUrl: users.photoUrl,
          level: users.level,
          streak: users.streak,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!user) {
        set.status = 404;
        return {
          success: false,
          error: 'User not found',
        };
      }

      return {
        success: true,
        user,
      };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        summary: 'Get user public profile',
      },
    }
  );
