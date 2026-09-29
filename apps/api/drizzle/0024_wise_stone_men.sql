CREATE UNIQUE INDEX "meetings_bot_id_uq" ON "meetings" USING btree ("bot_id");--> statement-breakpoint
DROP INDEX "meetings_bot_id_idx";
