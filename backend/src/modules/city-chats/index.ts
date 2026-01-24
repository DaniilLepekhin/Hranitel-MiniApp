import { Elysia, t } from 'elysia';
import { sql, eq } from 'drizzle-orm';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import postgres from 'postgres';
import { db } from '@/db';
import { users } from '@/db/schema';
import { subscriptionGuardService } from '@/services/subscription-guard.service';

// Connect directly to the old database for city_chats_ik table
const oldDbConnection = postgres({
  host: '31.128.36.81',
  port: 5423,
  database: 'club_hranitel',
  username: 'postgres',
  password: 'kH*kyrS&9z7K',
  ssl: false,
});

interface CityChat {
  id: number;
  country: string;
  city: string;
  chat_name: string;
  chat_link: string;
  platform_id: number | null; // Telegram chat ID stored in platform_id column
}

export const cityChatModule = new Elysia({ prefix: '/city-chats' })
  // Get all countries
  .get('/countries', async () => {
    try {
      const result = await oldDbConnection<{ country: string }[]>`
        SELECT DISTINCT country
        FROM city_chats_ik
        WHERE country IS NOT NULL
          AND country != 'Украина'
        ORDER BY country
      `;

      const countries = result.map((row) => row.country);

      logger.info({ count: countries.length }, 'Fetched countries');

      return {
        success: true,
        countries,
      };
    } catch (error) {
      logger.error({ error }, 'Error fetching countries');
      throw new Error('Failed to fetch countries');
    }
  })

  // Get cities by country
  .get(
    '/cities',
    async ({ query }) => {
      const { country } = query;

      if (!country) {
        return {
          success: false,
          error: 'Country parameter is required',
          cities: [],
        };
      }

      try {
        const result = await oldDbConnection<{ city: string; chat_name: string }[]>`
          SELECT city, chat_name
          FROM city_chats_ik
          WHERE country = ${country}
          ORDER BY city
        `;

        const cities = result.map((row) => ({
          name: row.city,
          // Only include chatName if it's different from city name to avoid duplication
          chatName: row.chat_name !== row.city ? row.chat_name : undefined,
        }));

        logger.info({ country, count: cities.length }, 'Fetched cities');

        return {
          success: true,
          cities,
        };
      } catch (error) {
        logger.error({ error, country }, 'Error fetching cities');
        throw new Error('Failed to fetch cities');
      }
    },
    {
      query: t.Object({
        country: t.String(),
      }),
    }
  )

  // Get chat link by city
  .get(
    '/link',
    async ({ query }) => {
      const { city } = query;

      if (!city) {
        return {
          success: false,
          error: 'City parameter is required',
          chatLink: null,
        };
      }

      try {
        const result = await oldDbConnection<CityChat[]>`
          SELECT id, country, city, chat_name, chat_link, platform_id
          FROM city_chats_ik
          WHERE city = ${city}
          LIMIT 1
        `;

        if (result.length === 0) {
          return {
            success: false,
            error: 'City not found',
            chatLink: null,
          };
        }

        const chat = result[0];

        logger.info({ city, chatLink: chat.chat_link, cityChatId: chat.id }, 'Fetched chat link');

        return {
          success: true,
          chatLink: chat.chat_link,
          chatName: chat.chat_name,
          country: chat.country,
          cityChatId: chat.id,
          telegramChatId: chat.platform_id || null,
        };
      } catch (error) {
        logger.error({ error, city }, 'Error fetching chat link');
        throw new Error('Failed to fetch chat link');
      }
    },
    {
      query: t.Object({
        city: t.String(),
      }),
    }
  )

  // Get all chats (for debugging/admin)
  .get('/all', async ({ query }) => {
    try {
      const limit = query.limit ? parseInt(query.limit) : 100;

      const result = await oldDbConnection<CityChat[]>`
        SELECT id, country, city, chat_name, chat_link
        FROM city_chats_ik
        ORDER BY country, city
        LIMIT ${limit}
      `;

      logger.info({ count: result.length }, 'Fetched all chats');

      return {
        success: true,
        chats: result,
      };
    } catch (error) {
      logger.error({ error }, 'Error fetching all chats');
      throw new Error('Failed to fetch chats');
    }
  })

  // Join city chat - save selection and unban user
  .post(
    '/join',
    async ({ body }) => {
      const { telegramId, city, cityChatId, telegramChatId } = body;

      try {
        // 1. Update user's city and cityChatId
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.telegramId, telegramId))
          .limit(1);

        if (!user) {
          logger.warn({ telegramId }, 'User not found when joining city chat');
          return {
            success: false,
            error: 'User not found',
          };
        }

        // Update user's city and cityChatId
        await db
          .update(users)
          .set({
            city: city,
            cityChatId: cityChatId,
            updatedAt: new Date(),
          })
          .where(eq(users.telegramId, telegramId));

        logger.info({ telegramId, city, cityChatId }, 'User city chat selection saved');

        // 2. Unban user from this specific chat if telegramChatId is provided
        if (telegramChatId) {
          try {
            await subscriptionGuardService.unbanFromSpecificChat(telegramId, telegramChatId);
            logger.info({ telegramId, telegramChatId }, 'User unbanned from city chat');
          } catch (unbanError) {
            // Log but don't fail - user might not be banned
            logger.warn({ telegramId, telegramChatId, error: unbanError }, 'Error unbanning user from chat (may not be banned)');
          }
        }

        return {
          success: true,
          message: 'City chat selection saved',
        };
      } catch (error) {
        logger.error({ error, telegramId, city }, 'Error joining city chat');
        throw new Error('Failed to join city chat');
      }
    },
    {
      body: t.Object({
        telegramId: t.Number(),
        city: t.String(),
        cityChatId: t.Number(),
        telegramChatId: t.Optional(t.Number()),
      }),
    }
  );
