import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { parseParticipantNames, isAudioMime, detectAudioFormat } from './upload-inputs';

describe('parseParticipantNames', () => {
  it('parses a JSON array of names', () => {
    expect(parseParticipantNames('["Alper","AbdulRehman"]')).toEqual(['Alper', 'AbdulRehman']);
  });

  it('trims whitespace and drops blank entries', () => {
    expect(parseParticipantNames('["  Alper  ","",  "   "]')).toEqual(['Alper']);
  });

  it('treats an absent or empty field as no names', () => {
    expect(parseParticipantNames(undefined)).toEqual([]);
    expect(parseParticipantNames('')).toEqual([]);
    expect(parseParticipantNames('[]')).toEqual([]);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseParticipantNames('not json')).toThrow(ZodError);
  });

  it('rejects JSON that is not an array', () => {
    expect(() => parseParticipantNames('"just a string"')).toThrow(ZodError);
    expect(() => parseParticipantNames('{"a":1}')).toThrow(ZodError);
  });

  it('rejects an array containing non-strings', () => {
    expect(() => parseParticipantNames('[1,2,3]')).toThrow(ZodError);
  });

  it('rejects an absurdly long names array', () => {
    const many = JSON.stringify(Array.from({ length: 51 }, (_, i) => `Name ${i}`));
    expect(() => parseParticipantNames(many)).toThrow(ZodError);
  });

  it('rejects a single absurdly long name', () => {
    // The array cap bounds the count, not the size — without a per-name cap one entry could be
    // megabytes of text, stored and then rendered as the meeting's title.
    expect(() => parseParticipantNames(JSON.stringify(['x'.repeat(81)]))).toThrow(ZodError);
  });

  it('accepts a name at the length limit', () => {
    const name = 'x'.repeat(80);
    expect(parseParticipantNames(JSON.stringify([name]))).toEqual([name]);
  });
});

describe('isAudioMime', () => {
  it('accepts audio types (case-insensitive)', () => {
    expect(isAudioMime('audio/webm')).toBe(true);
    expect(isAudioMime('audio/mp4')).toBe(true);
    expect(isAudioMime('AUDIO/WEBM;codecs=opus')).toBe(true);
  });

  it('rejects non-audio and missing types', () => {
    expect(isAudioMime('video/mp4')).toBe(false);
    expect(isAudioMime('application/json')).toBe(false);
    expect(isAudioMime('')).toBe(false);
    expect(isAudioMime(undefined)).toBe(false);
  });
});

describe('detectAudioFormat', () => {
  /** A 16-byte buffer with the given signatures written at the given offsets. */
  function sample(...parts: Array<[number, number[] | string]>): Buffer {
    const buf = Buffer.alloc(16);
    for (const [offset, part] of parts) {
      const bytes = typeof part === 'string' ? Buffer.from(part, 'latin1') : Buffer.from(part);
      bytes.copy(buf, offset);
    }
    return buf;
  }

  it('identifies the containers browsers actually record into', () => {
    // Chrome/Firefox MediaRecorder → WebM (EBML header); Safari → MP4 (`ftyp` at offset 4).
    expect(detectAudioFormat(sample([0, [0x1a, 0x45, 0xdf, 0xa3]]))).toEqual({ format: 'webm', mime: 'audio/webm' });
    expect(detectAudioFormat(sample([4, 'ftyp']))).toEqual({ format: 'mp4', mime: 'audio/mp4' });
  });

  it('identifies the other accepted containers', () => {
    expect(detectAudioFormat(sample([0, 'OggS']))).toEqual({ format: 'ogg', mime: 'audio/ogg' });
    expect(detectAudioFormat(sample([0, 'RIFF'], [8, 'WAVE']))).toEqual({ format: 'wav', mime: 'audio/wav' });
    expect(detectAudioFormat(sample([0, 'fLaC']))).toEqual({ format: 'flac', mime: 'audio/flac' });
    expect(detectAudioFormat(sample([0, 'FORM'], [8, 'AIFF']))).toEqual({ format: 'aiff', mime: 'audio/aiff' });
    expect(detectAudioFormat(sample([0, 'FORM'], [8, 'AIFC']))).toEqual({ format: 'aiff', mime: 'audio/aiff' });
    expect(detectAudioFormat(sample([0, 'caff']))).toEqual({ format: 'caf', mime: 'audio/x-caf' });
    expect(detectAudioFormat(sample([0, '#!AMR']))).toEqual({ format: 'amr', mime: 'audio/amr' });
  });

  it('accepts mp3 both behind an ID3 tag and as a bare frame', () => {
    expect(detectAudioFormat(sample([0, 'ID3']))).toEqual({ format: 'mp3', mime: 'audio/mpeg' });
    expect(detectAudioFormat(sample([0, [0xff, 0xfb]]))).toEqual({ format: 'mp3', mime: 'audio/mpeg' });
  });

  it('rejects a non-WAVE RIFF file', () => {
    // RIFF is a container family — without the form-type check an AVI would sail through.
    expect(detectAudioFormat(sample([0, 'RIFF'], [8, 'AVI ']))).toBeNull();
  });

  it('rejects files that merely claim to be audio', () => {
    expect(detectAudioFormat(Buffer.from('this is plain text, not a recording'))).toBeNull();
    expect(detectAudioFormat(sample([0, '%PDF-1.7']))).toBeNull();
    expect(detectAudioFormat(sample([0, [0x89, 0x50, 0x4e, 0x47]]))).toBeNull(); // PNG
    expect(detectAudioFormat(sample([0, 'PK\x03\x04']))).toBeNull(); // zip
    expect(detectAudioFormat(sample([0, '<?php echo 1;']))).toBeNull();
  });

  it('rejects buffers too short to carry a signature', () => {
    expect(detectAudioFormat(Buffer.alloc(0))).toBeNull();
    expect(detectAudioFormat(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))).toBeNull();
  });
});
