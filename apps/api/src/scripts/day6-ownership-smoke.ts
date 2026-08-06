import crypto from 'crypto';
import type { AddressInfo } from 'net';
import { createServer } from '../adapters/http/server';
import { createAuthRoutes } from '../adapters/http/routes/auth.routes';
import { createMeetingRoutes } from '../adapters/http/routes/meetings.routes';
import { createMeRoutes } from '../adapters/http/routes/me.routes';
import { AuthService } from '../application/auth.service';
import { EmailVerificationTokenService } from '../application/email-verification-token.service';
import { EmailVerificationDeliveryService } from '../application/email-verification-delivery.service';
import { EmailSendBudgetService } from '../application/email-send-budget.service';
import { DrizzleEmailSendLedgerRepository } from '../adapters/db/repositories/email-send-ledger.repository';
import { StartMeetingService } from '../application/start-meeting.service';
import { UsageMeterService } from '../application/usage-meter.service';
import { Argon2Hasher } from '../adapters/auth/argon2.hasher';
import { FakeBotAdapter } from '../adapters/fake/fake-bot.adapter';
import { FakeDocumentGenerator } from '../adapters/fake/fake-document.generator';
import { DrizzleUserRepository } from '../adapters/db/repositories/user.repository';
import { DrizzleSessionRepository } from '../adapters/db/repositories/session.repository';
import { DrizzleVerificationTokenRepository } from '../adapters/db/repositories/verification-token.repository';
import { LogEmailVerificationMailer } from '../adapters/email/log-email-verification.mailer';
import { DrizzleMeetingRepository } from '../adapters/db/repositories/meeting.repository';
import { DrizzleTranscriptRepository } from '../adapters/db/repositories/transcript.repository';
import { DrizzleDocumentRepository } from '../adapters/db/repositories/document.repository';
import { DrizzleChatMessageRepository } from '../adapters/db/repositories/chat-message.repository';
import { DrizzleUsageRepository } from '../adapters/db/repositories/usage.repository';
import { DrizzleWebhookEventRepository } from '../adapters/db/repositories/webhook-event.repository';
import { SupabaseStorageAdapter } from '../adapters/supabase/supabase-storage.adapter';
import { RecallAdapter } from '../adapters/recall/recall.adapter';
import { config } from '../config/env';
import { PLAN_ENTITLEMENTS } from '../domain/billing';

// Live multi-tenancy check for Step 6: two users each see only their own meetings, cross-user
// access 404s, /api/me/usage works. Self-cleaning (removes the meeting + both users).
const ORIGIN = config.WEB_ORIGIN;
const J = { 'content-type': 'application/json', origin: ORIGIN };

async function main() {
  const userRepo = new DrizzleUserRepository();
  const sessionRepo = new DrizzleSessionRepository();
  const meetingRepo = new DrizzleMeetingRepository();
  const transcriptRepo = new DrizzleTranscriptRepository();
  const documentRepo = new DrizzleDocumentRepository();
  const usageRepo = new DrizzleUsageRepository();
  const webhookRepo = new DrizzleWebhookEventRepository();
  const verificationTokens = new EmailVerificationTokenService(new DrizzleVerificationTokenRepository());
  const sendBudget = new EmailSendBudgetService(
    new DrizzleEmailSendLedgerRepository(), config.EMAIL_DAILY_SEND_BUDGET,
  );
  const authService = new AuthService(
    userRepo, sessionRepo, new Argon2Hasher(), 30, meetingRepo, transcriptRepo, documentRepo,
    new DrizzleChatMessageRepository(), usageRepo, new SupabaseStorageAdapter(), new RecallAdapter(),
    verificationTokens,
    new EmailVerificationDeliveryService(verificationTokens, new LogEmailVerificationMailer(), config.WEB_ORIGIN, sendBudget),
    sendBudget,
  );
  const billingAccess = {
    getAccess: async () => ({
      plan: 'free' as const, status: 'none' as const, hasPaidAccess: false,
      entitlements: PLAN_ENTITLEMENTS.free, subscription: null,
    }),
  };
  const startMeeting = new StartMeetingService(meetingRepo, new UsageMeterService(meetingRepo, usageRepo, billingAccess), new FakeBotAdapter(webhookRepo));

  const app = createServer(
    [createAuthRoutes(authService), createMeRoutes(usageRepo, billingAccess), createMeetingRoutes(meetingRepo, transcriptRepo, documentRepo, startMeeting, new FakeDocumentGenerator())],
    (t) => authService.getUserForToken(t)
  );
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const signup = async (email: string) => {
    const r = await fetch(`${base}/api/auth/signup`, { method: 'POST', headers: J, body: JSON.stringify({ email, password: 'a-good-password' }) });
    return { cookie: `session=${/session=([^;]+)/.exec(r.headers.get('set-cookie') ?? '')?.[1]}`, user: (await r.json()).user };
  };

  const rand = crypto.randomBytes(3).toString('hex');
  const A = await signup(`owner.a.${rand}@example.test`);
  const B = await signup(`owner.b.${rand}@example.test`);
  const mA = await meetingRepo.create({ ownerUserId: A.user.id, source: 'bot', meetingUrl: 'https://zoom.us/j/111' });

  try {
    const aList = await (await fetch(`${base}/api/meetings`, { headers: { cookie: A.cookie } })).json();
    assert(Array.isArray(aList) && aList.some((m: any) => m.id === mA.id), 'A sees their own meeting');

    const bList = await (await fetch(`${base}/api/meetings`, { headers: { cookie: B.cookie } })).json();
    assert(Array.isArray(bList) && !bList.some((m: any) => m.id === mA.id), "B does NOT see A's meeting");

    assert((await fetch(`${base}/api/meetings/${mA.id}`, { headers: { cookie: B.cookie } })).status === 404, "B requesting A's meeting id → 404 (not 403 — no id leak)");
    assert((await fetch(`${base}/api/meetings/${mA.id}`, { headers: { cookie: A.cookie } })).status === 200, 'A fetching own meeting → 200');
    assert((await fetch(`${base}/api/meetings`)).status === 401, 'logged-out list → 401');

    const usage = await fetch(`${base}/api/me/usage`, { headers: { cookie: A.cookie } });
    const ub = await usage.json();
    assert(usage.status === 200 && typeof ub.secondsUsed === 'number' && typeof ub.secondsCap === 'number', '/api/me/usage → 200 { secondsUsed, secondsCap }');

    console.log('🎉 Day 6 ownership smoke passed.');
  } finally {
    await meetingRepo.deleteById(mA.id);
    for (const u of [A, B]) { await sessionRepo.deleteAllForUser(u.user.id); await userRepo.deleteById(u.user.id); }
    server.close();
    console.log('🧹 cleanup: meeting + both test users removed.');
  }
  process.exit(0);
}

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAILED: ${label}`);
  console.log(`   ✓ ${label}`);
}

main().catch((err) => {
  console.error('❌ Day 6 ownership smoke failed:', err);
  process.exit(1);
});
