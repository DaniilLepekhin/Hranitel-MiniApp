import { Elysia, t } from 'elysia';
import { eq } from 'drizzle-orm';
import { db, users } from '@/db';
import { authMiddleware } from '@/middlewares/auth';
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
    async ({ user, body }) => {
      const { settings, languageCode } = body;

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

      const [updatedUser] = await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, user!.id))
        .returning();

      return {
        success: true,
        user: {
          id: updatedUser.id,
          settings: updatedUser.settings,
          languageCode: updatedUser.languageCode,
        },
      };
    },
    {
      body: t.Object({
        settings: t.Optional(t.Record(t.String(), t.Unknown())),
        languageCode: t.Optional(t.String()),
      }),
      detail: {
        summary: 'Update user profile',
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
