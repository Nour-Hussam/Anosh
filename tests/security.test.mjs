/* Security regression tests against a live instance: headers, CSRF,
   validation, auth, origin checks and information leakage. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/server.mjs';

const server = await startTestServer();
test.after(() => server.stop());

const get = (path, headers = {}) => fetch(server.origin + path, { headers: { Accept: 'application/json', ...headers } });

async function csrfContext() {
  const res = await get('/api/csrf-token');
  const { csrfToken: token } = await res.json();
  const cookie = res.headers.getSetCookie()?.map((c) => c.split(';')[0]).join('; ') || '';
  return { token, cookie };
}

test('security headers are present and strict', async () => {
  const res = await get('/');
  const csp = res.headers.get('content-security-policy');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.doesNotMatch(csp, /'unsafe-inline'/);
  assert.doesNotMatch(csp, /'unsafe-eval'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  const xfo = res.headers.get('x-frame-options');
  assert.ok(xfo === null || ['DENY', 'SAMEORIGIN'].includes(xfo), 'frame guard is defensive, not permissive');
  assert.ok(res.headers.get('referrer-policy'), 'referrer policy set');
  assert.ok(res.headers.get('permissions-policy'), 'permissions policy set');
  assert.equal(res.headers.get('x-powered-by'), null, 'no framework fingerprint');
});

test('API responses are never cached', async () => {
  const res = await get('/api/content/packages');
  assert.match(res.headers.get('cache-control') || '', /no-store/);
});

test('mutations without a CSRF token are rejected', async () => {
  const { cookie } = await csrfContext();
  const res = await fetch(`${server.origin}/api/leads/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'No Token', email: 'x@example.com', message: 'hello there' }),
  });
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error.code, 'csrf_failed');
});

test('cross-origin form posts are blocked', async () => {
  const { token, cookie } = await csrfContext();
  const res = await fetch(`${server.origin}/api/leads/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': token, Origin: 'https://evil.example' },
    body: JSON.stringify({ name: 'Evil', email: 'x@example.com', message: 'hello there' }),
  });
  assert.equal(res.status, 403);
});

test('invalid payloads fail closed with 422 and field details', async () => {
  const { token, cookie } = await csrfContext();
  const res = await fetch(`${server.origin}/api/leads/booking`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': token, Origin: server.origin },
    body: JSON.stringify({ fullName: 'A', email: 'not-an-email', adults: 999 }),
  });
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.equal(body.error.code, 'validation_failed');
  assert.ok(Array.isArray(body.error.details) && body.error.details.length > 0);
});

test('admin API requires a session', async () => {
  for (const path of ['/api/admin/dashboard', '/api/admin/bookings', '/api/admin/audit', '/api/admin/export.csv?entity=bookings']) {
    const res = await get(path);
    assert.equal(res.status, 401, `${path} must require auth`);
  }
});

test('login rejects bad credentials without leaking account existence', async () => {
  const { token, cookie } = await csrfContext();
  const res = await fetch(`${server.origin}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': token },
    body: JSON.stringify({ email: 'ghost@example.com', password: 'Whatever-123!' }),
  });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.match(body.error.message, /incorrect email or password/i);
});

test('unknown API routes return JSON 404, unknown pages return the 404 page', async () => {
  const api404 = await get('/api/definitely-not-a-route');
  assert.equal(api404.status, 404);
  assert.equal((await api404.json()).error.code, 'not_found');

  const page = await fetch(`${server.origin}/definitely-not-a-page`);
  assert.equal(page.status, 404);
  assert.match(page.headers.get('content-type') || '', /text\/html/);
});

test('admin area is excluded from robots and sitemap', async () => {
  const robots = await (await fetch(`${server.origin}/robots.txt`)).text();
  assert.match(robots, /Disallow: \/admin/);
  const sitemap = await (await fetch(`${server.origin}/sitemap.xml`)).text();
  assert.doesNotMatch(sitemap, /\/admin/);
});
