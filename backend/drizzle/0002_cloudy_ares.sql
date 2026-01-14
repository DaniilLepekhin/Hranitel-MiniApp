CREATE TYPE "public"."content_type" AS ENUM('course', 'podcast', 'stream_record', 'practice');--> statement-breakpoint
CREATE TYPE "public"."practice_content_type" AS ENUM('markdown', 'html');--> statement-breakpoint
CREATE TABLE "content_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "content_type" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"cover_url" text,
	"key_number" integer,
	"month_program" boolean DEFAULT false,
	"order_index" integer DEFAULT 0 NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_item_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_item_id" uuid NOT NULL,
	"content_type" "practice_content_type" NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_content_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content_item_id" uuid,
	"video_id" uuid,
	"watched" boolean DEFAULT false,
	"watch_time_seconds" integer DEFAULT 0,
	"completed_at" timestamp,
	"ep_earned" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_timecodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"time_seconds" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"order_index" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_section_id" uuid,
	"content_item_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"video_url" text NOT NULL,
	"duration_seconds" integer,
	"thumbnail_url" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_sections" ADD CONSTRAINT "content_sections_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_content" ADD CONSTRAINT "practice_content_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_content_progress" ADD CONSTRAINT "user_content_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_content_progress" ADD CONSTRAINT "user_content_progress_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_content_progress" ADD CONSTRAINT "user_content_progress_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_timecodes" ADD CONSTRAINT "video_timecodes_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_content_section_id_content_sections_id_fk" FOREIGN KEY ("content_section_id") REFERENCES "public"."content_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_content_item_id_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_items_type_idx" ON "content_items" USING btree ("type");--> statement-breakpoint
CREATE INDEX "content_items_key_number_idx" ON "content_items" USING btree ("key_number");--> statement-breakpoint
CREATE INDEX "content_items_month_program_idx" ON "content_items" USING btree ("month_program");--> statement-breakpoint
CREATE INDEX "content_items_order_index_idx" ON "content_items" USING btree ("order_index");--> statement-breakpoint
CREATE INDEX "content_sections_content_item_id_idx" ON "content_sections" USING btree ("content_item_id");--> statement-breakpoint
CREATE INDEX "content_sections_order_index_idx" ON "content_sections" USING btree ("order_index");--> statement-breakpoint
CREATE UNIQUE INDEX "practice_content_content_item_id_idx" ON "practice_content" USING btree ("content_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_content_progress_user_video_idx" ON "user_content_progress" USING btree ("user_id","video_id");--> statement-breakpoint
CREATE INDEX "user_content_progress_user_id_idx" ON "user_content_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_content_progress_content_item_id_idx" ON "user_content_progress" USING btree ("content_item_id");--> statement-breakpoint
CREATE INDEX "video_timecodes_video_id_idx" ON "video_timecodes" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "video_timecodes_order_index_idx" ON "video_timecodes" USING btree ("order_index");--> statement-breakpoint
CREATE INDEX "videos_content_section_id_idx" ON "videos" USING btree ("content_section_id");--> statement-breakpoint
CREATE INDEX "videos_content_item_id_idx" ON "videos" USING btree ("content_item_id");--> statement-breakpoint
CREATE INDEX "videos_order_index_idx" ON "videos" USING btree ("order_index");