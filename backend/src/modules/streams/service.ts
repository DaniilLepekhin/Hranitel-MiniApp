import { db } from '@/db';
import { streamRecordings, streamAttendance, users } from '@/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { logger } from '@/utils/logger';
import { energiesService as energyPointsService } from '../energy-points/service';

export class StreamRecordingsService {
  /**
   * Получить все записи эфиров
   */
  async getAllRecordings(
    options?: {
      category?: string;
      isPublished?: boolean;
      limit?: number;
    }
  ) {
    try {
      let query = db.select().from(streamRecordings);

      // Фильтр по категории
      if (options?.category) {
        const allRecordings = await query;
        query = db.select().from(streamRecordings);
        const filtered = allRecordings.filter(r => r.category === options.category);
        return filtered.sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());
      }

      // Фильтр по опубликованным
      if (options?.isPublished !== undefined) {
        const allRecordings = await query;
        query = db.select().from(streamRecordings);
        const filtered = allRecordings.filter(r => r.isPublished === options.isPublished);
        return filtered
          .sort((a, b) => {
            // Сортируем сначала по sortOrder, потом по дате
            if (a.sortOrder !== b.sortOrder) {
              return a.sortOrder - b.sortOrder;
            }
            return b.recordedAt.getTime() - a.recordedAt.getTime();
          })
          .slice(0, options?.limit || 50);
      }

      const recordings = await query
        .orderBy(desc(streamRecordings.sortOrder), desc(streamRecordings.recordedAt))
        .limit(options?.limit || 50);

      return recordings;
    } catch (error) {
      logger.error('[Recordings] Error getting all recordings:', error);
      throw new Error('Failed to get recordings');
    }
  }

  /**
   * Получить последние записи (опубликованные)
   */
  async getRecentRecordings(limit: number = 10) {
    try {
      const recordings = await db
        .select()
        .from(streamRecordings)
        .where(eq(streamRecordings.isPublished, true))
        .orderBy(desc(streamRecordings.recordedAt))
        .limit(limit);

      return recordings;
    } catch (error) {
      logger.error('[Recordings] Error getting recent recordings:', error);
      throw new Error('Failed to get recent recordings');
    }
  }

  /**
   * Получить популярные записи (по просмотрам)
   */
  async getPopularRecordings(limit: number = 10) {
    try {
      const recordings = await db
        .select()
        .from(streamRecordings)
        .where(eq(streamRecordings.isPublished, true))
        .orderBy(desc(streamRecordings.viewsCount))
        .limit(limit);

      return recordings;
    } catch (error) {
      logger.error('[Recordings] Error getting popular recordings:', error);
      throw new Error('Failed to get popular recordings');
    }
  }

  /**
   * Получить записи по категории
   */
  async getRecordingsByCategory(category: string, limit: number = 20) {
    try {
      return await this.getAllRecordings({ category, isPublished: true, limit });
    } catch (error) {
      logger.error('[Recordings] Error getting recordings by category:', error);
      throw error;
    }
  }

  /**
   * Получить запись по ID
   */
  async getRecordingById(recordingId: string) {
    try {
      const recording = await db
        .select()
        .from(streamRecordings)
        .where(eq(streamRecordings.id, recordingId))
        .limit(1);

      if (recording.length === 0) {
        throw new Error('Recording not found');
      }

      return recording[0];
    } catch (error) {
      logger.error('[Recordings] Error getting recording by ID:', error);
      throw error;
    }
  }

  /**
   * Отметить просмотр записи
   */
  async markWatched(userId: string, recordingId: string) {
    try {
      // Проверяем, что запись существует
      const recording = await this.getRecordingById(recordingId);

      // Проверяем, не отмечался ли уже пользователь
      const existingView = await db
        .select()
        .from(streamAttendance)
        .where(
          and(
            eq(streamAttendance.streamId, recordingId),
            eq(streamAttendance.userId, userId)
          )
        )
        .limit(1);

      if (existingView.length > 0) {
        logger.info(`[Recordings] User ${userId} already watched recording ${recordingId}`);
        return { success: true, alreadyWatched: true };
      }

      // Создаем запись о просмотре
      await db.insert(streamAttendance).values({
        streamId: recordingId,
        userId,
        watchedOnline: true,
        energiesEarned: recording.energiesReward,
      });

      // Увеличиваем счётчик просмотров
      await db
        .update(streamRecordings)
        .set({
          viewsCount: sql`${streamRecordings.viewsCount} + 1`,
        })
        .where(eq(streamRecordings.id, recordingId));

      // Начисляем энергии
      await energyPointsService.awardStreamRecording(userId, recordingId);

      logger.info(
        `[Recordings] User ${userId} watched recording ${recordingId} (energies: ${recording.energiesReward})`
      );

      return {
        success: true,
        energiesEarned: recording.energiesReward,
        alreadyWatched: false,
      };
    } catch (error) {
      logger.error('[Recordings] Error marking watched:', error);
      throw error;
    }
  }

  /**
   * Получить историю просмотров пользователя
   */
  async getUserWatchHistory(userId: string) {
    try {
      const history = await db
        .select({
          id: streamAttendance.id,
          watchedAt: streamAttendance.joinedAt,
          energiesEarned: streamAttendance.energiesEarned,
          // Данные записи
          recordingTitle: streamRecordings.title,
          recordingRecordedAt: streamRecordings.recordedAt,
          recordingHost: streamRecordings.host,
          recordingCategory: streamRecordings.category,
          recordingThumbnail: streamRecordings.thumbnailUrl,
        })
        .from(streamAttendance)
        .leftJoin(streamRecordings, eq(streamAttendance.streamId, streamRecordings.id))
        .where(eq(streamAttendance.userId, userId))
        .orderBy(desc(streamAttendance.joinedAt));

      return history;
    } catch (error) {
      logger.error('[Recordings] Error getting user watch history:', error);
      throw new Error('Failed to get user watch history');
    }
  }

  /**
   * Получить зрителей записи
   */
  async getRecordingViewers(recordingId: string) {
    try {
      const viewers = await db
        .select({
          id: streamAttendance.id,
          userId: streamAttendance.userId,
          watchedAt: streamAttendance.joinedAt,
          energiesEarned: streamAttendance.energiesEarned,
          // Данные пользователя
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          photoUrl: users.photoUrl,
        })
        .from(streamAttendance)
        .leftJoin(users, eq(streamAttendance.userId, users.id))
        .where(eq(streamAttendance.streamId, recordingId))
        .orderBy(desc(streamAttendance.joinedAt));

      return viewers;
    } catch (error) {
      logger.error('[Recordings] Error getting recording viewers:', error);
      throw new Error('Failed to get recording viewers');
    }
  }

  /**
   * Создать новую запись эфира
   */
  async createRecording(data: {
    title: string;
    recordedAt: Date;
    host: string;
    videoUrl: string;
    description?: string;
    duration?: number;
    thumbnailUrl?: string;
    category?: string;
    energiesReward?: number;
    sortOrder?: number;
    isPublished?: boolean;
  }) {
    try {
      const newRecording = await db
        .insert(streamRecordings)
        .values({
          title: data.title,
          description: data.description,
          recordedAt: data.recordedAt,
          videoUrl: data.videoUrl,
          host: data.host,
          duration: data.duration,
          thumbnailUrl: data.thumbnailUrl,
          category: data.category || 'general',
          energiesReward: data.energiesReward || 100,
          sortOrder: data.sortOrder || 0,
          isPublished: data.isPublished ?? true,
          status: 'ended', // Все записи имеют статус 'ended'
        })
        .returning();

      logger.info(`[Recordings] Created new recording "${data.title}"`);

      return newRecording[0];
    } catch (error) {
      logger.error('[Recordings] Error creating recording:', error);
      throw new Error('Failed to create recording');
    }
  }

  /**
   * Обновить запись эфира
   */
  async updateRecording(
    recordingId: string,
    data: {
      title?: string;
      description?: string;
      videoUrl?: string;
      duration?: number;
      thumbnailUrl?: string;
      category?: string;
      energiesReward?: number;
      sortOrder?: number;
      isPublished?: boolean;
    }
  ) {
    try {
      await db
        .update(streamRecordings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(streamRecordings.id, recordingId));

      logger.info(`[Recordings] Recording ${recordingId} updated`);

      return { success: true };
    } catch (error) {
      logger.error('[Recordings] Error updating recording:', error);
      throw error;
    }
  }

  /**
   * Удалить запись эфира
   */
  async deleteRecording(recordingId: string) {
    try {
      await db
        .delete(streamRecordings)
        .where(eq(streamRecordings.id, recordingId));

      logger.info(`[Recordings] Recording ${recordingId} deleted`);

      return { success: true };
    } catch (error) {
      logger.error('[Recordings] Error deleting recording:', error);
      throw error;
    }
  }

  /**
   * Получить статистику записи
   */
  async getRecordingStats(recordingId: string) {
    try {
      const viewers = await this.getRecordingViewers(recordingId);
      const recording = await this.getRecordingById(recordingId);

      const stats = {
        totalViews: recording.viewsCount,
        totalViewers: viewers.length,
        totalEnergiesAwarded: viewers.reduce((sum, v) => sum + v.energiesEarned, 0),
        averageEnergiesPerViewer: viewers.length > 0
          ? viewers.reduce((sum, v) => sum + v.energiesEarned, 0) / viewers.length
          : 0,
      };

      return stats;
    } catch (error) {
      logger.error('[Recordings] Error getting recording stats:', error);
      throw error;
    }
  }

  /**
   * Получить статистику просмотров пользователя
   */
  async getUserWatchStats(userId: string) {
    try {
      const history = await this.getUserWatchHistory(userId);

      const stats = {
        totalRecordingsWatched: history.length,
        totalEnergiesEarned: history.reduce((sum, h) => sum + h.energiesEarned, 0),
        categoriesWatched: [...new Set(history.map(h => h.recordingCategory))],
        lastWatchedAt: history.length > 0 ? history[0].watchedAt : null,
      };

      return stats;
    } catch (error) {
      logger.error('[Recordings] Error getting user watch stats:', error);
      throw error;
    }
  }

  /**
   * Проверить, смотрел ли пользователь запись
   */
  async hasUserWatched(userId: string, recordingId: string): Promise<boolean> {
    try {
      const view = await db
        .select()
        .from(streamAttendance)
        .where(
          and(
            eq(streamAttendance.userId, userId),
            eq(streamAttendance.streamId, recordingId)
          )
        )
        .limit(1);

      return view.length > 0;
    } catch (error) {
      logger.error('[Recordings] Error checking if user watched:', error);
      throw error;
    }
  }
}

export const streamRecordingsService = new StreamRecordingsService();

// Экспортируем также под старым именем для обратной совместимости
export const streamsService = streamRecordingsService;
