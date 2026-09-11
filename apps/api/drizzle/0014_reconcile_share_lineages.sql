-- Main's parallel 0011 has a later timestamp than the security branch's immutable 0011–0013.
-- Drizzle skips those older entries when upgrading main. Reconcile both supported lineages.
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "share_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "share_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meetings_share_expiry_idx" ON "meetings" USING btree ("share_enabled","share_expires_at");--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "organization_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "business_use_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "terms_version_accepted" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "recording_notice_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "recording_notice_version" text;--> statement-breakpoint
-- Old links have no expiry and are intentionally retired. Already time-limited links survive.
UPDATE "meetings" SET "share_enabled" = false WHERE "share_expires_at" IS NULL;
