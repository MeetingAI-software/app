import { config } from '../../config/env';
import { BotProviderError, type BotOperation } from '../../domain/errors';

function failure(operation: BotOperation, response?: Response) {
  return new BotProviderError({ operation, status: response?.status,
    requestId: response?.headers.get('x-request-id') ?? undefined });
}

/** One retry, a 15-second deadline including body reads, and no raw upstream data in errors. */
export async function requestRecall(
  operation: BotOperation, url: string, options: RequestInit = {}, presigned = false, deleting = false,
): Promise<any> {
  if (!presigned && !config.RECALL_API_KEY) throw failure(operation);
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let response: Response | undefined;
    let retry = false;
    try {
      response = await fetch(url, { ...options, signal: controller.signal,
        // Presigned media URLs must never receive the Recall Authorization header.
        headers: presigned ? undefined : { Authorization: `Token ${config.RECALL_API_KEY}`,
          'Content-Type': 'application/json', accept: 'application/json' },
      });
      if (response.status >= 500 && attempt === 0) {
        await response.body?.cancel().catch(() => undefined);
        retry = true;
      } else if (deleting && (response.ok || response.status === 404 || response.status === 409)) {
        await response.body?.cancel().catch(() => undefined);
        return;
      } else if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw failure(operation, response);
      } else {
        try { return await response.json(); }
        catch { throw failure(operation, response); }
      }
    } catch (err) {
      if (err instanceof BotProviderError) throw err;
      if (controller.signal.aborted || attempt === 1) throw failure(operation, response);
      retry = true;
    } finally {
      clearTimeout(timeout);
    }
    if (retry) await new Promise(resolve => setTimeout(resolve, 2_000));
  }
  throw failure(operation);
}
