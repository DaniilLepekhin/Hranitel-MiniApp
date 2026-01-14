import { Elysia, t } from 'elysia';
import { sql } from 'drizzle-orm';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import postgres from 'postgres';

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
          SELECT id, country, city, chat_name, chat_link
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

        logger.info({ city, chatLink: chat.chat_link }, 'Fetched chat link');

        return {
          success: true,
          chatLink: chat.chat_link,
          chatName: chat.chat_name,
          country: chat.country,
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
  });
