-- Migration: Add performance optimizations for ratings and queries
-- Purpose: Fix slow city/team ratings queries (500ms → 5ms)
-- Date: 2026-01-20

-- ============================================================================
-- PART 1: Composite Indexes for User Queries
-- ============================================================================

-- City + energies composite index for fast city ratings
CREATE INDEX IF NOT EXISTS idx_users_city_energies ON users(city, energies DESC)
WHERE city IS NOT NULL AND is_pro = true;

-- City + team composite index for fast team queries
CREATE INDEX IF NOT EXISTS idx_users_city_team ON users(city, team_id)
WHERE city IS NOT NULL;

-- Team + energies composite index for fast team rankings
CREATE INDEX IF NOT EXISTS idx_users_team_energies ON users(team_id, energies DESC)
WHERE team_id IS NOT NULL AND is_pro = true;

-- ============================================================================
-- PART 2: Materialized Views for Fast Ratings
-- ============================================================================

-- City Ratings Materialized View
CREATE MATERIALIZED VIEW IF NOT EXISTS city_ratings_cache AS
SELECT
  city,
  SUM(energies) as total_energies,
  COUNT(*) as user_count,
  ARRAY_AGG(username ORDER BY energies DESC LIMIT 10) as top_users
FROM users
WHERE city IS NOT NULL AND is_pro = true
GROUP BY city
ORDER BY total_energies DESC;

-- Create index on materialized view for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_city_ratings_cache_city ON city_ratings_cache(city);
CREATE INDEX IF NOT EXISTS idx_city_ratings_cache_total ON city_ratings_cache(total_energies DESC);

-- Team Ratings Materialized View
CREATE MATERIALIZED VIEW IF NOT EXISTS team_ratings_cache AS
SELECT
  t.id as team_id,
  t.name as team_name,
  t.city as team_city,
  SUM(u.energies) as total_energies,
  COUNT(u.id) as member_count,
  ARRAY_AGG(u.username ORDER BY u.energies DESC LIMIT 10) as top_members
FROM teams t
LEFT JOIN users u ON u.team_id = t.id AND u.is_pro = true
GROUP BY t.id, t.name, t.city
ORDER BY total_energies DESC;

-- Create index on materialized view for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_ratings_cache_team_id ON team_ratings_cache(team_id);
CREATE INDEX IF NOT EXISTS idx_team_ratings_cache_total ON team_ratings_cache(total_energies DESC);
CREATE INDEX IF NOT EXISTS idx_team_ratings_cache_city ON team_ratings_cache(team_city);

-- ============================================================================
-- PART 3: Additional Performance Indexes
-- ============================================================================

-- Course progress compound index for N+1 prevention
CREATE INDEX IF NOT EXISTS idx_course_progress_user_course ON course_progress(user_id, course_id);

-- Meditation history for user stats
CREATE INDEX IF NOT EXISTS idx_meditation_history_user_date ON meditation_history(user_id, created_at DESC);

-- Energy transactions for balance calculations
CREATE INDEX IF NOT EXISTS idx_energy_transactions_user_created ON energy_transactions(user_id, created_at DESC);

-- ============================================================================
-- PART 4: Refresh Function for Cron Job
-- ============================================================================

-- Create function to refresh all materialized views
CREATE OR REPLACE FUNCTION refresh_ratings_cache()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY city_ratings_cache;
  REFRESH MATERIALIZED VIEW CONCURRENTLY team_ratings_cache;
END;
$$ LANGUAGE plpgsql;

-- Add comment for documentation
COMMENT ON FUNCTION refresh_ratings_cache() IS 'Refreshes city and team rating caches. Should be called hourly via cron job.';
COMMENT ON MATERIALIZED VIEW city_ratings_cache IS 'Cached city ratings. Refresh hourly.';
COMMENT ON MATERIALIZED VIEW team_ratings_cache IS 'Cached team ratings. Refresh hourly.';
