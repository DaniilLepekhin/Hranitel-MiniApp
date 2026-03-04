-- Migration: Add referral program tables
-- Description: referral_agents and referral_payments for the referral program

CREATE TABLE IF NOT EXISTS "referral_agents" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "telegram_id" bigint NOT NULL UNIQUE,
    "full_name" text NOT NULL,
    "phone" text NOT NULL,
    "reason" text NOT NULL,
    "ref_code" text NOT NULL UNIQUE,
    "total_referrals" integer DEFAULT 0 NOT NULL,
    "pending_bonus" integer DEFAULT 0 NOT NULL,
    "total_bonus_earned" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "referral_agents_user_id_idx" ON "referral_agents" ("user_id");
CREATE INDEX IF NOT EXISTS "referral_agents_telegram_id_idx" ON "referral_agents" ("telegram_id");
CREATE INDEX IF NOT EXISTS "referral_agents_ref_code_idx" ON "referral_agents" ("ref_code");

CREATE TABLE IF NOT EXISTS "referral_payments" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "agent_id" uuid NOT NULL REFERENCES "referral_agents"("id") ON DELETE CASCADE,
    "referred_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "referred_telegram_id" bigint NOT NULL,
    "payment_id" uuid REFERENCES "payments"("id") ON DELETE SET NULL,
    "bonus_amount" integer NOT NULL,
    "status" varchar(20) DEFAULT 'pending' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "paid_at" timestamp
);

CREATE INDEX IF NOT EXISTS "referral_payments_agent_id_idx" ON "referral_payments" ("agent_id");
CREATE INDEX IF NOT EXISTS "referral_payments_referred_user_idx" ON "referral_payments" ("referred_user_id");
CREATE INDEX IF NOT EXISTS "referral_payments_status_idx" ON "referral_payments" ("status");
