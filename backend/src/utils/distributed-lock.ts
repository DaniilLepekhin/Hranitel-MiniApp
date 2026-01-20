import { redis } from '@/utils/redis';
import { logger } from '@/utils/logger';

/**
 * 🔐 Distributed Lock using Redis (Redlock Algorithm)
 *
 * Senior-level distributed locking для:
 * - Предотвращение duplicate task execution в horizontal scaling
 * - Защита critical sections
 * - Graceful degradation если Redis недоступен
 *
 * Based on Redlock algorithm: https://redis.io/topics/distlock
 *
 * Use cases:
 * - Scheduler task execution (prevent duplicates across multiple instances)
 * - Payment processing (prevent double charges)
 * - Critical database operations
 */

interface LockOptions {
  ttl?: number;           // Lock TTL in milliseconds (default: 30000 = 30s)
  retryDelay?: number;    // Delay between retry attempts (default: 100ms)
  retryCount?: number;    // Number of retry attempts (default: 3)
}

interface Lock {
  key: string;
  value: string;
  ttl: number;
  acquired: boolean;
}

/**
 * Generates a unique lock value (prevents accidental unlock by other processes)
 */
function generateLockValue(): string {
  return `${process.pid}:${Date.now()}:${Math.random().toString(36)}`;
}

/**
 * Attempts to acquire a distributed lock
 *
 * @param key - Lock key (e.g., 'scheduler:task:payment_check:12345')
 * @param options - Lock options
 * @returns Lock object or null if failed to acquire
 */
export async function acquireLock(
  key: string,
  options: LockOptions = {}
): Promise<Lock | null> {
  const {
    ttl = 30000,          // 30 seconds default
    retryDelay = 100,     // 100ms between retries
    retryCount = 3,       // 3 retry attempts
  } = options;

  if (!redis) {
    logger.warn({ key }, 'Redis unavailable, lock not acquired (fail-open)');
    // Fail-open: return a dummy lock that allows operation
    return {
      key,
      value: 'no-redis',
      ttl,
      acquired: false, // Indicates Redis was unavailable
    };
  }

  const lockValue = generateLockValue();
  const lockKey = `lock:${key}`;
  const ttlSeconds = Math.ceil(ttl / 1000);

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      // Try to acquire lock using SET NX (SET if Not eXists) with expiration
      // Redis command: SET key value NX EX seconds
      const result = await redis.set(lockKey, lockValue, 'EX', ttlSeconds, 'NX');

      if (result === 'OK') {
        logger.debug({ key, ttl, attempt }, 'Lock acquired');
        return {
          key: lockKey,
          value: lockValue,
          ttl,
          acquired: true,
        };
      }

      // Lock already held by another process
      if (attempt < retryCount) {
        logger.debug({ key, attempt }, 'Lock held by another process, retrying...');
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    } catch (error) {
      logger.error({ error, key, attempt }, 'Lock acquisition error');

      // On last attempt, fail-open
      if (attempt === retryCount) {
        return {
          key: lockKey,
          value: lockValue,
          ttl,
          acquired: false,
        };
      }
    }
  }

  logger.warn({ key, retryCount }, 'Failed to acquire lock after retries');
  return null;
}

/**
 * Releases a distributed lock
 *
 * Uses Lua script to ensure atomic check-and-delete:
 * - Only deletes if lock value matches (prevents deleting someone else's lock)
 *
 * @param lock - Lock object returned from acquireLock
 * @returns true if successfully released, false otherwise
 */
export async function releaseLock(lock: Lock): Promise<boolean> {
  if (!redis || !lock.acquired) {
    return true; // No-op if Redis unavailable or lock wasn't really acquired
  }

  try {
    // Lua script for atomic check-and-delete
    // Only delete if the lock value matches (prevents deleting another process's lock)
    const luaScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    const result = await redis.eval(luaScript, 1, lock.key, lock.value);

    if (result === 1) {
      logger.debug({ key: lock.key }, 'Lock released');
      return true;
    } else {
      logger.warn({ key: lock.key }, 'Lock already expired or held by another process');
      return false;
    }
  } catch (error) {
    logger.error({ error, key: lock.key }, 'Lock release error');
    return false;
  }
}

