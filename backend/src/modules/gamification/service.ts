import { eq, and, sql, desc } from 'drizzle-orm';
import { db, users, xpHistory, achievements, userAchievements } from '@/db';
import { logger } from '@/utils/logger';

// XP required per level (exponential growth)
const XP_PER_LEVEL = [
  0,      // Level 1
  100,    // Level 2
  250,    // Level 3
  500,    // Level 4
  1000,   // Level 5
  2000,   // Level 6
  3500,   // Level 7
  5500,   // Level 8
  8000,   // Level 9
  12000,  // Level 10
  17000,  // Level 11
  23000,  // Level 12
  30000,  // Level 13
  40000,  // Level 14
  50000,  // Level 15+
];

function calculateLevel(experience: number): number {
  for (let i = XP_PER_LEVEL.length - 1; i >= 0; i--) {
    if (experience >= XP_PER_LEVEL[i]) {
      return i + 1;
    }
  }
  return 1;
}

function getXPForNextLevel(level: number): number {
  if (level >= XP_PER_LEVEL.length) {
    return XP_PER_LEVEL[XP_PER_LEVEL.length - 1] + (level - XP_PER_LEVEL.length + 1) * 15000;
  }
  return XP_PER_LEVEL[level] || XP_PER_LEVEL[XP_PER_LEVEL.length - 1];
}

export const gamificationService = {
  // Add XP to user
  async addXP(
    userId: string,
    amount: number,
    reason: string,
    metadata: Record<string, unknown> = {}
  ): Promise<{ newExperience: number; newLevel: number; leveledUp: boolean }> {
    try {
      // Get current user
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new Error('User not found');
      }

      const oldLevel = user.level;
      const newExperience = user.experience + amount;
      const newLevel = calculateLevel(newExperience);
      const leveledUp = newLevel > oldLevel;

      // Update user
      await db
        .update(users)
        .set({
          experience: newExperience,
          level: newLevel,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      // Log XP history
      await db.insert(xpHistory).values({
        userId,
        amount,
        reason,
        metadata,
      });

      logger.info({ userId, amount, reason, newLevel, leveledUp }, 'XP awarded');

      // Check for achievements
      await this.checkAchievements(userId);

      return { newExperience, newLevel, leveledUp };
    } catch (error) {
      logger.error({ error, userId, amount }, 'Error adding XP');
      throw error;
    }
  },

  // Update user streak
  async updateStreak(userId: string): Promise<number> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) return 0;

      // Используем московское время (UTC+3) для определения дня
      const MSK_OFFSET = 3 * 60 * 60 * 1000;
      const nowMSK = new Date(Date.now() + MSK_OFFSET);
      const today = new Date(nowMSK);
      today.setUTCHours(0, 0, 0, 0);

      const lastActive = user.lastActiveDate ? new Date(user.lastActiveDate) : null;

      let newStreak = user.streak;

      if (!lastActive) {
        // First activity
        newStreak = 1;
      } else {
        const lastActiveMSK = new Date(lastActive.getTime() + MSK_OFFSET);
        const lastActiveDay = new Date(lastActiveMSK);
        lastActiveDay.setUTCHours(0, 0, 0, 0);

        const diffDays = Math.floor((today.getTime() - lastActiveDay.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
          // Same day, no change
          return user.streak;
        } else if (diffDays === 1) {
          // Consecutive day
          newStreak = user.streak + 1;
        } else {
          // Streak broken
          newStreak = 1;
        }
      }

      await db
        .update(users)
        .set({
          streak: newStreak,
          lastActiveDate: today,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      // Award XP for streak milestones
      if ([7, 14, 30, 60, 100].includes(newStreak)) {
        const bonusXP = newStreak * 10;
        await this.addXP(userId, bonusXP, `streak_milestone_${newStreak}`, { streak: newStreak });
      }

      return newStreak;
    } catch (error) {
      logger.error({ error, userId }, 'Error updating streak');
      return 0;
    }
  },

  // Check and award achievements
  async checkAchievements(userId: string): Promise<void> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) return;

      // Get all achievements
      const allAchievements = await db.select().from(achievements);

      // Get user's unlocked achievements
      const unlocked = await db
        .select({ achievementId: userAchievements.achievementId })
        .from(userAchievements)
        .where(eq(userAchievements.userId, userId));

      const unlockedIds = new Set(unlocked.map((u) => u.achievementId));

      // Check each achievement
      for (const achievement of allAchievements) {
        if (unlockedIds.has(achievement.id)) continue;

        const condition = achievement.condition as { type: string; value: number };
        let earned = false;

        switch (condition.type) {
          case 'level':
            earned = user.level >= condition.value;
            break;
          case 'experience':
            earned = user.experience >= condition.value;
            break;
          case 'streak':
            earned = user.streak >= condition.value;
            break;
          // Add more achievement types as needed
        }

        if (earned) {
          // Award achievement
          await db.insert(userAchievements).values({
            userId,
            achievementId: achievement.id,
          });

          // Award XP for achievement
          if (achievement.xpReward > 0) {
            await this.addXP(userId, achievement.xpReward, 'achievement_unlocked', {
              achievementId: achievement.id,
              achievementCode: achievement.code,
            });
          }

          logger.info({ userId, achievementId: achievement.id }, 'Achievement unlocked');
        }
      }
    } catch (error) {
      logger.error({ error, userId }, 'Error checking achievements');
    }
  },

  // Get user gamification stats
  async getUserStats(userId: string) {
    const [user] = await db
      .select({
        level: users.level,
        experience: users.experience,
        streak: users.streak,
        lastActiveDate: users.lastActiveDate,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) return null;

    const currentLevelXP = XP_PER_LEVEL[user.level - 1] || 0;
    const nextLevelXP = getXPForNextLevel(user.level);
    const progressToNextLevel = user.experience - currentLevelXP;
    const xpNeededForNextLevel = nextLevelXP - currentLevelXP;

    return {
      level: user.level,
      experience: user.experience,
      streak: user.streak,
      lastActiveDate: user.lastActiveDate,
      currentLevelXP,
      nextLevelXP,
      progressToNextLevel,
      xpNeededForNextLevel,
      progressPercent: Math.min(100, Math.round((progressToNextLevel / xpNeededForNextLevel) * 100)),
    };
  },

  // Get XP history
  async getXPHistory(userId: string, limit = 20) {
    return db
      .select()
      .from(xpHistory)
      .where(eq(xpHistory.userId, userId))
      .orderBy(desc(xpHistory.createdAt))
      .limit(limit);
  },

  // Get user achievements
  async getUserAchievements(userId: string) {
    const unlocked = await db
      .select({
        achievement: achievements,
        unlockedAt: userAchievements.unlockedAt,
      })
      .from(userAchievements)
      .innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
      .where(eq(userAchievements.userId, userId));

    const all = await db.select().from(achievements);

    const unlockedIds = new Set(unlocked.map((u) => u.achievement.id));

    return {
      unlocked: unlocked.map((u) => ({
        ...u.achievement,
        unlockedAt: u.unlockedAt,
      })),
      locked: all.filter((a) => !unlockedIds.has(a.id)),
      total: all.length,
      unlockedCount: unlocked.length,
    };
  },
};
