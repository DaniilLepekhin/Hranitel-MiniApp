-- Migration 0018: Add year column to weekly_reports to prevent cross-year week number collisions
-- The uniqueIndex (userId, weekNumber) is insufficient — week 1 of 2026 clashes with week 1 of 2027.

-- 1. Add year column (nullable first so we can backfill)
ALTER TABLE weekly_reports ADD COLUMN IF NOT EXISTS year INTEGER;

-- 2. Backfill existing rows from submitted_at timestamp
UPDATE weekly_reports SET year = EXTRACT(year FROM submitted_at)::integer WHERE year IS NULL;

-- 3. Make NOT NULL
ALTER TABLE weekly_reports ALTER COLUMN year SET NOT NULL;

-- 4. Drop old unique index (userId, weekNumber)
DROP INDEX IF EXISTS weekly_reports_user_week_idx;

-- 5. Create new unique index including year
CREATE UNIQUE INDEX IF NOT EXISTS weekly_reports_user_week_year_idx
  ON weekly_reports (user_id, week_number, year);
