-- Migration 0004: Add city field and basic optimization
-- Critical fix for ratings functionality
-- Created: 2026-01-18

-- ============================================================================
-- CRITICAL: Add city field to users table
-- ============================================================================

BEGIN;

-- 1. Add city column to users table
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "city" text;

-- 2. Create index for city-based queries (ratings, teams)
CREATE INDEX IF NOT EXISTS "users_city_idx"
ON "users" USING btree ("city")
WHERE "city" IS NOT NULL;

-- 3. Migrate existing city data from metadata JSONB to dedicated column
-- This handles users who were previously storing city in metadata
UPDATE "users"
SET "city" = (metadata->>'city')::text
WHERE metadata ? 'city'
  AND metadata->>'city' IS NOT NULL
  AND "city" IS NULL;

-- 4. Add documentation comment
COMMENT ON COLUMN "users"."city" IS
'Город пользователя для рейтингов по городам и распределения по командам';

COMMIT;

-- Update table statistics for query planner
ANALYZE "users";