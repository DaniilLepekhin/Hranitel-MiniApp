-- Migration 0005: Performance indexes for 10K+ users
-- Production-ready database optimization
-- Created: 2026-01-18
-- Target: Support 10,000+ concurrent users

-- ============================================================================
-- CRITICAL PERFORMANCE INDEXES
-- Using CONCURRENTLY to avoid table locks in production
-- ============================================================================

-- ============================================================================
-- USERS TABLE - Most critical for performance
-- ============================================================================

-- Composite index for global leaderboard (CRITICAL!)
-- Used in: GET /api/v1/ratings/leaderboard
CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_is_pro_energies_idx"
ON "users" USING btree ("is_pro", "energies" DESC)
WHERE "is_pro" = true;

-- Composite index for city ratings (CRITICAL!)
-- Used in: GET /api/v1/ratings/cities
CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_city_is_pro_energies_idx"
ON "users" USING btree ("city", "is_pro", "energies" DESC)
WHERE "city" IS NOT NULL AND "is_pro" = true;

-- Hash index for fast telegram_id lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_telegram_id_hash_idx"
ON "users" USING hash ("telegram_id");

-- Index for active users analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_last_active_date_idx"
ON "users" USING btree ("last_active_date" DESC NULLS LAST)
WHERE "last_active_date" IS NOT NULL;

-- Index for expiring subscriptions
CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_subscription_expires_idx"
ON "users" USING btree ("subscription_expires")
WHERE "is_pro" = true AND "subscription_expires" IS NOT NULL;

-- Index for leaderboard by level and experience
CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_level_experience_idx"
ON "users" USING btree ("level" DESC, "experience" DESC);

-- ============================================================================
-- TEAM_MEMBERS - Team functionality optimization
-- ============================================================================

-- Composite index for team member queries with sorting
CREATE INDEX CONCURRENTLY IF NOT EXISTS "team_members_team_id_joined_at_idx"
ON "team_members" USING btree ("team_id", "joined_at" DESC);

-- Index for finding user's teams
CREATE INDEX CONCURRENTLY IF NOT EXISTS "team_members_user_id_role_idx"
ON "team_members" USING btree ("user_id", "role");

-- ============================================================================
-- ENERGY_TRANSACTIONS - Critical for energy operations
-- ============================================================================

-- Composite index for user transaction history (most frequent query)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "energy_transactions_user_created_idx"
ON "energy_transactions" USING btree ("user_id", "created_at" DESC);

-- Partial index for income transactions
CREATE INDEX CONCURRENTLY IF NOT EXISTS "energy_transactions_income_idx"
ON "energy_transactions" USING btree ("user_id", "created_at" DESC, "amount")
WHERE "type" = 'income';

-- Partial index for expense transactions
CREATE INDEX CONCURRENTLY IF NOT EXISTS "energy_transactions_expense_idx"
ON "energy_transactions" USING btree ("user_id", "created_at" DESC, "amount")
WHERE "type" = 'expense';

-- Index for analytics by transaction type
CREATE INDEX CONCURRENTLY IF NOT EXISTS "energy_transactions_type_created_idx"
ON "energy_transactions" USING btree ("type", "created_at" DESC);

-- ============================================================================
-- USER_CONTENT_PROGRESS - Content progress optimization
-- ============================================================================

-- Composite index for unwatched content (frequent query)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_content_progress_user_watched_idx"
ON "user_content_progress" USING btree ("user_id", "watched", "updated_at" DESC)
WHERE "watched" = false;

-- Index for completed content with rewards
CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_content_progress_completed_energies_idx"
ON "user_content_progress" USING btree ("user_id", "completed_at" DESC, "energies_earned")
WHERE "completed_at" IS NOT NULL;

-- Index for content analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_content_progress_content_item_updated_idx"
ON "user_content_progress" USING btree ("content_item_id", "updated_at" DESC);

-- ============================================================================
-- STREAM_ATTENDANCE - Live stream optimization
-- ============================================================================

-- Composite index for stream statistics
CREATE INDEX CONCURRENTLY IF NOT EXISTS "stream_attendance_stream_watched_joined_idx"
ON "stream_attendance" USING btree ("stream_id", "watched_online", "joined_at" DESC);

