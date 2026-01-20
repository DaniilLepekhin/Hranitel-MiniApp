-- Migration: Add onboarding and gift subscription fields
-- Created: 2026-01-20

-- 1. Add new fields to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS first_purchase_date TIMESTAMP,
  ADD COLUMN IF NOT EXISTS gifted BOOLEAN DEFAULT FALSE NOT NULL,
  ADD COLUMN IF NOT EXISTS gifted_by BIGINT,
  ADD COLUMN IF NOT EXISTS onboarding_step TEXT;

-- 2. Create gift_subscriptions table
CREATE TABLE IF NOT EXISTS gift_subscriptions (
  id SERIAL PRIMARY KEY,
  gifter_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_tg_id BIGINT NOT NULL,
  payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  activated BOOLEAN DEFAULT FALSE NOT NULL,
  activation_token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  activated_at TIMESTAMP
);

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_gift_subscriptions_recipient_tg_id
  ON gift_subscriptions(recipient_tg_id);

CREATE INDEX IF NOT EXISTS idx_gift_subscriptions_activation_token
  ON gift_subscriptions(activation_token);

CREATE INDEX IF NOT EXISTS idx_gift_subscriptions_activated
  ON gift_subscriptions(activated);

CREATE INDEX IF NOT EXISTS idx_users_onboarding_step
  ON users(onboarding_step) WHERE onboarding_step IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_first_purchase_date
  ON users(first_purchase_date) WHERE first_purchase_date IS NOT NULL;

-- 4. Backfill first_purchase_date for existing users with successful payments
UPDATE users
SET first_purchase_date = (
  SELECT MIN(created_at)
  FROM payments
  WHERE payments.user_id = users.id
    AND payments.status = 'succeeded'
)
WHERE is_pro = TRUE
  AND first_purchase_date IS NULL
  AND EXISTS (
    SELECT 1 FROM payments
    WHERE payments.user_id = users.id
      AND payments.status = 'succeeded'
  );

-- 5. Add comment for documentation
COMMENT ON TABLE gift_subscriptions IS 'Stores gift subscription information for the referral gift program';
COMMENT ON COLUMN users.first_purchase_date IS 'Date of first successful payment, used for engagement funnel scheduling';
COMMENT ON COLUMN users.gifted IS 'Whether user received subscription as a gift';
COMMENT ON COLUMN users.gifted_by IS 'Telegram ID of the user who gifted the subscription';
COMMENT ON COLUMN users.onboarding_step IS 'Current step in post-payment onboarding flow';
