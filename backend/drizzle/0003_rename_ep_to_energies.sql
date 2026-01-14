-- Migration: Rename Energy Points to Energies
-- Переименование Energy Points в Энергии

-- 1. Rename enum type
ALTER TYPE "ep_transaction_type" RENAME TO "energy_transaction_type";

-- 2. Rename table
ALTER TABLE "ep_transactions" RENAME TO "energy_transactions";

-- 3. Rename indexes
ALTER INDEX "ep_transactions_user_id_idx" RENAME TO "energy_transactions_user_id_idx";
ALTER INDEX "ep_transactions_created_at_idx" RENAME TO "energy_transactions_created_at_idx";
ALTER INDEX "ep_transactions_type_idx" RENAME TO "energy_transactions_type_idx";

-- 4. Rename column in users table
ALTER TABLE "users" RENAME COLUMN "energy_points" TO "energies";

-- 5. Rename column in stream_attendance table
ALTER TABLE "stream_attendance" RENAME COLUMN "ep_earned" TO "energies_earned";

-- 6. Rename column in weekly_reports table
ALTER TABLE "weekly_reports" RENAME COLUMN "ep_earned" TO "energies_earned";

-- 7. Rename column in user_content_progress table
ALTER TABLE "user_content_progress" RENAME COLUMN "ep_earned" TO "energies_earned";
