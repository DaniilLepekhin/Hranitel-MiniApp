-- Migration: Add leader_test_city_quotas table
-- Description: Table for storing city quotas for the "Leader of Ten" test

CREATE TABLE IF NOT EXISTS "leader_test_city_quotas" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "city" text NOT NULL UNIQUE,
    "max_passed" integer NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "leader_test_city_quotas_city_idx" ON "leader_test_city_quotas" ("city");
