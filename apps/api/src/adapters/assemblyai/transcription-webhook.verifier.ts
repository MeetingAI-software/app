import crypto from 'crypto';

/** The header AssemblyAI is told to send on its webhook, and the one we check for. */
export const TRANSCRIPTION_WEBHOOK_HEADER = 'x-transcription-secret';

/**
 * Constant-time check of the shared secret AssemblyAI echoes back on its webhook. An unconfigured
 * secret (empty/undefined) is never accepted — a real webhook must always be signed.
 */
export function verifyTranscriptionSecret(
  expected: string | undefined,
  provided: string | string[] | undefined
): boolean {
  if (!expected) return false;
  const got = Array.isArray(provided) ? provided[0] : provided;
  if (!got) return false;

  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
