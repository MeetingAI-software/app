# Email verification runbook

MeetingAI requires password accounts to confirm ownership of their email address. Signup still creates
an authenticated session so the user can enter the application, where a persistent banner explains the
pending status and can request a replacement link. Google accounts are treated as verified only when
Google supplies a verified email claim.

## Local setup

1. Set `DATABASE_URL` to the development Postgres database.
2. Set `WEB_ORIGIN=http://localhost:3001`. This must be the public frontend origin because the API uses
   it to construct `/verify-email?token=...` links.
3. Apply the database migrations from the repository root:

   ```shell
   npm run db:migrate -w api
   ```

   Migration `0004_lethal_human_robot.sql` creates the token table and adds the user verification flag.
   Migration `0005_flowery_omega_flight.sql` adds single-use token consumption tracking.

4. Start the API and frontend in separate terminals:

   ```shell
   npm run dev -w api
   npm run dev -w web
   ```

`NEXT_PUBLIC_API_URL` is optional for the frontend and defaults to `http://localhost:3000`.

## Simulated delivery workflow

The current `LogEmailVerificationMailer` is a development adapter. After a password signup, email
change, or resend request, find this structured API log message:

```text
Email verification message simulated
```

Its structured fields contain `to`, `verificationUrl`, and `expiresAt`. Open `verificationUrl` in the
browser to exercise the same `/verify-email` flow that a real email recipient would use.

A successful verification updates the current application tab and other open tabs. The verification
banner should disappear without requiring logout. Reopening a consumed link displays the already-used
state rather than verifying it again.

## HTTP contract

| Endpoint | Successful result | Important behavior |
| --- | --- | --- |
| `POST /api/auth/signup` | `201` with `user` and `emailVerificationRequired` | Creates an unverified password user, starts a session, and attempts initial delivery. |
| `POST /api/auth/login` | `200` with `user` and `emailVerificationRequired` | Allows login and tells the frontend whether the verification banner is required. |
| `GET /api/auth/me` | `200` with current verification status | Used to refresh the banner after verification. |
| `POST /api/auth/verify-email` | `200` with a verified user | Accepts `{ "token": "..." }`; invalid, expired, used, and already-verified tokens have distinct codes. |
| `POST /api/auth/resend-verification` | `200` with a neutral message | Accepts `{ "email": "..." }` without revealing whether an account exists. |

The frontend routes unverified login and signup results to `/meetings?verification=required`. The app
shell then renders the verification banner from the server-provided user status rather than trusting
the query parameter.

## Security properties

- Raw tokens are generated with cryptographically secure randomness; only their SHA-256 hashes are
  stored in Postgres.
- Tokens expire after 24 hours and are atomically consumed, preventing successful reuse or concurrent
  double consumption.
- Issuing a replacement removes the previous active token, leaving at most one active token per user.
- Resend requests do nothing for unknown or already verified accounts and return the same public
  response, reducing account-enumeration risk.
- Changing an email resets verification and issues a link for the new address.
- A verified Google identity can mark a matching password account as verified.

Verification is currently advisory: unverified authenticated users can use protected application
pages while the banner remains visible. Any future feature that must require verification should enforce
that rule on the API, not only in the frontend.

## Production requirement

`LogEmailVerificationMailer` writes the raw verification URL to application logs and is therefore not a
production mail transport. Before production deployment, replace it in `apps/api/src/main.ts` with an
`EmailVerificationMailer` adapter backed by the chosen transactional email provider. Do not log raw
verification tokens in production.

Also verify that:

- `WEB_ORIGIN` uses the public HTTPS frontend origin;
- the provider uses the intended sender domain and has SPF, DKIM, and DMARC configured;
- delivery failures and bounce rates are monitored without recording verification URLs;
- migrations `0004` and `0005` have run before the new API version receives traffic.

## Release checks

Run the complete validation from the repository root:

```shell
npm run typecheck
npm test
```

Then manually verify signup, resend, successful verification, consumed-link, expired-link, and
cross-tab banner refresh behavior in a production-like environment.
