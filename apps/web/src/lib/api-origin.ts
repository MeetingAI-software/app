export const PRODUCTION_API_ORIGIN = 'https://api.syncmemos.com';

/** Use one validated origin for browser requests and the CSP connect-src directive. */
export function resolveApiOrigin(raw: string | undefined, production: boolean): string {
  if (!raw) {
    if (production) throw new Error('NEXT_PUBLIC_API_URL is required for a production build');
    return 'http://localhost:3000';
  }
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('NEXT_PUBLIC_API_URL must be an absolute URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('NEXT_PUBLIC_API_URL must be a plain HTTP(S) origin without credentials');
  }
  if (production && url.origin !== PRODUCTION_API_ORIGIN) {
    throw new Error(`NEXT_PUBLIC_API_URL must be ${PRODUCTION_API_ORIGIN} in production`);
  }
  return url.origin;
}