/**
 * Extends the TTL of an existing lock
 * Useful for long-running operations
 *
 * @param lock - Lock object
 * @param additionalTtl - Additional TTL in milliseconds
 * @returns true if extended successfully
 */
export async function extendLock(lock: Lock, additionalTtl: number): Promise<boolean> {
  if (!redis || !lock.acquired) {
    return true; // No-op
  }

  try {
    // Lua script to extend TTL only if lock value matches
    const luaScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("expire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;

    const ttlSeconds = Math.ceil(additionalTtl / 1000);
    const result = await redis.eval(luaScript, 1, lock.key, lock.value, ttlSeconds);

    if (result === 1) {
      logger.debug({ key: lock.key, additionalTtl }, 'Lock extended');
      return true;
    } else {
      logger.warn({ key: lock.key }, 'Failed to extend lock (not owned or expired)');
      return false;
    }
  } catch (error) {
    logger.error({ error, key: lock.key }, 'Lock extension error');
    return false;
  }
}

/**
 * High-level utility: Execute function with distributed lock
 *
 * Automatically acquires lock, executes function, releases lock
 * Handles errors gracefully
 *
 * @param key - Lock key
 * @param fn - Function to execute while holding lock
 * @param options - Lock options
 * @returns Result of fn or null if lock couldn't be acquired
 *
 * @example
 * const result = await withLock('scheduler:task:123', async () => {
 *   // Your critical section code here
 *   await processPayment();
 *   return { success: true };
 * }, { ttl: 60000 });
 */
export async function withLock<T>(
  key: string,
  fn: () => Promise<T>,
  options: LockOptions = {}
): Promise<T | null> {
  const lock = await acquireLock(key, options);

  if (!lock) {
    logger.warn({ key }, 'Could not acquire lock, skipping execution');
    return null;
  }

  try {
    // Execute the function
    const result = await fn();
    return result;
  } catch (error) {
    logger.error({ error, key }, 'Error during locked execution');
    throw error; // Re-throw so caller can handle
  } finally {
    // Always release lock, even on error
    await releaseLock(lock);
  }
}

/**
 * Checks if a lock is currently held
 *
 * @param key - Lock key
 * @returns true if lock exists
 */
export async function isLocked(key: string): Promise<boolean> {
  if (!redis) return false;

  try {
    const lockKey = `lock:${key}`;
    const exists = await redis.exists(lockKey);
    return exists === 1;
  } catch (error) {
    logger.error({ error, key }, 'Error checking lock status');
    return false;
  }
}

/**
 * Gets remaining TTL of a lock
 *
 * @param key - Lock key
 * @returns TTL in seconds, -1 if no expiry, -2 if key doesn't exist
 */
export async function getLockTTL(key: string): Promise<number> {
  if (!redis) return -2;

  try {
    const lockKey = `lock:${key}`;
    const ttl = await redis.ttl(lockKey);
    return ttl;
  } catch (error) {
    logger.error({ error, key }, 'Error getting lock TTL');
    return -2;
  }
}

/**
 * Example Usage in Scheduler:
 *
 * // When executing a scheduled task
 * async function executeScheduledTask(taskId: string) {
 *   const lockKey = `scheduler:task:${taskId}`;
 *
 *   const result = await withLock(lockKey, async () => {
 *     // Critical section: only one instance will execute this
 *     await checkPaymentStatus(taskId);
 *     await updateDatabase(taskId);
 *     return { success: true };
 *   }, { ttl: 60000 }); // 60 second lock
 *
 *   if (result === null) {
 *     logger.info({ taskId }, 'Task skipped (already running on another instance)');
 *   }
 * }
 *
 * // For payment processing
 * async function processPayment(paymentId: string) {
 *   const lockKey = `payment:process:${paymentId}`;
 *
 *   const lock = await acquireLock(lockKey, { ttl: 120000 }); // 2 minute lock
 *   if (!lock) {
 *     throw new Error('Payment already being processed');
 *   }
 *
 *   try {
 *     // Process payment
 *     await chargeCustomer(paymentId);
 *     await updatePaymentStatus(paymentId);
 *   } finally {
 *     await releaseLock(lock);
 *   }
 * }
 */
