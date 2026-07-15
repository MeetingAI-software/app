import type { MeetingStatus } from './types';
import { InvalidTransitionError } from './errors';

export const ALLOWED_TRANSITIONS: Record<MeetingStatus, MeetingStatus[]> = {
  pending:     ['bot_joining', 'failed'],
  bot_joining: ['recording', 'failed'],
  recording:   ['processing', 'failed'],
  processing:  ['transcribed', 'failed'],
  transcribed: [],
  failed:      [],
};

export function assertTransition(from: MeetingStatus, to: MeetingStatus): void {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new InvalidTransitionError(`Invalid transition from ${from} to ${to}`);
  }
}
