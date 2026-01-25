-- Migration: Add subscription_history table for tracking renewals/cancellations
-- This table tracks all subscription events for analytics dashboard

CREATE TABLE IF NOT EXISTS "subscription_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"telegram_id" bigint NOT NULL,
	"event_type" varchar(20) NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"payment_id" uuid,
	"amount" numeric(10, 2),
	"currency" varchar(3) DEFAULT 'RUB',
	"source" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- Foreign key constraints
DO $$ BEGIN
 ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS "subscription_history_user_id_idx" ON "subscription_history" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "subscription_history_telegram_id_idx" ON "subscription_history" USING btree ("telegram_id");
CREATE INDEX IF NOT EXISTS "subscription_history_event_type_idx" ON "subscription_history" USING btree ("event_type");
CREATE INDEX IF NOT EXISTS "subscription_history_period_end_idx" ON "subscription_history" USING btree ("period_end");
CREATE INDEX IF NOT EXISTS "subscription_history_created_at_idx" ON "subscription_history" USING btree ("created_at");

-- Composite index for date range queries
CREATE INDEX IF NOT EXISTS "subscription_history_period_range_idx" ON "subscription_history" USING btree ("period_start", "period_end");
