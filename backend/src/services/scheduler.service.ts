import { redis } from '@/utils/redis';
import { nanoid } from 'nanoid';
import { logger } from '@/utils/logger';
import { withLock } from '@/utils/distributed-lock';

// Check Redis availability
const isRedisAvailable = !!redis;
if (!isRedisAvailable) {
  logger.warn('⚠️ Redis not configured - SchedulerService will be disabled. Scheduled messages will not work.');
}

export interface ScheduledTask {
  id: string;
  type:
    // Existing types
    | 'start_reminder'
    | 'five_min_reminder'
    | 'burning_question_reminder'
    | 'payment_reminder'
    | 'final_reminder'
    | 'day2_reminder'
    | 'day3_reminder'
    | 'day4_reminder'
    | 'day5_final'
    | 'custom'
    | 'payment_check'  // 🆕 Periodic payment status check

    // 🆕 Post-payment onboarding - Keyword
    | 'keyword_reminder_20m'   // Догрев "введи код" через 20 мин
    | 'keyword_reminder_60m'   // Догрев "введи код" через 60 мин
    | 'keyword_reminder_120m'  // Догрев "введи код" через 120 мин

    // 🆕 Post-payment onboarding - Ready button
    | 'ready_reminder_30m'     // Догрев "нажми ГОТОВО" через 30 мин
    | 'ready_reminder_60m'     // Догрев "нажми ГОТОВО" через 60 мин
    | 'ready_final_120m'       // Финальное видео-инструкция через 120 мин

    // 🆕 Engagement funnel (by days)
    | 'day1_gift_promo'        // День 1 в 10:00 МСК - "Подари подписку"
    | 'day7_check_in'          // День 7 в 9:00 МСК - Проверка прогресса
    | 'day14_check_in'         // День 14 в 9:00 МСК
    | 'day21_check_in'         // День 21 в 9:00 МСК
    | 'day28_renewal'          // День 28 в 9:00 МСК - Напоминание о продлении

    // 🆕 Subscription renewal reminders
    | 'renewal_2days'          // За 2 дня до окончания в 9:00 МСК
    | 'renewal_1day'           // За 1 день до окончания в 9:00 МСК
    | 'renewal_today'          // В день окончания в 9:00 МСК

    // 🆕 Gift subscription expiry reminders
    | 'gift_expiry_3days'      // За 3 дня до окончания в 9:00 МСК
    | 'gift_expiry_2days'      // За 2 дня до окончания в 9:00 МСК
    | 'gift_expiry_1day'       // За 1 день до окончания в 9:00 МСК

    // 🆕 Club funnel (numerology-based pre-payment)
    | 'club_auto_progress';    // Авто-прокидывание шага воронки

  userId: number;
  chatId: number;
  data?: Record<string, any>;
  executeAt: number; // Unix timestamp in milliseconds
}

export class SchedulerService {
  private readonly QUEUE_KEY = 'scheduler:tasks';
  private readonly PROCESSING_KEY = 'scheduler:processing';
  private readonly USER_INDEX_KEY = 'scheduler:user_tasks'; // Hash: {taskId} -> "userId:type" for O(1) lookups
  private readonly TASK_DATA_KEY = 'scheduler:task_data'; // Hash: {taskId} -> taskJson for O(1) task lookup
  private processingInterval?: Timer;
  private isProcessing = false;

  /**
   * Schedule a task to be executed at a specific time
   * @param task Task details
   * @param executeInMs Delay in milliseconds from now
   * @returns Task ID or null if duplicate exists or Redis unavailable
   */
  async schedule(
    task: Omit<ScheduledTask, 'id' | 'executeAt'>,
    executeInMs: number
  ): Promise<string | null> {
    if (!isRedisAvailable || !redis) {
      logger.warn({ userId: task.userId, type: task.type }, 'Cannot schedule task - Redis not available');
      return null;
    }

    // Check for duplicate task (same user + same type + same step for club_auto_progress)
    const existingTasks = await this.getUserTasks(task.userId);
    const duplicate = existingTasks.find(t => {
      if (t.type !== task.type) return false;
      // For club_auto_progress, also check the step in data
      if (t.type === 'club_auto_progress' && task.data?.step && t.data?.step) {
        return t.data.step === task.data.step;
      }
      return true;
    });
    if (duplicate) {
      logger.info({ userId: task.userId, type: task.type, step: task.data?.step }, 'Duplicate task skipped');
      return null;
    }

    const taskId = nanoid();
    const executeAt = Date.now() + executeInMs;

    const fullTask: ScheduledTask = {
      ...task,
      id: taskId,
      executeAt,
    };

    try {
      const taskJson = JSON.stringify(fullTask);
      // Add task to Redis sorted set (score = executeAt timestamp)
      // Also add to user index and task data for fast lookups
      await redis
        .multi()
        .zadd(this.QUEUE_KEY, executeAt, taskJson)
        .hset(this.USER_INDEX_KEY, taskId, `${task.userId}:${task.type}`)
        .hset(this.TASK_DATA_KEY, taskId, taskJson)
        .exec();
      logger.info({ taskId, type: task.type, executeAt, userId: task.userId }, 'Task scheduled');
      return taskId;
    } catch (error) {
      logger.error({ error, task }, 'Failed to schedule task');
      throw error;
    }
  }

