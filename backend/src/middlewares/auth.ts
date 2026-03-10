import { Elysia } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { createHmac } from 'crypto';
import { eq } from 'drizzle-orm';
import { db, users, type User } from '@/db';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import type { JWTPayloadSpec } from '@elysiajs/jwt';

// Validate Telegram WebApp initData
export function validateTelegramInitData(initData: string): boolean {
  try {
    logger.info({ 
      hasInitData: !!initData, 
      initDataLength: initData?.length || 0,
      hasBotToken: !!config.TELEGRAM_BOT_TOKEN,
      nodeEnv: config.NODE_ENV
    }, 'validateTelegramInitData called');
    
    // 🔒 SECURITY: In production, BOT_TOKEN is REQUIRED
    if (!config.TELEGRAM_BOT_TOKEN) {
      if (config.NODE_ENV === 'production') {
        logger.error('🔴 CRITICAL: TELEGRAM_BOT_TOKEN not set in production!');
        throw new Error('TELEGRAM_BOT_TOKEN required in production');
      }
      logger.warn('⚠️ DEVELOPMENT MODE: Skipping initData validation (NO BOT TOKEN)');
      logger.warn('⚠️ THIS IS INSECURE - Anyone can impersonate any user!');
      return true;
    }

    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    
    logger.info({ hasHash: !!hash }, 'InitData hash check');

    if (!hash) {
      logger.error('InitData validation failed: no hash');
      return false;
    }

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
    logger.info({ 
      calculatedHash: calculatedHash.substring(0, 20) + '...', 
      providedHash: hash.substring(0, 20) + '...',
      matches: calculatedHash === hash
    }, 'Hash comparison');
    
    if (calculatedHash !== hash) {
      logger.error('InitData validation failed: hash mismatch');
      return false;
    }

    // Check auth_date (24 hours tolerance)
    // Увеличено с 5 минут до 24 часов - безопасность обеспечивается HMAC подписью,
    // а короткий таймаут вызывает проблемы у пользователей с кэшированным WebApp
    const authDate = urlParams.get('auth_date');
    if (authDate) {
      const authTimestamp = parseInt(authDate, 10) * 1000;
      const now = Date.now();
      const twentyFourHours = 24 * 60 * 60 * 1000;

      // Allow 24 hours tolerance - HMAC signature ensures security
      if (now - authTimestamp > twentyFourHours) {
        logger.warn({ authDate, now }, 'Telegram initData expired (older than 24h)');
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

// ✅ ПРОСТАЯ HELPER-ФУНКЦИЯ - работает всегда
export async function getUserFromToken(authHeader: string | undefined): Promise<User | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);

  try {
    // Create JWT instance
    const jwtInstance = jwt({
      name: 'jwt',
      secret: config.JWT_SECRET,
      exp: '30d',
    });

    // Verify token manually
    const payload = await jwtInstance.decorator.jwt.verify(token) as { userId?: string };

    if (!payload || typeof payload.userId !== 'string') {
      return null;
    }

    // Load user from database
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (!user) {
      logger.warn({ userId: payload.userId }, 'User not found in DB');
      return null;
    }

    return user;
  } catch (error) {
    logger.error({ error }, 'JWT verification error');
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
        logger.warn({ userId: payload.userId }, 'authMiddleware: User not found in DB');
        return { user: null as User | null, authError: 'User not found' };
      }

      // Update lastActiveDate (max once per hour to reduce DB writes)
      const now = new Date();
      const lastActive = user.lastActiveDate ? new Date(user.lastActiveDate) : null;
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      if (!lastActive || lastActive < oneHourAgo) {
        // Fire-and-forget: don't await, don't block the request
        db.update(users)
          .set({ lastActiveDate: now })
          .where(eq(users.id, user.id))
          .then(() => {})
          .catch((err) => logger.error({ err, userId: user.id }, 'Failed to update lastActiveDate'));
      }

      return { user, authError: null };
    } catch (error) {
      logger.error({ error }, 'JWT verification error');
      return { user: null as User | null, authError: 'Token verification failed' };
    }
  })
  .onBeforeHandle(({ user, authError, set }) => {
    if (!user) {
      set.status = 401;
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
