import Redis from 'ioredis';
import { config } from '@/config';
import { logger } from './logger';

const redisUrl = new URL(config.REDIS_URL);

export const redis = new Redis({
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port) || 6379,
  password: redisUrl.password || undefined,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
});

redis.on('connect', () => {
  logger.info('✅ Redis connected');
});

redis.on('error', (err) => {
  logger.error({ err }, '❌ Redis error');
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

// Cache helper
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error({ error, key }, 'Cache get error');
      return null;
    }
  },

  async set(key: string, value: unknown, ttl: number = 3600): Promise<void> {
    try {
      await redis.setex(key, ttl, JSON.stringify(value));
    } catch (error) {
      logger.error({ error, key }, 'Cache set error');
    }
  },

  async del(key: string): Promise<void> {
    try {
      await redis.del(key);
    } catch (error) {
      logger.error({ error, key }, 'Cache del error');
    }
  },

  async delPattern(pattern: string): Promise<void> {
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
    try {
      return (await redis.exists(key)) === 1;
    } catch (error) {
      logger.error({ error, key }, 'Cache exists error');
      return false;
    }
  },
};

export const closeRedisConnection = async () => {
  await redis.quit();
  logger.info('Redis connection closed');
};
