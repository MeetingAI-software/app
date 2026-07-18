import { config } from '../../config/env';
import type { TranscriptionPort } from '../../ports/transcription.port';
import type { TranscriptSegment } from '../../domain/types';
import { normalizeAssemblyTranscript } from './assemblyai.normalizer';
import { TRANSCRIPTION_WEBHOOK_HEADER } from './transcription-webhook.verifier';

// Default endpoint. For EU data residency use 'https://api.eu.assemblyai.com' with an EU-provisioned
// account/key — see README (Architecture-Day3 §2: verify the EU option, don't assume it).
const DEFAULT_BASE_URL = 'https://api.assemblyai.com';

type FetchFn = typeof fetch;

export interface AssemblyAIOptions {
  apiKey?: string;
  baseUrl?: string;
  webhookUrl?: string;
  webhookSecret?: string;
  fetchFn?: FetchFn;
}

/**
 * AssemblyAI transcription over the REST API (no SDK, matching the house style). `submit` kicks off
 * an async diarized transcription and asks AssemblyAI to call our webhook when done; `fetchResult`
 * pulls the finished transcript and normalizes it. Construction is tolerant of missing config so the
 * app still boots without AssemblyAI; each method validates on use.
 */
export class AssemblyAIAdapter implements TranscriptionPort {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly webhookUrl?: string;
  private readonly webhookSecret?: string;
  private readonly fetchFn: FetchFn;

  constructor(opts: AssemblyAIOptions = {}) {
    this.apiKey = opts.apiKey ?? config.ASSEMBLYAI_API_KEY ?? '';
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.webhookUrl =
      opts.webhookUrl ??
      (config.PUBLIC_WEBHOOK_URL
        ? `${config.PUBLIC_WEBHOOK_URL.replace(/\/+$/, '')}/webhooks/transcription`
        : undefined);
    this.webhookSecret = opts.webhookSecret ?? config.TRANSCRIPTION_WEBHOOK_SECRET;
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  private ensureConfigured(): void {
    if (!this.apiKey) {
      throw new Error('AssemblyAI is not configured (set ASSEMBLYAI_API_KEY)');
    }
  }

  private headers(): Record<string, string> {
    return { Authorization: this.apiKey, 'Content-Type': 'application/json' };
  }

  async submit(audioUrl: string, _meta: { meetingId: string }): Promise<{ jobId: string }> {
    this.ensureConfigured();

    const body: Record<string, unknown> = {
      audio_url: audioUrl,
      speaker_labels: true,
    };
    // Ask AssemblyAI to call us back when done, signed with our shared secret.
    if (this.webhookUrl) {
      body.webhook_url = this.webhookUrl;
      if (this.webhookSecret) {
        body.webhook_auth_header_name = TRANSCRIPTION_WEBHOOK_HEADER;
        body.webhook_auth_header_value = this.webhookSecret;
      }
    }

    const res = await this.fetchFn(`${this.baseUrl}/v2/transcript`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`AssemblyAI submit failed: ${res.status} ${res.statusText} ${text}`.trim());
    }

    const data = (await res.json()) as { id?: string };
    if (!data.id) {
      throw new Error('AssemblyAI submit response missing transcript id');
    }
    return { jobId: data.id };
  }

  async fetchResult(jobId: string): Promise<TranscriptSegment[]> {
    this.ensureConfigured();

    const res = await this.fetchFn(`${this.baseUrl}/v2/transcript/${jobId}`, {
      method: 'GET',
      headers: this.headers(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`AssemblyAI fetch failed: ${res.status} ${res.statusText} ${text}`.trim());
    }

    return normalizeAssemblyTranscript(await res.json());
  }
}
