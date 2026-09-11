# Migration history

SQL migrations 0011–0013 are immutable. Two branches independently added 0011:

- `0011_windy_master_mold` → `0012_lonely_maggott` → `0013_recording_notice_evidence` is the security branch's journal/snapshot lineage.
- Main at `d1707ba2be3a48dc73126225308fac6e44ddf0fb` applied `0011_demonic_gwen_stacy`, with timestamp `1789131006383`. Its SQL is retained unchanged as historical evidence; it is not replayed by the current journal because its `share_enabled` addition overlaps the security lineage.

Drizzle decides which migrations to run from the latest applied timestamp. Consequently main databases skip the older security 0011–0013. Additive `0014_reconcile_share_lineages` (timestamp `1789131006384`) fills the missing columns/index on that path and is safe after the security path too. It intentionally disables pre-existing links without expiry; it does not remove meeting data. Snapshots retain the security lineage and 0014 records the reconciled schema.

`src/adapters/db/migration-lineages.test.ts` applies the real journal to an empty PGlite database, the main 0011 schema, and the security 0013 schema, checks data preservation and retired historical links, and reruns migration. Ordinary repository tests also apply the real SQL. These are isolated tests, not proof of production backup or migration status.

Before a future production release, verify a restorable backup and the actual migration ledger. Apply the current journal before deploying the API; do not manually apply both 0011 SQL files. After additive migration, roll application code back only to a compatible version, leaving columns and migration records intact. Verify the chosen commit and closed-mode behavior after any deployment or rollback.
