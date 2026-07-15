import { DrizzleMeetingRepository } from '../adapters/db/repositories/meeting.repository';
import { DrizzleTranscriptRepository } from '../adapters/db/repositories/transcript.repository';
import { DrizzleWebhookEventRepository } from '../adapters/db/repositories/webhook-event.repository';
import { DrizzleUsageRepository } from '../adapters/db/repositories/usage.repository';
import { assertTransition } from '../domain/state-machine';

async function main() {
  console.log('🧪 Starting database smoke test...');
  
  const meetingRepo = new DrizzleMeetingRepository();
  const transcriptRepo = new DrizzleTranscriptRepository();
  const webhookRepo = new DrizzleWebhookEventRepository();
  const usageRepo = new DrizzleUsageRepository();
  
  // 1. Create meeting
  console.log('1. Creating meeting...');
  const meeting = await meetingRepo.create({ meetingUrl: 'https://zoom.us/j/123456789' });
  console.log('   Created meeting with ID:', meeting.id);
  
  // 2. Transition status
  console.log('2. Transitioning meeting status to bot_joining...');
  assertTransition(meeting.status, 'bot_joining');
  const updatedMeeting = await meetingRepo.updateStatus(meeting.id, 'bot_joining', { botId: 'test-bot-123' });
  console.log('   Updated status to:', updatedMeeting.status, 'with botId:', updatedMeeting.botId);
  
  // 3. Save transcript
  console.log('3. Saving transcript...');
  const segments = [{ startMs: 0, endMs: 5000, speaker: 'Alper Eken', text: 'Hello, testing the database integration.' }];
  await transcriptRepo.save(meeting.id, segments, { original: 'payload' });
  console.log('   Transcript saved.');
  
  // 4. Read back transcript
  console.log('4. Reading transcript back...');
  const readBack = await transcriptRepo.getByMeetingId(meeting.id);
  console.log('   Read back segments:', JSON.stringify(readBack));
  
  // 5. Test usage
  console.log('5. Adding usage ledger entry...');
  await usageRepo.addSeconds(meeting.id, 120);
  const monthlyTotal = await usageRepo.monthlyTotalSeconds();
  console.log('   Monthly total seconds recorded:', monthlyTotal);
  
  // 6. Test Webhook idempotency
  console.log('6. Testing Webhook insertIfNew...');
  const inserted1 = await webhookRepo.insertIfNew({
    provider: 'fake',
    externalEventId: 'evt_111',
    eventType: 'test_event',
    payload: { status: 'ok' }
  });
  console.log('   Insert event 1 (first time):', inserted1); // should be true
  
  const inserted2 = await webhookRepo.insertIfNew({
    provider: 'fake',
    externalEventId: 'evt_111',
    eventType: 'test_event',
    payload: { status: 'ok' }
  });
  console.log('   Insert event 1 again (idempotent):', inserted2); // should be false
  
  // 7. Claim webhook event
  console.log('7. Claiming next pending webhook event...');
  const claimed = await webhookRepo.claimNextPending();
  console.log('   Claimed event:', JSON.stringify(claimed));
  
  if (claimed) {
    await webhookRepo.markProcessed(claimed.id);
    console.log('   Event marked processed.');
  }
  
  console.log('🎉 DB Smoke test completed successfully!');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ DB Smoke test failed:', err);
  process.exit(1);
});
