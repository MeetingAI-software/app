import express from 'express';
import { config } from '../config/env';
import { initObservability } from '../adapters/observability/sentry';
import { createServer } from '../adapters/http/server';
import { DrizzleMeetingRepository } from '../adapters/db/repositories/meeting.repository';
import { DrizzleTranscriptRepository } from '../adapters/db/repositories/transcript.repository';
import { DrizzleWebhookEventRepository } from '../adapters/db/repositories/webhook-event.repository';
import { DrizzleUsageRepository } from '../adapters/db/repositories/usage.repository';
import { DrizzleDocumentRepository } from '../adapters/db/repositories/document.repository';
import { DrizzleChatMessageRepository } from '../adapters/db/repositories/chat-message.repository';
import { DrizzleUserRepository } from '../adapters/db/repositories/user.repository';
import { DrizzleSessionRepository } from '../adapters/db/repositories/session.repository';
import { DrizzleVerificationTokenRepository } from '../adapters/db/repositories/verification-token.repository';
import { DrizzlePaddleBillingRepository } from '../adapters/db/repositories/paddle-billing.repository';
import { createEmailVerificationMailer } from '../adapters/email/email-verification-mailer.factory';
import { FakeBotAdapter } from '../adapters/fake/fake-bot.adapter';
import { UsageMeterService } from '../application/usage-meter.service';
import { StartMeetingService } from '../application/start-meeting.service';
import { ProcessWebhookEventService } from '../application/process-webhook-event.service';
import { ProcessUploadEventService } from '../application/process-upload-event.service';
import { ChatService } from '../application/chat.service';
import { BillingAccessService } from '../application/billing-access.service';
import { CustomerPortalService } from '../application/customer-portal.service';
import { paddlePriceCatalog } from '../config/billing-catalog';
import { AuthService } from '../application/auth.service';
import { EmailVerificationTokenService } from '../application/email-verification-token.service';
import { EmailVerificationDeliveryService } from '../application/email-verification-delivery.service';
import { createMeetingRoutes } from '../adapters/http/routes/meetings.routes';
import { createHealthRoutes } from '../adapters/http/routes/health.routes';
import { createWebhookRoutes } from '../adapters/http/routes/webhooks.routes';
import { createChatRoutes } from '../adapters/http/routes/chat.routes';
import { createUploadRoutes } from '../adapters/http/routes/upload.routes';
import { createAuthRoutes } from '../adapters/http/routes/auth.routes';
import { createMeRoutes } from '../adapters/http/routes/me.routes';
import { createBillingRoutes } from '../adapters/http/routes/billing.routes';
import { PaddleCustomerPortalAdapter } from '../adapters/paddle/paddle-customer-portal.adapter';
import { SupabaseStorageAdapter } from '../adapters/supabase/supabase-storage.adapter';
import { RecallAdapter } from '../adapters/recall/recall.adapter';
import { FakeDocumentGenerator } from '../adapters/fake/fake-document.generator';
import { ClaudeAdapter } from '../adapters/claude/claude.adapter';
import { GeminiDocumentAdapter } from '../adapters/gemini/gemini-document.adapter';
import { FakeChatAdapter } from '../adapters/fake/fake-chat.adapter';
import { ClaudeChatAdapter } from '../adapters/claude/claude-chat.adapter';
import { GeminiChatAdapter } from '../adapters/gemini/gemini-chat.adapter';
import { FakeTranscriptionAdapter } from '../adapters/fake/fake-transcription.adapter';
import { AssemblyAIAdapter } from '../adapters/assemblyai/assemblyai.adapter';
import { Argon2Hasher } from '../adapters/auth/argon2.hasher';
import type { MeetingBotPort } from '../ports/meeting-bot.port';
import type { DocumentGeneratorPort } from '../ports/document-generator.port';
import type { MeetingChatPort } from '../ports/chat.port';
import type { TranscriptionPort } from '../ports/transcription.port';

let appInstance: express.Application | null = null;

export function getApp(): express.Application {
  if (appInstance) return appInstance;

  initObservability();

  const meetingRepo = new DrizzleMeetingRepository();
  const transcriptRepo = new DrizzleTranscriptRepository();
  const webhookRepo = new DrizzleWebhookEventRepository();
  const usageRepo = new DrizzleUsageRepository();
  const documentRepo = new DrizzleDocumentRepository();
  const chatRepo = new DrizzleChatMessageRepository();
  const paddleBillingRepo = new DrizzlePaddleBillingRepository();

  let botAdapter: MeetingBotPort;
  if (config.BOT_PROVIDER === 'fake') {
    botAdapter = new FakeBotAdapter(webhookRepo);
  } else {
    botAdapter = new RecallAdapter();
  }

  let docGen: DocumentGeneratorPort;
  if (config.DOC_PROVIDER === 'fake') {
    docGen = new FakeDocumentGenerator();
  } else if (config.DOC_PROVIDER === 'gemini') {
    docGen = new GeminiDocumentAdapter();
  } else {
    docGen = new ClaudeAdapter();
  }

  let chatAdapter: MeetingChatPort;
  if (config.CHAT_PROVIDER === 'fake') {
    chatAdapter = new FakeChatAdapter();
  } else if (config.CHAT_PROVIDER === 'gemini') {
    chatAdapter = new GeminiChatAdapter();
  } else {
    chatAdapter = new ClaudeChatAdapter();
  }

  const audioStorage = new SupabaseStorageAdapter();

  let transcription: TranscriptionPort;
  if (config.TRANSCRIPTION_PROVIDER === 'fake') {
    transcription = new FakeTranscriptionAdapter(webhookRepo);
  } else {
    transcription = new AssemblyAIAdapter({ baseUrl: config.ASSEMBLYAI_BASE_URL });
  }

  const billingAccess = new BillingAccessService(paddleBillingRepo, paddlePriceCatalog);
  const customerPortal = new CustomerPortalService(paddleBillingRepo, new PaddleCustomerPortalAdapter());
  const usageMeter = new UsageMeterService(meetingRepo, usageRepo, billingAccess);
  const startMeetingService = new StartMeetingService(meetingRepo, usageMeter, botAdapter);

  const userRepo = new DrizzleUserRepository();
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

  const routes = [
    createHealthRoutes(),
    createAuthRoutes(authService),
    createMeRoutes(usageRepo, billingAccess),
    createBillingRoutes(customerPortal),
    createMeetingRoutes(meetingRepo, transcriptRepo, documentRepo, startMeetingService, docGen),
    createChatRoutes(meetingRepo, new ChatService(transcriptRepo, chatRepo, chatAdapter, billingAccess)),
    createUploadRoutes(meetingRepo, webhookRepo, usageMeter, audioStorage),
    createWebhookRoutes(webhookRepo, paddleBillingRepo)
  ];

  appInstance = createServer(routes, (token) => authService.getUserForToken(token));
  return appInstance;
}

export default function handler(req: any, res: any) {
  const app = getApp();
  return app(req, res);
}
