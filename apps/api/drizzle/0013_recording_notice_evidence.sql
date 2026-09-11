ALTER TABLE "meetings" ADD COLUMN "recording_notice_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "recording_notice_version" text;
