import { config } from '../../config/env';
import { BotProviderError, type BotOperation } from '../../domain/errors';

function failure(operation: BotOperation, response?: Response) {
  return new BotProviderError({ operation, status: response?.status,
    requestId: response?.headers.get('x-request-id') ?? undefined });
}

const MAX_TRANSCRIPT_DOWNLOAD_BYTES = 8 * 1024 * 1024;
const RECALL_MEDIA_HOST = /^recallai-(?:production|prod)-bot-data\.s3(?:\.[a-z0-9-]+)?\.amazonaws\.com$/;

function validTranscriptUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      !url.hash && RECALL_MEDIA_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

async function readBoundedTranscript(response: Response, operation: BotOperation): Promise<unknown> {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_TRANSCRIPT_DOWNLOAD_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw failure(operation, response);
  }
  if (!response.body) throw failure(operation, response);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_TRANSCRIPT_DOWNLOAD_BYTES) throw failure(operation, response);
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks, bytes).toString('utf8'));
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** One retry, a 15-second deadline including body reads, and no raw upstream data in errors. */
export async function requestRecall(
  operation: BotOperation, url: string, options: RequestInit = {}, presigned = false, deleting = false,
): Promise<any> {
  if (!presigned && !config.RECALL_API_KEY) throw failure(operation);
  if (presigned && !validTranscriptUrl(url)) throw failure(operation);
  // Create-bot POST has no provider idempotency key. A 5xx or lost response may already have
  // created a paid bot, so retry only reads and the explicitly idempotent media deletion.
  const mayRetry = presigned || deleting || (options.method ?? 'GET').toUpperCase() === 'GET';
  for (let attempt = 0; attempt < (mayRetry ? 2 : 1); attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let response: Response | undefined;
    let retry = false;
    try {
      response = await fetch(url, { ...options, signal: controller.signal, redirect: 'manual',
        // Presigned media URLs must never receive the Recall Authorization header.
        headers: presigned ? undefined : { Authorization: `Token ${config.RECALL_API_KEY}`,
          'Content-Type': 'application/json', accept: 'application/json' },
      });
      if (response.status >= 500 && attempt === 0 && mayRetry) {
        await response.body?.cancel().catch(() => undefined);
        retry = true;
      } else if (deleting && (response.ok || response.status === 404 || response.status === 409)) {
        await response.body?.cancel().catch(() => undefined);
        return;
      } else if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw failure(operation, response);
      } else {
        try { return presigned ? await readBoundedTranscript(response, operation) : await response.json(); }
        catch { throw failure(operation, response); }
      }
    } catch (err) {
      if (err instanceof BotProviderError) throw err;
      if (controller.signal.aborted || !mayRetry || attempt === 1) throw failure(operation, response);
      retry = true;
    } finally {
      clearTimeout(timeout);
    }
    if (retry) await new Promise(resolve => setTimeout(resolve, 2_000));
  }
  throw failure(operation);
}
