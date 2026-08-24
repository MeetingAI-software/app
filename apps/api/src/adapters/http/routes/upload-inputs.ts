import { z } from 'zod';

/** A sane ceiling so a malformed field cannot allocate an enormous names array. */
const MAX_NAMES = 50;

/**
 * `participantNames` arrives as a JSON-array string in a multipart text field. Parse it, validate
 * it is an array of strings, then trim and drop blanks. Invalid input throws a ZodError, which the
 * global error handler maps to 400.
 */
const participantNamesSchema = z.preprocess(
  (val) => {
    if (val === undefined || val === null || val === '') return [];
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch {
        return val; // not JSON → let the array check fail with a clear error
      }
    }
    return val;
  },
  z
    .array(z.string())
    .max(MAX_NAMES)
    .transform((arr) => arr.map((s) => s.trim()).filter((s) => s.length > 0))
);

export function parseParticipantNames(raw: unknown): string[] {
  return participantNamesSchema.parse(raw);
}

const AUDIO_MIME_TYPES = new Set([
  'audio/aac',
  'audio/flac',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/x-flac',
  'audio/x-m4a',
  'audio/x-wav',
]);

function normalizedMime(mimeType: string | undefined): string {
  return mimeType?.split(';', 1)[0].trim().toLowerCase() ?? '';
}

/** An allowlist is safer than accepting arbitrary attacker-controlled `audio/*` labels. */
export function isAudioMime(mimeType: string | undefined): boolean {
  return AUDIO_MIME_TYPES.has(normalizedMime(mimeType));
}

function ascii(buffer: Buffer, start: number, length: number): string {
  return buffer.subarray(start, start + length).toString('ascii');
}

/**
 * Match the declared type to a well-known container signature before persisting or transcribing.
 * This is intentionally a lightweight file-type gate, not a claim that the entire codec stream is
 * valid; the provider still parses it in an isolated service.
 */
export function hasMatchingAudioSignature(buffer: Buffer, mimeType: string | undefined): boolean {
  const mime = normalizedMime(mimeType);
  if (!isAudioMime(mime) || buffer.length < 4) return false;

  if (mime === 'audio/webm') {
    return buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  }
  if (mime === 'audio/ogg') return ascii(buffer, 0, 4) === 'OggS';
  if (mime === 'audio/wav' || mime === 'audio/x-wav') {
    return buffer.length >= 12 && ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 4) === 'WAVE';
  }
  if (mime === 'audio/mp4' || mime === 'audio/m4a' || mime === 'audio/x-m4a') {
    return buffer.length >= 12 && ascii(buffer, 4, 4) === 'ftyp';
  }
  if (mime === 'audio/flac' || mime === 'audio/x-flac') return ascii(buffer, 0, 4) === 'fLaC';
  if (mime === 'audio/mpeg' || mime === 'audio/mp3') {
    return ascii(buffer, 0, 3) === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
  }
  if (mime === 'audio/aac') return buffer[0] === 0xff && (buffer[1] & 0xf6) === 0xf0;
  return false;
}
