-- Add is_ambassador column to users table
-- Ambassadors can join any decade chat without counting towards member limits
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_ambassador BOOLEAN NOT NULL DEFAULT false;

-- Index for quick ambassador lookups
CREATE INDEX IF NOT EXISTS users_ambassador_idx ON users (is_ambassador) WHERE is_ambassador = true;
