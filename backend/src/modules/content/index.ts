import { Elysia, t } from 'elysia';
import { db } from '../../db';
import {
  contentItems,
  contentSections,
  videos,
  videoTimecodes,
  userContentProgress,
  practiceContent
} from '../../db/schema';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { energyTransactions } from '../../db/schema';

export const contentModule = new Elysia({ prefix: '/api/v1/content' })
  // Get content items list (with filters)
  .get('/items', async ({ query }) => {
    const { type, keyNumber, monthProgram } = query;

    let conditions = [];
    if (type) conditions.push(eq(contentItems.type, type as any));
    if (keyNumber) conditions.push(eq(contentItems.keyNumber, parseInt(keyNumber as string)));
    if (monthProgram === 'true') conditions.push(eq(contentItems.monthProgram, true));

    const items = await db
      .select()
      .from(contentItems)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(contentItems.orderIndex), desc(contentItems.createdAt));

    return { items };
  }, {
    query: t.Object({
      type: t.Optional(t.String()),
      keyNumber: t.Optional(t.String()),
      monthProgram: t.Optional(t.String()),
    })
  })

  // Get single content item details
  .get('/items/:id', async ({ params }) => {
    const item = await db
      .select()
      .from(contentItems)
      .where(eq(contentItems.id, params.id))
      .limit(1);

    if (item.length === 0) {
      throw new Error('Content item not found');
    }

    return { item: item[0] };
  }, {
    params: t.Object({
      id: t.String()
    })
  })

  // Get monthly program
  .get('/month-program', async () => {
    const items = await db
      .select()
      .from(contentItems)
      .where(eq(contentItems.monthProgram, true))
      .orderBy(asc(contentItems.orderIndex));

    return { items };
  })

  // Get content sections (lessons, episodes)
  .get('/:itemId/sections', async ({ params }) => {
    const sections = await db
      .select()
      .from(contentSections)
      .where(eq(contentSections.contentItemId, params.itemId))
      .orderBy(asc(contentSections.orderIndex));

    return { sections };
  }, {
    params: t.Object({
      itemId: t.String()
    })
  })

  // Get videos in a section
  .get('/sections/:sectionId/videos', async ({ params }) => {
    const sectionVideos = await db
      .select()
      .from(videos)
      .where(eq(videos.contentSectionId, params.sectionId))
      .orderBy(asc(videos.orderIndex));

    return { videos: sectionVideos };
  }, {
    params: t.Object({
      sectionId: t.String()
    })
  })

  // Get video details with timecodes
  .get('/videos/:videoId', async ({ params }) => {
    const video = await db
      .select()
      .from(videos)
      .where(eq(videos.id, params.videoId))
      .limit(1);

    if (video.length === 0) {
      throw new Error('Video not found');
    }

    const timecodes = await db
      .select()
      .from(videoTimecodes)
      .where(eq(videoTimecodes.videoId, params.videoId))
      .orderBy(asc(videoTimecodes.orderIndex));

    return {
      video: video[0],
      timecodes
    };
  }, {
    params: t.Object({
      videoId: t.String()
    })
  })

  // Get user progress for all content
  .get('/progress', async ({ query, set }) => {
    const { userId } = query;

    if (!userId) {
      set.status = 400;
      return { success: false, error: 'userId is required', progress: [] };
    }

    try {
      const progress = await db
        .select()
        .from(userContentProgress)
        .where(eq(userContentProgress.userId, userId))
        .orderBy(desc(userContentProgress.updatedAt));

      return { success: true, progress };
    } catch (error) {
      set.status = 500;
      return { success: false, error: 'Failed to fetch progress', progress: [] };
    }
  }, {
    query: t.Object({
      userId: t.Optional(t.String())
    })
  })

  // Get user progress stats
  .get('/progress/stats', async ({ query, set }) => {
    const { userId } = query;

    if (!userId) {
      set.status = 400;
      return { success: false, error: 'userId is required', stats: { totalWatched: 0, totalEnergies: 0, totalWatchTime: 0 } };
    }

    try {
      const stats = await db
        .select({
          totalWatched: sql<number>`count(*)`,
          totalEnergies: sql<number>`sum(${userContentProgress.energiesEarned})`,
          totalWatchTime: sql<number>`sum(${userContentProgress.watchTimeSeconds})`
        })
        .from(userContentProgress)
        .where(and(
          eq(userContentProgress.userId, userId),
          eq(userContentProgress.watched, true)
        ));

      return {
        success: true,
        stats: stats[0] || { totalWatched: 0, totalEnergies: 0, totalWatchTime: 0 }
      };
    } catch (error) {
      set.status = 500;
      return { success: false, error: 'Failed to fetch stats', stats: { totalWatched: 0, totalEnergies: 0, totalWatchTime: 0 } };
    }
  }, {
    query: t.Object({
      userId: t.Optional(t.String())
    })
  })

  // Mark video as completed (with Энергии)
  .post('/progress/complete', async ({ body }) => {
    const { userId, videoId, watchTimeSeconds } = body;

    // Get video details to calculate Энергии
    const video = await db
      .select()
      .from(videos)
      .where(eq(videos.id, videoId))
      .limit(1);

    if (video.length === 0) {
      throw new Error('Video not found');
    }

    // Calculate Энергии based on video duration
    let energiesReward = 0;
    const durationMinutes = (video[0].durationSeconds || 0) / 60;

    if (durationMinutes < 5) {
      energiesReward = 25; // Short video
    } else if (durationMinutes <= 20) {
      energiesReward = 50; // Medium video
    } else {
      energiesReward = 100; // Long video
    }

    // Check if progress already exists
    const existingProgress = await db
      .select()
      .from(userContentProgress)
      .where(and(
        eq(userContentProgress.userId, userId),
        eq(userContentProgress.videoId, videoId)
      ))
      .limit(1);

    let progress;

    if (existingProgress.length > 0) {
      // Update existing progress
      progress = await db
        .update(userContentProgress)
        .set({
          watched: true,
          watchTimeSeconds: watchTimeSeconds,
          completedAt: new Date(),
          energiesEarned: energiesReward,
          updatedAt: new Date()
        })
        .where(eq(userContentProgress.id, existingProgress[0].id))
        .returning();
    } else {
      // Create new progress record
      progress = await db
        .insert(userContentProgress)
        .values({
          userId,
          videoId,
          watched: true,
          watchTimeSeconds: watchTimeSeconds || 0,
          completedAt: new Date(),
          energiesEarned: energiesReward
        })
        .returning();
    }

    // Award Энергии пользователю
    if (energiesReward > 0) {
      await db.insert(energyTransactions).values({
        userId,
        amount: energiesReward,
        type: 'earn',
        source: 'video_completion',
        description: `Просмотр видео: ${video[0].title}`,
        metadata: { videoId, videoTitle: video[0].title }
      });
    }

    return {
      progress: progress[0],
      energiesEarned: energiesReward
    };
  }, {
    body: t.Object({
      userId: t.String(),
      videoId: t.String(),
      watchTimeSeconds: t.Optional(t.Number())
    })
  })

  // Get practice content
  .get('/practices/:id/content', async ({ params }) => {
    const practice = await db
      .select()
      .from(practiceContent)
      .where(eq(practiceContent.contentItemId, params.id))
      .limit(1);

    if (practice.length === 0) {
      throw new Error('Practice content not found');
    }

    return { practice: practice[0] };
  }, {
    params: t.Object({
      id: t.String()
    })
  })

  // Get videos directly attached to content item (for stream recordings)
  .get('/:itemId/videos', async ({ params }) => {
    const itemVideos = await db
      .select()
      .from(videos)
      .where(eq(videos.contentItemId, params.itemId))
      .orderBy(asc(videos.orderIndex));

    return { videos: itemVideos };
  }, {
    params: t.Object({
      itemId: t.String()
    })
  });
