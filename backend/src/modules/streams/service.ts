import { db } from '@/db';
import { liveStreams, streamAttendance, users } from '@/db/schema';
import { eq, and, gte, desc, sql } from 'drizzle-orm';
import { logger } from '@/utils/logger';
import { energyPointsService } from '../energy-points/service';

export class StreamsService {
  /**
   * Получить предстоящие эфиры
   */
  async getUpcomingStreams(limit: number = 10) {
    try {
      const now = new Date();

      const streams = await db
        .select()
        .from(liveStreams)
        .where(gte(liveStreams.scheduledAt, now))
        .orderBy(liveStreams.scheduledAt)
        .limit(limit);

      return streams;
    } catch (error) {
      logger.error('[Streams] Error getting upcoming streams:', error);
      throw new Error('Failed to get upcoming streams');
    }
  }

  /**
   * Получить ближайший эфир
   */
  async getNextStream() {
    try {
      const streams = await this.getUpcomingStreams(1);
      return streams.length > 0 ? streams[0] : null;
    } catch (error) {
      logger.error('[Streams] Error getting next stream:', error);
      throw error;
    }
  }

  /**
   * Получить все эфиры (прошлые и будущие)
   */
  async getAllStreams(status?: 'scheduled' | 'live' | 'ended') {
    try {
      const query = db.select().from(liveStreams);

      if (status) {
        const allStreams = await query;
        return allStreams.filter(stream => stream.status === status);
      }

      return await query.orderBy(desc(liveStreams.scheduledAt));
    } catch (error) {
      logger.error('[Streams] Error getting all streams:', error);
      throw new Error('Failed to get streams');
    }
  }

  /**
   * Получить эфир по ID
   */
  async getStreamById(streamId: string) {
    try {
      const stream = await db
        .select()
        .from(liveStreams)
        .where(eq(liveStreams.id, streamId))
        .limit(1);

      if (stream.length === 0) {
        throw new Error('Stream not found');
      }

      return stream[0];
    } catch (error) {
      logger.error('[Streams] Error getting stream by ID:', error);
      throw error;
    }
  }

  /**
   * Отметить посещение эфира
   */
  async markAttendance(userId: string, streamId: string, watchedOnline: boolean = false) {
    try {
      // Проверяем, что эфир существует
      const stream = await this.getStreamById(streamId);

      // Проверяем, не отмечался ли уже пользователь
      const existingAttendance = await db
        .select()
        .from(streamAttendance)
        .where(
          and(
            eq(streamAttendance.streamId, streamId),
            eq(streamAttendance.userId, userId)
          )
        )
        .limit(1);

      if (existingAttendance.length > 0) {
        // Если уже отмечался, обновляем только если теперь был онлайн
        if (watchedOnline && !existingAttendance[0].watchedOnline) {
          await db
            .update(streamAttendance)
            .set({
              watchedOnline: true,
              epEarned: stream.epReward,
            })
            .where(eq(streamAttendance.id, existingAttendance[0].id));

          // Начисляем дополнительные EP
          await energyPointsService.awardLiveStream(userId, streamId, true);

          logger.info(`[Streams] Updated attendance for user ${userId} to online for stream ${streamId}`);
        }

        return { success: true, updated: true };
      }

      // Определяем награду
      const epReward = watchedOnline ? stream.epReward : 10;

      // Создаем запись о посещении
      await db.insert(streamAttendance).values({
        streamId,
        userId,
        watchedOnline,
        epEarned: epReward,
      });

      // Начисляем EP
      await energyPointsService.awardLiveStream(userId, streamId, watchedOnline);

      logger.info(
        `[Streams] User ${userId} marked attendance for stream ${streamId} (online: ${watchedOnline}, EP: ${epReward})`
      );

      return {
        success: true,
        epEarned: epReward,
        watchedOnline,
      };
    } catch (error) {
      logger.error('[Streams] Error marking attendance:', error);
      throw error;
    }
  }

