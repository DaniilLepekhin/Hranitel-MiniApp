-- Add city_chat_id field to users table (references city_chats_ik.id in old DB)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "city_chat_id" INTEGER;
