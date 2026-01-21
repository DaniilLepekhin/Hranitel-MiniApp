-- Add contact fields to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" TEXT;

-- Add contact fields to payments table
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "phone" TEXT;
