CREATE TYPE "public"."chat_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."course_category" AS ENUM('mindset', 'spiritual', 'esoteric', 'health');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"icon" text,
	"xp_reward" integer DEFAULT 0 NOT NULL,
	"condition" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "achievements_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "chat_role" NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"day_number" integer NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"audio_url" text,
	"video_url" text,
	"pdf_url" text,
	"welcome_content" text,
	"course_info" text,
	"meditation_guide" text,
	"additional_content" text,
	"gift_content" text,
	"stream_link" text,
	"is_premium" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"current_day" integer DEFAULT 1 NOT NULL,
	"completed_days" jsonb DEFAULT '[]'::jsonb,
	"last_accessed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" "course_category" DEFAULT 'mindset' NOT NULL,
	"cover_url" text,
	"is_premium" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meditation_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"meditation_id" uuid NOT NULL,
	"duration_listened" integer DEFAULT 0 NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meditations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"duration" integer NOT NULL,
	"cover_url" text,
	"audio_url" text,
	"audio_series" jsonb DEFAULT '[]'::jsonb,
	"category" text DEFAULT 'relaxation',
	"is_premium" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"achievement_id" uuid NOT NULL,
	"unlocked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_id" text NOT NULL,
	"username" text,
	"first_name" text,
	"last_name" text,
	"photo_url" text,
	"language_code" text DEFAULT 'ru',
	"level" integer DEFAULT 1 NOT NULL,
	"experience" integer DEFAULT 0 NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"last_active_date" timestamp,
	"is_pro" boolean DEFAULT false NOT NULL,
	"subscription_expires" timestamp,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_telegram_id_unique" UNIQUE("telegram_id")
);
--> statement-breakpoint
CREATE TABLE "xp_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_days" ADD CONSTRAINT "course_days_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_progress" ADD CONSTRAINT "course_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_progress" ADD CONSTRAINT "course_progress_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meditation_history" ADD CONSTRAINT "meditation_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meditation_history" ADD CONSTRAINT "meditation_history_meditation_id_meditations_id_fk" FOREIGN KEY ("meditation_id") REFERENCES "public"."meditations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_history" ADD CONSTRAINT "xp_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_user_id_idx" ON "chat_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_messages_created_at_idx" ON "chat_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "course_days_course_id_idx" ON "course_days" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_days_course_day_idx" ON "course_days" USING btree ("course_id","day_number");--> statement-breakpoint
CREATE UNIQUE INDEX "course_progress_user_course_idx" ON "course_progress" USING btree ("user_id","course_id");--> statement-breakpoint
CREATE INDEX "course_progress_user_id_idx" ON "course_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "courses_category_idx" ON "courses" USING btree ("category");--> statement-breakpoint
CREATE INDEX "courses_sort_order_idx" ON "courses" USING btree ("sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_user_course_idx" ON "favorites" USING btree ("user_id","course_id");--> statement-breakpoint
CREATE INDEX "favorites_user_id_idx" ON "favorites" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "meditation_history_user_id_idx" ON "meditation_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "meditation_history_meditation_id_idx" ON "meditation_history" USING btree ("meditation_id");--> statement-breakpoint
CREATE INDEX "meditations_category_idx" ON "meditations" USING btree ("category");--> statement-breakpoint
CREATE INDEX "meditations_sort_order_idx" ON "meditations" USING btree ("sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "user_achievements_user_achievement_idx" ON "user_achievements" USING btree ("user_id","achievement_id");--> statement-breakpoint
CREATE INDEX "user_achievements_user_id_idx" ON "user_achievements" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_telegram_id_idx" ON "users" USING btree ("telegram_id");--> statement-breakpoint
CREATE INDEX "users_level_idx" ON "users" USING btree ("level");--> statement-breakpoint
CREATE INDEX "xp_history_user_id_idx" ON "xp_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "xp_history_created_at_idx" ON "xp_history" USING btree ("created_at");