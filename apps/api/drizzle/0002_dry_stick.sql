CREATE TABLE IF NOT EXISTS "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meetings" ALTER COLUMN "meeting_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "source" text DEFAULT 'bot' NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "participant_names" jsonb;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "audio_storage_path" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "transcription_job_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_messages_meeting_id_created_at_idx" ON "chat_messages" USING btree ("meeting_id","created_at");