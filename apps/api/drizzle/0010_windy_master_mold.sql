ALTER TABLE "meetings" ADD COLUMN "share_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "share_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "meetings_share_expiry_idx" ON "meetings" USING btree ("share_enabled","share_expires_at");