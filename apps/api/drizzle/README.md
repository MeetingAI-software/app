# Migration history

SQL migrations 0011–0013 are immutable. Two branches independently added 0011:

- `0011_windy_master_mold` → `0012_lonely_maggott` → `0013_recording_notice_evidence` is the security branch's journal/snapshot lineage.
- Main at `d1707ba2be3a48dc73126225308fac6e44ddf0fb` applied `0011_demonic_gwen_stacy`, with timestamp `1789131006383`. Its SQL is retained unchanged as historical evidence; it is not replayed by the current journal because its `share_enabled` addition overlaps the security lineage.

Drizzle decides which migrations to run from the latest applied timestamp. Consequently main databases skip the older security 0011–0013. Additive `0014_reconcile_share_lineages` (timestamp `1789131006384`) fills the missing columns/index on that path and is safe after the security path too. It intentionally disables pre-existing links without expiry; it does not remove meeting data. Snapshots retain the security lineage and 0014 records the reconciled schema.

`src/adapters/db/migration-lineages.test.ts` applies the real journal to an empty PGlite database, the main 0011 schema, and the security 0013 schema, checks data preservation and retired historical links, and reruns migration. Ordinary repository tests also apply the real SQL. These are isolated tests, not proof of production backup or migration status.

Before a future production release, verify a restorable backup and the actual migration ledger. Apply the current journal before deploying the API; do not manually apply both 0011 SQL files. After additive migration, roll application code back only to a compatible version, leaving columns and migration records intact. Verify the chosen commit and closed-mode behavior after any deployment or rollback.

Migrations 0017–0018 add address and authentication versions. Existing verification tokens have null address bindings and are rejected by the new API; users must request a fresh link. Existing sessions and users start at authentication version 1. Completing verification increments the user version, making old sessions invalid. Deploy migrations before the API and web changes; validate the actual production migration ledger and backup separately.

Migrations 0019–0020 add one-time Google OAuth challenges and a shared start budget. An API deployment without these tables fails closed on new Google sign-in and linking. Existing Google-linked accounts and sessions are not rewritten. Apply the migrations before deploying the API and check the production ledger and backup.

Migration 0021 adds shared login-attempt counters. Production login fails closed if this table is missing or unavailable, before looking up a user or hashing a password. Apply the migration before the API deployment. Counters expire by window and are pruned after 24 hours of age.

Migration 0023 adds a per-meeting document-generation attempt ledger. Existing documents start with one consumed attempt; historical failed provider calls cannot be reconstructed. Deploy this migration before the new API code. During a rolling API deployment, old replicas can still bypass admission, so stop document-generation traffic until all replicas run the new version. The migration is additive; rolling code back to a version that ignores the ledger reopens the spend path. Check the production migration ledger and a restorable backup before deployment.

Migration 0024 makes non-null Recall bot IDs unique. A duplicate historical bot ID intentionally makes migration fail; the migration does not choose an owner or remove meeting data. Check duplicates with a read-only grouped query and resolve them with verified Recall provenance before deploying. The repository also rejects ambiguous reads while the index is absent. Apply the migration before the new API code and keep the production backup and migration ledger available for review.

Migration 0028 adds a nullable receipt for failed Recall bot media deletion. Existing failed bots begin without a receipt and become eligible one hour after their last update. Apply the migration before the new API; an old API replica ignores the column and can leave failed media until the new sweep runs. A rollback can leave the nullable column in place, but failed-bot cleanup stops until the new code returns. Verify the production ledger, backup, Recall response behavior, and a synthetic failed bot before deployment.
