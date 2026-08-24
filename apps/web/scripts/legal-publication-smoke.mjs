const LEGAL_ROUTES = [
  { path: '/privacy', alternate: '/sv/privacy' },
  { path: '/terms', alternate: '/sv/terms' },
  { path: '/refund-policy', alternate: '/sv/refund-policy', withdrawal: true },
  { path: '/sv/privacy', alternate: '/privacy' },
  { path: '/sv/terms', alternate: '/terms' },
  { path: '/sv/refund-policy', alternate: '/refund-policy', withdrawal: true },
];
const PUBLIC_FOOTER_ROUTES = ['/', '/login', '/signup'];
const SETTINGS_ROUTE = '/settings';
const LEGAL_HREFS = ['/privacy', '/terms', '/refund-policy'];
const WITHDRAWAL_URL = 'https://paddle.net';

export function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`);
    const [name, inlineValue] = argument.split('=', 2);
    const value = inlineValue ?? argv[index + 1];
    if (!inlineValue) index += 1;
    if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
    values.set(name, value);
  }

  const baseUrl = values.get('--base-url');
  const mode = values.get('--mode');
  if (!baseUrl) throw new Error('--base-url is required');
  if (mode !== 'closed' && mode !== 'open') throw new Error('--mode must be closed or open');
  if ([...values.keys()].some((key) => key !== '--base-url' && key !== '--mode')) {
    throw new Error('Only --base-url and --mode are supported');
  }

  const parsed = new URL(baseUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('--base-url must use http or https');
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('--base-url must be an origin without credentials, path, query, or fragment');
  }
  return { baseUrl: parsed.origin, mode };
}

function assertStatus(path, response, expected) {
  if (response.status !== expected) {
    throw new Error(`${path}: expected HTTP ${expected}, received HTTP ${response.status}`);
  }
}

function assertContains(path, html, marker, label) {
  if (!html.includes(marker)) throw new Error(`${path}: missing ${label}`);
}

function assertAbsent(path, html, marker, label) {
  if (html.includes(marker)) throw new Error(`${path}: unexpectedly exposed ${label}`);
}

async function read(baseUrl, path, fetchImpl) {
  const response = await fetchImpl(new URL(path, baseUrl), {
    redirect: 'manual',
    headers: { accept: 'text/html', 'user-agent': 'syncmemos-legal-smoke/1.0' },
  });
  return { response, html: await response.text() };
}

export async function runLegalPublicationSmoke({ baseUrl, mode, fetchImpl = fetch }) {
  const checked = [];
  for (const route of LEGAL_ROUTES) {
    const { response, html } = await read(baseUrl, route.path, fetchImpl);
    if (mode === 'closed') {
      assertStatus(route.path, response, 404);
    } else {
      assertStatus(route.path, response, 200);
      assertContains(route.path, html, `href="${route.alternate}"`, 'language-switch link');
      if (route.withdrawal) assertContains(route.path, html, `href="${WITHDRAWAL_URL}"`, 'Paddle withdrawal link');
    }
    checked.push(route.path);
  }

  for (const path of PUBLIC_FOOTER_ROUTES) {
    const { response, html } = await read(baseUrl, path, fetchImpl);
    assertStatus(path, response, 200);
    for (const href of LEGAL_HREFS) {
      const marker = `href="${href}"`;
      if (mode === 'open') assertContains(path, html, marker, `legal link ${href}`);
      else assertAbsent(path, html, marker, `legal link ${href}`);
    }
    if (mode === 'open') assertContains(path, html, `href="${WITHDRAWAL_URL}"`, 'Paddle withdrawal link');
    else assertAbsent(path, html, WITHDRAWAL_URL, 'Paddle withdrawal link');
    checked.push(path);
  }

  const settings = await read(baseUrl, SETTINGS_ROUTE, fetchImpl);
  assertStatus(SETTINGS_ROUTE, settings.response, 200);
  if (mode === 'open') assertContains(SETTINGS_ROUTE, settings.html, `href="${WITHDRAWAL_URL}"`, 'Paddle withdrawal link');
  else assertAbsent(SETTINGS_ROUTE, settings.html, WITHDRAWAL_URL, 'Paddle withdrawal link');
  checked.push(SETTINGS_ROUTE);

  return { mode, baseUrl, checked };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const result = await runLegalPublicationSmoke(options);
  console.log(`Legal publication smoke passed: ${result.mode} (${result.checked.length} routes)`);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Legal publication smoke failed');
    process.exitCode = 1;
  });
}
import { pathToFileURL } from 'node:url';
