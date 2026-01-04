import { Elysia } from 'elysia';
import { redis } from '@/utils/redis';
import { logger } from '@/utils/logger';

interface RateLimitOptions {
  max: number;
  windowSeconds: number;
  prefix: string;
  skipPaths?: string[];
}

// In-memory fallback when Redis is unavailable
const memoryStore = new Map<string, { count: number; resetTime: number }>();

function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }
  return 'unknown';
}

export function createRateLimiter(options: RateLimitOptions) {
  const { max, windowSeconds, prefix, skipPaths = [] } = options;

  return new Elysia({ name: `rateLimit-${prefix}` })
    .onBeforeHandle(async ({ request, set, path }) => {
      // Skip certain paths
      if (skipPaths.some((skip) => path.startsWith(skip))) {
        return;
      }

      const identifier = getClientIP(request);
      const key = `${prefix}:${identifier}`;

      try {
        // Try Redis first
        const current = await redis.incr(key);
        if (current === 1) {
          await redis.expire(key, windowSeconds);
        }

        const ttl = await redis.ttl(key);

        set.headers['X-RateLimit-Limit'] = max.toString();
        set.headers['X-RateLimit-Remaining'] = Math.max(0, max - current).toString();
        set.headers['X-RateLimit-Reset'] = (Date.now() + ttl * 1000).toString();

        if (current > max) {
          set.status = 429;
          set.headers['Retry-After'] = ttl.toString();
          return {
            success: false,
            error: 'Too Many Requests',
            message: `Rate limit exceeded. Try again in ${ttl} seconds`,
          };
        }
      } catch (error) {
        // Fallback to in-memory store
        const now = Date.now();
        const entry = memoryStore.get(key);

        if (!entry || entry.resetTime < now) {
          memoryStore.set(key, { count: 1, resetTime: now + windowSeconds * 1000 });
          return;
        }

        entry.count++;
        if (entry.count > max) {
          const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
          set.status = 429;
          set.headers['Retry-After'] = retryAfter.toString();
          return {
            success: false,
            error: 'Too Many Requests',
            message: `Rate limit exceeded. Try again in ${retryAfter} seconds`,
          };
        }
      }
    });
}

// Pre-configured rate limiters
export const authRateLimit = createRateLimiter({
  max: 5,
  windowSeconds: 60,
  prefix: 'ratelimit:auth',
});

export const apiRateLimit = createRateLimiter({
  max: 100,
  windowSeconds: 60,
  prefix: 'ratelimit:api',
  skipPaths: ['/health', '/docs', '/swagger'],
});

export const webhookRateLimit = createRateLimiter({
  max: 1000,
  windowSeconds: 60,
  prefix: 'ratelimit:webhook',
});
