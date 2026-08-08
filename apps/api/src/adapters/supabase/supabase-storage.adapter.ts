import { config } from '../../config/env';
import type { AudioStoragePort } from '../../ports/audio-storage.port';

/** Private EU bucket that holds in-room audio until the summary succeeds (Architecture-Day3 §4). */
const DEFAULT_BUCKET = 'meeting-audio';
/** Short-lived — just long enough for the transcription vendor to pull the file. */
const SIGNED_URL_TTL_SECONDS = 600;

type FetchFn = typeof fetch;

export interface SupabaseStorageOptions {
  baseUrl?: string;
  serviceKey?: string;
  bucket?: string;
  fetchFn?: FetchFn;
}

/**
 * Supabase Storage reports a missing object as `400 Bad Request` with the real status buried in the
 * body: `{"statusCode":"404","error":"not_found","message":"Object not found","code":"NoSuchKey"}`.
 * A plain `res.status === 404` check therefore never fires, which is what broke `delete`'s
 * idempotency in production. Matched narrowly — a missing *bucket* answers with `error: "Bucket not
 * found"`, which is a real misconfiguration and must keep throwing.
 */
function isObjectNotFound(body: string): boolean {
  try {
    const parsed = JSON.parse(body) as { statusCode?: string; error?: string; code?: string };
    return parsed.code === 'NoSuchKey' || (parsed.statusCode === '404' && parsed.error === 'not_found');
  } catch {
    return false; // not JSON — treat as a genuine failure and let the caller see the raw body
  }
}

/** `audio/webm;codecs=opus` → `.webm`; unknown → `.bin`. */
function extForMime(mimeType: string): string {
  const subtype = mimeType.split('/')[1]?.split(';')[0]?.trim();
  return subtype ? `.${subtype}` : '.bin';
}

/**
 * Supabase Storage adapter over the REST API (no SDK, matching the house style). Uses the
 * server-side service-role key — NEVER expose it to apps/web. Construction is tolerant of missing
 * config so the online (bot) flow still boots without Supabase; each method validates on use.
 */
export class SupabaseStorageAdapter implements AudioStoragePort {
  private readonly baseUrl: string;
  private readonly serviceKey: string;
  private readonly bucket: string;
  private readonly fetchFn: FetchFn;

  constructor(opts: SupabaseStorageOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? config.SUPABASE_URL ?? '').replace(/\/+$/, '');
    this.serviceKey = opts.serviceKey ?? config.SUPABASE_SERVICE_ROLE_KEY ?? '';
    this.bucket = opts.bucket ?? DEFAULT_BUCKET;
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  private ensureConfigured(): void {
    if (!this.baseUrl || !this.serviceKey) {
      throw new Error(
        'Supabase storage is not configured (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)'
      );
    }
  }

  private authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.serviceKey}`,
      apikey: this.serviceKey,
    };
  }

  async upload(meetingId: string, data: Buffer, mimeType: string): Promise<{ path: string }> {
    this.ensureConfigured();
    const path = `${meetingId}/audio${extForMime(mimeType)}`;
    const url = `${this.baseUrl}/storage/v1/object/${this.bucket}/${path}`;

    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        'Content-Type': mimeType,
        'x-upsert': 'true',
      },
      body: new Uint8Array(data),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Supabase upload failed: ${res.status} ${res.statusText} ${body}`.trim());
    }
    return { path };
  }

  async getSignedUrl(path: string): Promise<string> {
    this.ensureConfigured();
    const url = `${this.baseUrl}/storage/v1/object/sign/${this.bucket}/${path}`;

    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: SIGNED_URL_TTL_SECONDS }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Supabase sign failed: ${res.status} ${res.statusText} ${body}`.trim());
    }

    const data = (await res.json()) as { signedURL?: string; signedUrl?: string };
    const signed = data.signedURL ?? data.signedUrl;
    if (!signed) {
      throw new Error('Supabase sign response did not contain a signed URL');
    }
    // The API returns a relative path like "/object/sign/bucket/...". Make it absolute.
    return signed.startsWith('http') ? signed : `${this.baseUrl}/storage/v1${signed}`;
  }

  async delete(path: string): Promise<void> {
    this.ensureConfigured();
    const url = `${this.baseUrl}/storage/v1/object/${this.bucket}/${path}`;

    const res = await this.fetchFn(url, {
      method: 'DELETE',
      headers: this.authHeaders(),
    });

    // Idempotent per the port contract: a file that is already gone is a success, not an error.
    if (res.ok || res.status === 404) return;

    const body = await res.text().catch(() => '');
    if (isObjectNotFound(body)) return;

    throw new Error(`Supabase delete failed: ${res.status} ${res.statusText} ${body}`.trim());
  }
}