-- Index for users who earned energies from streams
CREATE INDEX CONCURRENTLY IF NOT EXISTS "stream_attendance_user_energies_idx"
ON "stream_attendance" USING btree ("user_id", "energies_earned" DESC)
WHERE "energies_earned" > 0;

-- ============================================================================
-- WEEKLY_REPORTS - Reports optimization
-- ============================================================================

-- Composite index for week-based queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "weekly_reports_week_submitted_idx"
ON "weekly_reports" USING btree ("week_number" DESC, "submitted_at" DESC);

-- Index for pending reports (deadlines)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "weekly_reports_deadline_idx"
ON "weekly_reports" USING btree ("deadline")
WHERE "submitted_at" IS NULL;

-- ============================================================================
-- SHOP_PURCHASES - Shop optimization
-- ============================================================================

-- Composite index for user purchase history
CREATE INDEX CONCURRENTLY IF NOT EXISTS "shop_purchases_user_purchased_idx"
ON "shop_purchases" USING btree ("user_id", "purchased_at" DESC, "status");

-- Partial index for unused purchases (active items)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "shop_purchases_unused_idx"
ON "shop_purchases" USING btree ("user_id", "item_id", "purchased_at" DESC)
WHERE "status" = 'completed' AND "used_at" IS NULL;

-- Index for item popularity analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS "shop_purchases_item_purchased_idx"
ON "shop_purchases" USING btree ("item_id", "purchased_at" DESC)
WHERE "status" = 'completed';

-- ============================================================================
-- LIVE_STREAMS - Upcoming streams
-- ============================================================================

-- Index for upcoming/active streams
CREATE INDEX CONCURRENTLY IF NOT EXISTS "live_streams_status_scheduled_idx"
ON "live_streams" USING btree ("status", "scheduled_at")
WHERE "status" IN ('scheduled', 'live');

-- ============================================================================
-- USER_KEYS - 12 Keys system
-- ============================================================================

-- Composite index for user key progress
CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_keys_user_key_unlocked_idx"
ON "user_keys" USING btree ("user_id", "key_number", "is_unlocked");

-- Index for unlocked keys timeline
CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_keys_unlocked_at_idx"
ON "user_keys" USING btree ("unlocked_at" DESC NULLS LAST)
WHERE "is_unlocked" = true;

-- ============================================================================
-- COURSE_PROGRESS - Course system
-- ============================================================================

-- Composite index for active courses
CREATE INDEX CONCURRENTLY IF NOT EXISTS "course_progress_user_accessed_idx"
ON "course_progress" USING btree ("user_id", "last_accessed_at" DESC);

-- ============================================================================
-- MEDITATION_HISTORY - Meditation tracking
-- ============================================================================

-- Composite index for completed meditations
CREATE INDEX CONCURRENTLY IF NOT EXISTS "meditation_history_user_completed_created_idx"
ON "meditation_history" USING btree ("user_id", "completed", "created_at" DESC);

-- ============================================================================
-- XP_HISTORY - Experience tracking
-- ============================================================================

-- Composite index for user XP history
CREATE INDEX CONCURRENTLY IF NOT EXISTS "xp_history_user_created_amount_idx"
ON "xp_history" USING btree ("user_id", "created_at" DESC, "amount");

-- ============================================================================
-- UPDATE STATISTICS FOR QUERY PLANNER
-- ============================================================================

ANALYZE "users";
ANALYZE "team_members";
ANALYZE "energy_transactions";
ANALYZE "user_content_progress";
ANALYZE "stream_attendance";
ANALYZE "weekly_reports";
ANALYZE "shop_purchases";
ANALYZE "live_streams";
ANALYZE "user_keys";
ANALYZE "course_progress";
ANALYZE "meditation_history";
ANALYZE "xp_history";

-- ============================================================================
-- DOCUMENTATION
-- ============================================================================

COMMENT ON INDEX "users_is_pro_energies_idx" IS
'Composite index for global leaderboard - CRITICAL for 10K+ users performance';

COMMENT ON INDEX "users_city_is_pro_energies_idx" IS
'Composite index for city ratings - CRITICAL for 10K+ users performance';

COMMENT ON INDEX "energy_transactions_user_created_idx" IS
'Composite index for user transaction history - frequently accessed';

COMMENT ON INDEX "user_content_progress_user_watched_idx" IS
'Partial index for unwatched content - performance optimization';
