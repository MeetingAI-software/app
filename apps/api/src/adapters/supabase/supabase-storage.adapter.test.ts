import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseStorageAdapter } from './supabase-storage.adapter';

const BASE = 'https://proj.supabase.co';
const KEY = 'service-role-key';

function makeRes(status: number, body: unknown = ''): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => body,
  } as unknown as Response;
}

function adapterWith(fetchFn: ReturnType<typeof vi.fn>) {
  return new SupabaseStorageAdapter({ baseUrl: BASE, serviceKey: KEY, fetchFn: fetchFn as unknown as typeof fetch });
}

describe('SupabaseStorageAdapter', () => {
  let fetchFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchFn = vi.fn();
  });

  describe('upload', () => {
    it('PUTs the bytes to the object endpoint with the service-role auth and returns the path', async () => {
      fetchFn.mockResolvedValue(makeRes(200, { Key: 'meeting-audio/m1/audio.webm' }));
      const adapter = adapterWith(fetchFn);

      const result = await adapter.upload('m1', Buffer.from('audio-bytes'), 'audio/webm;codecs=opus');

      expect(result).toEqual({ path: 'm1/audio.webm' });
      const [url, options] = fetchFn.mock.calls[0];
      expect(url).toBe(`${BASE}/storage/v1/object/meeting-audio/m1/audio.webm`);
      expect(options.method).toBe('POST');
      expect(options.headers.Authorization).toBe(`Bearer ${KEY}`);
      expect(options.headers['Content-Type']).toBe('audio/webm;codecs=opus');
    });

    it('derives the extension from the mime subtype', async () => {
      fetchFn.mockResolvedValue(makeRes(200, {}));
      const { path } = await adapterWith(fetchFn).upload('m2', Buffer.from('x'), 'audio/mp4');
      expect(path).toBe('m2/audio.mp4');
    });

    it('throws when the upload fails', async () => {
      fetchFn.mockResolvedValue(makeRes(403, 'forbidden'));
      await expect(adapterWith(fetchFn).upload('m1', Buffer.from('x'), 'audio/webm')).rejects.toThrow(
        /Supabase upload failed: 403/
      );
    });
  });

  describe('getSignedUrl', () => {
    it('requests a signed URL and returns it as an absolute URL', async () => {
      fetchFn.mockResolvedValue(makeRes(200, { signedURL: '/object/sign/meeting-audio/m1/audio.webm?token=abc' }));
      const adapter = adapterWith(fetchFn);

      const signed = await adapter.getSignedUrl('m1/audio.webm');

      expect(signed).toBe(`${BASE}/storage/v1/object/sign/meeting-audio/m1/audio.webm?token=abc`);
      const [url, options] = fetchFn.mock.calls[0];
      expect(url).toBe(`${BASE}/storage/v1/object/sign/meeting-audio/m1/audio.webm`);
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({ expiresIn: 600 });
    });

    it('passes through an already-absolute signed URL', async () => {
      fetchFn.mockResolvedValue(makeRes(200, { signedUrl: 'https://cdn.example/signed?token=x' }));
      const signed = await adapterWith(fetchFn).getSignedUrl('m1/audio.webm');
      expect(signed).toBe('https://cdn.example/signed?token=x');
    });

    it('throws when the response has no signed URL', async () => {
      fetchFn.mockResolvedValue(makeRes(200, {}));
      await expect(adapterWith(fetchFn).getSignedUrl('m1/audio.webm')).rejects.toThrow(/did not contain a signed URL/);
    });
  });

  describe('delete', () => {
    it('DELETEs the object', async () => {
      fetchFn.mockResolvedValue(makeRes(200));
      await adapterWith(fetchFn).delete('m1/audio.webm');

      const [url, options] = fetchFn.mock.calls[0];
      expect(url).toBe(`${BASE}/storage/v1/object/meeting-audio/m1/audio.webm`);
      expect(options.method).toBe('DELETE');
    });

    it('treats an already-deleted file (404) as success', async () => {
      fetchFn.mockResolvedValue(makeRes(404, 'not found'));
      await expect(adapterWith(fetchFn).delete('m1/gone.webm')).resolves.toBeUndefined();
    });

    // The shape Supabase actually returns, copied from a production Sentry event: HTTP 400 with the
    // real 404 in the body. The 404 case above passed all along while the sweep job threw every run.
    it('treats a 400 carrying NoSuchKey as already-deleted', async () => {
      fetchFn.mockResolvedValue(
        makeRes(400, { statusCode: '404', error: 'not_found', message: 'Object not found', code: 'NoSuchKey' })
      );
      await expect(adapterWith(fetchFn).delete('m1/gone.webm')).resolves.toBeUndefined();
    });

    it('still throws when the bucket is missing, which is a real misconfiguration', async () => {
      fetchFn.mockResolvedValue(makeRes(400, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' }));
      await expect(adapterWith(fetchFn).delete('m1/audio.webm')).rejects.toThrow(/Bucket not found/);
    });

    it('throws on a real delete failure', async () => {
      fetchFn.mockResolvedValue(makeRes(500, 'server error'));
      await expect(adapterWith(fetchFn).delete('m1/audio.webm')).rejects.toThrow(/Supabase delete failed: 500/);
    });

    it('throws when a 400 body is not JSON at all', async () => {
      fetchFn.mockResolvedValue(makeRes(400, 'gateway barfed'));
      await expect(adapterWith(fetchFn).delete('m1/audio.webm')).rejects.toThrow(/Supabase delete failed: 400/);
    });
  });

  describe('configuration', () => {
    it('throws a clear error when used without SUPABASE_URL / service key', async () => {
      const unconfigured = new SupabaseStorageAdapter({ baseUrl: '', serviceKey: '', fetchFn: fetchFn as unknown as typeof fetch });
      await expect(unconfigured.upload('m1', Buffer.from('x'), 'audio/webm')).rejects.toThrow(/not configured/);
      expect(fetchFn).not.toHaveBeenCalled();
    });
  });
});
