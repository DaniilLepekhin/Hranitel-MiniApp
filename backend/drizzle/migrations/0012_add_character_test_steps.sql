-- Migration: Add character test steps to club_funnel_step enum
-- Purpose: Support separate character test funnel for paid users
-- Date: 2026-01-28

-- Add new enum values for character test funnel
ALTER TYPE club_funnel_step ADD VALUE IF NOT EXISTS 'character_test_birthdate_confirmed';
ALTER TYPE club_funnel_step ADD VALUE IF NOT EXISTS 'character_test_showing_star';
ALTER TYPE club_funnel_step ADD VALUE IF NOT EXISTS 'character_test_archetype';
ALTER TYPE club_funnel_step ADD VALUE IF NOT EXISTS 'character_test_style';
ALTER TYPE club_funnel_step ADD VALUE IF NOT EXISTS 'character_test_scale';
ALTER TYPE club_funnel_step ADD VALUE IF NOT EXISTS 'character_test_complete';

-- Add comment for documentation
COMMENT ON TYPE club_funnel_step IS 'Steps for club funnel and character test funnel';
