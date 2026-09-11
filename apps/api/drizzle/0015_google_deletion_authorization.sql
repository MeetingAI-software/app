CREATE TABLE "account_deletion_authorizations" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"google_sub" text NOT NULL,
	"state_hash" text NOT NULL,
	"nonce_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"grant_hash" text,
	"grant_expires_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "account_deletion_authorizations_state_hash_unique" UNIQUE("state_hash"),
	CONSTRAINT "account_deletion_authorizations_grant_hash_unique" UNIQUE("grant_hash")
);
--> statement-breakpoint
ALTER TABLE "account_deletion_authorizations" ADD CONSTRAINT "account_deletion_authorizations_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_deletion_authorizations" ADD CONSTRAINT "account_deletion_authorizations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;