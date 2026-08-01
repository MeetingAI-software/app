import { describe, it, expect } from 'vitest';
import { routeRecallEvent } from './recall-event.router';

describe('recall-event.router', () => {
  // The provider sends one event per transition, not a single bot.status_change. Matching an
  // enum meant every real event fell through to 'ignore' and meetings hung in bot_joining.
  it.each([
    'bot.joining_call',
    'bot.in_waiting_room',
    'bot.in_call_not_recording',
    'bot.in_call_recording',
    'bot.recording_permission_denied',
    'bot.call_ended',
    'bot.done',
    'bot.fatal',
  ])('routes %s to bot_status_change', (event) => {
    expect(routeRecallEvent(event)).toBe('bot_status_change');
  });

  it('routes a status code we have never seen to bot_status_change', () => {
    // The docs warn the event list will grow; unknown bot.* events must not be dropped.
    expect(routeRecallEvent('bot.some_future_state')).toBe('bot_status_change');
  });

  it('still accepts the legacy single-event shape', () => {
    expect(routeRecallEvent('bot.status_change')).toBe('bot_status_change');
  });

  it('routes transcript completion and failure', () => {
    expect(routeRecallEvent('transcript.done')).toBe('transcript_ready');
    expect(routeRecallEvent('transcript.failed')).toBe('transcript_failed');
  });

  it('accepts the fake provider event so the fake stays substitutable', () => {
    expect(routeRecallEvent('transcript_ready')).toBe('transcript_ready');
  });

  it('ignores artifact events we do not act on', () => {
    expect(routeRecallEvent('transcript.processing')).toBe('ignore');
    expect(routeRecallEvent('transcript.deleted')).toBe('ignore');
    expect(routeRecallEvent('recording.done')).toBe('ignore');
    expect(routeRecallEvent('participant_events.done')).toBe('ignore');
    expect(routeRecallEvent('')).toBe('ignore');
  });

  // These are delivered to POST /webhooks/recall/live and handled inline. If they ever start
  // resolving to an action here, they would be queued onto the 2s-poll webhook outbox — which
  // would both lag the live transcript and flood the table with rows that are thrown away.
  it('never routes live transcript events into the webhook outbox', () => {
    expect(routeRecallEvent('transcript.data')).toBe('ignore');
    expect(routeRecallEvent('transcript.partial_data')).toBe('ignore');
  });
});
