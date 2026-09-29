CREATE TABLE "bot_transcript_claims" (
	"meeting_id" uuid PRIMARY KEY NOT NULL,
	"claim_id" uuid NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bot_transcript_claims" ADD CONSTRAINT "bot_transcript_claims_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;