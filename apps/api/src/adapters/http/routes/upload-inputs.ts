import { z } from 'zod';

/** A sane ceiling so a malformed field cannot allocate an enormous names array. */
const MAX_NAMES = 50;

/** The array cap alone bounds the count, not the size — one "name" could still be megabytes. */
const MAX_NAME_LENGTH = 80;

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
    .array(z.string().max(MAX_NAME_LENGTH))
    .max(MAX_NAMES)
    .transform((arr) => arr.map((s) => s.trim()).filter((s) => s.length > 0))
);

export function parseParticipantNames(raw: unknown): string[] {
  return participantNamesSchema.parse(raw);
}

/**
 * Cheap pre-filter on the client-declared type, used in multer's `fileFilter` so an obviously wrong
 * upload is refused before we buffer it. Trivially spoofed, so it proves nothing on its own —
 * `detectAudioFormat` is the check that actually decides.
 */
export function isAudioMime(mimeType: string | undefined): boolean {
  return !!mimeType && mimeType.toLowerCase().startsWith('audio/');
}

/** A format we proved from the bytes themselves. Both fields are ours, never the caller's. */
export interface AudioFormat {
  /** Canonical container name, for logs. */
  format: string;
  /** Canonical MIME — what we hand to storage and on to the transcription vendor. */
  mime: string;
}

/**
 * Enough bytes to reach every offset the table below inspects (`WAVE`/`AIFF` sit at 8..11).
 * Nothing we accept is a plausible recording under this length anyway.
 */
const MIN_SNIFF_BYTES = 12;

function hasAscii(buf: Buffer, offset: number, text: string): boolean {
  return buf.length >= offset + text.length && buf.toString('latin1', offset, offset + text.length) === text;
}

/**
 * Identify the container from its signature ("magic bytes"). `Content-Type` and the filename are
 * both attacker-controlled, so this is the only statement about the file we can rely on.
 *
 * The list is deliberately generous: browser `MediaRecorder` picks its own container per engine
 * (Chrome/Firefox emit WebM, Safari emits MP4), and native mobile recorders add CAF and AMR. A
 * stricter list would start rejecting genuine recordings, which is a worse failure than the spoof
 * it would prevent. Returns null when nothing matches → the caller answers 400.
 */
export function detectAudioFormat(buf: Buffer): AudioFormat | null {
  if (buf.length < MIN_SNIFF_BYTES) return null;

  // EBML header — WebM/Matroska. What Chrome and Firefox MediaRecorder produce.
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return { format: 'webm', mime: 'audio/webm' };
  }
  // ISO-BMFF `ftyp` box, always at offset 4 — MP4/M4A. What Safari MediaRecorder produces.
  if (hasAscii(buf, 4, 'ftyp')) return { format: 'mp4', mime: 'audio/mp4' };
  if (hasAscii(buf, 0, 'OggS')) return { format: 'ogg', mime: 'audio/ogg' };
  // RIFF is a family; the `WAVE` form type at offset 8 is what keeps AVI and friends out.
  if (hasAscii(buf, 0, 'RIFF') && hasAscii(buf, 8, 'WAVE')) return { format: 'wav', mime: 'audio/wav' };
  if (hasAscii(buf, 0, 'fLaC')) return { format: 'flac', mime: 'audio/flac' };
  if (hasAscii(buf, 0, 'FORM') && (hasAscii(buf, 8, 'AIFF') || hasAscii(buf, 8, 'AIFC'))) {
    return { format: 'aiff', mime: 'audio/aiff' };
  }
  if (hasAscii(buf, 0, 'caff')) return { format: 'caf', mime: 'audio/x-caf' };
  if (hasAscii(buf, 0, '#!AMR')) return { format: 'amr', mime: 'audio/amr' };
  // MP3 arrives either behind an ID3v2 tag or as a bare MPEG frame — 11 set sync bits.
  if (hasAscii(buf, 0, 'ID3')) return { format: 'mp3', mime: 'audio/mpeg' };
  if (buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0) return { format: 'mp3', mime: 'audio/mpeg' };

  return null;
}
