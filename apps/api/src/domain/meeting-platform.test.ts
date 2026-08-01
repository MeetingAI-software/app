import { describe, it, expect } from 'vitest';
import { detectPlatform } from './meeting-platform';

describe('detectPlatform', () => {
  it('recognises the supported platforms', () => {
    expect(detectPlatform('https://us02web.zoom.us/j/123456789')).toBe('zoom');
    expect(detectPlatform('https://zoom.us/j/123456789')).toBe('zoom');
    expect(detectPlatform('https://meet.google.com/abc-defg-hij')).toBe('google_meet');
    expect(detectPlatform('https://teams.microsoft.com/l/meetup-join/xyz')).toBe('teams');
    expect(detectPlatform('https://teams.live.com/meet/123')).toBe('teams');
  });

  it('rejects unsupported hosts', () => {
    expect(detectPlatform('https://example.com/j/123')).toBeNull();
    expect(detectPlatform('not a url')).toBeNull();
  });

  it('does not match on a substring elsewhere in the URL', () => {
    // A plain `url.includes('zoom.us')` check would accept both of these.
    expect(detectPlatform('https://evil.com/?redirect=zoom.us/j/1')).toBeNull();
    expect(detectPlatform('https://zoom.us.evil.com/j/1')).toBeNull();
  });
});
