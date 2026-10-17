CREATE TYPE "public"."credential_kind" AS ENUM('password', 'pin');--> statement-breakpoint
CREATE TYPE "public"."location_precision" AS ENUM('approximate', 'exact');--> statement-breakpoint
CREATE TYPE "public"."moderation_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."photo_kind" AS ENUM('profile', 'cover', 'gallery', 'customer');--> statement-breakpoint
CREATE TYPE "public"."photo_source" AS ENUM('vendor', 'customer');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('spam', 'offensive', 'harassment', 'unsafe', 'wrong_info', 'privacy', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'dismissed', 'upheld', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."report_target" AS ENUM('vendor', 'photo', 'review', 'status_post', 'upcoming_post');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('customer', 'vendor', 'admin');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('none', 'verified', 'revoked');--> statement-breakpoint
CREATE TABLE "analytics_daily" (
	"vendor_id" uuid NOT NULL,
	"day" date NOT NULL,
	"profile_views" integer DEFAULT 0 NOT NULL,
	"map_impressions" integer DEFAULT 0 NOT NULL,
	"directions_taps" integer DEFAULT 0 NOT NULL,
	"favorites_added" integer DEFAULT 0 NOT NULL,
	"favorites_removed" integer DEFAULT 0 NOT NULL,
	"confirmations" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "analytics_daily_vendor_id_day_pk" PRIMARY KEY("vendor_id","day")
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"refresh_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_refresh_hash_unique" UNIQUE("refresh_hash")
);
--> statement-breakpoint
CREATE TABLE "deleted_entities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vendor_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"user_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"notify_on_open" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_id_vendor_id_pk" PRIMARY KEY("user_id","vendor_id")
);
--> statement-breakpoint
CREATE TABLE "hash_peppers" (
	"epoch" integer PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"max_redemptions" integer,
	"redemption_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"disabled" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invite_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_cents" integer NOT NULL,
	"sold_out" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"client_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_items_price_nonneg" CHECK ("menu_items"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"uploader_user_id" uuid,
	"source" "photo_source" NOT NULL,
	"kind" "photo_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"thumb_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"caption" text,
	"moderation" "moderation_status" DEFAULT 'pending' NOT NULL,
	"hidden_by_vendor" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"expo_token" text NOT NULL,
	"platform" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_devices_expo_token_unique" UNIQUE("expo_token")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_user_id" uuid,
	"target_type" "report_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" "report_reason" NOT NULL,
	"details" text,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"admin_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"moderation" "moderation_status" DEFAULT 'approved' NOT NULL,
	"vendor_reply" text,
	"vendor_reply_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_one_per_user" UNIQUE("vendor_id","user_id"),
	CONSTRAINT "reviews_rating_range" CHECK ("reviews"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "schedule_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"public_point" geography(Point, 4326),
	"precision" "location_precision" DEFAULT 'approximate' NOT NULL,
	"cell_key" text,
	"place_label" text,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_weekday_valid" CHECK ("schedule_entries"."weekday" BETWEEN 0 AND 6)
);
--> statement-breakpoint
CREATE TABLE "still_here_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"confirmer_hash" text NOT NULL,
	"epoch" integer NOT NULL,
	"local_day" date NOT NULL,
	"counted" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag_synonyms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tag_id" uuid NOT NULL,
	"phrase" text NOT NULL,
	"lang" text DEFAULT 'any' NOT NULL,
	CONSTRAINT "tag_synonyms_tag_phrase" UNIQUE("tag_id","phrase")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name_en" text NOT NULL,
	"name_es" text NOT NULL,
	"category" text,
	CONSTRAINT "tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "upcoming_spot_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"public_point" geography(Point, 4326) NOT NULL,
	"precision" "location_precision" NOT NULL,
	"cell_key" text,
	"place_label" text,
	"note" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"client_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "upcoming_window_valid" CHECK ("upcoming_spot_posts"."ends_at" > "upcoming_spot_posts"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content_type" text NOT NULL,
	"total_bytes" integer NOT NULL,
	"received_bytes" integer DEFAULT 0 NOT NULL,
	"tmp_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"blocker_user_id" uuid NOT NULL,
	"blocked_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_blocker_user_id_blocked_user_id_pk" PRIMARY KEY("blocker_user_id","blocked_user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" "user_role" NOT NULL,
	"email" "citext",
	"phone" text,
	"password_hash" text NOT NULL,
	"credential_kind" "credential_kind" DEFAULT 'password' NOT NULL,
	"display_name" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_identifier_present" CHECK ("users"."email" IS NOT NULL OR "users"."phone" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "vendor_live_sessions" (
	"vendor_id" uuid PRIMARY KEY NOT NULL,
	"public_point" geography(Point, 4326) NOT NULL,
	"precision" "location_precision" NOT NULL,
	"cell_key" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"last_confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "vendor_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"payment_methods" text[] DEFAULT '{}'::text[] NOT NULL,
	"price_level" smallint,
	"default_precision" "location_precision" DEFAULT 'approximate' NOT NULL,
	"contact_text" text,
	"contact_visible" boolean DEFAULT false NOT NULL,
	"timezone" text DEFAULT 'America/Los_Angeles' NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"profile_photo_id" uuid,
	"cover_photo_id" uuid,
	"quick_start_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_live_at" timestamp with time zone,
	"search_doc" "tsvector",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "vendor_profiles_price_level" CHECK ("vendor_profiles"."price_level" IS NULL OR "vendor_profiles"."price_level" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE TABLE "vendor_status_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"body" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"client_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_tags" (
	"vendor_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "vendor_tags_vendor_id_tag_id_pk" PRIMARY KEY("vendor_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "verification_progress" (
	"vendor_id" uuid PRIMARY KEY NOT NULL,
	"live_days" integer DEFAULT 0 NOT NULL,
	"last_live_day" date,
	"confirmations_met_at" timestamp with time zone,
	"status" "verification_status" DEFAULT 'none' NOT NULL,
	"verified_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics_daily" ADD CONSTRAINT "analytics_daily_vendor_id_vendor_profiles_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deleted_entities" ADD CONSTRAINT "deleted_entities_vendor_id_vendor_profiles_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_vendor_id_vendor_profiles_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_vendor_id_vendor_profiles_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_vendor_id_vendor_profiles_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_uploader_user_id_users_id_fk" FOREIGN KEY ("uploader_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_vendor_id_vendor_profiles_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_vendor_id_vendor_profiles_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "still_here_confirmations" ADD CONSTRAINT "still_here_confirmations_vendor_id_vendor_profiles_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_synonyms" ADD CONSTRAINT "tag_synonyms_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upcoming_spot_posts" ADD CONSTRAINT "upcoming_spot_posts_vendor_id_vendor_profiles_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_user_id_users_id_fk" FOREIGN KEY ("blocker_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_user_id_users_id_fk" FOREIGN KEY ("blocked_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_live_sessions" ADD CONSTRAINT "vendor_live_sessions_vendor_id_vendor_profiles_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_profiles" ADD CONSTRAINT "vendor_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_profiles" ADD CONSTRAINT "vendor_profiles_profile_photo_id_photos_id_fk" FOREIGN KEY ("profile_photo_id") REFERENCES "public"."photos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_profiles" ADD CONSTRAINT "vendor_profiles_cover_photo_id_photos_id_fk" FOREIGN KEY ("cover_photo_id") REFERENCES "public"."photos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_status_posts" ADD CONSTRAINT "vendor_status_posts_vendor_id_vendor_profiles_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_tags" ADD CONSTRAINT "vendor_tags_vendor_id_vendor_profiles_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_tags" ADD CONSTRAINT "vendor_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_progress" ADD CONSTRAINT "verification_progress_vendor_id_vendor_profiles_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_family_idx" ON "auth_sessions" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "favorites_vendor_idx" ON "favorites" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "menu_items_vendor_idx" ON "menu_items" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "photos_vendor_idx" ON "photos" USING btree ("vendor_id","moderation");--> statement-breakpoint
CREATE INDEX "photos_moderation_idx" ON "photos" USING btree ("moderation");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reports_target_idx" ON "reports" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "reviews_moderation_idx" ON "reviews" USING btree ("moderation");--> statement-breakpoint
CREATE INDEX "schedule_vendor_idx" ON "schedule_entries" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "schedule_point_gist" ON "schedule_entries" USING gist ("public_point");--> statement-breakpoint
CREATE INDEX "still_here_vendor_idx" ON "still_here_confirmations" USING btree ("vendor_id","created_at");--> statement-breakpoint
CREATE INDEX "still_here_confirmer_idx" ON "still_here_confirmations" USING btree ("confirmer_hash","created_at");--> statement-breakpoint
CREATE INDEX "tag_synonyms_phrase_idx" ON "tag_synonyms" USING btree ("phrase");--> statement-breakpoint
CREATE INDEX "upcoming_point_gist" ON "upcoming_spot_posts" USING gist ("public_point");--> statement-breakpoint
CREATE INDEX "upcoming_ends_idx" ON "upcoming_spot_posts" USING btree ("ends_at");--> statement-breakpoint
CREATE INDEX "upcoming_vendor_idx" ON "upcoming_spot_posts" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "live_sessions_point_gist" ON "vendor_live_sessions" USING gist ("public_point");--> statement-breakpoint
CREATE INDEX "live_sessions_expires_idx" ON "vendor_live_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "vendor_profiles_categories_gin" ON "vendor_profiles" USING gin ("categories");--> statement-breakpoint
CREATE INDEX "vendor_profiles_languages_gin" ON "vendor_profiles" USING gin ("languages");--> statement-breakpoint
CREATE INDEX "vendor_profiles_payment_gin" ON "vendor_profiles" USING gin ("payment_methods");--> statement-breakpoint
CREATE INDEX "vendor_profiles_search_gin" ON "vendor_profiles" USING gin ("search_doc");--> statement-breakpoint
CREATE INDEX "vendor_profiles_name_trgm" ON "vendor_profiles" USING gin ("display_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "status_posts_vendor_idx" ON "vendor_status_posts" USING btree ("vendor_id","expires_at");--> statement-breakpoint
CREATE INDEX "vendor_tags_tag_idx" ON "vendor_tags" USING btree ("tag_id");