CREATE TABLE "document_generation_budgets" (
	"meeting_id" uuid PRIMARY KEY NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claim_id" uuid,
	"claimed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "document_generation_budgets" ADD CONSTRAINT "document_generation_budgets_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Historic successful generations already consumed one paid attempt. Seed only meetings that
-- still have a document; older failures cannot be reconstructed and are an explicit residual risk.
INSERT INTO "document_generation_budgets" ("meeting_id", "attempts")
SELECT "meeting_id", 1 FROM "documents";
