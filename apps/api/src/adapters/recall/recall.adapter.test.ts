import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecallAdapter } from './recall.adapter';
import { config } from '../../config/env';
import { logger } from '../../config/logger';
import { BOT_PROVIDER_MESSAGE, BotProviderError } from '../../domain/errors';
import { errorHandler } from '../http/middleware/error-handler';
import { sanitizeBotProviderEvent } from '../observability/sentry';

const marker = 'SYNTHETIC_SENSITIVE_token_signed_url_customer_data';
const safeRequestId = '12345678-1234-4234-8234-123456789abc';
const media = `https://recallai-production-bot-data.s3.amazonaws.com/transcript?signature=${marker}`;
const bot = { recordings: [{ media_shortcuts: { transcript: { data: { download_url: media } } } }] };
const adapter = new RecallAdapter();
const operations = [
  ['create_bot', () => adapter.createBot({ meetingUrl: `https://meet.example/${marker}`, meetingId: 'synthetic' })],
  ['get_bot_status', () => adapter.getBotStatus(marker)],
  ['fetch_transcript', () => adapter.fetchTranscript(marker)],
  ['delete_recording', () => adapter.deleteRecording(marker)],
] as const;

describe('Recall error boundary', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    config.RECALL_API_KEY = marker;
    config.RECALL_BASE_URL = 'https://recall.example.test';
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

  async function safeFailure(work: () => Promise<unknown>) {
    const error = await work().catch(e => e);
    expect(error).toBeInstanceOf(BotProviderError);
    if (!(error instanceof BotProviderError)) throw new Error('Expected a sanitized bot error');
    expect(error.message).toBe(BOT_PROVIDER_MESSAGE);
    expect(error.cause).toBeUndefined();
    expect(JSON.stringify(error) + String(error.stack) + JSON.stringify(warn.mock.calls)).not.toContain(marker);
    return error as BotProviderError;
  }

  it.each(operations)('sanitizes %s upstream body, statusText and diagnostics', async (_name, operation) => {
    fetchMock.mockResolvedValue(new Response(marker, { status: 400, statusText: marker,
      headers: { 'x-request-id': safeRequestId } }));
    const error = await safeFailure(operation);
    expect(error.diagnostics).toMatchObject({ status: 400, requestId: safeRequestId });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(operations)('sanitizes %s network exceptions without duplicating paid creation', async (name, operation) => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new Error(marker, { cause: { url: media, token: marker } }));
    const result = safeFailure(operation);
    await vi.advanceTimersByTimeAsync(2_001);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(name === 'create_bot' ? 1 : 2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(operations.slice(0, 3))('sanitizes %s JSON parser errors', async (_name, operation) => {
    fetchMock.mockResolvedValue(new Response(`not-json-${marker}`, { status: 200 }));
    await safeFailure(operation);
  });

  it.each(['http', 'json', 'network'])('sanitizes signed transcript download %s errors without sending Recall credentials', async (kind) => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(Response.json(bot));
    if (kind === 'network') fetchMock.mockRejectedValue(new Error(media));
    else fetchMock.mockResolvedValue(new Response(marker, { status: kind === 'http' ? 403 : 200, statusText: marker }));
    const result = safeFailure(() => adapter.fetchTranscript(marker));
    await vi.advanceTimersByTimeAsync(2_001);
    expect((await result).diagnostics.operation).toBe('download_transcript');
    for (const [url, options] of fetchMock.mock.calls.slice(1)) {
      expect(url).toBe(media);
      expect(options.headers).toBeUndefined();
    }
  });

  it.each([
    'http://127.0.0.1/latest/meta-data',
    'https://127.0.0.1/transcript',
    'https://recallai-production-bot-data.s3.amazonaws.com.evil.test/transcript',
    'https://attacker:secret@recallai-production-bot-data.s3.amazonaws.com/transcript',
  ])('rejects an untrusted transcript URL before a second fetch: %s', async (downloadUrl) => {
    fetchMock.mockResolvedValueOnce(Response.json({ recordings: [{ media_shortcuts: {
      transcript: { data: { download_url: downloadUrl } },
    } }] }));
    await safeFailure(() => adapter.fetchTranscript(marker));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not follow a transcript redirect to an internal host', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(bot));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 302,
      headers: { location: 'http://127.0.0.1/latest/meta-data' } }));
    await safeFailure(() => adapter.fetchTranscript(marker));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].redirect).toBe('manual');
  });

  it('rejects an oversized transcript before reading its body', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(bot));
    fetchMock.mockResolvedValueOnce(new Response('[{}]', { headers: { 'content-length': '9000000' } }));
    await safeFailure(() => adapter.fetchTranscript(marker));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('still downloads a valid signed transcript without Recall credentials', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(bot));
    fetchMock.mockResolvedValueOnce(Response.json([{ speaker: 'A',
      words: [{ text: 'Hello', start_timestamp: 0, end_timestamp: 0.5 }],
    }]));
    await expect(adapter.fetchTranscript('synthetic-bot')).resolves.toMatchObject([
      { speaker: 'A', text: 'Hello', startMs: 0, endMs: 500 },
    ]);
    expect(fetchMock.mock.calls[1][1].headers).toBeUndefined();
  });

  it('measures a silent recording from provider start and completion timestamps', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ recordings: [{
      started_at: '2026-09-26T10:00:00.000Z', completed_at: '2026-09-26T10:30:00.100Z',
    }] }));
    await expect(adapter.getRecordedDurationSeconds('synthetic-bot')).resolves.toBe(1801);
  });

  it('uses the documented bot lifecycle span when recording timestamps are absent', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ status_changes: [
      { code: 'joining_call', created_at: '2026-09-26T10:00:00Z' },
      { code: 'in_call_recording', created_at: '2026-09-26T10:02:00Z' },
      { code: 'done', created_at: '2026-09-26T10:30:00Z' },
    ] }));
    await expect(adapter.getRecordedDurationSeconds('synthetic-bot')).resolves.toBe(1800);
  });

  it('requires conservative quota settlement for malformed or missing provider timing', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ recordings: [{
      started_at: '2026-09-26T10:00:00Z', completed_at: 'not-a-date',
    }] })).mockResolvedValueOnce(Response.json({ recordings: [] }));
    await expect(adapter.getRecordedDurationSeconds('synthetic-bot')).resolves.toBeNull();
    await expect(adapter.getRecordedDurationSeconds('synthetic-bot')).resolves.toBeNull();
  });

  it('keeps body reading inside the timeout and discards timeout causes', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async (_url, options) => ({
      ok: true, status: 200, headers: new Headers(),
      json: () => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error(marker)))),
    }));
    const result = safeFailure(operations[0][1]);
    await vi.advanceTimersByTimeAsync(15_001);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not retry an ambiguous bot-create 5xx, but permits a later explicit start', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(new Response(marker, { status: 503 })).mockResolvedValueOnce(Response.json({ id: 'synthetic-bot' }));
    await safeFailure(operations[0][1]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await operations[0][1]()).toEqual({ botId: 'synthetic-bot' });
    for (const status of [200, 404]) {
      fetchMock.mockResolvedValueOnce(new Response('', { status }));
      await expect(adapter.deleteRecording('synthetic-bot')).resolves.toBeUndefined();
    }
    fetchMock.mockResolvedValueOnce(new Response('', { status: 409 }))
      .mockResolvedValueOnce(new Response('', { status: 409 }));
    const conflictedDeletion = adapter.deleteRecording('synthetic-bot');
    const conflictResult = expect(conflictedDeletion).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(2_001);
    await conflictResult;
    fetchMock.mockResolvedValueOnce(new Response('', { status: 409 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }));
    const eventualDeletion = adapter.deleteRecording('synthetic-bot');
    await vi.advanceTimersByTimeAsync(2_001);
    await expect(eventualDeletion).resolves.toBeUndefined();
    fetchMock.mockResolvedValueOnce(new Response(marker, { status: 503 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }));
    const deletion = adapter.deleteRecording('synthetic-bot');
    await vi.advanceTimersByTimeAsync(2_001);
    await expect(deletion).resolves.toBeUndefined();
  });

  it('returns a stable HTTP error and restricts Sentry to permitted metadata even with contaminated SDK context', async () => {
    const error = new BotProviderError({ operation: 'create_bot', status: 403, requestId: safeRequestId });
    error.message = marker; // defensive HTTP and reporting boundaries do not trust arbitrary properties
    const json = vi.fn();
    const res = { status: vi.fn().mockReturnValue({ json }) };
    errorHandler(error, { headers: { 'x-request-id': marker } } as never, res as never, vi.fn());
    expect(res.status).toHaveBeenCalledWith(502);
    expect(json).toHaveBeenCalledWith({ error: { code: 'BOT_PROVIDER_ERROR', message: BOT_PROVIDER_MESSAGE } });
    const event = sanitizeBotProviderEvent({ type: undefined, message: marker, request: { url: media },
      exception: { values: [{ value: marker }] }, breadcrumbs: [{ message: marker }],
      extra: { raw: marker }, contexts: { upstream: { token: marker } }, user: { email: marker },
      tags: { requestId: marker, unsafe: marker } }, error);
    expect(JSON.stringify(event)).not.toContain(marker);
    expect(event.tags).toEqual({ operation: 'create_bot', status: '403', providerRequestId: safeRequestId });
    expect(new BotProviderError({ requestId: marker }).diagnostics).toEqual({});
    expect(new BotProviderError(marker).message).toBe(BOT_PROVIDER_MESSAGE);
  });
});
