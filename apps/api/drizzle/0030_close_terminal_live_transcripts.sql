-- Serialize every writer, including older API replicas, with terminal meeting updates.
CREATE FUNCTION reject_terminal_live_transcript_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_status text;
BEGIN
  SELECT status INTO current_status FROM meetings WHERE id = NEW.meeting_id FOR UPDATE;
  IF current_status IN ('failed', 'transcribed') THEN
    RAISE EXCEPTION 'Live transcript is closed for terminal meeting' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER live_transcript_terminal_insert_fence
  BEFORE INSERT ON live_transcript_segments
  FOR EACH ROW EXECUTE FUNCTION reject_terminal_live_transcript_insert();--> statement-breakpoint

-- Keep status and removal in the same transaction for direct worker/sweep updates too.
CREATE FUNCTION purge_terminal_live_transcripts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM live_transcript_segments WHERE meeting_id = NEW.id;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER purge_live_transcripts_on_terminal_status
  AFTER UPDATE OF status ON meetings
  FOR EACH ROW WHEN (NEW.status IN ('failed', 'transcribed'))
  EXECUTE FUNCTION purge_terminal_live_transcripts();--> statement-breakpoint

-- Remove rows already retained by terminal meetings before this migration.
DELETE FROM live_transcript_segments AS segment USING meetings AS meeting
  WHERE segment.meeting_id = meeting.id AND meeting.status IN ('failed', 'transcribed');
