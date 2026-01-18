import { db } from '@/db';
import { teams, teamMembers, users } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { logger } from '@/utils/logger';

export class TeamsService {
  /**
   * Получить команду пользователя
   */
  async getUserTeam(userId: string) {
    try {
      // Находим членство в команде
      const membership = await db
        .select()
        .from(teamMembers)
        .where(eq(teamMembers.userId, userId))
        .limit(1);

      if (membership.length === 0) {
        return null;
      }

      // Получаем информацию о команде
      const team = await db
        .select()
        .from(teams)
        .where(eq(teams.id, membership[0].teamId))
        .limit(1);

      if (team.length === 0) {
        return null;
      }

      return {
        ...team[0],
        userRole: membership[0].role,
        joinedAt: membership[0].joinedAt,
      };
    } catch (error) {
      logger.error('[Teams] Error getting user team:', error);
      throw new Error('Failed to get user team');
    }
  }

  /**
   * Получить участников команды
   */
  async getTeamMembers(teamId: string) {
    try {
      const members = await db
        .select({
          id: teamMembers.id,
          userId: teamMembers.userId,
          role: teamMembers.role,
          joinedAt: teamMembers.joinedAt,
          // Данные пользователя
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          photoUrl: users.photoUrl,
          level: users.level,
          energies: users.energies, // Исправлено: было energyPoints
        })
        .from(teamMembers)
        .leftJoin(users, eq(teamMembers.userId, users.id))
        .where(eq(teamMembers.teamId, teamId))
        .orderBy(teamMembers.joinedAt);

      return members;
    } catch (error) {
      logger.error('[Teams] Error getting team members:', error);
      throw new Error('Failed to get team members');
    }
  }

  /**
   * Получить команду со всеми участниками
   */
  async getTeamWithMembers(teamId: string) {
    try {
      const team = await db
        .select()
        .from(teams)
        .where(eq(teams.id, teamId))
        .limit(1);

      if (team.length === 0) {
        throw new Error('Team not found');
      }

      const members = await this.getTeamMembers(teamId);

      return {
        ...team[0],
        members,
      };
    } catch (error) {
      logger.error('[Teams] Error getting team with members:', error);
      throw error;
    }
  }

  /**
   * Добавить пользователя в команду
   */
  async addUserToTeam(userId: string, teamId: string, role: 'member' | 'leader' = 'member') {
    try {
      // Проверяем, что команда существует
      const team = await db
        .select()
        .from(teams)
        .where(eq(teams.id, teamId))
        .limit(1);

      if (team.length === 0) {
        throw new Error('Team not found');
      }

      // Проверяем, что команда не заполнена
      if (team[0].memberCount >= team[0].maxMembers) {
        throw new Error('Team is full');
      }

      // Проверяем, что пользователь еще не в команде
      const existingMembership = await db
        .select()
        .from(teamMembers)
        .where(eq(teamMembers.userId, userId))
        .limit(1);

      if (existingMembership.length > 0) {
        throw new Error('User is already in a team');
      }

      // Добавляем в транзакции
      await db.transaction(async (tx) => {
        // Добавляем участника
        await tx.insert(teamMembers).values({
          teamId,
          userId,
          role,
        });

        // Обновляем счетчик участников
        await tx
          .update(teams)
          .set({ memberCount: sql`${teams.memberCount} + 1` })
          .where(eq(teams.id, teamId));
      });

      logger.info(`[Teams] User ${userId} added to team ${teamId} as ${role}`);

      return { success: true };
    } catch (error) {
      logger.error('[Teams] Error adding user to team:', error);
      throw error;
    }
  }

  /**
   * Удалить пользователя из команды
   */
  async removeUserFromTeam(userId: string) {
    try {
      // Получаем членство
      const membership = await db
        .select()
        .from(teamMembers)
        .where(eq(teamMembers.userId, userId))
        .limit(1);

      if (membership.length === 0) {
        throw new Error('User is not in a team');
      }

      const teamId = membership[0].teamId;

      // Удаляем в транзакции
      await db.transaction(async (tx) => {
        // Удаляем участника
        await tx
          .delete(teamMembers)
          .where(eq(teamMembers.userId, userId));

        // Обновляем счетчик участников
        await tx
          .update(teams)
          .set({ memberCount: sql`${teams.memberCount} - 1` })
          .where(eq(teams.id, teamId));
      });

      logger.info(`[Teams] User ${userId} removed from team ${teamId}`);

      return { success: true };
    } catch (error) {
      logger.error('[Teams] Error removing user from team:', error);
      throw error;
    }
  }

