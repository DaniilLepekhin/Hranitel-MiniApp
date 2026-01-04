import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config, isDevelopment } from '@/config';
import { logger } from '@/utils/logger';
import * as schema from './schema';

const queryClient = postgres(config.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  max_lifetime: 60 * 30,
});

export const db = drizzle(queryClient, {
  schema,
  logger: isDevelopment,
});

export const closeDatabaseConnection = async () => {
  await queryClient.end();
  logger.info('Database connection closed');
};

export * from './schema';
