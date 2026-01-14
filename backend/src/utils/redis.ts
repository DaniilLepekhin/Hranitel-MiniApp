import Redis from 'ioredis';
import { config } from '@/config';
import { logger } from './logger';

// Redis is optional - create a mock if not configured
const isRedisEnabled = config.REDIS_URL && config.REDIS_URL.length > 0;

let redisClient: Redis | null = null;

if (isRedisEnabled) {
  const redisUrl = new URL(config.REDIS_URL);
  redisClient = new Redis({
    host: redisUrl.hostname,
    port: parseInt(redisUrl.port) || 6379,
    password: redisUrl.password || undefined,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
  });

  redisClient.on('connect', () => {
    logger.info('✅ Redis connected');
  });

  redisClient.on('error', (err) => {
    logger.error({ err }, '❌ Redis error');
  });

  redisClient.on('close', () => {
    logger.warn('Redis connection closed');
  });
} else {
  logger.warn('⚠️ Redis not configured - caching disabled');
}

export const redis = redisClient;

// Cache helper - works without Redis (no-op if disabled)
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    if (!redis) return null;
    try {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error({ error, key }, 'Cache get error');
      return null;
    }
  },

  async set(key: string, value: unknown, ttl: number = 3600): Promise<void> {
    if (!redis) return;
    try {
      await redis.setex(key, ttl, JSON.stringify(value));
    } catch (error) {
      logger.error({ error, key }, 'Cache set error');
    }
  },

  async del(key: string): Promise<void> {
    if (!redis) return;
    try {
      await redis.del(key);
    } catch (error) {
      logger.error({ error, key }, 'Cache del error');
    }
  },

  async delPattern(pattern: string): Promise<void> {
    if (!redis) return;
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      logger.error({ error, pattern }, 'Cache delPattern error');
    }
  },

  async exists(key: string): Promise<boolean> {
    if (!redis) return false;
    try {
      return (await redis.exists(key)) === 1;
    } catch (error) {
      logger.error({ error, key }, 'Cache exists error');
      return false;
    }
  },
};

export const closeRedisConnection = async () => {
  if (redis) {
    await redis.quit();
    logger.info('Redis connection closed');
  }
};
