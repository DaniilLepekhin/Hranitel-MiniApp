-- Migration: Create payments table
-- Purpose: Fix broken FK constraint in gift_subscriptions.payment_id
-- Date: 2026-01-20

-- Create payments table
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'RUB',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  payment_provider VARCHAR(50),
  external_payment_id VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Add indexes for performance
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_external_id ON payments(external_payment_id);
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);

-- Add comment for documentation
COMMENT ON TABLE payments IS 'Payment records for subscriptions and gifts';
COMMENT ON COLUMN payments.status IS 'pending, completed, failed, refunded';
COMMENT ON COLUMN payments.metadata IS 'Additional payment data (gift recipient, etc.)';
