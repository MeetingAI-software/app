export type RecallEventAction =
  | 'transcript_ready'
  | 'transcript_failed'
  | 'bot_status_change'
  | 'ignore';

/**
 * Recall does not send a single `bot.status_change` event — it sends one event per transition
 * (`bot.joining_call`, `bot.in_call_recording`, `bot.done`, `bot.fatal`, ...) and the docs
 * warn the list will grow. So this classifies by prefix rather than matching an enum; the
 * actual status code travels in the payload, not the event name.
 */
export function routeRecallEvent(eventType: string): RecallEventAction {
  switch (eventType) {
    case 'transcript.done':
    case 'transcript_ready': // Support fake provider's simulated event too
      return 'transcript_ready';
    case 'transcript.failed':
      return 'transcript_failed';
    case 'bot.status_change': // Legacy single-event shape, kept for older accounts
      return 'bot_status_change';
    // Live utterances. These never reach this router in practice — they are delivered to
    // POST /webhooks/recall/live and handled inline — but they are listed explicitly so nobody
    // later "fixes" them by routing them into the webhook outbox. That queue is polled every
    // 2s and guarantees exactly-once delivery, which is the wrong shape entirely for text that
    // is superseded several times a second and thrown away at the end of the call.
    case 'transcript.data':
    case 'transcript.partial_data':
      return 'ignore';
  }

  if (eventType.startsWith('bot.')) {
    return 'bot_status_change';
  }

  // transcript.processing / transcript.deleted / recording.* / participant_events.* etc.
  return 'ignore';
}
