export function routeRecallEvent(eventType: string): 'transcript_ready' | 'bot_status_change' | 'ignore' {
  switch (eventType) {
    case 'bot.status_change':
      return 'bot_status_change';
    case 'transcript.done':
    case 'transcript_ready': // Support fake provider's simulated event too
      return 'transcript_ready';
    default:
      return 'ignore';
  }
}