  /**
   * Cancel a scheduled task
   * ⚡ Optimized: O(1) lookup using TASK_DATA_KEY
   * @param taskId Task ID to cancel
   */
  async cancel(taskId: string): Promise<boolean> {
    if (!isRedisAvailable || !redis) {
      return false;
    }

    try {
      // ⚡ O(1) lookup from task data hash
      const taskJson = await redis.hget(this.TASK_DATA_KEY, taskId);

      if (!taskJson) {
        return false;
      }

      await redis
        .multi()
        .zrem(this.QUEUE_KEY, taskJson)
        .hdel(this.USER_INDEX_KEY, taskId)
        .hdel(this.TASK_DATA_KEY, taskId)
        .exec();

      logger.info({ taskId }, 'Task cancelled');
      return true;
    } catch (error) {
      logger.error({ error, taskId }, 'Failed to cancel task');
      return false;
    }
  }

  /**
   * Cancel all tasks of a specific type for a user
   * ⚡ Optimized: uses TASK_DATA_KEY hash for O(1) task lookup
   * @param userId User ID
   * @param type Task type to cancel
   */
  async cancelUserTasksByType(userId: number, type: ScheduledTask['type']): Promise<number> {
    if (!isRedisAvailable || !redis) {
      return 0;
    }

    try {
      // Use HSCAN instead of HGETALL for better performance on large sets
      const userTypeKey = `${userId}:${type}`;
      const tasksToCancel: string[] = [];

      // Scan through user index to find matching tasks
      let cursor = '0';
      do {
        const [nextCursor, entries] = await redis.hscan(this.USER_INDEX_KEY, cursor, 'COUNT', 100);
        cursor = nextCursor;

        // entries is [key1, value1, key2, value2, ...]
        for (let i = 0; i < entries.length; i += 2) {
          const taskId = entries[i];
          const value = entries[i + 1];
          if (value === userTypeKey) {
            tasksToCancel.push(taskId);
          }
        }
      } while (cursor !== '0');

      if (tasksToCancel.length === 0) {
        return 0;
      }

      // ⚡ Get task data from hash instead of scanning entire sorted set
      const taskJsons = await redis.hmget(this.TASK_DATA_KEY, ...tasksToCancel);

      // Build multi command for all deletions at once
      const multi = redis.multi();
      let cancelled = 0;

      for (let i = 0; i < tasksToCancel.length; i++) {
        const taskId = tasksToCancel[i];
        const taskJson = taskJsons[i];

        if (taskJson) {
          multi.zrem(this.QUEUE_KEY, taskJson);
        }
        multi.hdel(this.USER_INDEX_KEY, taskId);
        multi.hdel(this.TASK_DATA_KEY, taskId);
        cancelled++;
      }

      if (cancelled > 0) {
        await multi.exec();
        logger.info({ userId, type, cancelled }, 'User tasks cancelled by type');
      }
      return cancelled;
    } catch (error) {
      logger.error({ error, userId, type }, 'Failed to cancel user tasks by type');
      return 0;
    }
  }

