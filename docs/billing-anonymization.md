# Local billing anonymization

Migration `0016_paddle_anonymization_marker` adds nullable `paddle_customers.anonymized_at`.
Account erasure sets that timestamp while clearing email and userId. Every customer upsert
(webhooks and checkout) conditionally updates only rows without that marker, in the SQL write.
Later, repeated and concurrent events cannot restore identity on a marked customer. Subscription
events can still maintain provider IDs and billing status; an ordinary placeholder remains enrichable.

The marker has no automatic reset. A new account using an erased account's email does not regain
that customer's billing association. No external Paddle mutation is performed by this change.
Provider records/IDs remain linkable at Paddle and must not be described as anonymous everywhere.

Existing null email/userId values cannot reliably distinguish past erasure from placeholders. The
additive migration does not guess or backfill them. If accounts were erased before this marker,
reconcile their customer IDs from authorized operational evidence before claiming protection for
those historical rows. That evidence and Paddle's own retention/DSR obligations need separate review.

Isolated PostgreSQL tests cover replay after erasure, a newly registered matching email, concurrent
erasure/upsert, continued subscription updates, and normal placeholder enrichment.
