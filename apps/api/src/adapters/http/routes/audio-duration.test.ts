import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AudioDurationError, measureAudioDuration } from './audio-duration';
import { detectAudioFormat } from './upload-inputs';

const executable = (name: 'ffmpeg' | 'ffprobe') => process.env.FFMPEG_TEST_BIN_DIR
  ? join(process.env.FFMPEG_TEST_BIN_DIR, `${name}${process.platform === 'win32' ? '.exe' : ''}`)
  : name;
const tools = { ffmpegPath: executable('ffmpeg'), ffprobePath: executable('ffprobe') };

function generateAudio(args: string[], suffix: string): Buffer {
  const folder = mkdtempSync(join(tmpdir(), 'audio-duration-test-'));
  const path = join(folder, `sample.${suffix}`);
  try {
    const result = spawnSync(executable('ffmpeg'), [
      '-hide_banner', '-loglevel', 'error', '-nostdin', ...args, '-y', path,
    ], { timeout: 15_000, windowsHide: true, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`Test fixture generation failed: ${result.status}`);
    return readFileSync(path);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

describe('decoded upload duration', () => {
  const silent = (seconds: number, codec: string, suffix: string) => generateAudio([
    '-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono',
    '-t', String(seconds), '-c:a', codec,
  ], suffix);

  it.each([
    ['wav', 'pcm_s16le'], ['webm', 'libopus'], ['mp4', 'aac'],
    ['ogg', 'libopus'], ['flac', 'flac'], ['aiff', 'pcm_s16be'],
    ['caf', 'pcm_s16le'], ['mp3', 'libmp3lame'],
  ])('measures silent %s by decoded samples rather than spoken words', async (suffix, codec) => {
    const bytes = silent(2, codec, suffix);
    const format = detectAudioFormat(bytes);
    expect(format?.format).toBe(suffix);
    // Codec priming/padding differs across FFmpeg versions. Counting decoded samples may
    // conservatively round a 2-second encoded file up to 3 seconds, never below 2.
    const measured = await measureAudioDuration(bytes, format!, 5, tools);
    expect(measured).toBeGreaterThanOrEqual(2);
    expect(measured).toBeLessThanOrEqual(3);
  }, 30_000);

  it('ignores a forged short WebM Duration element while decoding the full silent stream', async () => {
    const bytes = silent(2, 'libopus', 'webm');
    const marker = bytes.indexOf(Buffer.from([0x44, 0x89, 0x88]));
    expect(marker).toBeGreaterThan(0);
    bytes.writeDoubleBE(0.1, marker + 3);
    const measured = await measureAudioDuration(bytes, detectAudioFormat(bytes)!, 5, tools);
    expect(measured).toBeGreaterThanOrEqual(2);
    expect(measured).toBeLessThanOrEqual(3);
    await expect(measureAudioDuration(bytes, detectAudioFormat(bytes)!, 1, tools))
      .rejects.toMatchObject({ reason: 'too_long' });
  });

  it('counts a long pause between speech and rejects it above the plan limit', async () => {
    const bytes = generateAudio([
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=8000:duration=1',
      '-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono:d=4',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=8000:duration=1',
      '-filter_complex', '[0:a][1:a][2:a]concat=n=3:v=0:a=1[out]',
      '-map', '[out]', '-c:a', 'libopus',
    ], 'webm');
    const format = detectAudioFormat(bytes)!;
    const measured = await measureAudioDuration(bytes, format, 7, tools);
    expect(measured).toBeGreaterThanOrEqual(6);
    expect(measured).toBeLessThanOrEqual(7);
    await expect(measureAudioDuration(bytes, format, 5, tools))
      .rejects.toMatchObject({ reason: 'too_long' });
  });

  it('rejects a truncated container before storage', async () => {
    const bytes = silent(2, 'libopus', 'webm').subarray(0, 20);
    await expect(measureAudioDuration(bytes, detectAudioFormat(bytes)!, 5, tools))
      .rejects.toMatchObject({ reason: 'invalid' });
  });

  it('rejects a second audio stream instead of measuring only the short first stream', async () => {
    const bytes = generateAudio([
      '-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono',
      '-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono',
      '-t', '1', '-map', '0:a', '-map', '1:a', '-c:a', 'libopus',
    ], 'webm');
    await expect(measureAudioDuration(bytes, detectAudioFormat(bytes)!, 5, tools))
      .rejects.toMatchObject({ reason: 'invalid' });
  });

  it('fails closed when the decoder is missing or the request is aborted', async () => {
    const bytes = silent(1, 'pcm_s16le', 'wav');
    const format = detectAudioFormat(bytes)!;
    await expect(measureAudioDuration(bytes, format, 5, {
      ...tools, ffprobePath: 'missing-ffprobe-executable',
    })).rejects.toMatchObject({ reason: 'unavailable' });
    const controller = new AbortController();
    controller.abort();
    await expect(measureAudioDuration(bytes, format, 5, { ...tools, signal: controller.signal }))
      .rejects.toBeInstanceOf(AudioDurationError);
  });
});
