import crypto from 'crypto';
import type { AddressInfo } from 'net';
import { createServer } from '../adapters/http/server';
import { createAuthRoutes } from '../adapters/http/routes/auth.routes';
import { AuthService } from '../application/auth.service';
import { EmailVerificationTokenService } from '../application/email-verification-token.service';
import { EmailVerificationDeliveryService } from '../application/email-verification-delivery.service';
import { EmailSendBudgetService } from '../application/email-send-budget.service';
import { DrizzleEmailSendLedgerRepository } from '../adapters/db/repositories/email-send-ledger.repository';
import { Argon2Hasher } from '../adapters/auth/argon2.hasher';
import { DrizzleUserRepository } from '../adapters/db/repositories/user.repository';
import { DrizzleSessionRepository } from '../adapters/db/repositories/session.repository';
import { DrizzleVerificationTokenRepository } from '../adapters/db/repositories/verification-token.repository';
import { LogEmailVerificationMailer } from '../adapters/email/log-email-verification.mailer';
import { DrizzleMeetingRepository } from '../adapters/db/repositories/meeting.repository';
import { DrizzleTranscriptRepository } from '../adapters/db/repositories/transcript.repository';
import { DrizzleDocumentRepository } from '../adapters/db/repositories/document.repository';
import { DrizzleChatMessageRepository } from '../adapters/db/repositories/chat-message.repository';
import { DrizzleUsageRepository } from '../adapters/db/repositories/usage.repository';
import { SupabaseStorageAdapter } from '../adapters/supabase/supabase-storage.adapter';
import { RecallAdapter } from '../adapters/recall/recall.adapter';
import { config } from '../config/env';

// End-to-end drive of the Day 5 HTTP stack (originCheck → requireUser → auth routes → cookies →
// error handler) against the real DB. No worker/sweep — createServer only builds the app.
const ORIGIN = config.WEB_ORIGIN;

async function main() {
  const userRepo = new DrizzleUserRepository();
  const verificationTokens = new EmailVerificationTokenService(new DrizzleVerificationTokenRepository());
  const sendBudget = new EmailSendBudgetService(
    new DrizzleEmailSendLedgerRepository(), config.EMAIL_DAILY_SEND_BUDGET,
  );
  const authService = new AuthService(
    userRepo, new DrizzleSessionRepository(), new Argon2Hasher(), 30,
    new DrizzleMeetingRepository(), new DrizzleTranscriptRepository(), new DrizzleDocumentRepository(),
    new DrizzleChatMessageRepository(), new DrizzleUsageRepository(), new SupabaseStorageAdapter(), new RecallAdapter(),
    verificationTokens,
    new EmailVerificationDeliveryService(verificationTokens, new LogEmailVerificationMailer(), config.WEB_ORIGIN, sendBudget),
    sendBudget,
  );
  const app = createServer([createAuthRoutes(authService)], (t) => authService.getUserForToken(t));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const J = { 'content-type': 'application/json' };

  const email = `day5.http.${crypto.randomBytes(3).toString('hex')}@example.test`;
  const password = 'a-strong-enough-password';
  let userId: string | null = null;

  try {
    // 1. mutating request without Origin → 403 (CSRF)
    const noOrigin = await fetch(`${base}/api/auth/signup`, { method: 'POST', headers: J, body: JSON.stringify({ email, password }) });
    assert(noOrigin.status === 403, `signup without Origin → 403 (got ${noOrigin.status})`);

    // 2. signup with Origin → 201 + session cookie
    const signup = await fetch(`${base}/api/auth/signup`, { method: 'POST', headers: { ...J, origin: ORIGIN }, body: JSON.stringify({ email, password }) });
    assert(signup.status === 201, `signup → 201 (got ${signup.status})`);
    const setCookie = signup.headers.get('set-cookie') ?? '';
    const token = /session=([^;]+)/.exec(setCookie)?.[1];
    assert(!!token, 'signup sets a session cookie');
    assert(/HttpOnly/i.test(setCookie), 'cookie is HttpOnly');
    assert(/SameSite=Lax/i.test(setCookie), 'cookie is SameSite=Lax');
    const user = (await signup.json()).user;
    userId = user.id;
    assert(user.email === email.toLowerCase() && user.passwordHash === undefined, 'signup returns a leak-free user');
    const cookie = `session=${token}`;

    // 3. /me with the cookie → 200; without → 401
    assert((await fetch(`${base}/api/auth/me`, { headers: { cookie } })).status === 200, '/me with cookie → 200');
    assert((await fetch(`${base}/api/auth/me`)).status === 401, '/me without cookie → 401');

    // 4. protected route without a session → 401 (requireUser)
    const noAuth = await fetch(`${base}/api/auth/account`, { method: 'DELETE', headers: { ...J, origin: ORIGIN }, body: JSON.stringify({ password }) });
    assert(noAuth.status === 401, `DELETE account without cookie → 401 (got ${noAuth.status})`);

    // 5. login wrong password → 401; duplicate signup → 409
    assert((await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { ...J, origin: ORIGIN }, body: JSON.stringify({ email, password: 'wrong-one' }) })).status === 401, 'wrong password → 401');
    assert((await fetch(`${base}/api/auth/signup`, { method: 'POST', headers: { ...J, origin: ORIGIN }, body: JSON.stringify({ email, password }) })).status === 409, 'duplicate email → 409');

    // 6. logout clears the session
    assert((await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { origin: ORIGIN, cookie } })).status === 204, 'logout → 204');
    assert((await fetch(`${base}/api/auth/me`, { headers: { cookie } })).status === 401, 'session invalid after logout');

    // 7. rate limit: rapid failed logins on one email eventually 429
    let got429 = false;
    for (let i = 0; i < 14 && !got429; i++) {
      got429 = (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { ...J, origin: ORIGIN }, body: JSON.stringify({ email, password: 'nope' }) })).status === 429;
    }
    assert(got429, 'rapid failed logins hit 429');

    console.log('🎉 Day 5 HTTP smoke passed.');
  } finally {
    if (userId) { await userRepo.deleteById(userId); console.log('🧹 cleanup: test user removed.'); }
    server.close();
  }
  process.exit(0);
}

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAILED: ${label}`);
  console.log(`   ✓ ${label}`);
}

main().catch((err) => {
  console.error('❌ Day 5 HTTP smoke failed:', err);
  process.exit(1);
});
