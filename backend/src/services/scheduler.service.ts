import { redis } from '@/utils/redis';
import { nanoid } from 'nanoid';
import { logger } from '@/utils/logger';

// Ensure Redis is available
if (!redis) {
  throw new Error('Redis is required for SchedulerService. Please configure REDIS_URL in environment variables.');
}

export interface ScheduledTask {
  id: string;
  type: 'payment_reminder' | 'final_reminder' | 'custom';
  userId: number;
  chatId: number;
  data?: Record<string, any>;
  executeAt: number; // Unix timestamp in milliseconds
}

export class SchedulerService {
  private readonly QUEUE_KEY = 'scheduler:tasks';
  private readonly PROCESSING_KEY = 'scheduler:processing';
  private processingInterval?: Timer;
  private isProcessing = false;

  /**
   * Schedule a task to be executed at a specific time
   * @param task Task details
   * @param executeInMs Delay in milliseconds from now
   * @returns Task ID
   */
  async schedule(
    task: Omit<ScheduledTask, 'id' | 'executeAt'>,
    executeInMs: number
  ): Promise<string> {
    const taskId = nanoid();
    const executeAt = Date.now() + executeInMs;

    const fullTask: ScheduledTask = {
      ...task,
      id: taskId,
      executeAt,
    };

    try {
      // Add task to Redis sorted set (score = executeAt timestamp)
      await redis.zadd(this.QUEUE_KEY, executeAt, JSON.stringify(fullTask));
      logger.info({ taskId, type: task.type, executeAt }, 'Task scheduled');
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
          await redis.zrem(this.QUEUE_KEY, taskJson);
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

            // Remove from processing set after successful execution
            await redis.srem(this.PROCESSING_KEY, taskJson);

            logger.info({ taskId: task.id, type: task.type }, 'Task completed');
          } catch (error) {
            logger.error({ error, taskJson }, 'Task execution failed');
            // Remove from processing set on error too
            await redis.srem(this.PROCESSING_KEY, taskJson);
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
   * Clear all tasks (use with caution)
   */
  async clearAll(): Promise<void> {
    try {
      await redis.del(this.QUEUE_KEY);
      await redis.del(this.PROCESSING_KEY);
      logger.warn('All scheduled tasks cleared');
    } catch (error) {
      logger.error({ error }, 'Failed to clear tasks');
    }
  }
}

// Singleton instance
export const schedulerService = new SchedulerService();
