CREATE TABLE "paddle_billing_budgets" (
	"scope" text NOT NULL,
	"window" integer NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "paddle_billing_budgets_scope_window_pk" PRIMARY KEY("scope","window")
);
--> statement-breakpoint
CREATE TABLE "paddle_billing_slots" (
	"slot" integer PRIMARY KEY NOT NULL,
	"token" text,
	"user_id" uuid,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
INSERT INTO "paddle_billing_slots" ("slot") SELECT generate_series(1, 8);
