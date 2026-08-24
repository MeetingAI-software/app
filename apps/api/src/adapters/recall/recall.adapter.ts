import { config } from '../../config/env';
import { BotProviderError } from '../../domain/errors';
import type { MeetingBotPort } from '../../ports/meeting-bot.port';
import type { TranscriptSegment } from '../../domain/types';
import { normalizeTranscript } from './transcript.normalizer';

function mapRecallStatus(status: string): 'joining' | 'in_call' | 'done' | 'fatal' {
  switch (status) {
    case 'ready':
    case 'joining_call':
    case 'in_waiting_room':
      return 'joining';
    case 'in_call_not_recording':
    case 'recording_permission_allowed':
    case 'recording_permission_denied':
    case 'in_call_recording':
    case 'recording_done':
      return 'in_call';
    case 'call_ended':
    case 'done':
    case 'media_expired':
    case 'analysis_done':
      return 'done';
    case 'fatal':
    case 'analysis_failed':
      return 'fatal';
    default:
      if (status.includes('joining') || status.includes('waiting')) return 'joining';
      if (status.includes('in_call') || status.includes('recording')) return 'in_call';
      if (status.includes('fail') || status.includes('fatal')) return 'fatal';
      return 'done';
  }
}

async function fetchWithRetry(url: string, options: RequestInit = {}): Promise<Response> {
  const apiKey = config.RECALL_API_KEY;
  if (!apiKey) {
    throw new Error('RECALL_API_KEY is not configured');
  }

  const headers = {
    'Authorization': `Token ${apiKey}`,
    'Content-Type': 'application/json',
    'accept': 'application/json',
    ...options.headers,
  } as Record<string, string>;

  const makeRequest = async () => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(id);
    }
  };

  try {
    let response = await makeRequest();
    if (response.status >= 500) {
      console.warn(`⚠️ Recall API returned ${response.status}. Retrying in 2s...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      response = await makeRequest();
    }
    return response;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new BotProviderError('Recall API request timed out (15s limit reached)');
    }
    console.warn(`⚠️ Recall API request failed: ${error.message}. Retrying in 2s...`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    try {
      return await makeRequest();
    } catch (retryError: any) {
      if (retryError.name === 'AbortError') {
        throw new BotProviderError('Recall API request timed out on retry (15s limit reached)');
      }
      throw new BotProviderError(`Recall API network error: ${retryError.message}`);
    }
  }
}

/**
 * Fetch a presigned media URL. Sending our `Authorization: Token ...` header to S3 makes it
 * reject the request, so this cannot reuse fetchWithRetry — but it keeps the same
 * 15s timeout + single retry contract.
 */
async function fetchPresigned(url: string): Promise<any> {
  const makeRequest = async () => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 15000);
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(id);
    }
  };

  let response: Response;
  try {
    response = await makeRequest();
    if (response.status >= 500) {
      console.warn(`⚠️ Transcript download returned ${response.status}. Retrying in 2s...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      response = await makeRequest();
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new BotProviderError('Transcript download timed out (15s limit reached)');
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
    try {
      response = await makeRequest();
    } catch (retryError: any) {
      throw new BotProviderError(`Transcript download failed: ${retryError.message}`);
    }
  }

  if (!response.ok) {
    throw new BotProviderError(`Transcript download failed: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

export class RecallAdapter implements MeetingBotPort {
  private getBaseUrl(): string {
    const baseUrl = config.RECALL_BASE_URL;
    if (!baseUrl) {
      throw new Error('RECALL_BASE_URL is not configured');
    }
    // Clean trailing slash
    return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  }

  async createBot(input: { meetingUrl: string; meetingId: string; maxMeetingSeconds?: number }): Promise<{ botId: string }> {
    const url = `${this.getBaseUrl()}/api/v1/bot/`;
    
    // `recording_config` replaced the old `transcription_options` field, which the API no
    // longer accepts.
    //
    // Provider choice: `recallai_async` is NOT valid here — it is only accepted by the separate
    // "create async transcript" call against a finished recording, which would mean a second
    // round trip and a `recording.done` subscription. `recallai_streaming` transcribes during
    // the call and still finalizes the transcript afterwards, firing `transcript.done` with a
    // downloadable transcript that carries participant names and per-word timestamps — exactly
    // the webhook→worker→fetch flow we already have.
    //
    // `realtime_endpoints` is what makes the live transcript possible: without it Recall
    // transcribes silently and only the post-call transcript is produced. Subscribing costs
    // nothing extra — the same streaming provider is already running. `prioritize_low_latency`
    // over `prioritize_accuracy` is the price of the live view: partials land while the sentence
    // is still being spoken instead of seconds after it ends. The post-call transcript from
    // `transcript.done` remains the authority either way.
    const liveEndpoint = config.LIVE_TRANSCRIPT_ENABLED
      ? [{
          type: 'webhook',
          url: `${config.PUBLIC_WEBHOOK_URL}/webhooks/recall/live`,
          // `transcript.data` is the finalized utterance we persist; `transcript.partial_data`
          // is the in-flight guess ('fur' → 'further' → 'furthermore') that we only broadcast.
          events: ['transcript.data', 'transcript.partial_data'],
        }]
      : undefined;

    // Low latency mode is English-only — Recall rejects the bot outright with
    // "language_code other than english is not supported in low latency mode" if you send
    // `auto` alongside it. Multi-language detection is only available at the accuracy setting,
    // so the two options are genuinely exclusive; live transcription costs us `auto`.
    const streaming = config.LIVE_TRANSCRIPT_ENABLED
      ? { mode: 'prioritize_low_latency', language_code: 'en' }
      : { mode: 'prioritize_accuracy', language_code: 'auto' };

    const body = {
      meeting_url: input.meetingUrl,
      bot_name: 'Notetaker',
      recording_config: {
        transcript: {
          provider: {
            recallai_streaming: streaming,
          },
        },
        ...(liveEndpoint ? { realtime_endpoints: liveEndpoint } : {}),
      },
      // Rides through to every webhook at data.bot.metadata — lets the worker resolve our
      // meeting without a lookup by bot id.
      metadata: {
        meetingId: input.meetingId,
      },
      automatic_leave: {
        in_call_recording_timeout: input.maxMeetingSeconds ?? config.MAX_MEETING_SECONDS,
      },
    };

    const response = await fetchWithRetry(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new BotProviderError(`Failed to create bot: ${response.status} ${response.statusText}. Response: ${errorText}`);
    }

    const data = await response.json() as any;
    const botId = data.id || data.bot_id;
    if (!botId) {
      throw new BotProviderError('Recall API response did not contain bot ID');
    }

    return { botId };
  }

  /** GET /api/v1/bot/{id}/ — the one read endpoint everything else hangs off. */
  private async retrieveBot(botId: string): Promise<any> {
    const url = `${this.getBaseUrl()}/api/v1/bot/${botId}/`;

    const response = await fetchWithRetry(url, {
      method: 'GET',
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new BotProviderError(`Failed to retrieve bot: ${response.status} ${response.statusText}. Response: ${errorText}`);
    }

    return await response.json() as any;
  }

  async getBotStatus(botId: string): Promise<'joining' | 'in_call' | 'done' | 'fatal'> {
    const data = await this.retrieveBot(botId);

    // The bot no longer carries a top-level `status`; it carries the full `status_changes`
    // history. The last entry is the current state. The legacy shape is still read first so
    // an older account/response doesn't break the reconciler.
    const changes = Array.isArray(data.status_changes) ? data.status_changes : [];
    const latest = changes.length > 0 ? changes[changes.length - 1] : null;
    const rawStatus = data.status?.code || data.status || latest?.code;

    if (!rawStatus) {
      throw new BotProviderError('Recall API response did not contain bot status');
    }

    return mapRecallStatus(String(rawStatus));
  }

  async fetchTranscript(botId: string): Promise<TranscriptSegment[]> {
    // Two hops now. The old /bot/{id}/transcript/ endpoint is gone: retrieve the bot, then
    // follow the transcript shortcut to a presigned download URL.
    const data = await this.retrieveBot(botId);

    const recordings = Array.isArray(data.recordings) ? data.recordings : [];
    const downloadUrl = recordings
      .map((r: any) => r?.media_shortcuts?.transcript?.data?.download_url)
      .find((u: any) => typeof u === 'string' && u.length > 0);

    if (!downloadUrl) {
      // Recall is most likely still processing. Throwing puts the job back on the worker's
      // exponential backoff, which is the behaviour we want.
      throw new BotProviderError(`Transcript is not ready for bot ${botId}: no download_url on any recording`);
    }

    // Presigned S3 link — it must be fetched WITHOUT our Authorization header, so this
    // deliberately does not go through fetchWithRetry.
    const payload = await fetchPresigned(downloadUrl);
    return normalizeTranscript(payload);
  }

  async deleteRecording(botId: string): Promise<void> {
    // POST /api/v1/bot/{id}/delete_media/ — irreversible at the provider.
    const url = `${this.getBaseUrl()}/api/v1/bot/${botId}/delete_media/`;

    const response = await fetchWithRetry(url, {
      method: 'POST',
    });

    // Idempotent per the port contract: media that is already gone is a success,
    // not an error. 404 = unknown bot/media, 409 = conflict (already deleted).
    if (response.ok || response.status === 404 || response.status === 409) {
      return;
    }

    const errorText = await response.text().catch(() => '');
    throw new BotProviderError(
      `Failed to delete recording: ${response.status} ${response.statusText}. Response: ${errorText}`
    );
  }
}


