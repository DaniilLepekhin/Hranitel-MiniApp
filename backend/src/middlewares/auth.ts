import { Elysia } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { createHmac } from 'crypto';
import { eq } from 'drizzle-orm';
import { db, users, type User } from '@/db';
import { config } from '@/config';
import { logger } from '@/utils/logger';

// Validate Telegram WebApp initData
export function validateTelegramInitData(initData: string): boolean {
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');

    if (!hash) return false;

    urlParams.delete('hash');

    // Sort params alphabetically
    const dataCheckArr: string[] = [];
    urlParams.sort();
    urlParams.forEach((value, key) => {
      dataCheckArr.push(`${key}=${value}`);
    });
    const dataCheckString = dataCheckArr.join('\n');

    // Create HMAC-SHA256
    const secretKey = createHmac('sha256', 'WebAppData')
      .update(config.TELEGRAM_BOT_TOKEN)
      .digest();

    const calculatedHash = createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // Verify hash
    if (calculatedHash !== hash) {
      return false;
    }

    // Check auth_date (5 minutes tolerance)
    const authDate = urlParams.get('auth_date');
    if (authDate) {
      const authTimestamp = parseInt(authDate, 10) * 1000;
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;

      // Allow some tolerance for time differences
      if (Math.abs(now - authTimestamp) > fiveMinutes + 60000) {
        logger.warn({ authDate, now }, 'Telegram initData expired');
        return false;
      }
    }

    return true;
  } catch (error) {
    logger.error({ error }, 'Error validating Telegram initData');
    return false;
  }
}

// Parse Telegram user from initData
export function parseTelegramUser(initData: string): {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
} | null {
  try {
    const urlParams = new URLSearchParams(initData);
    const userJson = urlParams.get('user');

    if (!userJson) return null;

    return JSON.parse(userJson);
  } catch {
    return null;
  }
}

// Auth middleware
export const authMiddleware = new Elysia({ name: 'auth' })
  .use(
    jwt({
      name: 'jwt',
      secret: config.JWT_SECRET,
      exp: '30d',
    })
  )
  .derive(async ({ headers, jwt, cookie }) => {
    // Try to get token from httpOnly cookie first
    let token: string | undefined = cookie?.auth_token?.value;

    // Fallback to Authorization header
    if (!token) {
      const authHeader = headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      return { user: null as User | null, authError: 'No token provided' };
    }

    try {
      const payload = await jwt.verify(token);

      if (!payload || typeof payload.userId !== 'string') {
        return { user: null as User | null, authError: 'Invalid token' };
      }

      // Load user from database
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, payload.userId))
        .limit(1);

      if (!user) {
        return { user: null as User | null, authError: 'User not found' };
      }

      return { user, authError: null };
    } catch (error) {
      logger.error({ error }, 'JWT verification error');
      return { user: null as User | null, authError: 'Token verification failed' };
    }
  })
  .onBeforeHandle(({ user, authError, set }) => {
    logger.info({ user: user ? 'present' : 'missing', authError }, 'Auth middleware check');
    if (!user) {
      set.status = 401;
      logger.warn({ authError }, 'Unauthorized access attempt');
      return {
        success: false,
        error: 'Unauthorized',
        message: authError || 'Authentication required',
      };
    }
  });

// Optional auth (doesn't require login)
export const optionalAuthMiddleware = new Elysia({ name: 'optionalAuth' })
  .use(
    jwt({
      name: 'jwt',
      secret: config.JWT_SECRET,
      exp: '30d',
    })
  )
  .derive(async ({ headers, jwt, cookie }) => {
    let token: string | undefined = cookie?.auth_token?.value;

    if (!token) {
      const authHeader = headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      return { user: null as User | null };
    }

    try {
      const payload = await jwt.verify(token);

      if (!payload || typeof payload.userId !== 'string') {
        return { user: null as User | null };
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, payload.userId))
        .limit(1);

      return { user: user || null };
    } catch {
      return { user: null as User | null };
    }
  });