  /**
   * Cancel all tasks of multiple types for a user in one batch
   * ⚡ Optimized: uses TASK_DATA_KEY hash for O(1) task lookup instead of ZRANGE
   * @param userId User ID
   * @param types Array of task types to cancel
   */
  async cancelUserTasksByTypes(userId: number, types: ScheduledTask['type'][]): Promise<number> {
    if (!isRedisAvailable || !redis) {
      return 0;
    }

    try {
      // Create a set of user:type keys to match
      const userTypeKeys = new Set(types.map(type => `${userId}:${type}`));
      const tasksToCancel: string[] = [];

      // Single scan through user index to find all matching tasks
      let cursor = '0';
      do {
        const [nextCursor, entries] = await redis.hscan(this.USER_INDEX_KEY, cursor, 'COUNT', 100);
        cursor = nextCursor;

        for (let i = 0; i < entries.length; i += 2) {
          const taskId = entries[i];
          const value = entries[i + 1];
          if (userTypeKeys.has(value)) {
            tasksToCancel.push(taskId);
          }
        }
      } while (cursor !== '0');

      if (tasksToCancel.length === 0) {
        return 0;
      }

      // ⚡ Get task data from hash instead of scanning entire sorted set
      const taskJsons = await redis.hmget(this.TASK_DATA_KEY, ...tasksToCancel);

      // Build multi command for all deletions at once
      const multi = redis.multi();
      let cancelled = 0;

      for (let i = 0; i < tasksToCancel.length; i++) {
        const taskId = tasksToCancel[i];
        const taskJson = taskJsons[i];

        if (taskJson) {
          multi.zrem(this.QUEUE_KEY, taskJson);
        }
        multi.hdel(this.USER_INDEX_KEY, taskId);
        multi.hdel(this.TASK_DATA_KEY, taskId);
        cancelled++;
      }

      if (cancelled > 0) {
        await multi.exec();
        logger.info({ userId, types, cancelled }, 'User tasks cancelled by types (batch)');
      }
      return cancelled;
    } catch (error) {
      logger.error({ error, userId, types }, 'Failed to cancel user tasks by types');
      return 0;
    }
  }

