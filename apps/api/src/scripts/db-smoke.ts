import { DrizzleMeetingRepository } from '../adapters/db/repositories/meeting.repository';
import { DrizzleTranscriptRepository } from '../adapters/db/repositories/transcript.repository';
import { DrizzleWebhookEventRepository } from '../adapters/db/repositories/webhook-event.repository';
import { DrizzleUsageRepository } from '../adapters/db/repositories/usage.repository';
import { DrizzleDocumentRepository } from '../adapters/db/repositories/document.repository';
import { assertTransition } from '../domain/state-machine';

async function main() {
  console.log('🧪 Starting database smoke test...');
  
  const meetingRepo = new DrizzleMeetingRepository();
  const transcriptRepo = new DrizzleTranscriptRepository();
  const webhookRepo = new DrizzleWebhookEventRepository();
  const usageRepo = new DrizzleUsageRepository();
  const documentRepo = new DrizzleDocumentRepository();
  
  // 1. Create meeting
  console.log('1. Creating meeting...');
  const meeting = await meetingRepo.create({ meetingUrl: 'https://zoom.us/j/123456789' });
  console.log('   Created meeting with ID:', meeting.id);
  console.log('   Share token:', meeting.shareToken);
  
  if (!meeting.shareToken) {
    throw new Error('shareToken is missing!');
  }

  // Create second meeting to verify uniqueness of share tokens
  const meeting2 = await meetingRepo.create({ meetingUrl: 'https://zoom.us/j/987654321' });
  console.log('   Created second meeting, Share token:', meeting2.shareToken);
  if (meeting.shareToken === meeting2.shareToken) {
    throw new Error('Share tokens must be unique!');
  }

  // 1b. Test findByShareToken
  console.log('1b. Finding meeting by share token...');
  const foundByToken = await meetingRepo.findByShareToken(meeting.shareToken);
  if (!foundByToken || foundByToken.id !== meeting.id) {
    throw new Error('findByShareToken failed to retrieve the correct meeting!');
  }
  console.log('   Meeting found successfully by share token.');
  
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
  
  // 4b. Test Document upsert (twice)
  console.log('4b. Testing Document upsert (twice)...');
  const docContent1 = {
    title: 'Meeting Notes V1',
    missed5: ['Bullet 1', 'Bullet 2', 'Bullet 3'],
    decisions: ['Decision 1'],
    actionPoints: [{ task: 'Task 1', owner: 'Alper Eken', deadlineIso: null }],
    openQuestions: ['Question 1'],
  };
  await documentRepo.upsertForMeeting(meeting.id, docContent1, {
    model: 'claude-sonnet-4-6',
    inputTokens: 100,
    outputTokens: 200,
  });

  const docContent2 = {
    title: 'Meeting Notes V2',
    missed5: ['Bullet 1', 'Bullet 2', 'Bullet 3', 'Bullet 4'],
    decisions: ['Decision 1', 'Decision 2'],
    actionPoints: [{ task: 'Task 1', owner: 'Alper Eken', deadlineIso: null }],
    openQuestions: ['Question 1'],
  };
  await documentRepo.upsertForMeeting(meeting.id, docContent2, {
    model: 'claude-sonnet-4-6',
    inputTokens: 150,
    outputTokens: 250,
  });

  const fetchedDoc = await documentRepo.getByMeetingId(meeting.id);
  if (!fetchedDoc) {
    throw new Error('Document was not upserted properly!');
  }
  console.log('   Fetched document title (should be V2):', fetchedDoc.content.title);
  if (fetchedDoc.content.title !== 'Meeting Notes V2') {
    throw new Error('Document content was not updated!');
  }
  
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

