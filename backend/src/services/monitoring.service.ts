import { db, dbRead } from '@/db';
import { sql } from 'drizzle-orm';
import { logger } from '@/utils/logger';
import { config, isProduction } from '@/config';

interface DatabaseMetrics {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  idleInTransaction: number;
  waitingConnections: number;
  cacheHitRatio: number;
  slowQueries: number;
  databaseSize: string;
}

interface TableMetrics {
  tableName: string;
  totalSize: string;
  tableSize: string;
  indexSize: string;
  rowCount: number;
}

interface IndexMetrics {
  tableName: string;
  indexName: string;
  indexScans: number;
  indexSize: string;
  isUnused: boolean;
}

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  database: {
    primary: boolean;
    readReplica: boolean;
  };
  metrics?: DatabaseMetrics;
  errors?: string[];
}

export const monitoringService = {
  /**
   * Получить метрики производительности базы данных
   */
  async getDatabaseMetrics(): Promise<DatabaseMetrics> {
    try {
      // Get connection stats
      const connStats = await dbRead.execute<{
        total: number;
        active: number;
        idle: number;
        idle_in_transaction: number;
        waiting: number;
      }>(sql`
        SELECT
          COUNT(*) FILTER (WHERE state IS NOT NULL) AS total,
          COUNT(*) FILTER (WHERE state = 'active') AS active,
          COUNT(*) FILTER (WHERE state = 'idle') AS idle,
          COUNT(*) FILTER (WHERE state = 'idle in transaction') AS idle_in_transaction,
          COUNT(*) FILTER (WHERE wait_event IS NOT NULL) AS waiting
        FROM pg_stat_activity
        WHERE datname = current_database()
      `);

      // Get cache hit ratio
      const cacheStats = await dbRead.execute<{
        name: string;
        ratio: number;
      }>(sql`
        SELECT
          'table hit rate' AS name,
          COALESCE(
            sum(heap_blks_hit)::float / NULLIF(sum(heap_blks_hit + heap_blks_read)::float, 0),
            0
          ) AS ratio
        FROM pg_statio_user_tables
      `);

      // Get slow queries count (>100ms)
      const slowQueriesStats = await dbRead.execute<{
        count: number;
      }>(sql`
        SELECT COUNT(*) AS count
        FROM pg_stat_statements
        WHERE mean_exec_time > 100
      `);

      // Get database size
      const dbSize = await dbRead.execute<{
        size: string;
      }>(sql`
        SELECT pg_size_pretty(pg_database_size(current_database())) AS size
      `);

      const conn = connStats.rows[0];
      const cache = cacheStats.rows[0];
      const slow = slowQueriesStats.rows[0];
      const size = dbSize.rows[0];

      return {
        totalConnections: Number(conn?.total || 0),
        activeConnections: Number(conn?.active || 0),
        idleConnections: Number(conn?.idle || 0),
        idleInTransaction: Number(conn?.idle_in_transaction || 0),
        waitingConnections: Number(conn?.waiting || 0),
        cacheHitRatio: Number(cache?.ratio || 0),
        slowQueries: Number(slow?.count || 0),
        databaseSize: size?.size || '0',
      };
    } catch (error) {
      logger.error({ error }, 'Error getting database metrics');
      throw new Error('Failed to get database metrics');
    }
  },

  /**
   * Получить метрики размеров таблиц
   */
  async getTableMetrics(limit: number = 10): Promise<TableMetrics[]> {
    try {
      const result = await dbRead.execute<{
        tablename: string;
        total_size: string;
        table_size: string;
        index_size: string;
        row_count: number;
      }>(sql`
        SELECT
          tablename,
          pg_size_pretty(pg_total_relation_size('public.'||tablename)) AS total_size,
          pg_size_pretty(pg_relation_size('public.'||tablename)) AS table_size,
          pg_size_pretty(
            pg_total_relation_size('public.'||tablename) - pg_relation_size('public.'||tablename)
          ) AS index_size,
          (
            SELECT count(*) FROM (
              SELECT 1 FROM information_schema.tables t
              WHERE t.table_name = tablename
              LIMIT 1
            ) s
          ) AS row_count
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size('public.'||tablename) DESC
        LIMIT ${limit}
      `);

      return result.rows.map((row) => ({
        tableName: row.tablename,
        totalSize: row.total_size,
        tableSize: row.table_size,
        indexSize: row.index_size,
        rowCount: Number(row.row_count),
      }));
    } catch (error) {
      logger.error({ error }, 'Error getting table metrics');
      throw new Error('Failed to get table metrics');
    }
  },

  /**
   * Получить метрики использования индексов
   */
  async getIndexMetrics(limit: number = 20): Promise<IndexMetrics[]> {
    try {
      const result = await dbRead.execute<{
        tablename: string;
        indexname: string;
        idx_scan: number;
        index_size: string;
      }>(sql`
        SELECT
          tablename,
          indexname,
          idx_scan,
          pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
        FROM pg_stat_user_indexes
        WHERE schemaname = 'public'
        ORDER BY idx_scan DESC
        LIMIT ${limit}
      `);

      return result.rows.map((row) => ({
        tableName: row.tablename,
        indexName: row.indexname,
        indexScans: Number(row.idx_scan),
        indexSize: row.index_size,
        isUnused: Number(row.idx_scan) === 0,
      }));
    } catch (error) {
      logger.error({ error }, 'Error getting index metrics');
      throw new Error('Failed to get index metrics');
    }
  },

  /**
   * Получить список неиспользуемых индексов
   */
  async getUnusedIndexes(): Promise<IndexMetrics[]> {
    try {
      const result = await dbRead.execute<{
        tablename: string;
        indexname: string;
        index_size: string;
      }>(sql`
        SELECT
          tablename,
          indexname,
          pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
        FROM pg_stat_user_indexes
        WHERE schemaname = 'public'
          AND idx_scan = 0
          AND indexrelname NOT LIKE '%_pkey'
        ORDER BY pg_relation_size(indexrelid) DESC
      `);

      return result.rows.map((row) => ({
        tableName: row.tablename,
        indexName: row.indexname,
        indexScans: 0,
        indexSize: row.index_size,
        isUnused: true,
      }));
    } catch (error) {
      logger.error({ error }, 'Error getting unused indexes');
      throw new Error('Failed to get unused indexes');
    }
  },

  /**
   * Health check для production monitoring
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const errors: string[] = [];
    let primaryHealthy = false;
    let readReplicaHealthy = false;
    let metrics: DatabaseMetrics | undefined;

    try {
      // Check primary database
      await db.execute(sql`SELECT 1`);
      primaryHealthy = true;
    } catch (error) {
      errors.push(`Primary database unreachable: ${error instanceof Error ? error.message : 'Unknown error'}`);
      logger.error({ error }, 'Primary database health check failed');
    }

    try {
      // Check read replica (if configured separately)
      await dbRead.execute(sql`SELECT 1`);
      readReplicaHealthy = true;
    } catch (error) {
      errors.push(`Read replica unreachable: ${error instanceof Error ? error.message : 'Unknown error'}`);
      logger.error({ error }, 'Read replica health check failed');
    }

    // Get metrics if database is healthy
    if (primaryHealthy) {
      try {
        metrics = await this.getDatabaseMetrics();

        // Check for warning conditions
        if (metrics.cacheHitRatio < 0.95) {
          errors.push(`Low cache hit ratio: ${(metrics.cacheHitRatio * 100).toFixed(2)}% (should be >95%)`);
        }

        if (metrics.activeConnections > 40 && isProduction) {
          errors.push(`High active connections: ${metrics.activeConnections} (max 50)`);
        }

        if (metrics.slowQueries > 10) {
          errors.push(`${metrics.slowQueries} slow queries detected (>100ms)`);
        }

        if (metrics.idleInTransaction > 5) {
          errors.push(`${metrics.idleInTransaction} idle-in-transaction connections (potential locks)`);
        }
      } catch (error) {
        errors.push(`Failed to get metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Determine overall health status
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (!primaryHealthy) {
      status = 'unhealthy';
    } else if (errors.length > 0) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    const result: HealthCheckResult = {
      status,
      timestamp: new Date(),
      database: {
        primary: primaryHealthy,
        readReplica: readReplicaHealthy,
      },
      metrics,
      errors: errors.length > 0 ? errors : undefined,
    };

    // Log health check results
    if (status !== 'healthy') {
      logger.warn({ result }, `Database health check: ${status}`);
    } else {
      logger.info({ result }, 'Database health check: healthy');
    }

    return result;
  },

  /**
   * Запустить периодический мониторинг (каждые 60 секунд)
   */
  startPeriodicMonitoring(intervalSeconds: number = 60): NodeJS.Timeout | null {
    if (!isProduction) {
      logger.info('Periodic monitoring disabled in development mode');
      return null;
    }

    logger.info({ intervalSeconds }, 'Starting periodic database monitoring');

    return setInterval(async () => {
      try {
        const health = await this.healthCheck();

        if (health.status === 'unhealthy') {
          logger.error({ health }, 'CRITICAL: Database unhealthy!');
          // TODO: Send alert (email, Telegram, Slack, etc.)
        } else if (health.status === 'degraded') {
          logger.warn({ health }, 'WARNING: Database degraded');
          // TODO: Send warning notification
        }
      } catch (error) {
        logger.error({ error }, 'Error in periodic monitoring');
      }
    }, intervalSeconds * 1000);
  },
};
