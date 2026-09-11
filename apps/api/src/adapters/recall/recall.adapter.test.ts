import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecallAdapter } from './recall.adapter';
import { config } from '../../config/env';
import { logger } from '../../config/logger';
import { BOT_PROVIDER_MESSAGE, BotProviderError } from '../../domain/errors';
import { errorHandler } from '../http/middleware/error-handler';
import { sanitizeBotProviderEvent } from '../observability/sentry';

const marker = 'SYNTHETIC_SENSITIVE_token_signed_url_customer_data';
const safeRequestId = '12345678-1234-4234-8234-123456789abc';
const media = `https://media.example.test/transcript?signature=${marker}`;
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

  it.each(operations)('sanitizes %s network exceptions on the bounded retry', async (_name, operation) => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new Error(marker, { cause: { url: media, token: marker } }));
    const result = safeFailure(operation);
    await vi.advanceTimersByTimeAsync(2_001);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

  it('retries a 5xx once and preserves successful bot creation and recording deletion', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(new Response(marker, { status: 503 })).mockResolvedValueOnce(Response.json({ id: 'synthetic-bot' }));
    const created = operations[0][1]();
    await vi.advanceTimersByTimeAsync(2_001);
    expect(await created).toEqual({ botId: 'synthetic-bot' });
    for (const status of [200, 404, 409]) {
      fetchMock.mockResolvedValueOnce(new Response('', { status }));
      await expect(adapter.deleteRecording('synthetic-bot')).resolves.toBeUndefined();
    }
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
