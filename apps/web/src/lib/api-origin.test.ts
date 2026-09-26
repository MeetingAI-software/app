import { describe, expect, it } from 'vitest';
import { PRODUCTION_API_ORIGIN, resolveApiOrigin } from './api-origin';

describe('API origin', () => {
  it('uses the same approved HTTPS origin for production requests and CSP', () => {
    expect(resolveApiOrigin(PRODUCTION_API_ORIGIN, true)).toBe(PRODUCTION_API_ORIGIN);
    expect(resolveApiOrigin(`${PRODUCTION_API_ORIGIN}/`, true)).toBe(PRODUCTION_API_ORIGIN);
  });

  it.each([
    undefined, '', 'http://localhost:3000', 'https://api.syncmemos.com.attacker.test',
    'https://attacker.test', 'https://api.syncmemos.com@attacker.test',
    'https://user:secret@api.syncmemos.com', 'https://api.syncmemos.com/path',
    'https://api.syncmemos.com?token=x', 'javascript:alert(1)',
  ])('rejects unsafe production API origin %s', raw => {
    expect(() => resolveApiOrigin(raw, true)).toThrow();
  });

  it('keeps local development usable without a configured API origin', () => {
    expect(resolveApiOrigin(undefined, false)).toBe('http://localhost:3000');
  });
});
