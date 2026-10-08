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

## Multipart field bounds

The parser accepts one audio file plus at most 50 text fields (51 total parts).
`MAX_PARTICIPANT_NAMES` is shared with the participant schema. Multer rejects nesting deeper
than one bracket and every numeric bracket index above 49 before calling append-field,
including unknown field bases and zero-padded indices. This prevents sparse arrays from
allocating or being traversed before application validation.

JSON `participantNames`, indexed `participantNames[0]` through `[49]`, and repeated
`participantNames[]` remain supported. The complete participant schema still caps the result
at 50 nonempty names of at most 80 characters, including mixtures of indexed and appended forms.
Both audio-first and audio-last requests preserve all 50 participants.

Malformed multipart fields return HTTP 400 `UPLOAD_ERROR`; invalid participant values return
HTTP 400 `VALIDATION_ERROR`. Oversized audio keeps HTTP 413 `FILE_TOO_LARGE`.
Rejected parsing has no billing, storage or database side effects and releases its reservation,
so a subsequent legitimate upload can proceed. Multer 2.4 treats the public parts limit inclusively;
keep the 50-field plus one-file controls when upgrading it.
