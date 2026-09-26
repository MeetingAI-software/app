CREATE TABLE "google_oauth_exchange_slots" (
	"slot" integer PRIMARY KEY NOT NULL,
	"token" text,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
INSERT INTO "google_oauth_exchange_slots" ("slot") SELECT generate_series(1, 8);
