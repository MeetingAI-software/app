CREATE TABLE "login_attempt_budgets" (
	"scope" text NOT NULL,
	"window" integer NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "login_attempt_budgets_scope_window_pk" PRIMARY KEY("scope","window")
);
