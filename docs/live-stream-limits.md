# Live transcript resource limits

Admission is process-local: defaults are 50 streams per API process, five per authenticated user,
and three per owned meeting. Global exhaustion returns `503 LIVE_STREAM_CAPACITY_REACHED`;
user/meeting exhaustion returns `429 LIVE_STREAM_LIMIT_REACHED`. Both include `Retry-After: 5`.
Authentication still runs first; stream admission precedes meeting/replay database work. Meeting
capacity binds only after an owner-scoped lookup.

A disconnected stream retains its reservation while an uncancellable repository query is pending.
Cleanup is idempotent and removes listeners, timers and shutdown callbacks. Shutdown also closes
connections waiting for their initial database work. Heartbeats permit at most one status query
per connection. SSE replay fetches 100 rows at a time and waits for response drain; polling fetches
at most 500 rows per cursor request. Clients continue from the returned cursor.

Replaceable partial captions may be dropped under backpressure. Durable segments use a single
paged cursor reader which waits for drain; publications during a pending read/write only set a
dirty bit. Disconnecting and reconnecting resumes from the last received event ID. PostgreSQL
append transactions lock the owning meeting before allocating a sequence, retaining the lock
through commit. This prevents a lower sequence becoming visible after a higher cursor. Bus
publications are wake-ups, so reversed publication order also cannot advance past an unsent row.
No per-connection segment queue grows with the number of publications. A blocked control frame
may still close the connection, whose durable data remains available for replay.

The limits and fan-out do not coordinate between replicas. Keep the documented single-process
deployment assumption under review; the existing cursor-polling fallback reads PostgreSQL. No Redis
or distributed service is introduced.

Regression tests use synthetic repositories/clients: global admission before slow ownership work,
aborted queries, per-user/per-meeting exhaustion, shutdown during replay, large paged replay,
single-flight heartbeats, simulated write backpressure and reconnect. These local tests are not a
production load test or a measurement of Railway's capacity.
