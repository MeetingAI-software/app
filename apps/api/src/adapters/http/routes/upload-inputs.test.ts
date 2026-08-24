import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { parseParticipantNames, isAudioMime, hasMatchingAudioSignature } from './upload-inputs';

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

  it('rejects unapproved audio subtypes', () => {
    expect(isAudioMime('audio/vnd.attacker')).toBe(false);
  });
});

describe('hasMatchingAudioSignature', () => {
  it('accepts matching WebM, WAV, MP4, Ogg, FLAC and MP3 signatures', () => {
    expect(hasMatchingAudioSignature(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), 'audio/webm')).toBe(true);
    expect(hasMatchingAudioSignature(Buffer.from('RIFF0000WAVE'), 'audio/wav')).toBe(true);
    expect(hasMatchingAudioSignature(Buffer.from('0000ftypM4A '), 'audio/mp4')).toBe(true);
    expect(hasMatchingAudioSignature(Buffer.from('OggS'), 'audio/ogg')).toBe(true);
    expect(hasMatchingAudioSignature(Buffer.from('fLaC'), 'audio/flac')).toBe(true);
    expect(hasMatchingAudioSignature(Buffer.from('ID3payload'), 'audio/mpeg')).toBe(true);
  });

  it('rejects a renamed document and a MIME/container mismatch', () => {
    expect(hasMatchingAudioSignature(Buffer.from('%PDF-not-audio'), 'audio/webm')).toBe(false);
    expect(hasMatchingAudioSignature(Buffer.from('OggS'), 'audio/wav')).toBe(false);
  });
});
