import { Elysia } from 'elysia';
import { redis } from '@/utils/redis';
import { logger } from '@/utils/logger';
import { config } from '@/config';

/**
 * 🔒 Rate Limiter Middleware
 *
 * Защищает API от злоупотреблений используя Redis для распределённого rate limiting.
 *
 * Стратегия: Sliding Window (точнее чем Fixed Window)
 *
 * Лимиты по умолчанию:
 * - Анонимные пользователи: 20 req/min
 * - Авторизованные пользователи: 100 req/min
 * - Admin endpoints: 1000 req/min
 */

interface RateLimitConfig {
  windowMs: number;      // Временное окно в миллисекундах
  maxRequests: number;   // Максимум запросов в окне
  keyPrefix?: string;    // Префикс для Redis ключей
  skipSuccessfulRequests?: boolean;  // Не считать успешные запросы
  skipFailedRequests?: boolean;      // Не считать failed запросы
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number;  // Unix timestamp когда лимит сбросится
}

/**
 * Проверяет rate limit для ключа
 */
async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  if (!redis) {
    // Если Redis недоступен, разрешаем все запросы (fail open)
    logger.warn({ key }, 'Redis unavailable, rate limiting disabled');
    return {
      allowed: true,
      limit: config.maxRequests,
      remaining: config.maxRequests,
      reset: Date.now() + config.windowMs
    };
  }

  const now = Date.now();
  const windowStart = now - config.windowMs;
  const redisKey = `${config.keyPrefix || 'ratelimit'}:${key}`;

  try {
    // Используем sorted set для sliding window
    // Score = timestamp, member = unique request ID

    // 1. Удаляем старые записи (вне окна)
    await redis.zremrangebyscore(redisKey, 0, windowStart);

    // 2. Получаем количество запросов в текущем окне
    const requestCount = await redis.zcard(redisKey);

    // 3. Проверяем лимит
    const allowed = requestCount < config.maxRequests;

    if (allowed) {
      // 4. Добавляем текущий запрос
      const requestId = `${now}:${Math.random()}`;
      await redis.zadd(redisKey, now, requestId);

      // 5. Устанавливаем TTL (cleanup)
      await redis.expire(redisKey, Math.ceil(config.windowMs / 1000));
    }

    return {
      allowed,
      limit: config.maxRequests,
      remaining: Math.max(0, config.maxRequests - requestCount - (allowed ? 1 : 0)),
      reset: now + config.windowMs
    };
  } catch (error) {
    logger.error({ error, key }, 'Rate limit check failed');

    // Fail open: разрешаем запрос при ошибке Redis
    return {
      allowed: true,
      limit: config.maxRequests,
      remaining: config.maxRequests,
      reset: now + config.windowMs
    };
  }
}

/**
 * Создаёт rate limiter middleware с заданной конфигурацией
 */
export function rateLimiter(config: RateLimitConfig) {
  return new Elysia({ name: 'rate-limiter' })
    .derive(async ({ request, headers, user, set }) => {
      // Определяем идентификатор для rate limiting
      let identifier: string;

      if (user?.id) {
        // Используем user ID для авторизованных пользователей
        identifier = `user:${user.id}`;
      } else {
        // Используем IP для анонимных (с учётом proxy)
        const ip =
          headers['x-forwarded-for']?.split(',')[0]?.trim() ||
          headers['x-real-ip'] ||
          'unknown';
        identifier = `ip:${ip}`;
      }

      // Проверяем rate limit
      const result = await checkRateLimit(identifier, config);

      // Добавляем rate limit headers
      set.headers['X-RateLimit-Limit'] = result.limit.toString();
      set.headers['X-RateLimit-Remaining'] = result.remaining.toString();
      set.headers['X-RateLimit-Reset'] = result.reset.toString();

      return {
        rateLimitResult: result,
        rateLimitIdentifier: identifier
      };
    })
    .onBeforeHandle(({ rateLimitResult, set, rateLimitIdentifier }) => {
      if (!rateLimitResult.allowed) {
        // Rate limit exceeded
        logger.warn(
          {
            identifier: rateLimitIdentifier,
            limit: rateLimitResult.limit,
            reset: new Date(rateLimitResult.reset).toISOString()
          },
          'Rate limit exceeded'
        );

        set.status = 429;
        set.headers['Retry-After'] = Math.ceil(
          (rateLimitResult.reset - Date.now()) / 1000
        ).toString();

        return {
          success: false,
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: rateLimitResult.reset
        };
      }
    });
}

/**
 * Предустановленные rate limiters для разных endpoint типов
 */

// 🌐 Публичные endpoints (строгий лимит)
export const publicRateLimiter = rateLimiter({
  windowMs: 60 * 1000,      // 1 минута
  maxRequests: 20,          // 20 запросов
  keyPrefix: 'rl:public',
});

// 🔐 Авторизованные endpoints (средний лимит)
export const authRateLimiter = rateLimiter({
  windowMs: 60 * 1000,      // 1 минута
  maxRequests: 100,         // 100 запросов
  keyPrefix: 'rl:auth',
});

// ⚡ Admin endpoints (высокий лимит)
export const adminRateLimiter = rateLimiter({
  windowMs: 60 * 1000,      // 1 минута
  maxRequests: 1000,        // 1000 запросов
  keyPrefix: 'rl:admin',
});

// 🤖 Webhook endpoints (очень строгий лимит)
export const webhookRateLimiter = rateLimiter({
  windowMs: 10 * 1000,      // 10 секунд
  maxRequests: 30,          // 30 запросов (Telegram шлёт часто)
  keyPrefix: 'rl:webhook',
});

// 💳 Payment endpoints (строгий лимит для безопасности)
export const paymentRateLimiter = rateLimiter({
  windowMs: 60 * 1000,      // 1 минута
  maxRequests: 10,          // 10 запросов
  keyPrefix: 'rl:payment',
});

/**
 * Utility: Manually reset rate limit for a key
 * Используется в emergency случаях или для VIP пользователей
 */
export async function resetRateLimit(key: string, prefix: string = 'rl') {
  if (!redis) {
    logger.warn('Redis unavailable, cannot reset rate limit');
    return false;
  }

  try {
    const redisKey = `${prefix}:${key}`;
    await redis.del(redisKey);
    logger.info({ key, prefix }, 'Rate limit reset');
    return true;
  } catch (error) {
    logger.error({ error, key, prefix }, 'Failed to reset rate limit');
    return false;
  }
}

/**
 * Utility: Get current rate limit status
 * Для monitoring и debugging
 */
export async function getRateLimitStatus(
  key: string,
  prefix: string = 'rl'
): Promise<{ count: number; keys: string[] } | null> {
  if (!redis) {
    return null;
  }

  try {
    const redisKey = `${prefix}:${key}`;
    const count = await redis.zcard(redisKey);
    const keys = await redis.zrange(redisKey, 0, -1);
    return { count, keys };
  } catch (error) {
    logger.error({ error, key, prefix }, 'Failed to get rate limit status');
    return null;
  }
}
