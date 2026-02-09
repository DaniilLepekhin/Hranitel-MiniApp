import { db } from '@/db';
import { users, teamMembers, decades } from '@/db/schema';
import { eq, desc, sql, and, isNotNull } from 'drizzle-orm';
import { logger } from '@/utils/logger';

/**
 * Сервис рейтингов для геймификации
 * По документу "Геймификация для дани.pdf"
 */

interface PersonalRating {
  userId: string;
  telegramId: number;
  name: string;
  energies: number;
  rank: number;
  total: number;
}

interface DecadeRating {
  decadeId: string;
  decadeName: string;
  city: string;
  avgEnergies: number;
  totalEnergies: number;
  memberCount: number;
  rank: number;
}

interface CityRating {
  city: string;
  totalEnergies: number;
  memberCount: number;
  avgEnergies: number;
  rank: number;
}

export class RatingsService {
  /**
   * Получить личный рейтинг пользователя
   */
  async getPersonalRating(userId: string) {
    try {
      const allUsers = await db
        .select({
          id: users.id,
          telegramId: users.telegramId,
          name: users.name,
          energies: users.energies,
        })
        .from(users)
        .where(isNotNull(users.energies))
        .orderBy(desc(users.energies));

      const total = allUsers.length;
      const userIndex = allUsers.findIndex((u) => u.id === userId);
      const rank = userIndex + 1;

      const currentUser = {
        userId: allUsers[userIndex]?.id || userId,
        telegramId: allUsers[userIndex]?.telegramId || 0,
        name: allUsers[userIndex]?.name || 'Неизвестно',
        energies: allUsers[userIndex]?.energies || 0,
        rank,
        total,
      };

      const topUsers = allUsers.slice(0, 100).map((u, index) => ({
        userId: u.id,
        telegramId: u.telegramId,
        name: u.name || 'Участник',
        energies: u.energies || 0,
        rank: index + 1,
        total,
      }));

      return { user: currentUser, topUsers };
    } catch (error) {
      logger.error('[Ratings] Error getting personal rating:', error);
      throw error;
    }
  }

  /**
   * Получить рейтинг городов
   */
  async getCityRatings(limit: number = 50) {
    try {
      const cityRatings = await db
        .select({
          city: users.city,
          memberCount: sql<number>`COUNT(DISTINCT ${users.id})`,
          totalEnergies: sql<number>`COALESCE(SUM(${users.energies}), 0)`,
          avgEnergies: sql<number>`COALESCE(AVG(${users.energies}), 0)`,
        })
        .from(users)
        .where(and(isNotNull(users.city), isNotNull(users.energies)))
        .groupBy(users.city)
        .orderBy(desc(sql`COALESCE(SUM(${users.energies}), 0)`))
        .limit(limit);

      return cityRatings.map((c, index) => ({
        city: c.city || 'Неизвестно',
        totalEnergies: Number(c.totalEnergies),
        memberCount: Number(c.memberCount),
        avgEnergies: Number(c.avgEnergies),
        rank: index + 1,
      }));
    } catch (error) {
      logger.error('[Ratings] Error getting city ratings:', error);
      throw error;
    }
  }
}

export const ratingsService = new RatingsService();
