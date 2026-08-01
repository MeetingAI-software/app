import { config } from './config/env';
import { initObservability } from './adapters/observability/sentry';
import { createServer } from './adapters/http/server';
import { DrizzleMeetingRepository } from './adapters/db/repositories/meeting.repository';
import { DrizzleTranscriptRepository } from './adapters/db/repositories/transcript.repository';
import { DrizzleLiveTranscriptRepository } from './adapters/db/repositories/live-transcript.repository';
import { DrizzleWebhookEventRepository } from './adapters/db/repositories/webhook-event.repository';
import { DrizzleUsageRepository } from './adapters/db/repositories/usage.repository';
import { DrizzleDocumentRepository } from './adapters/db/repositories/document.repository';
import { DrizzleChatMessageRepository } from './adapters/db/repositories/chat-message.repository';
import { DrizzleUserRepository } from './adapters/db/repositories/user.repository';
import { DrizzleSessionRepository } from './adapters/db/repositories/session.repository';
import { DrizzleVerificationTokenRepository } from './adapters/db/repositories/verification-token.repository';
import { DrizzlePaddleBillingRepository } from './adapters/db/repositories/paddle-billing.repository';
import { createEmailVerificationMailer } from './adapters/email/email-verification-mailer.factory';
import { FakeBotAdapter } from './adapters/fake/fake-bot.adapter';
import { UsageMeterService } from './application/usage-meter.service';
import { StartMeetingService } from './application/start-meeting.service';
import { ProcessWebhookEventService } from './application/process-webhook-event.service';
import { IngestLiveTranscriptService } from './application/ingest-live-transcript.service';
import { LiveTranscriptBus } from './adapters/realtime/live-transcript.bus';
import { ProcessUploadEventService } from './application/process-upload-event.service';
import { ChatService } from './application/chat.service';
import { BillingAccessService } from './application/billing-access.service';
import { CustomerPortalService } from './application/customer-portal.service';
import { CheckoutService } from './application/checkout.service';
import { SubscriptionUpdateService } from './application/subscription-update.service';
import { paddleCheckoutPriceIds, paddlePlanChangePrices, paddlePriceCatalog } from './config/billing-catalog';
import { AuthService } from './application/auth.service';
import { EmailVerificationTokenService } from './application/email-verification-token.service';
import { EmailVerificationDeliveryService } from './application/email-verification-delivery.service';
import { WebhookWorker } from './jobs/worker';
import { SweepJob } from './jobs/sweep';
import { createMeetingRoutes } from './adapters/http/routes/meetings.routes';
import { createHealthRoutes } from './adapters/http/routes/health.routes';
import { createWebhookRoutes } from './adapters/http/routes/webhooks.routes';
import { createChatRoutes } from './adapters/http/routes/chat.routes';
import { createUploadRoutes } from './adapters/http/routes/upload.routes';
import { createAuthRoutes } from './adapters/http/routes/auth.routes';
import { createMeRoutes } from './adapters/http/routes/me.routes';
import { createBillingRoutes } from './adapters/http/routes/billing.routes';
import { PaddleCustomerPortalAdapter } from './adapters/paddle/paddle-customer-portal.adapter';
import { PaddleCheckoutAdapter } from './adapters/paddle/paddle-checkout.adapter';
import { PaddleSubscriptionUpdateAdapter } from './adapters/paddle/paddle-subscription-update.adapter';
import { SupabaseStorageAdapter } from './adapters/supabase/supabase-storage.adapter';
import { RecallAdapter } from './adapters/recall/recall.adapter';
import { FakeDocumentGenerator } from './adapters/fake/fake-document.generator';
import { ClaudeAdapter } from './adapters/claude/claude.adapter';
import { GeminiDocumentAdapter } from './adapters/gemini/gemini-document.adapter';
import { FakeChatAdapter } from './adapters/fake/fake-chat.adapter';
import { ClaudeChatAdapter } from './adapters/claude/claude-chat.adapter';
import { GeminiChatAdapter } from './adapters/gemini/gemini-chat.adapter';
import { FakeTranscriptionAdapter } from './adapters/fake/fake-transcription.adapter';
import { AssemblyAIAdapter } from './adapters/assemblyai/assemblyai.adapter';
import { Argon2Hasher } from './adapters/auth/argon2.hasher';
import type { MeetingBotPort } from './ports/meeting-bot.port';
import type { DocumentGeneratorPort } from './ports/document-generator.port';
import type { MeetingChatPort } from './ports/chat.port';
import type { TranscriptionPort } from './ports/transcription.port';

