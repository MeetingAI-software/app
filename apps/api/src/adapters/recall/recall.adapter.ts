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

export class RecallAdapter implements MeetingBotPort {
  private getBaseUrl(): string {
    const baseUrl = config.RECALL_BASE_URL;
    if (!baseUrl) {
      throw new Error('RECALL_BASE_URL is not configured');
    }
    // Clean trailing slash
    return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  }

  async createBot(input: { meetingUrl: string; meetingId: string }): Promise<{ botId: string }> {
    const url = `${this.getBaseUrl()}/api/v1/bot/`;
    
    const body = {
      meeting_url: input.meetingUrl,
      transcription_options: {
        provider: 'recallai',
      },
      metadata: {
        meetingId: input.meetingId,
      },
      automatic_leave: {
        in_call_recording_timeout: config.MAX_MEETING_SECONDS,
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

  async getBotStatus(botId: string): Promise<'joining' | 'in_call' | 'done' | 'fatal'> {
    const url = `${this.getBaseUrl()}/api/v1/bot/${botId}/`;

    const response = await fetchWithRetry(url, {
      method: 'GET',
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new BotProviderError(`Failed to get bot status: ${response.status} ${response.statusText}. Response: ${errorText}`);
    }

    const data = await response.json() as any;
    const rawStatus = data.status?.code || data.status;
    if (!rawStatus) {
      throw new BotProviderError('Recall API response did not contain bot status');
    }

    return mapRecallStatus(String(rawStatus));
  }

  async fetchTranscript(botId: string): Promise<TranscriptSegment[]> {
    const url = `${this.getBaseUrl()}/api/v1/bot/${botId}/transcript/`;

    const response = await fetchWithRetry(url, {
      method: 'GET',
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new BotProviderError(`Failed to fetch transcript: ${response.status} ${response.statusText}. Response: ${errorText}`);
    }

    const data = await response.json();
    return normalizeTranscript(data);
  }
}
