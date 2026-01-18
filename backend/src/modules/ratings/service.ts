import { db, dbRead } from '@/db';
import { users, teams, teamMembers } from '@/db/schema';
import { sql, eq, and, isNotNull, gt } from 'drizzle-orm';
import { logger } from '@/utils/logger';
import { config } from '@/config';
import postgres from 'postgres';

// Connect to old database for city_chats_ik table (using env variable for security)
const oldDbConnection = config.OLD_DATABASE_URL
  ? postgres(config.OLD_DATABASE_URL, {
      max: 5, // Limited pool for readonly operations
      idle_timeout: 20,
      connect_timeout: 10,
    })
  : null;

interface CityRating {
  city: string;
  totalEnergies: number;
  userCount: number;
  rank: number;
}

interface TeamRating {
  teamId: string;
  teamName: string;
  totalEnergies: number;
  memberCount: number;
  rank: number;
}

interface UserPosition {
  globalRank: number;
  cityRank: number | null;
  teamRank: number | null;
  city: string | null;
  teamId: string | null;
}

export const ratingsService = {
  /**
   * Получить рейтинг городов по энергиям
   * Только пользователи с активной подпиской (isPro = true)
   */
  async getCityRatings(limit: number = 50): Promise<CityRating[]> {
    try {
      // Проверка что OLD_DATABASE_URL настроен
      if (!oldDbConnection) {
        throw new Error('OLD_DATABASE_URL not configured - cannot fetch city_chats');
      }

      // Get cities from city_chats_ik (excluding Ukraine)
      const citiesResult = await oldDbConnection<{ city: string }[]>`
        SELECT DISTINCT city
        FROM city_chats_ik
        WHERE country IS NOT NULL
          AND country != 'Украина'
        ORDER BY city
      `;

      const validCities = citiesResult.map((row) => row.city);

      // Get ratings from database (используем dbRead для read replica)
      const ratings = await dbRead
        .select({
          city: users.city,
          totalEnergies: sql<number>`SUM(${users.energies})`,
          userCount: sql<number>`COUNT(*)`,
        })
        .from(users)
        .where(
          and(
            eq(users.isPro, true),
            isNotNull(users.city),
            gt(users.energies, 0)
          )
        )
        .groupBy(users.city)
        .orderBy(sql`SUM(${users.energies}) DESC`)
        .limit(limit);

      // Filter only valid cities and add ranks
      const validRatings = ratings
        .filter((r) => r.city && validCities.includes(r.city))
        .map((rating, index) => ({
          city: rating.city!,
          totalEnergies: Number(rating.totalEnergies) || 0,
          userCount: Number(rating.userCount) || 0,
          rank: index + 1,
        }));

      logger.info(
        { count: validRatings.length, limit },
        'Fetched city ratings'
      );

      return validRatings;
    } catch (error) {
      logger.error({ error }, 'Error getting city ratings');
      throw new Error('Failed to get city ratings');
    }
  },

  /**
   * Получить рейтинг команд по энергиям
   * Только участники с активной подпиской (isPro = true)
   */
  async getTeamRatings(limit: number = 50): Promise<TeamRating[]> {
    try {
      // Используем dbRead для read replica
      const ratings = await dbRead
        .select({
          teamId: teams.id,
          teamName: teams.name,
          totalEnergies: sql<number>`SUM(${users.energies})`,
          memberCount: sql<number>`COUNT(DISTINCT ${teamMembers.userId})`,
        })
        .from(teams)
        .leftJoin(teamMembers, eq(teams.id, teamMembers.teamId))
        .leftJoin(users, and(
          eq(teamMembers.userId, users.id),
          eq(users.isPro, true)
        ))
        .groupBy(teams.id, teams.name)
        .having(sql`COUNT(DISTINCT ${teamMembers.userId}) > 0`)
        .orderBy(sql`SUM(${users.energies}) DESC`)
        .limit(limit);

      const result = ratings.map((rating, index) => ({
        teamId: rating.teamId,
        teamName: rating.teamName,
        totalEnergies: Number(rating.totalEnergies) || 0,
        memberCount: Number(rating.memberCount) || 0,
        rank: index + 1,
      }));

      logger.info({ count: result.length, limit }, 'Fetched team ratings');

      return result;
    } catch (error) {
      logger.error({ error }, 'Error getting team ratings');
      throw new Error('Failed to get team ratings');
    }
  },

  /**
   * Получить позицию пользователя во всех рейтингах
   */
  async getUserPosition(userId: string): Promise<UserPosition> {
    try {
      // Get user data (используем dbRead)
      const user = await dbRead.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Get global rank (используем dbRead)
      const higherRankedUsers = await dbRead
        .select({ count: sql<number>`COUNT(*)` })
        .from(users)
        .where(
          and(
            eq(users.isPro, true),
            gt(users.energies, user.energies)
          )
        );

      const globalRank = Number(higherRankedUsers[0]?.count || 0) + 1;

      // Get city rank
      let cityRank: number | null = null;
      if (user.city) {
        const higherInCity = await dbRead
          .select({ count: sql<number>`COUNT(*)` })
          .from(users)
          .where(
            and(
              eq(users.isPro, true),
              eq(users.city, user.city),
              gt(users.energies, user.energies)
            )
          );

        cityRank = Number(higherInCity[0]?.count || 0) + 1;
      }

      // Get team rank
      let teamRank: number | null = null;
      let teamId: string | null = null;

      const userTeam = await dbRead.query.teamMembers.findFirst({
        where: eq(teamMembers.userId, userId),
        with: {
          team: true,
        },
      });

      if (userTeam) {
        teamId = userTeam.teamId;

        const teamMembersData = await db
          .select({
            userId: users.id,
            energies: users.energies,
          })
          .from(teamMembers)
          .innerJoin(users, and(
            eq(teamMembers.userId, users.id),
            eq(users.isPro, true)
          ))
          .where(eq(teamMembers.teamId, userTeam.teamId))
          .orderBy(sql`${users.energies} DESC`);

        const userIndex = teamMembersData.findIndex((m) => m.userId === userId);
        teamRank = userIndex >= 0 ? userIndex + 1 : null;
      }

      logger.info(
        { userId, globalRank, cityRank, teamRank },
        'Fetched user position'
      );

      return {
        globalRank,
        cityRank,
        teamRank,
        city: user.city || null,
        teamId,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Error getting user position');
      throw new Error('Failed to get user position');
    }
  },
};