  /**
   * Start processing scheduled tasks
   * Checks for due tasks every 5 seconds
   */
  startProcessing(callback: (task: ScheduledTask) => Promise<void>): void {
    if (!isRedisAvailable || !redis) {
      logger.warn('Cannot start scheduler - Redis not available');
      return;
    }

    if (this.processingInterval) {
      logger.warn('Scheduler already running');
      return;
    }

    logger.info('Starting scheduler');

    this.processingInterval = setInterval(async () => {
      if (this.isProcessing) {
        return; // Skip if previous batch still processing
      }

      this.isProcessing = true;
      try {
        await this.processTasks(callback);
      } catch (error) {
        logger.error({ error }, 'Error processing tasks');
      } finally {
        this.isProcessing = false;
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Stop processing scheduled tasks
   */
  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
      logger.info('Scheduler stopped');
    }
  }

  /**
   * Process due tasks in batches
   */
  private async processTasks(
    callback: (task: ScheduledTask) => Promise<void>
  ): Promise<void> {
    const now = Date.now();

    try {
      // Get tasks that are due (score <= now)
      // Limit to 100 tasks per batch to avoid overwhelming the system
      const dueTasks = await redis.zrangebyscore(
        this.QUEUE_KEY,
        0,
        now,
        'LIMIT',
        0,
        100
      );

      if (dueTasks.length === 0) {
        return;
      }

      logger.info({ count: dueTasks.length }, 'Processing due tasks');

      // Process tasks in parallel but with controlled concurrency
      await Promise.allSettled(
        dueTasks.map(async (taskJson) => {
          try {
            const task = JSON.parse(taskJson) as ScheduledTask;

            // 🔐 Use distributed lock to prevent duplicate execution across instances
            // Lock key includes task ID to ensure per-task locking
            const lockKey = `scheduler:task:${task.id}`;

            const result = await withLock(
              lockKey,
              async () => {
                // Atomically move task to processing set to prevent duplicate execution
                const moved = await redis
                  .multi()
                  .zrem(this.QUEUE_KEY, taskJson)
                  .sadd(this.PROCESSING_KEY, taskJson)
                  .exec();

                if (!moved || moved[0]?.[1] === 0) {
                  // Task was already removed by another process
                  logger.debug({ taskId: task.id }, 'Task already processed by another instance');
                  return null;
                }

                // Execute the task callback
                await callback(task);

                // Remove from processing set, user index, and task data after successful execution
                await redis
                  .multi()
                  .srem(this.PROCESSING_KEY, taskJson)
                  .hdel(this.USER_INDEX_KEY, task.id)
                  .hdel(this.TASK_DATA_KEY, task.id)
                  .exec();

                logger.info({ taskId: task.id, type: task.type }, 'Task completed');
                return true;
              },
              { ttl: 60000, retryCount: 0 } // 60s lock, no retries (skip if locked)
            );

            if (result === null) {
              logger.debug({ taskId: task.id }, 'Task skipped (locked by another instance)');
            }
          } catch (error) {
            logger.error({ error, taskJson }, 'Task execution failed');
            // Remove from processing set, user index, and task data on error too
            const parsedTask = JSON.parse(taskJson) as ScheduledTask;
            await redis
              .multi()
              .srem(this.PROCESSING_KEY, taskJson)
              .hdel(this.USER_INDEX_KEY, parsedTask.id)
              .hdel(this.TASK_DATA_KEY, parsedTask.id)
              .exec();
          }
        })
      );
    } catch (error) {
      logger.error({ error }, 'Failed to fetch due tasks');
    }
  }

  /**
   * Get count of pending tasks
   */
  async getPendingCount(): Promise<number> {
    if (!isRedisAvailable || !redis) {
      return 0;
    }

    try {
      return await redis.zcard(this.QUEUE_KEY);
    } catch (error) {
      logger.error({ error }, 'Failed to get pending count');
      return 0;
    }
  }

  /**
   * Get tasks for a specific user
   */
  async getUserTasks(userId: number): Promise<ScheduledTask[]> {
    if (!isRedisAvailable || !redis) {
      return [];
    }

    try {
      const allTasks = await redis.zrange(this.QUEUE_KEY, 0, -1);
      const userTasks: ScheduledTask[] = [];

      for (const taskJson of allTasks) {
        const task = JSON.parse(taskJson) as ScheduledTask;
        if (task.userId === userId) {
          userTasks.push(task);
        }
      }

      return userTasks;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get user tasks');
      return [];
    }
  }

  /**
   * Cancel ALL tasks for a specific user (when user pays)
   * ⚡ Optimized: uses TASK_DATA_KEY hash for O(1) task lookup
   * @param userId User ID
   * @returns Number of cancelled tasks
   */
  async cancelAllUserTasks(userId: number): Promise<number> {
    if (!isRedisAvailable || !redis) {
      return 0;
    }

    try {
      // Scan through user index to find all tasks for this user
      const tasksToCancel: string[] = [];
      let cursor = '0';

      do {
        const [nextCursor, entries] = await redis.hscan(this.USER_INDEX_KEY, cursor, 'COUNT', 100);
        cursor = nextCursor;

        for (let i = 0; i < entries.length; i += 2) {
          const taskId = entries[i];
          const value = entries[i + 1];
          if (value.startsWith(`${userId}:`)) {
            tasksToCancel.push(taskId);
          }
        }
      } while (cursor !== '0');

      if (tasksToCancel.length === 0) {
        return 0;
      }

      // ⚡ Get task data from hash instead of scanning entire sorted set
      const taskJsons = await redis.hmget(this.TASK_DATA_KEY, ...tasksToCancel);

      // Build multi command for all deletions at once
      const multi = redis.multi();
      let cancelled = 0;

      for (let i = 0; i < tasksToCancel.length; i++) {
        const taskId = tasksToCancel[i];
        const taskJson = taskJsons[i];

        if (taskJson) {
          multi.zrem(this.QUEUE_KEY, taskJson);
        }
        multi.hdel(this.USER_INDEX_KEY, taskId);
        multi.hdel(this.TASK_DATA_KEY, taskId);
        cancelled++;
      }

      if (cancelled > 0) {
        await multi.exec();
        logger.info({ userId, cancelled }, 'All user tasks cancelled (user paid)');
      }
      return cancelled;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to cancel all user tasks');
      return 0;
    }
  }

  /**
   * Clear all tasks (use with caution)
   */
  async clearAll(): Promise<void> {
    if (!isRedisAvailable || !redis) {
      return;
    }

    try {
      await redis.del(this.QUEUE_KEY);
      await redis.del(this.PROCESSING_KEY);
      await redis.del(this.USER_INDEX_KEY);
      await redis.del(this.TASK_DATA_KEY);
      logger.warn('All scheduled tasks cleared');
    } catch (error) {
      logger.error({ error }, 'Failed to clear tasks');
    }
  }
}

// Singleton instance
export const schedulerService = new SchedulerService();
