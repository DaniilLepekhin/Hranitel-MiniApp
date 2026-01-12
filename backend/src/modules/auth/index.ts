import { Elysia, t } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { eq } from 'drizzle-orm';
import { db, users, type User } from '@/db';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import { validateTelegramInitData, parseTelegramUser, authMiddleware } from '@/middlewares/auth';
import { authRateLimit } from '@/middlewares/rateLimit';

export const authModule = new Elysia({ prefix: '/auth', tags: ['Auth'] })
  .use(authRateLimit)
  .use(
    jwt({
      name: 'jwt',
      secret: config.JWT_SECRET,
      exp: '30d',
    })
  )
  // Login via Telegram WebApp
  .post(
    '/telegram',
    async ({ body, jwt, cookie, set }) => {
      const { initData, initDataUnsafe } = body;

      // Validate initData
      if (!validateTelegramInitData(initData)) {
        set.status = 401;
        return {
          success: false,
          error: 'Invalid Telegram initData',
        };
      }

      // Parse user data
      const telegramUser = parseTelegramUser(initData) || initDataUnsafe?.user;

      if (!telegramUser?.id) {
        set.status = 400;
        return {
          success: false,
          error: 'User data not found',
        };
      }

      try {
        // Find or create user
        let [user] = await db
          .select()
          .from(users)
          .where(eq(users.telegramId, String(telegramUser.id)))
          .limit(1);

        if (user) {
          // Update existing user
          [user] = await db
            .update(users)
            .set({
              username: telegramUser.username || user.username,
              firstName: telegramUser.first_name || user.firstName,
              lastName: telegramUser.last_name || user.lastName,
              photoUrl: telegramUser.photo_url || user.photoUrl,
              languageCode: telegramUser.language_code || user.languageCode,
              updatedAt: new Date(),
            })
            .where(eq(users.id, user.id))
            .returning();
        } else {
          // Create new user
          [user] = await db
            .insert(users)
            .values({
              telegramId: String(telegramUser.id),
              username: telegramUser.username,
              firstName: telegramUser.first_name,
              lastName: telegramUser.last_name,
              photoUrl: telegramUser.photo_url,
              languageCode: telegramUser.language_code || 'ru',
            })
            .returning();

          logger.info({ telegramId: telegramUser.id }, 'New user registered');
        }

        // Generate JWT
        const token = await jwt.sign({
          userId: user.id,
          telegramId: user.telegramId,
        });

        // Set httpOnly cookie
        cookie.auth_token.set({
          value: token,
          httpOnly: true,
          secure: config.NODE_ENV === 'production',
          sameSite: config.NODE_ENV === 'production' ? 'strict' : 'lax',
          path: '/',
          maxAge: 30 * 24 * 60 * 60, // 30 days
        });

        return {
          success: true,
          user: {
            id: user.id,
            telegramId: user.telegramId,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            photoUrl: user.photoUrl,
            level: user.level,
            experience: user.experience,
            streak: user.streak,
            isPro: user.isPro,
          },
          token,
        };
      } catch (error) {
        logger.error({ error }, 'Auth error');
        set.status = 500;
        return {
          success: false,
          error: 'Authentication failed',
        };
      }
    },
    {
      body: t.Object({
        initData: t.String(),
        initDataUnsafe: t.Optional(
          t.Object({
            user: t.Optional(
              t.Object({
                id: t.Number(),
                first_name: t.Optional(t.String()),
                last_name: t.Optional(t.String()),
                username: t.Optional(t.String()),
                photo_url: t.Optional(t.String()),
                language_code: t.Optional(t.String()),
              })
            ),
          })
        ),
      }),
      detail: {
        summary: 'Login via Telegram WebApp',
        description: 'Authenticate user using Telegram WebApp initData',
      },
    }
  )
  // Refresh token
  .post(
    '/refresh',
    async ({ jwt, cookie, set }) => {
      const token = cookie?.auth_token?.value;

      if (!token) {
        set.status = 401;
        return {
          success: false,
          error: 'No token provided',
        };
      }

      try {
        const payload = await jwt.verify(token);

        if (!payload || typeof payload.userId !== 'string') {
          set.status = 401;
          return {
            success: false,
            error: 'Invalid token',
          };
        }

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, payload.userId))
          .limit(1);

        if (!user) {
          set.status = 401;
          return {
            success: false,
            error: 'User not found',
          };
        }

        // Generate new token
        const newToken = await jwt.sign({
          userId: user.id,
          telegramId: user.telegramId,
        });

        cookie.auth_token.set({
          value: newToken,
          httpOnly: true,
          secure: config.NODE_ENV === 'production',
          sameSite: config.NODE_ENV === 'production' ? 'strict' : 'lax',
          path: '/',
          maxAge: 30 * 24 * 60 * 60,
        });

        return {
          success: true,
          token: newToken,
        };
      } catch (error) {
        set.status = 401;
        return {
          success: false,
          error: 'Token refresh failed',
        };
      }
    },
    {
      detail: {
        summary: 'Refresh auth token',
      },
    }
  )
  // Get current user
  .use(authMiddleware)
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
          level: user!.level,
          experience: user!.experience,
          streak: user!.streak,
          isPro: user!.isPro,
          subscriptionExpires: user!.subscriptionExpires,
          createdAt: user!.createdAt,
        },
      };
    },
    {
      detail: {
        summary: 'Get current user',
      },
    }
  )
  // Logout
  .post(
    '/logout',
    async ({ cookie }) => {
      cookie.auth_token.remove();

      return {
        success: true,
        message: 'Logged out successfully',
      };
    },
    {
      detail: {
        summary: 'Logout',
      },
    }
  );
