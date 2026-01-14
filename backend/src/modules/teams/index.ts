import { Elysia, t } from 'elysia';
import { teamsService } from './service';
import { logger } from '@/utils/logger';

export const teamsRoutes = new Elysia({ prefix: '/api/teams' })
  /**
   * GET /api/teams/my
   * Получить команду пользователя
   */
  .get(
    '/my',
    async ({ query }) => {
      try {
        const { userId } = query;

        if (!userId) {
          return {
            success: false,
            error: 'User ID is required',
          };
        }

        const team = await teamsService.getUserTeam(userId);

        return {
          success: true,
          team,
        };
      } catch (error) {
        logger.error('[Teams API] Error getting user team:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get user team',
        };
      }
    },
    {
      query: t.Object({
        userId: t.String(),
      }),
    }
  )

  /**
   * GET /api/teams/:id
   * Получить команду по ID
   */
  .get(
    '/:id',
    async ({ params }) => {
      try {
        const team = await teamsService.getTeamWithMembers(params.id);

        return {
          success: true,
          team,
        };
      } catch (error) {
        logger.error('[Teams API] Error getting team:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get team',
        };
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    }
  )

  /**
   * GET /api/teams/:id/members
   * Получить участников команды
   */
  .get(
    '/:id/members',
    async ({ params }) => {
      try {
        const members = await teamsService.getTeamMembers(params.id);

        return {
          success: true,
          members,
        };
      } catch (error) {
        logger.error('[Teams API] Error getting team members:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get team members',
        };
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    }
  )

  /**
   * GET /api/teams
   * Получить все команды
   */
  .get(
    '/',
    async ({ query }) => {
      try {
        const { metka } = query;

        const teams = await teamsService.getAllTeams(metka);

        return {
          success: true,
          teams,
        };
      } catch (error) {
        logger.error('[Teams API] Error getting all teams:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get teams',
        };
      }
    },
    {
      query: t.Object({
        metka: t.Optional(t.String()),
      }),
    }
  )

  /**
   * POST /api/teams
   * Создать новую команду
   */
  .post(
    '/',
    async ({ body }) => {
      try {
        const { name, metka, cityChat, description, maxMembers } = body;

        const team = await teamsService.createTeam(
          name,
          metka,
          cityChat,
          description,
          maxMembers
        );

        return {
          success: true,
          team,
        };
      } catch (error) {
        logger.error('[Teams API] Error creating team:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create team',
        };
      }
    },
    {
      body: t.Object({
        name: t.String(),
        metka: t.Optional(t.String()),
        cityChat: t.Optional(t.String()),
        description: t.Optional(t.String()),
        maxMembers: t.Optional(t.Number()),
      }),
    }
  )

  /**
   * POST /api/teams/:id/join
   * Добавить пользователя в команду
   */
  .post(
    '/:id/join',
    async ({ params, body }) => {
      try {
        const { userId, role } = body;

        const result = await teamsService.addUserToTeam(
          userId,
          params.id,
          role as 'member' | 'leader' | undefined
        );

        return result;
      } catch (error) {
        logger.error('[Teams API] Error adding user to team:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to add user to team',
        };
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        userId: t.String(),
        role: t.Optional(t.Union([t.Literal('member'), t.Literal('leader')])),
      }),
    }
  )

  /**
   * POST /api/teams/leave
   * Удалить пользователя из команды
   */
  .post(
    '/leave',
    async ({ body }) => {
      try {
        const { userId } = body;

        const result = await teamsService.removeUserFromTeam(userId);

        return result;
      } catch (error) {
        logger.error('[Teams API] Error removing user from team:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to remove user from team',
        };
      }
    },
    {
      body: t.Object({
        userId: t.String(),
      }),
    }
  )

  /**
   * POST /api/teams/distribute
   * Распределить пользователей по командам (admin only)
   */
  .post('/distribute', async () => {
    try {
      const result = await teamsService.distributeUsersToTeams();

      return result;
    } catch (error) {
      logger.error('[Teams API] Error distributing users:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to distribute users',
      };
    }
  })

  /**
   * GET /api/teams/stats
   * Получить статистику по командам
   */
  .get('/stats', async () => {
    try {
      const stats = await teamsService.getTeamsStats();

      return {
        success: true,
        stats,
      };
    } catch (error) {
      logger.error('[Teams API] Error getting stats:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get stats',
      };
    }
  });
