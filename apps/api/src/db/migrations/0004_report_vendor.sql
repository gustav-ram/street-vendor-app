ALTER TABLE "reports" ADD COLUMN "vendor_id" uuid;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_vendor_id_vendor_profiles_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_vendor_idx" ON "reports" USING btree ("vendor_id","status");--> statement-breakpoint
-- Backfill reports filed before this column existed (where the content still exists).
UPDATE "reports" r SET "vendor_id" = r."target_id" FROM "vendor_profiles" v WHERE r."target_type" = 'vendor' AND v."id" = r."target_id";--> statement-breakpoint
UPDATE "reports" r SET "vendor_id" = p."vendor_id" FROM "photos" p WHERE r."target_type" = 'photo' AND p."id" = r."target_id" AND p."source" = 'vendor';--> statement-breakpoint
UPDATE "reports" r SET "vendor_id" = s."vendor_id" FROM "vendor_status_posts" s WHERE r."target_type" = 'status_post' AND s."id" = r."target_id";--> statement-breakpoint
UPDATE "reports" r SET "vendor_id" = u."vendor_id" FROM "upcoming_spot_posts" u WHERE r."target_type" = 'upcoming_post' AND u."id" = r."target_id";
