import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config, isDevelopment, isProduction } from '@/config';
import { logger } from '@/utils/logger';
import * as schema from './schema';

// 🚀 КРИТИЧЕСКАЯ ОПТИМИЗАЦИЯ ДЛЯ 10,000 ПОЛЬЗОВАТЕЛЕЙ
// Production-optimized connection pool configuration
const poolConfig: postgres.Options<{}> = {
  max: isProduction ? 150 : 10, // 🔥 150 connections для 10K+ concurrent users
  idle_timeout: 20,
  connect_timeout: 10,
  max_lifetime: null, // Отключаем max_lifetime - избегаем TimeoutNegativeWarning в postgres.js
  prepare: true, // Prepared statements для быстрых повторяющихся запросов
  keep_alive: isProduction ? 60 : undefined, // Keep-alive каждые 60 сек в production
  onnotice: () => {}, // Подавляем notice сообщения от PostgreSQL
};

// Primary database connection (for writes and critical reads)
const queryClient = postgres(config.DATABASE_URL, poolConfig);

// Read replica connection (for SELECT queries to offload primary)
// Falls back to primary if READ_REPLICA_URL not configured
const readReplicaClient = config.READ_REPLICA_URL
  ? postgres(config.READ_REPLICA_URL, {
      ...poolConfig,
      max: isProduction ? 200 : 10, // 🔥 200 connections для read replica (больше чем primary)
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
