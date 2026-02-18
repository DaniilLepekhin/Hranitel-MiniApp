import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config, isDevelopment, isProduction } from '@/config';
import { logger } from '@/utils/logger';
import * as schema from './schema';

// 🚀 КРИТИЧЕСКАЯ ОПТИМИЗАЦИЯ ДЛЯ 10,000 ПОЛЬЗОВАТЕЛЕЙ
// Production-optimized connection pool configuration
const poolConfig: postgres.Options<{}> = {
  max: isProduction ? 20 : 10, // 20 connections — реальная нагрузка ~1-5 concurrent
  idle_timeout: 20,
  connect_timeout: 10,
  max_lifetime: null, // Отключаем max_lifetime - избегаем TimeoutNegativeWarning в postgres.js
  prepare: true, // Prepared statements для быстрых повторяющихся запросов
  keep_alive: isProduction ? 60 : undefined, // Keep-alive каждые 60 сек в production
  onnotice: () => {}, // Подавляем notice сообщения от PostgreSQL
};

// Primary database connection (for writes and critical reads)
const queryClient = postgres(config.DATABASE_URL, poolConfig);

// Export raw postgres client for queries on tables not in drizzle schema (e.g. city_chats_ik)
export const rawDb = queryClient;

// Read replica connection (for SELECT queries to offload primary)
// Falls back to primary if READ_REPLICA_URL not configured
const readReplicaClient = config.READ_REPLICA_URL
  ? postgres(config.READ_REPLICA_URL, {
      ...poolConfig,
      max: isProduction ? 20 : 10, // Read replica pool (если настроена)
    })
  : queryClient;

// Primary database instance (for INSERT, UPDATE, DELETE)
export const db = drizzle(queryClient, {
  schema,
  logger: isDevelopment,
});

// Read replica instance (for SELECT queries)
export const dbRead = drizzle(readReplicaClient, {
  schema,
  logger: isDevelopment,
});

// Graceful shutdown: close all database connections
export const closeDatabaseConnection = async () => {
  try {
    await queryClient.end();
    logger.info('Primary database connection closed');

    if (readReplicaClient !== queryClient) {
      await readReplicaClient.end();
      logger.info('Read replica connection closed');
    }
  } catch (error) {
    logger.error({ error }, 'Error closing database connections');
    throw error;
  }
};

export * from './schema';
