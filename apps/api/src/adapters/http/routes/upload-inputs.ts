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

/** Uploads must be audio/* — a document generator is worthless on a video or a PDF. */
export function isAudioMime(mimeType: string | undefined): boolean {
  return !!mimeType && mimeType.toLowerCase().startsWith('audio/');
}
