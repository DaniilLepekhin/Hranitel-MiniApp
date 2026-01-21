-- Add contact fields to payment_analytics table
ALTER TABLE "payment_analytics" ADD COLUMN "name" TEXT;
ALTER TABLE "payment_analytics" ADD COLUMN "email" TEXT;
ALTER TABLE "payment_analytics" ADD COLUMN "phone" TEXT;
