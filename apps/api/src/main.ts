import { config } from './config/env';
import { initObservability } from './adapters/observability/sentry';
import { createServer } from './adapters/http/server';
import { DrizzleMeetingRepository } from './adapters/db/repositories/meeting.repository';
import { DrizzleTranscriptRepository } from './adapters/db/repositories/transcript.repository';
import { DrizzleWebhookEventRepository } from './adapters/db/repositories/webhook-event.repository';
import { DrizzleUsageRepository } from './adapters/db/repositories/usage.repository';
import { DrizzleDocumentRepository } from './adapters/db/repositories/document.repository';
import { DrizzleChatMessageRepository } from './adapters/db/repositories/chat-message.repository';
import { DrizzleUserRepository } from './adapters/db/repositories/user.repository';
import { DrizzleSessionRepository } from './adapters/db/repositories/session.repository';
import { FakeBotAdapter } from './adapters/fake/fake-bot.adapter';
import { UsageMeterService } from './application/usage-meter.service';
import { StartMeetingService } from './application/start-meeting.service';
import { ProcessWebhookEventService } from './application/process-webhook-event.service';
import { ProcessUploadEventService } from './application/process-upload-event.service';
import { ChatService } from './application/chat.service';
import { AuthService } from './application/auth.service';
import { WebhookWorker } from './jobs/worker';
import { SweepJob } from './jobs/sweep';
import { createMeetingRoutes } from './adapters/http/routes/meetings.routes';
import { createHealthRoutes } from './adapters/http/routes/health.routes';
import { createWebhookRoutes } from './adapters/http/routes/webhooks.routes';
import { createChatRoutes } from './adapters/http/routes/chat.routes';
import { createUploadRoutes } from './adapters/http/routes/upload.routes';
import { createAuthRoutes } from './adapters/http/routes/auth.routes';
import { createMeRoutes } from './adapters/http/routes/me.routes';
import { SupabaseStorageAdapter } from './adapters/supabase/supabase-storage.adapter';
import { RecallAdapter } from './adapters/recall/recall.adapter';
import { FakeDocumentGenerator } from './adapters/fake/fake-document.generator';
import { ClaudeAdapter } from './adapters/claude/claude.adapter';
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
  const webhookRepo = new DrizzleWebhookEventRepository();
  const usageRepo = new DrizzleUsageRepository();
  const documentRepo = new DrizzleDocumentRepository();
  const chatRepo = new DrizzleChatMessageRepository();

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
  const usageMeter = new UsageMeterService(meetingRepo, usageRepo);
  const startMeetingService = new StartMeetingService(meetingRepo, usageMeter, botAdapter);
  const processService = new ProcessWebhookEventService(meetingRepo, transcriptRepo, usageRepo, botAdapter, docGen);
  const uploadService = new ProcessUploadEventService(meetingRepo, transcriptRepo, usageRepo, transcription, audioStorage, docGen);
  const chatService = new ChatService(transcriptRepo, chatRepo, chatAdapter, config.MAX_CHAT_QUESTIONS_PER_MEETING);

  // 4c. Auth (Day 5): accounts + sessions + GDPR erasure
  const userRepo = new DrizzleUserRepository();
  const sessionRepo = new DrizzleSessionRepository();
  const passwordHasher = new Argon2Hasher();
  const authService = new AuthService(
    userRepo, sessionRepo, passwordHasher, config.SESSION_TTL_DAYS,
    meetingRepo, transcriptRepo, documentRepo, chatRepo, usageRepo, audioStorage, botAdapter
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
    createMeRoutes(usageRepo),
    createMeetingRoutes(meetingRepo, transcriptRepo, documentRepo, startMeetingService, docGen),
    createChatRoutes(meetingRepo, chatService),
    createUploadRoutes(meetingRepo, webhookRepo, usageMeter, audioStorage),
    createWebhookRoutes(webhookRepo)
  ];

  // 6. HTTP Server
  const app = createServer(routes, (token) => authService.getUserForToken(token));
  const server = app.listen(config.PORT, () => {
    console.log(`📡 HTTP Server running on http://localhost:${config.PORT}`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('🛑 Shutting down server...');
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

