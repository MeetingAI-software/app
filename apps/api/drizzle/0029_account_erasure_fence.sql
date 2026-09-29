ALTER TABLE "meetings" ADD COLUMN "bot_start_rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "upload_submission_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "upload_provider_excluded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deletion_started_at" timestamp with time zone;--> statement-breakpoint
CREATE FUNCTION guard_meeting_owner_during_erasure() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_deletion_started_at timestamptz;
BEGIN
  -- Direct inserts from older replicas serialize with reserve() and beginDeletion().
  SELECT deletion_started_at INTO owner_deletion_started_at
    FROM users WHERE id = NEW.owner_user_id FOR UPDATE;
  IF owner_deletion_started_at IS NOT NULL THEN
    RAISE EXCEPTION 'Account deletion is in progress' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER meetings_erasure_fence
  BEFORE INSERT OR UPDATE OF owner_user_id ON meetings
  FOR EACH ROW EXECUTE FUNCTION guard_meeting_owner_during_erasure();
