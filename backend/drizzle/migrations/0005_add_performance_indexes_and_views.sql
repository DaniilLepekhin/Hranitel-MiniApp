-- Migration: Add performance optimizations for ratings and queries
-- Purpose: Fix slow city/team ratings queries (500ms → 5ms)
-- Date: 2026-01-20

-- ============================================================================
-- PART 1: Composite Indexes for User Queries
-- ============================================================================

-- City + energies composite index for fast city ratings (already exists, skip if exists)
CREATE INDEX IF NOT EXISTS idx_users_city_energies ON users(city, energies DESC)
WHERE city IS NOT NULL AND is_pro = true;

-- ============================================================================
-- PART 2: Materialized Views for Fast Ratings
-- ============================================================================

-- City Ratings Materialized View
-- Note: Using subquery instead of ARRAY_AGG with LIMIT for PostgreSQL compatibility
CREATE MATERIALIZED VIEW IF NOT EXISTS city_ratings_cache AS
SELECT
  city,
  SUM(energies) as total_energies,
  COUNT(*) as user_count,
  (
    SELECT ARRAY_AGG(username ORDER BY energies DESC)
    FROM (
      SELECT username, energies
      FROM users u2
      WHERE u2.city = u1.city AND u2.is_pro = true
      ORDER BY energies DESC
      LIMIT 10
    ) top_users_subquery
  ) as top_users
FROM users u1
WHERE city IS NOT NULL AND is_pro = true
GROUP BY city
ORDER BY total_energies DESC;

-- Create indexes on materialized view for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_city_ratings_cache_city ON city_ratings_cache(city);
CREATE INDEX IF NOT EXISTS idx_city_ratings_cache_total ON city_ratings_cache(total_energies DESC);

-- Team Ratings Materialized View
CREATE MATERIALIZED VIEW IF NOT EXISTS team_ratings_cache AS
SELECT
  t.id as team_id,
  t.name as team_name,
  t.city_chat as team_city,
  COALESCE(SUM(u.energies), 0) as total_energies,
  COUNT(tm.user_id) as member_count,
  (
    SELECT ARRAY_AGG(username ORDER BY energies DESC)
    FROM (
      SELECT u3.username, u3.energies
      FROM team_members tm2
      JOIN users u3 ON u3.id = tm2.user_id
      WHERE tm2.team_id = t.id AND u3.is_pro = true
      ORDER BY u3.energies DESC
      LIMIT 10
    ) top_members_subquery
  ) as top_members
FROM teams t
LEFT JOIN team_members tm ON tm.team_id = t.id
LEFT JOIN users u ON u.id = tm.user_id AND u.is_pro = true
GROUP BY t.id, t.name, t.city_chat
ORDER BY total_energies DESC;

-- Create indexes on team materialized view for fast lookups
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

-- Team members compound index for team queries
CREATE INDEX IF NOT EXISTS idx_team_members_team_user ON team_members(team_id, user_id);

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

-- Add comments for documentation
COMMENT ON FUNCTION refresh_ratings_cache() IS 'Refreshes city and team rating caches. Should be called hourly via cron job.';
COMMENT ON MATERIALIZED VIEW city_ratings_cache IS 'Cached city ratings. Refresh hourly.';
COMMENT ON MATERIALIZED VIEW team_ratings_cache IS 'Cached team (десятка) ratings. Refresh hourly.';
