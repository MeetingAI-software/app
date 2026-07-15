import { config } from './config/env';
import { createServer } from './adapters/http/server';
import { DrizzleMeetingRepository } from './adapters/db/repositories/meeting.repository';
import { DrizzleTranscriptRepository } from './adapters/db/repositories/transcript.repository';
import { DrizzleWebhookEventRepository } from './adapters/db/repositories/webhook-event.repository';
import { DrizzleUsageRepository } from './adapters/db/repositories/usage.repository';
import { FakeBotAdapter } from './adapters/fake/fake-bot.adapter';
import { UsageMeterService } from './application/usage-meter.service';
import { StartMeetingService } from './application/start-meeting.service';
import { ProcessWebhookEventService } from './application/process-webhook-event.service';
import { WebhookWorker } from './jobs/worker';
import { createMeetingRoutes } from './adapters/http/routes/meetings.routes';
import { createHealthRoutes } from './adapters/http/routes/health.routes';
import { createWebhookRoutes } from './adapters/http/routes/webhooks.routes';
import type { MeetingBotPort } from './ports/meeting-bot.port';

async function bootstrap() {
  console.log(`🚀 Bootstrapping MeetingAI (Env: ${config.NODE_ENV}, Port: ${config.PORT})`);

  // 1. Repositories
  const meetingRepo = new DrizzleMeetingRepository();
  const transcriptRepo = new DrizzleTranscriptRepository();
  const webhookRepo = new DrizzleWebhookEventRepository();
  const usageRepo = new DrizzleUsageRepository();

  // 2. Select Bot Adapter
  let botAdapter: MeetingBotPort;
  if (config.BOT_PROVIDER === 'fake') {
    console.log('🤖 Using Fake Bot Adapter');
    botAdapter = new FakeBotAdapter(webhookRepo);
  } else {
    console.log('🤖 Using Recall Bot Adapter');
    // AbdulRehman will replace this with the real RecallAdapter.
    // For now we instantiate a placeholder to prevent boot crash.
    botAdapter = new FakeBotAdapter(webhookRepo);
  }

  // 3. Services
  const usageMeter = new UsageMeterService(meetingRepo, usageRepo);
  const startMeetingService = new StartMeetingService(meetingRepo, usageMeter, botAdapter);
  const processService = new ProcessWebhookEventService(meetingRepo, transcriptRepo, usageRepo, botAdapter);

  // 4. Web Worker
  const worker = new WebhookWorker(webhookRepo, meetingRepo, processService);
  worker.start();

  // 5. Server Routes
  const routes = [
    createHealthRoutes(),
    createMeetingRoutes(meetingRepo, transcriptRepo, startMeetingService),
    createWebhookRoutes(webhookRepo)
  ];

  // 6. HTTP Server
  const app = createServer(routes);
  const server = app.listen(config.PORT, () => {
    console.log(`📡 HTTP Server running on http://localhost:${config.PORT}`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('🛑 Shutting down server...');
    server.close(() => {
      worker.stop();
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
