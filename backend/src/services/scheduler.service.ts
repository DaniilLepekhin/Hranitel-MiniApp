import { redis } from '@/utils/redis';
import { nanoid } from 'nanoid';
import { logger } from '@/utils/logger';

// Ensure Redis is available
if (!redis) {
  throw new Error('Redis is required for SchedulerService. Please configure REDIS_URL in environment variables.');
}

export interface ScheduledTask {
  id: string;
  type: 'start_reminder' | 'five_min_reminder' | 'payment_reminder' | 'final_reminder' | 'day2_reminder' | 'day3_reminder' | 'day4_reminder' | 'day5_final' | 'custom';
  userId: number;
  chatId: number;
  data?: Record<string, any>;
  executeAt: number; // Unix timestamp in milliseconds
}

export class SchedulerService {
  private readonly QUEUE_KEY = 'scheduler:tasks';
  private readonly PROCESSING_KEY = 'scheduler:processing';
  private readonly USER_INDEX_KEY = 'scheduler:user_tasks'; // Hash: {taskId} -> userId for O(1) lookups
  private processingInterval?: Timer;
  private isProcessing = false;

  /**
   * Schedule a task to be executed at a specific time
   * @param task Task details
   * @param executeInMs Delay in milliseconds from now
   * @returns Task ID or null if duplicate exists
   */
  async schedule(
    task: Omit<ScheduledTask, 'id' | 'executeAt'>,
    executeInMs: number
  ): Promise<string | null> {
    // Check for duplicate task (same user + same type)
    const existingTasks = await this.getUserTasks(task.userId);
    const duplicate = existingTasks.find(t => t.type === task.type);
    if (duplicate) {
      logger.info({ userId: task.userId, type: task.type }, 'Duplicate task skipped');
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
      // Add task to Redis sorted set (score = executeAt timestamp)
      // Also add to user index for fast user-specific queries
      await redis
        .multi()
        .zadd(this.QUEUE_KEY, executeAt, JSON.stringify(fullTask))
        .hset(this.USER_INDEX_KEY, taskId, `${task.userId}:${task.type}`)
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
   * @param taskId Task ID to cancel
   */
  async cancel(taskId: string): Promise<boolean> {
    try {
      // Find and remove task by ID
      const tasks = await redis.zrange(this.QUEUE_KEY, 0, -1);
      for (const taskJson of tasks) {
        const task = JSON.parse(taskJson) as ScheduledTask;
        if (task.id === taskId) {
          await redis
            .multi()
            .zrem(this.QUEUE_KEY, taskJson)
            .hdel(this.USER_INDEX_KEY, taskId)
            .exec();
          logger.info({ taskId }, 'Task cancelled');
          return true;
        }
      }
      return false;
    } catch (error) {
      logger.error({ error, taskId }, 'Failed to cancel task');
      return false;
    }
  }

  /**
   * Cancel all tasks of a specific type for a user
   * Optimized for high-volume scenarios (10k+ users)
   * @param userId User ID
   * @param type Task type to cancel
   */
  async cancelUserTasksByType(userId: number, type: ScheduledTask['type']): Promise<number> {
    try {
      // Get all task IDs from user index
      const allTaskMappings = await redis.hgetall(this.USER_INDEX_KEY);
      const tasksToCancel: string[] = [];

      // Find tasks matching userId and type
      for (const [taskId, value] of Object.entries(allTaskMappings)) {
        if (value === `${userId}:${type}`) {
          tasksToCancel.push(taskId);
        }
      }

      if (tasksToCancel.length === 0) {
        return 0;
      }

      // Find and remove from sorted set
      const allTasks = await redis.zrange(this.QUEUE_KEY, 0, -1);
      let cancelled = 0;

      for (const taskJson of allTasks) {
        const task = JSON.parse(taskJson) as ScheduledTask;
        if (tasksToCancel.includes(task.id)) {
          await redis
            .multi()
            .zrem(this.QUEUE_KEY, taskJson)
            .hdel(this.USER_INDEX_KEY, task.id)
            .exec();
          cancelled++;
        }
      }

      logger.info({ userId, type, cancelled }, 'User tasks cancelled by type');
      return cancelled;
    } catch (error) {
      logger.error({ error, userId, type }, 'Failed to cancel user tasks by type');
      return 0;
    }
  }

  /**
   * Start processing scheduled tasks
   * Checks for due tasks every 5 seconds
   */
  startProcessing(callback: (task: ScheduledTask) => Promise<void>): void {
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

            // Atomically move task to processing set to prevent duplicate execution
            const moved = await redis
              .multi()
              .zrem(this.QUEUE_KEY, taskJson)
              .sadd(this.PROCESSING_KEY, taskJson)
              .exec();

            if (!moved || moved[0]?.[1] === 0) {
              // Task was already removed by another process
              return;
            }

            // Execute the task callback
            await callback(task);

            // Remove from processing set and user index after successful execution
            await redis
              .multi()
              .srem(this.PROCESSING_KEY, taskJson)
              .hdel(this.USER_INDEX_KEY, task.id)
              .exec();

            logger.info({ taskId: task.id, type: task.type }, 'Task completed');
          } catch (error) {
            logger.error({ error, taskJson }, 'Task execution failed');
            // Remove from processing set and user index on error too
            const parsedTask = JSON.parse(taskJson) as ScheduledTask;
            await redis
              .multi()
              .srem(this.PROCESSING_KEY, taskJson)
              .hdel(this.USER_INDEX_KEY, parsedTask.id)
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
   * @param userId User ID
   * @returns Number of cancelled tasks
   */
  async cancelAllUserTasks(userId: number): Promise<number> {
    try {
      // Get all task IDs from user index
      const allTaskMappings = await redis.hgetall(this.USER_INDEX_KEY);
      const tasksToCancel: string[] = [];

      // Find all tasks for this user
      for (const [taskId, value] of Object.entries(allTaskMappings)) {
        if (value.startsWith(`${userId}:`)) {
          tasksToCancel.push(taskId);
        }
      }

      if (tasksToCancel.length === 0) {
        return 0;
      }

      // Find and remove from sorted set
      const allTasks = await redis.zrange(this.QUEUE_KEY, 0, -1);
      let cancelled = 0;

      for (const taskJson of allTasks) {
        const task = JSON.parse(taskJson) as ScheduledTask;
        if (tasksToCancel.includes(task.id)) {
          await redis
            .multi()
            .zrem(this.QUEUE_KEY, taskJson)
            .hdel(this.USER_INDEX_KEY, task.id)
            .exec();
          cancelled++;
        }
      }

      logger.info({ userId, cancelled }, 'All user tasks cancelled (user paid)');
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
    try {
      await redis.del(this.QUEUE_KEY);
      await redis.del(this.PROCESSING_KEY);
      await redis.del(this.USER_INDEX_KEY);
      logger.warn('All scheduled tasks cleared');
    } catch (error) {
      logger.error({ error }, 'Failed to clear tasks');
    }
  }
}

// Singleton instance
export const schedulerService = new SchedulerService();
