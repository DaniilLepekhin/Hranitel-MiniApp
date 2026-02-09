-- Migration 0014: Add energy expiry fields to energy_transactions
-- Energy points expire after 6 months (per "Геймификация" document)
-- Records are NOT deleted — only marked as is_expired. Can be restored manually.

-- Add expires_at column (NULL = never expires, e.g. for expense transactions)
ALTER TABLE energy_transactions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;

-- Add is_expired flag (soft-delete: true = expired, not counted in balance)
ALTER TABLE energy_transactions ADD COLUMN IF NOT EXISTS is_expired BOOLEAN DEFAULT false NOT NULL;

-- Index for efficient expiry checks (cron job queries this)
CREATE INDEX IF NOT EXISTS energy_transactions_expires_idx ON energy_transactions (expires_at);

-- Backfill: set expires_at for all existing income transactions (6 months from creation)
UPDATE energy_transactions
SET expires_at = created_at + INTERVAL '6 months'
WHERE type = 'income' AND expires_at IS NULL;
