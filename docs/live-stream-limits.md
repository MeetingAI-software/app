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

Replaceable partial captions may be dropped under backpressure. If another durable live frame
arrives while the previous write is blocked, the connection closes and EventSource reconnects with
its last received event ID. Durable segments are read from PostgreSQL, including segments published
during replay; application code does not accumulate an unbounded live-event queue.

The limits and fan-out do not coordinate between replicas. Keep the documented single-process
deployment assumption under review; the existing cursor-polling fallback reads PostgreSQL. No Redis
or distributed service is introduced.

Regression tests use synthetic repositories/clients: global admission before slow ownership work,
aborted queries, per-user/per-meeting exhaustion, shutdown during replay, large paged replay,
single-flight heartbeats, simulated write backpressure and reconnect. These local tests are not a
production load test or a measurement of Railway's capacity.
