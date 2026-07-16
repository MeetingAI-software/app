ALTER TABLE "documents" ADD COLUMN "content" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "model" text NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "input_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "output_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "share_token" text NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN IF EXISTS "content_md";--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_meeting_id_unique" UNIQUE("meeting_id");--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_share_token_unique" UNIQUE("share_token");