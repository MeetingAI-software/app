import { describe, it, expect } from 'vitest';
import { verifyTranscriptionSecret, TRANSCRIPTION_WEBHOOK_HEADER } from './transcription-webhook.verifier';

describe('verifyTranscriptionSecret', () => {
  it('accepts a matching secret', () => {
    expect(verifyTranscriptionSecret('shared-secret', 'shared-secret')).toBe(true);
  });

  it('rejects a mismatched secret', () => {
    expect(verifyTranscriptionSecret('shared-secret', 'wrong-secret!')).toBe(false);
  });

  it('rejects when the expected secret is not configured', () => {
    expect(verifyTranscriptionSecret('', 'anything')).toBe(false);
    expect(verifyTranscriptionSecret(undefined, 'anything')).toBe(false);
  });

  it('rejects a missing provided header', () => {
    expect(verifyTranscriptionSecret('shared-secret', undefined)).toBe(false);
  });

  it('takes the first value when the header arrives as an array', () => {
    expect(verifyTranscriptionSecret('shared-secret', ['shared-secret'])).toBe(true);
  });

  it('exposes the header name it expects', () => {
    expect(TRANSCRIPTION_WEBHOOK_HEADER).toBe('x-transcription-secret');
  });
});
