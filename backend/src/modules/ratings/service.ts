import { db } from '@/db';
import { users, decades, decadeMembers } from '@/db/schema';
import { eq, desc, sql, and, isNotNull, isNull } from 'drizzle-orm';
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
          firstName: users.firstName,
          lastName: users.lastName,
          username: users.username,
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
        name: allUsers[userIndex]?.firstName || 'Неизвестно',
        energies: allUsers[userIndex]?.energies || 0,
        rank,
        total,
      };

      const topUsers = allUsers.slice(0, 100).map((u, index) => ({
        id: u.id, // Frontend expects 'id' not 'userId'
        userId: u.id,
        telegramId: u.telegramId,
        firstName: u.firstName,
        lastName: u.lastName,
        username: u.username,
        name: u.firstName || 'Участник',
        energies: u.energies || 0,
        experience: u.energies || 0, // Frontend expects 'experience' field
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
  /**
   * Получить рейтинг команд (десяток) по средним энергиям участников
   */
  async getTeamRatings(limit: number = 50) {
    try {
      const teamRatings = await db
        .select({
          decadeId: decades.id,
          city: decades.city,
          number: decades.number,
          memberCount: sql<number>`COUNT(DISTINCT ${decadeMembers.userId})`,
          totalEnergies: sql<number>`COALESCE(SUM(${users.energies}), 0)`,
          avgEnergies: sql<number>`COALESCE(AVG(${users.energies}), 0)`,
        })
        .from(decades)
        .innerJoin(decadeMembers, and(
          eq(decadeMembers.decadeId, decades.id),
          isNull(decadeMembers.leftAt)
        ))
        .innerJoin(users, eq(users.id, decadeMembers.userId))
        .where(eq(decades.isActive, true))
        .groupBy(decades.id, decades.city, decades.number)
        .orderBy(desc(sql`COALESCE(AVG(${users.energies}), 0)`))
        .limit(limit);

      return teamRatings.map((t, index) => ({
        decadeId: t.decadeId,
        decadeName: `Десятка №${t.number} ${t.city}`,
        city: t.city,
        number: t.number,
        totalEnergies: Number(t.totalEnergies),
        memberCount: Number(t.memberCount),
        avgEnergies: Math.round(Number(t.avgEnergies)),
        rank: index + 1,
      }));
    } catch (error) {
      logger.error('[Ratings] Error getting team ratings:', error);
      throw error;
    }
  }

  /**
   * Получить позицию пользователя во всех рейтингах
   */
  async getUserPosition(userId: string) {
    try {
      // Находим пользователя
      const userResult = await db
        .select({
          id: users.id,
          telegramId: users.telegramId,
          firstName: users.firstName,
          energies: users.energies,
          city: users.city,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const user = userResult[0];
      if (!user) {
        return { personalRank: 0, cityRank: 0, teamRank: 0, decadeId: null };
      }

      const userEnergies = user.energies || 0;

      // Личный рейтинг
      const personalResult = await db.execute(
        sql`SELECT COUNT(*)::int + 1 as rank FROM users WHERE energies > ${userEnergies}`
      );
      const personalRank = Number(personalResult.rows?.[0]?.rank ?? personalResult[0]?.rank ?? 0);

      // Рейтинг в городе
      let cityRank = 0;
      if (user.city) {
        const cityResult = await db.execute(
          sql`SELECT COUNT(*)::int + 1 as rank FROM users WHERE city = ${user.city} AND energies > ${userEnergies}`
        );
        cityRank = Number(cityResult.rows?.[0]?.rank ?? cityResult[0]?.rank ?? 0);
      }

      // Рейтинг десятки
      let teamRank = 0;
      let decadeId: string | null = null;

      const membershipResult = await db
        .select({ decadeId: decadeMembers.decadeId })
        .from(decadeMembers)
        .where(and(
          eq(decadeMembers.userId, userId),
          isNull(decadeMembers.leftAt)
        ))
        .limit(1);

      const membership = membershipResult[0];

      if (membership) {
        decadeId = membership.decadeId;

        const teamResult = await db.execute(sql`
          WITH team_avgs AS (
            SELECT dm.decade_id, AVG(u.energies) as avg_e
            FROM decade_members dm
            JOIN users u ON u.id = dm.user_id
            JOIN decades d ON d.id = dm.decade_id
            WHERE d.is_active = true AND dm.left_at IS NULL
            GROUP BY dm.decade_id
          ),
          my_team AS (
            SELECT avg_e FROM team_avgs WHERE decade_id = ${membership.decadeId}
          )
          SELECT COUNT(*)::int + 1 as rank
          FROM team_avgs
          WHERE avg_e > (SELECT COALESCE(avg_e, 0) FROM my_team)
        `);

        teamRank = Number(teamResult.rows?.[0]?.rank ?? teamResult[0]?.rank ?? 0);
      }

      return {
        personalRank,
        globalRank: personalRank, // Алиас для совместимости с frontend
        cityRank,
        teamRank,
        decadeId,
      };
    } catch (error) {
      logger.error({ error, userId }, '[Ratings] Error getting user position');
      throw error;
    }
  }
}

export const ratingsService = new RatingsService();
