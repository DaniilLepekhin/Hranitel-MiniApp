-- Migration: Create club_funnel_progress table
-- Purpose: Track numerology-based club funnel progress
-- Date: 2026-01-21

-- Create club funnel step enum
DO $$ BEGIN
  CREATE TYPE club_funnel_step AS ENUM (
    'start',
    'awaiting_ready',
    'awaiting_birthdate',
    'birthdate_confirmed',
    'showing_star',
    'showing_archetype',
    'awaiting_style_button',
    'showing_style',
    'awaiting_subscribe',
    'subscribed',
    'showing_scale',
    'awaiting_roadmap',
    'showing_roadmap',
    'awaiting_purchase',
    'completed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create club_funnel_progress table
CREATE TABLE IF NOT EXISTS club_funnel_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  telegram_id TEXT NOT NULL,

  -- Birthdate data
  birth_date TEXT,
  birth_day_number INTEGER,
  archetype_number INTEGER,

  -- Progress tracking
  current_step club_funnel_step NOT NULL DEFAULT 'start',
  subscribed_to_channel BOOLEAN NOT NULL DEFAULT FALSE,

  -- Metadata
  star_image_url TEXT,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS club_funnel_progress_user_id_idx ON club_funnel_progress(user_id);
CREATE INDEX IF NOT EXISTS club_funnel_progress_telegram_id_idx ON club_funnel_progress(telegram_id);
CREATE INDEX IF NOT EXISTS club_funnel_progress_current_step_idx ON club_funnel_progress(current_step);

-- Add comments for documentation
COMMENT ON TABLE club_funnel_progress IS 'Club numerology funnel progress tracking';
COMMENT ON COLUMN club_funnel_progress.birth_date IS 'Format: DD.MM.YYYY';
COMMENT ON COLUMN club_funnel_progress.birth_day_number IS '1-31 (день рождения)';
COMMENT ON COLUMN club_funnel_progress.archetype_number IS '1-22 (номер архетипа богини)';
COMMENT ON COLUMN club_funnel_progress.star_image_url IS 'URL изображения звезды от n8n webhook';
