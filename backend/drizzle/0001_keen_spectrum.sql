CREATE TYPE "public"."ep_transaction_type" AS ENUM('income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."shop_category" AS ENUM('elite', 'secret', 'savings');--> statement-breakpoint
CREATE TYPE "public"."shop_item_type" AS ENUM('raffle_ticket', 'lesson', 'discount');--> statement-breakpoint
CREATE TYPE "public"."stream_status" AS ENUM('scheduled', 'live', 'ended');--> statement-breakpoint
CREATE TABLE "ep_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"type" "ep_transaction_type" NOT NULL,
	"reason" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_streams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"scheduled_at" timestamp NOT NULL,
	"stream_url" text,
	"host" text,
	"status" "stream_status" DEFAULT 'scheduled' NOT NULL,
	"ep_reward" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" "shop_category" NOT NULL,
	"price" integer NOT NULL,
	"image_url" text,
	"item_type" "shop_item_type" NOT NULL,
	"item_data" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"price" integer NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"purchased_at" timestamp DEFAULT now() NOT NULL,
	"used_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "stream_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stream_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"watched_online" boolean DEFAULT false NOT NULL,
	"ep_earned" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"metka" text,
	"city_chat" text,
	"member_count" integer DEFAULT 0 NOT NULL,
	"max_members" integer DEFAULT 12 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"key_number" integer NOT NULL,
	"is_unlocked" boolean DEFAULT false NOT NULL,
	"unlocked_at" timestamp,
	"progress" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"week_number" integer NOT NULL,
	"content" text NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"deadline" timestamp NOT NULL,
	"ep_earned" integer DEFAULT 100 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "key_number" integer;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "month_theme" text;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "unlock_condition" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "energy_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "ep_transactions" ADD CONSTRAINT "ep_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_purchases" ADD CONSTRAINT "shop_purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_purchases" ADD CONSTRAINT "shop_purchases_item_id_shop_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."shop_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_attendance" ADD CONSTRAINT "stream_attendance_stream_id_live_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."live_streams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_attendance" ADD CONSTRAINT "stream_attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_keys" ADD CONSTRAINT "user_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ep_transactions_user_id_idx" ON "ep_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ep_transactions_created_at_idx" ON "ep_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ep_transactions_type_idx" ON "ep_transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "live_streams_scheduled_at_idx" ON "live_streams" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "live_streams_status_idx" ON "live_streams" USING btree ("status");--> statement-breakpoint
CREATE INDEX "shop_items_category_idx" ON "shop_items" USING btree ("category");--> statement-breakpoint
CREATE INDEX "shop_items_sort_order_idx" ON "shop_items" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "shop_items_is_active_idx" ON "shop_items" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "shop_purchases_user_id_idx" ON "shop_purchases" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shop_purchases_item_id_idx" ON "shop_purchases" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "shop_purchases_status_idx" ON "shop_purchases" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "stream_attendance_stream_user_idx" ON "stream_attendance" USING btree ("stream_id","user_id");--> statement-breakpoint
CREATE INDEX "stream_attendance_user_id_idx" ON "stream_attendance" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stream_attendance_stream_id_idx" ON "stream_attendance" USING btree ("stream_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_members_team_user_idx" ON "team_members" USING btree ("team_id","user_id");--> statement-breakpoint
CREATE INDEX "team_members_user_id_idx" ON "team_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "team_members_team_id_idx" ON "team_members" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "teams_metka_idx" ON "teams" USING btree ("metka");--> statement-breakpoint
CREATE UNIQUE INDEX "user_keys_user_key_idx" ON "user_keys" USING btree ("user_id","key_number");--> statement-breakpoint
CREATE INDEX "user_keys_user_id_idx" ON "user_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_keys_key_number_idx" ON "user_keys" USING btree ("key_number");--> statement-breakpoint
CREATE INDEX "weekly_reports_user_id_idx" ON "weekly_reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "weekly_reports_week_number_idx" ON "weekly_reports" USING btree ("week_number");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_reports_user_week_idx" ON "weekly_reports" USING btree ("user_id","week_number");--> statement-breakpoint
CREATE INDEX "courses_key_number_idx" ON "courses" USING btree ("key_number");