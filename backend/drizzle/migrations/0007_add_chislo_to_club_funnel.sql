-- Migration: Add chislo column to club_funnel_progress
-- Purpose: Store number from webhook for conditional message logic
-- Date: 2026-01-21

-- Add chislo column
ALTER TABLE club_funnel_progress
ADD COLUMN IF NOT EXISTS chislo INTEGER;

-- Add comment for documentation
COMMENT ON COLUMN club_funnel_progress.chislo IS 'Число от webhook zvezda_club_generated_chislo для условной логики сообщений';
