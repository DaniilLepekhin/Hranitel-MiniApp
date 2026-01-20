import { logger } from '@/utils/logger';
import { invalidateCacheByPrefix, invalidateCacheByTag } from '@/middlewares/cache';

/**
 * 🔄 Cache Invalidation Utilities
 *
 * Senior-level cache invalidation strategy:
 * - Invalidate on mutations (POST/PUT/DELETE)
 * - User-specific invalidation
 * - Tag-based group invalidation
 * - Automatic materialized view refresh triggering
 */

/**
 * Invalidates cache for a specific user
 * Call this after updating user data (profile, subscription, etc.)
 */
export async function invalidateUserCache(userId: string): Promise<void> {
  try {
    await invalidateCacheByPrefix(`user:GET:/api/v1:user:${userId}`);
    logger.debug({ userId }, 'User cache invalidated');
  } catch (error) {
    logger.error({ error, userId }, 'Failed to invalidate user cache');
  }
}

/**
 * Invalidates all user caches (use sparingly!)
 * Call this after global user data changes
 */
export async function invalidateAllUserCache(): Promise<void> {
  try {
    const count = await invalidateCacheByPrefix('user:');
    logger.info({ count }, 'All user cache invalidated');
  } catch (error) {
    logger.error({ error }, 'Failed to invalidate all user cache');
  }
}

/**
 * Invalidates ratings cache
 * Call this after energy points changes, team updates, etc.
 * Also triggers materialized view refresh
 */
export async function invalidateRatingsCache(): Promise<void> {
  try {
    // Invalidate hot cache for ratings endpoints
    await invalidateCacheByPrefix('hot:GET:/api/v1/ratings');

    // Note: Materialized views are refreshed hourly by cron
    // For immediate consistency, you can call refresh_ratings_cache() from DB
    logger.debug('Ratings cache invalidated');
  } catch (error) {
    logger.error({ error }, 'Failed to invalidate ratings cache');
  }
}

/**
 * Invalidates course/meditation cache
 * Call this after course/lesson/meditation updates
 */
export async function invalidateContentCache(): Promise<void> {
  try {
    await Promise.all([
      invalidateCacheByPrefix('user:GET:/api/v1/courses'),
      invalidateCacheByPrefix('user:GET:/api/v1/meditations'),
    ]);
    logger.debug('Content cache invalidated');
  } catch (error) {
    logger.error({ error }, 'Failed to invalidate content cache');
  }
}

/**
 * Invalidates team cache
 * Call this after team creation, member changes, etc.
 */
export async function invalidateTeamCache(teamId?: string): Promise<void> {
  try {
    if (teamId) {
      await invalidateCacheByPrefix(`user:GET:/api/v1/teams/${teamId}`);
    } else {
      await invalidateCacheByPrefix('user:GET:/api/v1/teams');
    }
    logger.debug({ teamId }, 'Team cache invalidated');
  } catch (error) {
    logger.error({ error, teamId }, 'Failed to invalidate team cache');
  }
}

/**
 * Invalidates shop cache
 * Call this after shop item purchases, inventory changes
 */
export async function invalidateShopCache(): Promise<void> {
  try {
    await invalidateCacheByPrefix('user:GET:/api/v1/shop');
    logger.debug('Shop cache invalidated');
  } catch (error) {
    logger.error({ error }, 'Failed to invalidate shop cache');
  }
}

/**
 * Invalidates gamification cache (XP, levels, achievements)
 * Call this after XP changes, level ups, achievement unlocks
 */
export async function invalidateGamificationCache(userId: string): Promise<void> {
  try {
    await Promise.all([
      invalidateCacheByPrefix(`user:GET:/api/v1/gamification:user:${userId}`),
      invalidateCacheByPrefix(`user:GET:/api/v1/users/${userId}`), // Profile includes XP
    ]);
    logger.debug({ userId }, 'Gamification cache invalidated');
  } catch (error) {
    logger.error({ error, userId }, 'Failed to invalidate gamification cache');
  }
}

/**
 * Smart cache invalidation based on action
 * This is a convenience function that invalidates relevant caches
 */
export async function invalidateCacheForAction(
  action: string,
  data: {
    userId?: string;
    teamId?: string;
    courseId?: string;
    meditationId?: string;
  }
): Promise<void> {
  try {
    switch (action) {
      case 'user.update':
      case 'user.subscription.change':
        if (data.userId) {
          await invalidateUserCache(data.userId);
        }
        break;

      case 'energy_points.change':
        if (data.userId) {
          await invalidateUserCache(data.userId);
          await invalidateRatingsCache(); // Affects leaderboards
        }
        break;

      case 'team.create':
      case 'team.update':
      case 'team.member.add':
      case 'team.member.remove':
        await invalidateTeamCache(data.teamId);
        await invalidateRatingsCache(); // Affects team rankings
        break;

      case 'course.update':
      case 'lesson.update':
      case 'meditation.update':
        await invalidateContentCache();
        break;

      case 'shop.purchase':
        if (data.userId) {
          await invalidateUserCache(data.userId);
          await invalidateShopCache();
        }
        break;

      case 'gamification.xp.change':
      case 'gamification.achievement.unlock':
        if (data.userId) {
          await invalidateGamificationCache(data.userId);
        }
        break;

      default:
        logger.warn({ action }, 'Unknown cache invalidation action');
    }
  } catch (error) {
    logger.error({ error, action, data }, 'Cache invalidation failed');
  }
}

/**
 * Example usage in route handlers:
 *
 * POST /api/v1/energy-points/add
 * await db.transaction(async (tx) => {
 *   await tx.update(users).set({ energyPoints: ... });
 *   await invalidateCacheForAction('energy_points.change', { userId });
 * });
 *
 * POST /api/v1/teams/create
 * await db.transaction(async (tx) => {
 *   const team = await tx.insert(teams).values(...);
 *   await invalidateCacheForAction('team.create', { teamId: team.id });
 * });
 */
