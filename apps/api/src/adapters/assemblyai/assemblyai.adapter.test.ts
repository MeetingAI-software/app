import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssemblyAIAdapter } from './assemblyai.adapter';
import { completedTranscriptFixture } from './__fixtures__/transcript-completed';

const BASE = 'https://api.assemblyai.com';

function makeRes(status: number, body: unknown = ''): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => body,
  } as unknown as Response;
}

describe('AssemblyAIAdapter', () => {
  let fetchFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchFn = vi.fn();
  });

  describe('submit', () => {
    it('POSTs the audio URL with diarization and signed webhook, returning the job id', async () => {
      fetchFn.mockResolvedValue(makeRes(200, { id: 'transcript-abc123', status: 'queued' }));
      const adapter = new AssemblyAIAdapter({
        apiKey: 'aai-key',
        webhookUrl: 'https://api.example/webhooks/transcription',
        webhookSecret: 'shh',
        fetchFn: fetchFn as unknown as typeof fetch,
      });

      const result = await adapter.submit('https://signed/audio.webm', { meetingId: 'm1' });

      expect(result).toEqual({ jobId: 'transcript-abc123' });
      const [url, options] = fetchFn.mock.calls[0];
      expect(url).toBe(`${BASE}/v2/transcript`);
      expect(options.method).toBe('POST');
      expect(options.headers.Authorization).toBe('aai-key');
      const body = JSON.parse(options.body);
      expect(body.audio_url).toBe('https://signed/audio.webm');
      expect(body.speaker_labels).toBe(true);
      expect(body.webhook_url).toBe('https://api.example/webhooks/transcription');
      expect(body.webhook_auth_header_name).toBe('x-transcription-secret');
      expect(body.webhook_auth_header_value).toBe('shh');
    });

    it('throws on a non-ok submit', async () => {
      fetchFn.mockResolvedValue(makeRes(400, 'bad request'));
      const adapter = new AssemblyAIAdapter({ apiKey: 'k', fetchFn: fetchFn as unknown as typeof fetch });
      await expect(adapter.submit('u', { meetingId: 'm' })).rejects.toThrow(/submit failed: 400/);
    });

    it('throws when the response is missing a transcript id', async () => {
      fetchFn.mockResolvedValue(makeRes(200, {}));
      const adapter = new AssemblyAIAdapter({ apiKey: 'k', fetchFn: fetchFn as unknown as typeof fetch });
      await expect(adapter.submit('u', { meetingId: 'm' })).rejects.toThrow(/missing transcript id/);
    });
  });

  describe('fetchResult', () => {
    it('GETs the transcript and returns normalized segments', async () => {
      fetchFn.mockResolvedValue(makeRes(200, completedTranscriptFixture));
      const adapter = new AssemblyAIAdapter({ apiKey: 'k', fetchFn: fetchFn as unknown as typeof fetch });

      const segs = await adapter.fetchResult('transcript-abc123');

      expect(fetchFn.mock.calls[0][0]).toBe(`${BASE}/v2/transcript/transcript-abc123`);
      expect(fetchFn.mock.calls[0][1].method).toBe('GET');
      expect(segs).toHaveLength(4);
      expect(segs[0].speaker).toBe('Speaker A');
      expect(segs[1].speaker).toBe('Speaker B');
    });

    it('throws on a non-ok fetch', async () => {
      fetchFn.mockResolvedValue(makeRes(404, 'not found'));
      const adapter = new AssemblyAIAdapter({ apiKey: 'k', fetchFn: fetchFn as unknown as typeof fetch });
      await expect(adapter.fetchResult('x')).rejects.toThrow(/fetch failed: 404/);
    });
  });

  describe('configuration', () => {
    it('throws when used without an API key, without calling fetch', async () => {
      const adapter = new AssemblyAIAdapter({ apiKey: '', fetchFn: fetchFn as unknown as typeof fetch });
      await expect(adapter.submit('u', { meetingId: 'm' })).rejects.toThrow(/not configured/);
      expect(fetchFn).not.toHaveBeenCalled();
    });
  });
});
