ALTER TABLE "meetings" ADD COLUMN "share_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Hand-added after generation. The DEFAULT above governs rows inserted from here on, which is what
-- we want: new meetings are private until their owner shares them. Every row that already exists,
-- though, predates the toggle and may have a link that is already in someone's inbox — silently
-- 404ing those would be a regression dressed up as a security fix.
UPDATE "meetings" SET "share_enabled" = true;
