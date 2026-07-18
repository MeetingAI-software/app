import { describe, it, expect } from 'vitest';
import { assertTransition } from './state-machine';
import { InvalidTransitionError } from './errors';

describe('state machine', () => {
  it('allows valid transitions', () => {
    expect(() => assertTransition('pending', 'bot_joining')).not.toThrow();
    expect(() => assertTransition('pending', 'processing')).not.toThrow();   // Day 3: upload path
    expect(() => assertTransition('pending', 'failed')).not.toThrow();
    expect(() => assertTransition('bot_joining', 'recording')).not.toThrow();
    expect(() => assertTransition('bot_joining', 'failed')).not.toThrow();
    expect(() => assertTransition('recording', 'processing')).not.toThrow();
    expect(() => assertTransition('recording', 'failed')).not.toThrow();
    expect(() => assertTransition('processing', 'transcribed')).not.toThrow();
    expect(() => assertTransition('processing', 'failed')).not.toThrow();
  });

  it('rejects invalid transitions', () => {
    expect(() => assertTransition('transcribed', 'recording')).toThrow(InvalidTransitionError);
    expect(() => assertTransition('failed', 'pending')).toThrow(InvalidTransitionError);
    expect(() => assertTransition('pending', 'transcribed')).toThrow(InvalidTransitionError);
    expect(() => assertTransition('recording', 'pending')).toThrow(InvalidTransitionError);
  });
});