  /**
   * Получить историю посещений пользователя
   */
  async getUserAttendance(userId: string) {
    try {
      const attendance = await db
        .select({
          id: streamAttendance.id,
          joinedAt: streamAttendance.joinedAt,
          watchedOnline: streamAttendance.watchedOnline,
          epEarned: streamAttendance.epEarned,
          // Данные эфира
          streamTitle: liveStreams.title,
          streamScheduledAt: liveStreams.scheduledAt,
          streamHost: liveStreams.host,
        })
        .from(streamAttendance)
        .leftJoin(liveStreams, eq(streamAttendance.streamId, liveStreams.id))
        .where(eq(streamAttendance.userId, userId))
        .orderBy(desc(streamAttendance.joinedAt));

      return attendance;
    } catch (error) {
      logger.error('[Streams] Error getting user attendance:', error);
      throw new Error('Failed to get user attendance');
    }
  }

  /**
   * Получить участников эфира
   */
  async getStreamAttendees(streamId: string) {
    try {
      const attendees = await db
        .select({
          id: streamAttendance.id,
          userId: streamAttendance.userId,
          joinedAt: streamAttendance.joinedAt,
          watchedOnline: streamAttendance.watchedOnline,
          epEarned: streamAttendance.epEarned,
          // Данные пользователя
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          photoUrl: users.photoUrl,
        })
        .from(streamAttendance)
        .leftJoin(users, eq(streamAttendance.userId, users.id))
        .where(eq(streamAttendance.streamId, streamId))
        .orderBy(desc(streamAttendance.joinedAt));

      return attendees;
    } catch (error) {
      logger.error('[Streams] Error getting stream attendees:', error);
      throw new Error('Failed to get stream attendees');
    }
  }

  /**
   * Создать новый эфир
   */
  async createStream(
    title: string,
    scheduledAt: Date,
    host: string,
    description?: string,
    streamUrl?: string,
    epReward: number = 100
  ) {
    try {
      const newStream = await db
        .insert(liveStreams)
        .values({
          title,
          description,
          scheduledAt,
          streamUrl,
          host,
          epReward,
          status: 'scheduled',
        })
        .returning();

      logger.info(`[Streams] Created new stream "${title}" scheduled for ${scheduledAt}`);

      return newStream[0];
    } catch (error) {
      logger.error('[Streams] Error creating stream:', error);
      throw new Error('Failed to create stream');
    }
  }

  /**
   * Обновить статус эфира
   */
  async updateStreamStatus(streamId: string, status: 'scheduled' | 'live' | 'ended') {
    try {
      await db
        .update(liveStreams)
        .set({ status, updatedAt: new Date() })
        .where(eq(liveStreams.id, streamId));

      logger.info(`[Streams] Stream ${streamId} status updated to ${status}`);

      return { success: true };
    } catch (error) {
      logger.error('[Streams] Error updating stream status:', error);
      throw error;
    }
  }

  /**
   * Получить статистику эфира
   */
  async getStreamStats(streamId: string) {
    try {
      const attendees = await this.getStreamAttendees(streamId);

      const stats = {
        totalAttendees: attendees.length,
        onlineAttendees: attendees.filter(a => a.watchedOnline).length,
        offlineAttendees: attendees.filter(a => !a.watchedOnline).length,
        totalEpAwarded: attendees.reduce((sum, a) => sum + a.epEarned, 0),
      };

      return stats;
    } catch (error) {
      logger.error('[Streams] Error getting stream stats:', error);
      throw error;
    }
  }

  /**
   * Получить статистику посещений пользователя
   */
  async getUserAttendanceStats(userId: string) {
    try {
      const attendance = await this.getUserAttendance(userId);

      const stats = {
        totalStreams: attendance.length,
        onlineStreams: attendance.filter(a => a.watchedOnline).length,
        offlineStreams: attendance.filter(a => !a.watchedOnline).length,
        totalEpEarned: attendance.reduce((sum, a) => sum + a.epEarned, 0),
      };

      return stats;
    } catch (error) {
      logger.error('[Streams] Error getting user attendance stats:', error);
      throw error;
    }
  }

  /**
   * Проверить, был ли пользователь на эфире
   */
  async hasUserAttended(userId: string, streamId: string): Promise<boolean> {
    try {
      const attendance = await db
        .select()
        .from(streamAttendance)
        .where(
          and(
            eq(streamAttendance.userId, userId),
            eq(streamAttendance.streamId, streamId)
          )
        )
        .limit(1);

      return attendance.length > 0;
    } catch (error) {
      logger.error('[Streams] Error checking user attendance:', error);
      throw error;
    }
  }
}

export const streamsService = new StreamsService();
