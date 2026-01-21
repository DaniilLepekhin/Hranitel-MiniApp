-- Add lava_contact_id to users table for subscription management
ALTER TABLE "users" ADD COLUMN "lava_contact_id" TEXT;

-- Add lava_contact_id to payments table
ALTER TABLE "payments" ADD COLUMN "lava_contact_id" TEXT;
CREATE INDEX IF NOT EXISTS "payments_lava_contact_id_idx" ON "payments" ("lava_contact_id");

-- Create payment_analytics table for tracking form opens, payment attempts, and conversions
CREATE TABLE IF NOT EXISTS "payment_analytics" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "telegram_id" TEXT NOT NULL,
  "event_type" VARCHAR(50) NOT NULL, -- form_open, payment_attempt, payment_success

  -- UTM метки
  "utm_campaign" TEXT,
  "utm_medium" TEXT,
  "utm_source" TEXT,
  "utm_content" TEXT,
  "client_id" TEXT,
  "metka" TEXT, -- Уникальная комбинация utm_campaign_utm_medium

  -- Payment data (для payment_attempt и payment_success)
  "payment_method" VARCHAR(10), -- RUB, USD, EUR
  "amount" NUMERIC(10, 2),
  "currency" VARCHAR(3),
  "payment_id" UUID REFERENCES "payments"("id") ON DELETE SET NULL,

  -- Additional data
  "metadata" JSONB DEFAULT '{}',
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create indexes for payment_analytics
CREATE INDEX IF NOT EXISTS "payment_analytics_telegram_id_idx" ON "payment_analytics" ("telegram_id");
CREATE INDEX IF NOT EXISTS "payment_analytics_event_type_idx" ON "payment_analytics" ("event_type");
CREATE INDEX IF NOT EXISTS "payment_analytics_metka_idx" ON "payment_analytics" ("metka");
CREATE INDEX IF NOT EXISTS "payment_analytics_utm_campaign_idx" ON "payment_analytics" ("utm_campaign");
CREATE INDEX IF NOT EXISTS "payment_analytics_payment_method_idx" ON "payment_analytics" ("payment_method");
CREATE INDEX IF NOT EXISTS "payment_analytics_created_at_idx" ON "payment_analytics" ("created_at");
CREATE INDEX IF NOT EXISTS "payment_analytics_metka_event_idx" ON "payment_analytics" ("metka", "event_type");