  /**
   * Создать новую команду
   */
  async createTeam(
    name: string,
    metka?: string,
    cityChat?: string,
    description?: string,
    maxMembers: number = 12
  ) {
    try {
      const newTeam = await db
        .insert(teams)
        .values({
          name,
          description,
          metka,
          cityChat,
          maxMembers,
          memberCount: 0,
        })
        .returning();

      logger.info(`[Teams] Created new team ${newTeam[0].id} with name "${name}"`);

      return newTeam[0];
    } catch (error) {
      logger.error('[Teams] Error creating team:', error);
      throw new Error('Failed to create team');
    }
  }

  /**
   * Получить все команды
   */
  async getAllTeams(metka?: string) {
    try {
      const query = db.select().from(teams);

      if (metka) {
        const allTeams = await query;
        return allTeams.filter(team => team.metka === metka);
      }

      return await query;
    } catch (error) {
      logger.error('[Teams] Error getting all teams:', error);
      throw new Error('Failed to get teams');
    }
  }

  /**
   * Алгоритм распределения пользователей по Десяткам
   * Группировка по metka (art, relationship, etc), 6-12 человек в команде
   */
  async distributeUsersToTeams() {
    try {
      logger.info('[Teams] Starting user distribution to teams...');

      // Получаем всех пользователей без команды
      const usersWithoutTeam = await db
        .select({
          id: users.id,
          metka: sql<string>`${users.metadata}->>'metka'`,
          firstName: users.firstName,
        })
        .from(users)
        .where(
          sql`NOT EXISTS (
            SELECT 1 FROM ${teamMembers}
            WHERE ${teamMembers.userId} = ${users.id}
          )`
        );

      logger.info(`[Teams] Found ${usersWithoutTeam.length} users without teams`);

      // Группируем по metka
      const usersByMetka = usersWithoutTeam.reduce((acc, user) => {
        const metka = user.metka || 'general';
        if (!acc[metka]) {
          acc[metka] = [];
        }
        acc[metka].push(user);
        return acc;
      }, {} as Record<string, typeof usersWithoutTeam>);

      let teamsCreated = 0;
      let usersAssigned = 0;

      // Создаем команды для каждой metka
      for (const [metka, usersInMetka] of Object.entries(usersByMetka)) {
        logger.info(`[Teams] Processing metka "${metka}" with ${usersInMetka.length} users`);

        // Разбиваем на группы по 10 человек (оптимальный размер)
        const teamSize = 10;
        const teamsCount = Math.ceil(usersInMetka.length / teamSize);

        for (let i = 0; i < teamsCount; i++) {
          const teamUsers = usersInMetka.slice(i * teamSize, (i + 1) * teamSize);

          // Создаем команду
          const teamName = `${metka.toUpperCase()} - Десятка ${i + 1}`;
          const team = await this.createTeam(teamName, metka, undefined, undefined, 12);

          // Добавляем участников
          for (const user of teamUsers) {
            await this.addUserToTeam(user.id, team.id);
            usersAssigned++;
          }

          teamsCreated++;
        }
      }

      logger.info(
        `[Teams] Distribution complete: ${teamsCreated} teams created, ${usersAssigned} users assigned`
      );

      return {
        success: true,
        teamsCreated,
        usersAssigned,
      };
    } catch (error) {
      logger.error('[Teams] Error distributing users to teams:', error);
      throw new Error('Failed to distribute users to teams');
    }
  }

  /**
   * Получить статистику команд
   */
  async getTeamsStats() {
    try {
      const allTeams = await this.getAllTeams();

      const stats = {
        totalTeams: allTeams.length,
        totalMembers: allTeams.reduce((sum, team) => sum + team.memberCount, 0),
        averageSize: allTeams.length > 0
          ? Math.round(allTeams.reduce((sum, team) => sum + team.memberCount, 0) / allTeams.length)
          : 0,
        byMetka: {} as Record<string, number>,
        fullTeams: allTeams.filter(team => team.memberCount >= team.maxMembers).length,
      };

      // Считаем по metka
      for (const team of allTeams) {
        const metka = team.metka || 'general';
        stats.byMetka[metka] = (stats.byMetka[metka] || 0) + 1;
      }

      return stats;
    } catch (error) {
      logger.error('[Teams] Error getting teams stats:', error);
      throw error;
    }
  }
}

export const teamsService = new TeamsService();
