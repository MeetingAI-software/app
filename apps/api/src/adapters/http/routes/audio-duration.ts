import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { AudioFormat } from './upload-inputs';

const SAMPLE_RATE = 8_000;
const BYTES_PER_SAMPLE = 2;
const BYTES_PER_SECOND = SAMPLE_RATE * BYTES_PER_SAMPLE;
const INSPECTION_TIMEOUT_MS = 120_000;
const PROBE_TIMEOUT_MS = 15_000;
const MAX_PROBE_OUTPUT_BYTES = 8_192;
const EXTENSIONS: Record<string, string> = {
  webm: 'webm', mp4: 'mp4', ogg: 'ogg', wav: 'wav', flac: 'flac',
  aiff: 'aiff', caf: 'caf', amr: 'amr', mp3: 'mp3',
};

export class AudioDurationError extends Error {
  constructor(readonly reason: 'invalid' | 'too_long' | 'unavailable') {
    super(`Audio inspection ${reason}`);
  }
}

interface InspectOptions {
  signal?: AbortSignal;
  ffmpegPath?: string;
  ffprobePath?: string;
  timeoutMs?: number;
}

function inspectWithProcess(
  executable: string, args: string[], maxOutputBytes: number,
  timeoutMs: number, signal?: AbortSignal, collectOutput = false,
): Promise<{ bytes: number; output: string }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AudioDurationError('unavailable'));
    const child = spawn(executable, args, {
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell: false,
    });
    let bytes = 0;
    let output = '';
    let failure: AudioDurationError | null = null;
    const stop = (reason: AudioDurationError) => {
      if (failure) return;
      failure = reason;
      child.kill();
    };
    const abort = () => stop(new AudioDurationError('unavailable'));
    const timer = setTimeout(() => stop(new AudioDurationError('unavailable')), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxOutputBytes) return stop(new AudioDurationError('too_long'));
      if (collectOutput) output += chunk.toString('utf8');
    });
    // Never place media decoder diagnostics in logs, exceptions, or telemetry.
    child.stderr.resume();
    child.once('error', () => stop(new AudioDurationError('unavailable')));
    child.once('close', code => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (failure) return reject(failure);
      if (code !== 0 || bytes === 0) return reject(new AudioDurationError('invalid'));
      resolve({ bytes, output });
    });
  });
}

/** Decode one audio stream to fixed-rate PCM and count its samples, including silence. */
export async function measureAudioDuration(
  buffer: Buffer, format: AudioFormat, maxSeconds: number, options: InspectOptions = {},
): Promise<number> {
  if (!Number.isSafeInteger(maxSeconds) || maxSeconds < 1 || maxSeconds > 86_400) {
    throw new AudioDurationError('unavailable');
  }
  const extension = EXTENSIONS[format.format];
  if (!extension || buffer.length === 0) throw new AudioDurationError('invalid');
  const tempRoot = resolve(tmpdir());
  const folder = await mkdtemp(join(tempRoot, 'meeting-audio-'));
  if (dirname(folder) !== tempRoot) throw new AudioDurationError('unavailable');
  const path = join(folder, `recording.${extension}`);
  try {
    options.signal?.throwIfAborted();
    await writeFile(path, buffer, { mode: 0o600, signal: options.signal });
    const probe = await inspectWithProcess(options.ffprobePath ?? 'ffprobe', [
      '-v', 'error', '-protocol_whitelist', 'file,pipe',
      '-show_entries', 'stream=codec_type', '-of', 'json', path,
    ], MAX_PROBE_OUTPUT_BYTES, Math.min(options.timeoutMs ?? PROBE_TIMEOUT_MS, PROBE_TIMEOUT_MS), options.signal, true);
    let streams: { streams?: Array<{ codec_type?: string }> };
    try {
      streams = JSON.parse(probe.output);
    } catch {
      throw new AudioDurationError('invalid');
    }
    if (!Array.isArray(streams.streams) || streams.streams.filter(s => s.codec_type === 'audio').length !== 1
      || streams.streams.some(s => s.codec_type === 'video')) {
      throw new AudioDurationError('invalid');
    }
    const decoded = await inspectWithProcess(options.ffmpegPath ?? 'ffmpeg', [
      '-hide_banner', '-nostdin', '-v', 'error', '-xerror',
      '-max_alloc', '33554432', '-filter_threads', '1',
      '-protocol_whitelist', 'file,pipe', '-threads', '1',
      '-err_detect', 'explode', '-i', path,
      '-map', '0:a:0', '-vn', '-sn', '-dn',
      '-af', 'aresample=async=1:first_pts=0',
      '-ac', '1', '-ar', String(SAMPLE_RATE), '-c:a', 'pcm_s16le', '-f', 's16le', 'pipe:1',
    ], maxSeconds * BYTES_PER_SECOND, options.timeoutMs ?? INSPECTION_TIMEOUT_MS, options.signal);
    return Math.ceil(decoded.bytes / BYTES_PER_SECOND);
  } catch (error) {
    if (error instanceof AudioDurationError) throw error;
    throw new AudioDurationError('unavailable');
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
