import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { parseParticipantNames, isAudioMime } from './upload-inputs';

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
