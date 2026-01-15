import { redis } from '@/utils/redis';
import { logger } from '@/utils/logger';

// Ensure Redis is available
if (!redis) {
  throw new Error('Redis is required for StateService. Please configure REDIS_URL in environment variables.');
}

export type UserState = 'awaiting_payment' | 'paid' | 'topic_selected' | 'idle';

export interface UserStateData {
  state: UserState;
  lastActivity: number;
  metadata?: Record<string, any>;
}

export class StateService {
  private readonly STATE_PREFIX = 'user:state:';
  private readonly DEFAULT_TTL = 3600; // 1 hour

  /**
   * Set user state with optional TTL
   */
  async setState(
    userId: number,
    state: UserState,
    metadata?: Record<string, any>,
    ttlSeconds?: number
  ): Promise<void> {
    const key = this.getKey(userId);
    const data: UserStateData = {
      state,
      lastActivity: Date.now(),
      metadata,
    };

    try {
      const serialized = JSON.stringify(data);
      const ttl = ttlSeconds ?? this.DEFAULT_TTL;

      await redis.setex(key, ttl, serialized);

      logger.debug(
        { userId, state, ttl },
        'User state set'
      );
    } catch (error) {
      logger.error(
        { error, userId, state },
        'Failed to set user state'
      );
      throw error;
    }
  }

  /**
   * Get user state
   */
  async getState(userId: number): Promise<UserStateData | null> {
    const key = this.getKey(userId);

    try {
      const data = await redis.get(key);

      if (!data) {
        return null;
      }

      return JSON.parse(data) as UserStateData;
    } catch (error) {
      logger.error(
        { error, userId },
        'Failed to get user state'
      );
      return null;
    }
  }

  /**
   * Check if user has specific state
   */
  async hasState(userId: number, state: UserState): Promise<boolean> {
    const data = await this.getState(userId);
    return data?.state === state;
  }

  /**
   * Update user metadata without changing state
   */
  async updateMetadata(
    userId: number,
    metadata: Record<string, any>
  ): Promise<void> {
    const current = await this.getState(userId);

    if (!current) {
      logger.warn({ userId }, 'Cannot update metadata - no state found');
      return;
    }

    await this.setState(
      userId,
      current.state,
      { ...current.metadata, ...metadata }
    );
  }

  /**
   * Delete user state
   */
  async deleteState(userId: number): Promise<void> {
    const key = this.getKey(userId);

    try {
      await redis.del(key);
      logger.debug({ userId }, 'User state deleted');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to delete user state');
    }
  }

  /**
   * Get all active users (with any state)
   * Use with caution - can be expensive for large datasets
   */
  async getActiveUsers(): Promise<number[]> {
    try {
      const pattern = `${this.STATE_PREFIX}*`;
      const keys = await redis.keys(pattern);

      return keys.map((key) => {
        const userId = key.replace(this.STATE_PREFIX, '');
        return parseInt(userId, 10);
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get active users');
      return [];
    }
  }

  /**
   * Extend TTL for user state
   */
  async extendTTL(userId: number, ttlSeconds?: number): Promise<void> {
    const key = this.getKey(userId);
    const ttl = ttlSeconds ?? this.DEFAULT_TTL;

    try {
      await redis.expire(key, ttl);
      logger.debug({ userId, ttl }, 'User state TTL extended');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to extend TTL');
    }
  }

  /**
   * Get remaining TTL for user state
   */
  async getTTL(userId: number): Promise<number> {
    const key = this.getKey(userId);

    try {
      return await redis.ttl(key);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get TTL');
      return -1;
    }
  }

  /**
   * Batch set states for multiple users
   */
  async batchSetState(
    users: Array<{ userId: number; state: UserState; metadata?: Record<string, any> }>,
    ttlSeconds?: number
  ): Promise<void> {
    const pipeline = redis.pipeline();
    const ttl = ttlSeconds ?? this.DEFAULT_TTL;

    for (const { userId, state, metadata } of users) {
      const key = this.getKey(userId);
      const data: UserStateData = {
        state,
        lastActivity: Date.now(),
        metadata,
      };
      pipeline.setex(key, ttl, JSON.stringify(data));
    }

    try {
      await pipeline.exec();
      logger.info({ count: users.length }, 'Batch state set completed');
    } catch (error) {
      logger.error({ error, count: users.length }, 'Failed to batch set states');
      throw error;
    }
  }

  /**
   * Clean up expired states (manual cleanup if needed)
   * Redis automatically removes expired keys, but this can be used for manual cleanup
   */
  async cleanupExpired(): Promise<number> {
    try {
      const pattern = `${this.STATE_PREFIX}*`;
      const keys = await redis.keys(pattern);
      let cleaned = 0;

      for (const key of keys) {
        const ttl = await redis.ttl(key);
        if (ttl <= 0) {
          await redis.del(key);
          cleaned++;
        }
      }

      logger.info({ cleaned }, 'Expired states cleaned up');
      return cleaned;
    } catch (error) {
      logger.error({ error }, 'Failed to cleanup expired states');
      return 0;
    }
  }

  /**
   * Get key for user state
   */
  private getKey(userId: number): string {
    return `${this.STATE_PREFIX}${userId}`;
  }
}

// Singleton instance
export const stateService = new StateService();
