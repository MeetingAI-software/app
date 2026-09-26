ALTER TABLE "email_verification_tokens" ADD COLUMN "email_at_issue" text;--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD COLUMN "email_version" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_version" integer DEFAULT 1 NOT NULL;