CREATE TABLE "meeting_quota_reservations" (
	"meeting_id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"reserved_seconds" integer NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meeting_quota_reservations" ADD CONSTRAINT "meeting_quota_reservations_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_quota_reservations" ADD CONSTRAINT "meeting_quota_reservations_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meeting_quota_reservations_owner_active_idx" ON "meeting_quota_reservations" USING btree ("owner_user_id","released_at");--> statement-breakpoint
-- Existing nonterminal meetings were admitted without a claim. Block new spend until they
-- settle; 24 hours is the largest operational meeting bound for any current plan.
INSERT INTO "meeting_quota_reservations" ("meeting_id", "owner_user_id", "reserved_seconds")
SELECT "id", "owner_user_id", 86400 FROM "meetings"
WHERE "status" IN ('pending', 'bot_joining', 'recording', 'processing');--> statement-breakpoint
-- Older workers could append duplicate rows for a replay. Use the largest measured duration
-- and the original month; summing replayed rows would overcharge the account.
UPDATE "usage_ledger" AS u SET "seconds_recorded" = totals.seconds,
  "created_at" = totals.first_at
FROM (
  SELECT "id", max("seconds_recorded") OVER (PARTITION BY "meeting_id") AS seconds,
    min("created_at") OVER (PARTITION BY "meeting_id") AS first_at,
    row_number() OVER (PARTITION BY "meeting_id" ORDER BY "id") AS rank
  FROM "usage_ledger"
) AS totals WHERE u."id" = totals."id" AND totals.rank = 1;--> statement-breakpoint
DELETE FROM "usage_ledger" AS u USING (
  SELECT "id", row_number() OVER (PARTITION BY "meeting_id" ORDER BY "id") AS rank
  FROM "usage_ledger"
) AS ranked WHERE u."id" = ranked."id" AND ranked.rank > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "usage_ledger_meeting_uq" ON "usage_ledger" USING btree ("meeting_id");
