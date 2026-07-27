CREATE TABLE IF NOT EXISTS "paddle_customers" (
	"customer_id" text PRIMARY KEY NOT NULL,
	"email" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "paddle_subscriptions" (
	"subscription_id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"status" text NOT NULL,
	"price_id" text,
	"product_id" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"scheduled_change_action" text,
	"scheduled_change_at" timestamp with time zone,
	"last_event_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "paddle_customers" ADD CONSTRAINT "paddle_customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "paddle_subscriptions" ADD CONSTRAINT "paddle_subscriptions_customer_id_paddle_customers_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."paddle_customers"("customer_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "paddle_customers_email_idx" ON "paddle_customers" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "paddle_customers_user_id_idx" ON "paddle_customers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "paddle_subscriptions_customer_id_idx" ON "paddle_subscriptions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "paddle_subscriptions_status_idx" ON "paddle_subscriptions" USING btree ("status");