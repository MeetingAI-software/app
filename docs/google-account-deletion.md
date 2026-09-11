# Google account deletion

Password accounts, including accounts also linked to Google, still verify their current password.
For Google-only accounts, an ordinary session and the public phrase `DELETE` are insufficient.

1. Settings sends an authenticated, Origin-checked POST to `/api/auth/account/deletion/google`.
2. A random state and nonce identify a dedicated deletion challenge, bound to the existing user,
   session and Google subject. PostgreSQL stores only their SHA-256 hashes. A new start replaces
   that session's previous challenge/grant. There is at most one row per session; session cleanup
   and account deletion cascade to the row.
3. Google returns to the existing registered `/api/auth/google/callback`. The `delete.` state
   purpose selects the separate handler before login/link. The challenge is atomically claimed
   before code exchange. The Google library verifies the ID token's signature/audience/issuer;
   the service also checks audience, issuer, expiry, nonce, the linked subject and issuance time
   against the new challenge (30 seconds of clock skew). The challenge lasts at most ten minutes.
4. The callback issues a random, hashed, user/session-bound grant lasting at most five minutes
   and no longer than the session. The raw value lives only in the `__Secure-deletion_grant`
   HttpOnly/Secure/SameSite=Lax cookie scoped to `/api/auth/account`. No grant is returned in
   JSON, URL, browser storage or logs. Local Google-flow smoke therefore needs HTTPS or a
   browser that supports Secure cookies on localhost; HTTP test clients explicitly supply cookies.
5. Settings returns to an explicit final confirmation. Its URL flag is presentation only.
   `DELETE /api/auth/account` accepts an optional password; Google users send `{}`. The shared
   service consumes the grant with a conditional PostgreSQL UPDATE before any erasure. Replays,
   concurrent consumers, another session/user, expiry and identity changes are rejected with
   HTTP 403 `DELETION_REAUTH_REQUIRED`. Provider erasure failure keeps local account data and
   requires a new Google round for the next deletion attempt.

The callback never creates, links or deletes accounts, and does not rotate the ordinary session.
The evidence is a new, signed provider assertion bound to an unpredictable nonce, not the
account chooser or a client flag. Google may reuse its own active browser login. This does **not**
prove a newly typed Google password or protect against compromise of both browser sessions.
Google explicitly does not support forced Google Account reauthentication; `prompt=select_account`
alone is not proof. We do not depend on undocumented `max_age`/`prompt=login` behavior or claim
Google's separately configured `auth_time` feature is enabled.

Primary references, checked 2026-09-11:
[Google session/reauthentication limitations](https://developers.google.com/identity/siwg/security-bundle#authentication_time),
[Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect),
[OIDC ID-token validation](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation).

Migration `0015_google_deletion_authorization` is additive and follows the lineage bridge `0014`.
Run the normal journal migration after a verified backup; do not edit/replay old migrations.
Automated tests use signed-claim/provider fakes and isolated PostgreSQL (PGlite), not a real Google
account. They cover wrong identity/session/state/nonce, stale claims, expiry, simultaneous callbacks
and consumers, provider errors, replay, cookie policy, Origin/authentication and password precedence.
