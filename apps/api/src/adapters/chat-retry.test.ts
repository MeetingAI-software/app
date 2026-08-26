import { describe, it, expect, vi } from 'vitest';
import { callChatProvider, isRetryableProviderError } from './chat-retry';
import { ChatProviderError } from '../domain/errors';

/** The exact shape @google/genai threw in production on 2026-08-26 — the failure that started this. */
const geminiDeadline = Object.assign(
  new Error('{"code":504,"message":"Deadline expired before operation could complete.","status":"DEADLINE_EXCEEDED"}'),
  { status: 504 }
);
const geminiOverloaded = Object.assign(
  new Error('{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}'),
  { status: 503 }
);
const anthropicOverloaded = Object.assign(new Error('Overloaded'), { status: 529 });

/** No real waiting in tests — the delay is behaviour we assert, not behaviour we sit through. */
const noSleep = vi.fn(async () => {});

describe('isRetryableProviderError', () => {
  it('retries an overloaded provider', () => {
    expect(isRetryableProviderError(geminiOverloaded)).toBe(true);
    expect(isRetryableProviderError(anthropicOverloaded)).toBe(true);
    expect(isRetryableProviderError(Object.assign(new Error('rate limited'), { status: 429 }))).toBe(true);
  });

  // The whole point of the shorter chat timeout: a second full-length wait is worse than an
  // honest failure, because somebody is watching a spinner the entire time.
  it('does NOT retry a timeout, however it is spelled', () => {
    expect(isRetryableProviderError(geminiDeadline)).toBe(false);
    expect(isRetryableProviderError(new Error('Request timed out'))).toBe(false);
  });

  it('does not retry a request we got wrong ourselves', () => {
    expect(isRetryableProviderError(Object.assign(new Error('invalid model'), { status: 400 }))).toBe(false);
    expect(isRetryableProviderError(Object.assign(new Error('bad key'), { status: 401 }))).toBe(false);
    expect(isRetryableProviderError(undefined)).toBe(false);
  });
});

describe('callChatProvider', () => {
  it('returns the result without retrying when the call succeeds', async () => {
    const call = vi.fn().mockResolvedValue('answer');

    await expect(callChatProvider('gemini', call, noSleep)).resolves.toBe('answer');
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('retries once after an overload and returns the second attempt', async () => {
    const call = vi.fn()
      .mockRejectedValueOnce(geminiOverloaded)
      .mockResolvedValueOnce('answer');

    await expect(callChatProvider('gemini', call, noSleep)).resolves.toBe('answer');
    expect(call).toHaveBeenCalledTimes(2);
    expect(noSleep).toHaveBeenCalled();
  });

  it('gives up after the retry also fails', async () => {
    const call = vi.fn().mockRejectedValue(geminiOverloaded);

    await expect(callChatProvider('gemini', call, noSleep)).rejects.toThrow(ChatProviderError);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('fails immediately on a timeout rather than doubling the wait', async () => {
    const call = vi.fn().mockRejectedValue(geminiDeadline);

    await expect(callChatProvider('gemini', call, noSleep)).rejects.toThrow(ChatProviderError);
    expect(call).toHaveBeenCalledTimes(1);
  });

  // Vendor error text is noise to a customer and can echo back part of the prompt.
  it('never leaks the provider’s own message to the caller', async () => {
    const call = vi.fn().mockRejectedValue(geminiDeadline);

    await expect(callChatProvider('gemini', call, noSleep)).rejects.toThrow(
      /busy right now/i
    );
  });
});
