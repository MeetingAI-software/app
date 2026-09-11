# Upload capacity

`MAX_CONCURRENT_UPLOADS` bounds in-memory audio uploads per API process, before multipart parsing.
Each reservation remains held until parsing, usage checks, storage, DB/outbox work and compensating
cleanup settle. A disconnected client signals cancellation but does not release the reservation.
Supabase REST upload receives the AbortSignal; adapters that ignore it still hold their place.
The finalizer clears the request's file reference and abort listeners and releases exactly once.

Over-capacity requests return HTTP 503 `UPLOAD_CAPACITY_REACHED` with `Retry-After: 5`. The per-user
spend limiter and recording-notice header checks still precede parsing. These are process-local
bounds, not a distributed quota. Use the configured upload size and replica count when budgeting memory.

Tests use synthetic audio, aborted HTTP clients and storage promises that remain pending despite
cancellation. Both late resolution and rejection retain capacity; late success is cleaned up before
release, and no transcription event is queued for that aborted upload. This is not production load testing.

Cancellation does not prove that a remote object was never written: the storage service may commit
while its response is lost. Reconciliation of failed rows and orphan audio remains launch work;
this patch does not claim complete orphan removal.
