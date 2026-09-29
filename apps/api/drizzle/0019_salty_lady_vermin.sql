CREATE TABLE "google_oauth_budget" (
	"window" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_oauth_states" (
	"state_hash" text PRIMARY KEY NOT NULL,
	"nonce_hash" text NOT NULL,
	"purpose" text NOT NULL,
	"user_id" uuid,
	"session_hash" text,
	"auth_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "google_oauth_states" ADD CONSTRAINT "google_oauth_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;