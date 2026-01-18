-- Migration 0006: Database-level optimizations
-- Production tuning and monitoring setup
-- Created: 2026-01-18

-- ============================================================================
-- DATABASE MAINTENANCE
-- ============================================================================

-- Full VACUUM ANALYZE to reclaim space and update statistics
VACUUM ANALYZE VERBOSE;

-- ============================================================================
-- TABLE-SPECIFIC AUTOVACUUM SETTINGS
-- Критические таблицы с высокой частотой изменений
-- ============================================================================

-- Users table: balance frequently updates
ALTER TABLE "users" SET (
  autovacuum_vacuum_scale_factor = 0.1,    -- Vacuum при 10% dead tuples
  autovacuum_analyze_scale_factor = 0.05   -- Analyze при 5% изменений
);

-- Energy transactions: high INSERT frequency
ALTER TABLE "energy_transactions" SET (
  autovacuum_vacuum_scale_factor = 0.1,
  autovacuum_analyze_scale_factor = 0.05
);

-- User content progress: frequently updated
ALTER TABLE "user_content_progress" SET (
  autovacuum_vacuum_scale_factor = 0.1,
  autovacuum_analyze_scale_factor = 0.05
);

-- ============================================================================
-- MONITORING EXTENSIONS
-- ============================================================================

-- Enable pg_stat_statements for query performance monitoring
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Enable pg_trgm for fast text search (если понадобится)
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- MONITORING VIEWS
-- ============================================================================

-- View for slow queries (>100ms)
CREATE OR REPLACE VIEW slow_queries AS
SELECT
  query,
  calls,
  total_exec_time,
  mean_exec_time,
  max_exec_time,
  stddev_exec_time,
  rows
FROM pg_stat_statements
WHERE mean_exec_time > 100  -- Запросы медленнее 100ms
ORDER BY mean_exec_time DESC
LIMIT 50;

-- View for table sizes (capacity planning)
CREATE OR REPLACE VIEW table_sizes AS
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  pg_total_relation_size(schemaname||'.'||tablename) AS size_bytes,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) -
                 pg_relation_size(schemaname||'.'||tablename)) AS index_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY size_bytes DESC;

-- View for index usage statistics
CREATE OR REPLACE VIEW index_usage AS
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- View for unused indexes (candidates for removal)
CREATE OR REPLACE VIEW unused_indexes AS
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan = 0
  AND indexrelname NOT LIKE '%_pkey'  -- Exclude primary keys
ORDER BY pg_relation_size(indexrelid) DESC;

-- View for cache hit ratios
CREATE OR REPLACE VIEW cache_hit_ratio AS
SELECT
  'index hit rate' AS name,
  (sum(idx_blks_hit)) / NULLIF(sum(idx_blks_hit + idx_blks_read), 0) AS ratio
FROM pg_statio_user_indexes
UNION ALL
SELECT
  'table hit rate' AS name,
  sum(heap_blks_hit) / NULLIF(sum(heap_blks_hit + heap_blks_read), 0) AS ratio
FROM pg_statio_user_tables;

-- View for database connections
CREATE OR REPLACE VIEW database_connections AS
SELECT
  datname,
  COUNT(*) FILTER (WHERE state = 'active') AS active,
  COUNT(*) FILTER (WHERE state = 'idle') AS idle,
  COUNT(*) FILTER (WHERE state = 'idle in transaction') AS idle_in_transaction,
  COUNT(*) FILTER (WHERE wait_event IS NOT NULL) AS waiting,
  COUNT(*) AS total
FROM pg_stat_activity
WHERE datname IS NOT NULL
GROUP BY datname;

-- ============================================================================
-- DOCUMENTATION
-- ============================================================================

COMMENT ON VIEW slow_queries IS
'Monitor slow queries (>100ms) for performance optimization';

COMMENT ON VIEW table_sizes IS
'Monitor table and index sizes for capacity planning';

COMMENT ON VIEW index_usage IS
'Monitor index usage statistics';

COMMENT ON VIEW unused_indexes IS
'Find unused indexes that can be removed to save space';

COMMENT ON VIEW cache_hit_ratio IS
'Monitor cache hit ratios (should be >0.99 for good performance)';

COMMENT ON VIEW database_connections IS
'Monitor active database connections by state';

-- ============================================================================
-- PRODUCTION POSTGRESQL.CONF RECOMMENDATIONS
-- ============================================================================

-- ⚠️ ВАЖНО: Следующие настройки нужно применить в postgresql.conf или через ALTER SYSTEM
-- Требуются права суперпользователя

-- Uncomment and run with superuser privileges:

-- Memory Settings (для сервера с 16GB RAM)
-- ALTER SYSTEM SET shared_buffers = '4GB';              -- 25% от RAM
-- ALTER SYSTEM SET effective_cache_size = '12GB';       -- 75% от RAM
-- ALTER SYSTEM SET maintenance_work_mem = '1GB';        -- Для VACUUM, CREATE INDEX
-- ALTER SYSTEM SET work_mem = '16MB';                   -- Для сортировки, хэширования

-- WAL Settings
-- ALTER SYSTEM SET wal_buffers = '16MB';
-- ALTER SYSTEM SET min_wal_size = '1GB';
-- ALTER SYSTEM SET max_wal_size = '4GB';
-- ALTER SYSTEM SET checkpoint_completion_target = 0.9;

-- Query Planner
-- ALTER SYSTEM SET default_statistics_target = 100;
-- ALTER SYSTEM SET random_page_cost = 1.1;              -- Для SSD
-- ALTER SYSTEM SET effective_io_concurrency = 200;      -- Для SSD

-- Parallelism (для multi-core CPU)
-- ALTER SYSTEM SET max_worker_processes = 8;
-- ALTER SYSTEM SET max_parallel_workers_per_gather = 4;
-- ALTER SYSTEM SET max_parallel_workers = 8;
-- ALTER SYSTEM SET max_parallel_maintenance_workers = 4;

-- Connection Settings
-- ALTER SYSTEM SET max_connections = 200;               -- Для 10K+ users

-- После изменений:
-- SELECT pg_reload_conf();
-- или перезапустить PostgreSQL

-- ============================================================================
-- FINAL STATISTICS UPDATE
-- ============================================================================

ANALYZE;