async function bootstrap() {
  // Day 6 §5: start error monitoring before anything else so boot-time failures are captured too.
  initObservability();

  console.log(`🚀 Bootstrapping MeetingAI (Env: ${config.NODE_ENV}, Port: ${config.PORT})`);

  // 1. Repositories
  const meetingRepo = new DrizzleMeetingRepository();
  const transcriptRepo = new DrizzleTranscriptRepository();
  const liveTranscriptRepo = new DrizzleLiveTranscriptRepository();
  const webhookRepo = new DrizzleWebhookEventRepository();
  const usageRepo = new DrizzleUsageRepository();
  const documentRepo = new DrizzleDocumentRepository();
  const chatRepo = new DrizzleChatMessageRepository();
  const paddleBillingRepo = new DrizzlePaddleBillingRepository();

  // 2. Select Bot Adapter
  let botAdapter: MeetingBotPort;
  if (config.BOT_PROVIDER === 'fake') {
    console.log('🤖 Using Fake Bot Adapter');
    botAdapter = new FakeBotAdapter(webhookRepo);
  } else {
    console.log('🤖 Using Recall Bot Adapter');
    botAdapter = new RecallAdapter();
  }

  // 3. Select Document Generator
  let docGen: DocumentGeneratorPort;
  if (config.DOC_PROVIDER === 'fake') {
    console.log('📝 Using Fake Document Generator');
    docGen = new FakeDocumentGenerator();
  } else if (config.DOC_PROVIDER === 'gemini') {
    console.log(`📝 Using Gemini Document Generator (${config.GEMINI_DOC_MODEL})`);
    docGen = new GeminiDocumentAdapter();
  } else {
    console.log(`📝 Using Claude Document Generator (${config.CLAUDE_MODEL})`);
    docGen = new ClaudeAdapter();
  }

  // 3b. Select Chat Adapter
  let chatAdapter: MeetingChatPort;
  if (config.CHAT_PROVIDER === 'fake') {
    console.log('💬 Using Fake Chat Adapter');
    chatAdapter = new FakeChatAdapter();
  } else if (config.CHAT_PROVIDER === 'gemini') {
    console.log(`💬 Using Gemini Chat Adapter (${config.GEMINI_CHAT_MODEL})`);
    chatAdapter = new GeminiChatAdapter();
  } else {
    console.log(`💬 Using Claude Chat Adapter (${config.CLAUDE_MODEL})`);
    chatAdapter = new ClaudeChatAdapter();
  }

  // 3c. Audio storage (uploads). Always Supabase; construction is tolerant if unconfigured.
  const audioStorage = new SupabaseStorageAdapter();

  // 3d. Select Transcription Adapter (uploads)
  let transcription: TranscriptionPort;
  if (config.TRANSCRIPTION_PROVIDER === 'fake') {
    console.log('🎙️  Using Fake Transcription Adapter');
    transcription = new FakeTranscriptionAdapter(webhookRepo);
  } else {
    console.log('🎙️  Using AssemblyAI Transcription Adapter');
    transcription = new AssemblyAIAdapter({ baseUrl: config.ASSEMBLYAI_BASE_URL });
  }

  // 4. Services
  const billingAccess = new BillingAccessService(paddleBillingRepo, paddlePriceCatalog);
  const customerPortal = new CustomerPortalService(paddleBillingRepo, new PaddleCustomerPortalAdapter());
  const usageMeter = new UsageMeterService(meetingRepo, usageRepo, billingAccess);
  const startMeetingService = new StartMeetingService(meetingRepo, usageMeter, botAdapter);
  // Live transcript: the webhook ingest publishes onto the bus, the SSE route subscribes.
  // Both live in this process — see the note in live-transcript.bus.ts.
  const liveTranscriptBus = new LiveTranscriptBus();
  const liveTranscriptService = new IngestLiveTranscriptService(meetingRepo, liveTranscriptRepo, liveTranscriptBus);
  const processService = new ProcessWebhookEventService(
    meetingRepo, transcriptRepo, usageRepo, botAdapter, docGen, liveTranscriptRepo, liveTranscriptBus,
  );
  const uploadService = new ProcessUploadEventService(meetingRepo, transcriptRepo, usageRepo, transcription, audioStorage, docGen);
  const chatService = new ChatService(transcriptRepo, chatRepo, chatAdapter, billingAccess);

  // 4c. Auth (Day 5): accounts + sessions + GDPR erasure
  const userRepo = new DrizzleUserRepository();
  const checkoutService = new CheckoutService(
    paddleBillingRepo, userRepo, new PaddleCheckoutAdapter(), paddleCheckoutPriceIds,
  );
  const subscriptionUpdate = new SubscriptionUpdateService(
    paddleBillingRepo, new PaddleSubscriptionUpdateAdapter(), paddlePlanChangePrices,
  );
  const sessionRepo = new DrizzleSessionRepository();
  const verificationTokenRepo = new DrizzleVerificationTokenRepository();
  const emailVerificationTokens = new EmailVerificationTokenService(verificationTokenRepo);
  const emailVerificationMailer = createEmailVerificationMailer({
    provider: config.EMAIL_PROVIDER,
    resendApiKey: config.RESEND_API_KEY,
    resendFrom: config.RESEND_FROM,
  });
  const emailVerificationDelivery = new EmailVerificationDeliveryService(
    emailVerificationTokens,
    emailVerificationMailer,
    config.WEB_ORIGIN,
  );
  const passwordHasher = new Argon2Hasher();
  const authService = new AuthService(
    userRepo, sessionRepo, passwordHasher, config.SESSION_TTL_DAYS,
    meetingRepo, transcriptRepo, documentRepo, chatRepo, usageRepo, audioStorage, botAdapter,
    emailVerificationTokens, emailVerificationDelivery,
  );

  // 4. Web Worker
  const worker = new WebhookWorker(webhookRepo, meetingRepo, processService, uploadService, botAdapter);
  worker.start();

  // 4b. Sweep Job (runs on boot + every 6 hours)
  const sweepJob = new SweepJob(meetingRepo, audioStorage, botAdapter, sessionRepo);
  sweepJob.start();

  // 5. Server Routes
  const routes = [
    createHealthRoutes(),
    createAuthRoutes(authService),
    createMeRoutes(usageRepo, billingAccess),
    createBillingRoutes(customerPortal, checkoutService, subscriptionUpdate),
    createMeetingRoutes(meetingRepo, transcriptRepo, documentRepo, startMeetingService, docGen, liveTranscriptRepo, liveTranscriptBus),
    createChatRoutes(meetingRepo, chatService),
    createUploadRoutes(meetingRepo, webhookRepo, usageMeter, audioStorage),
    createWebhookRoutes(webhookRepo, paddleBillingRepo, liveTranscriptService)
  ];

  // 6. HTTP Server
  const app = createServer(routes, (token) => authService.getUserForToken(token));
  const server = app.listen(config.PORT, () => {
    console.log(`📡 HTTP Server running on http://localhost:${config.PORT}`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('🛑 Shutting down server...');
    // Before server.close(), which waits for every connection to drain: SSE streams never end
    // on their own, so an open meeting page would otherwise hold the deploy open indefinitely.
    liveTranscriptBus.shutdown();
    server.close(() => {
      worker.stop();
      sweepJob.stop();
      console.log('👋 Clean exit.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap().catch(err => {
  console.error('❌ Bootstrap failed:', err);
  process.exit(1);
});

