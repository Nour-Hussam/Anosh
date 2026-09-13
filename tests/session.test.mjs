/* Session cookies — the console must work both directly (same-site) and when it is
   served over HTTPS through a proxy and embedded in a cross-site frame, where
   browsers drop `SameSite=Lax` cookies. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/server.mjs';

const server = await startTestServer({ TZ: 'Africa/Cairo' });
test.after(() => server.stop());

const HTTPS = { 'X-Forwarded-Proto': 'https' };

/** Minimal cookie jar so the double-submit token we request is the one we send. */
function newJar() {
  const store = new Map();
  return {
    header: () => [...store.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
    absorb(res) {
      for (const raw of res.headers.getSetCookie?.() || []) {
        const [pair] = raw.split(';');
        const idx = pair.indexOf('=');
        if (idx > 0) store.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
      }
      return res;
    },
  };
}

async function signIn(extraHeaders = {}) {
  const jar = newJar();
  const tokenRes = jar.absorb(
    await fetch(`${server.origin}/api/csrf-token`, { headers: { Accept: 'application/json', ...extraHeaders } })
  );
  const { csrfToken } = await tokenRes.json();
  const res = jar.absorb(
    await fetch(`${server.origin}/api/admin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
        Cookie: jar.header(),
        ...extraHeaders,
      },
      body: JSON.stringify({ email: server.admin.email, password: server.admin.password }),
    })
  );
  return { res, jar, tokenCookies: tokenRes.headers.getSetCookie(), setCookies: res.headers.getSetCookie() };
}

test('direct HTTP requests keep the strict SameSite=Lax cookies', async () => {
  const { res, setCookies, tokenCookies } = await signIn();
  assert.equal(res.status, 200);

  const session = setCookies.find((c) => c.startsWith('cj-session='));
  assert.ok(session, 'the session cookie is set');
  assert.match(session, /HttpOnly/);
  assert.match(session, /SameSite=Lax/);
  assert.doesNotMatch(session, /Secure/);

  for (const cookie of [...tokenCookies, ...setCookies]) {
    assert.match(cookie, /SameSite=Lax/, `lax expected: ${cookie}`);
    assert.doesNotMatch(cookie, /Secure/, `secure must stay off over plain HTTP: ${cookie}`);
  }
});

test('cookies switch to SameSite=None; Secure when the request arrives over HTTPS', async () => {
  const { res, setCookies, tokenCookies } = await signIn(HTTPS);
  assert.equal(res.status, 200);

  assert.deepEqual(tokenCookies.map((c) => c.split('=')[0]).sort(), ['cj-csrf', 'cj-vid']);
  assert.ok(setCookies.some((c) => c.startsWith('cj-session=')));

  for (const cookie of [...tokenCookies, ...setCookies]) {
    // Browsers only send these inside a cross-site frame (hosted previews) when the
    // cookie is None + Secure, and they reject None without Secure outright.
    assert.match(cookie, /SameSite=None/, `none expected: ${cookie}`);
    assert.match(cookie, /Secure/, `secure is required with None: ${cookie}`);
  }
});

test('an explicit COOKIE_SAMESITE keeps the last word', async () => {
  const lax = await startTestServer({ COOKIE_SAMESITE: 'lax' });
  try {
    const res = await fetch(`${lax.origin}/api/csrf-token`, { headers: HTTPS });
    for (const cookie of res.headers.getSetCookie()) {
      assert.match(cookie, /SameSite=Lax/, cookie);
      assert.doesNotMatch(cookie, /SameSite=None/);
    }
  } finally {
    lax.stop();
  }

  const explicit = await startTestServer({ COOKIE_SAMESITE: 'none' });
  try {
    // `None` needs a secure channel: over plain HTTP the app must not emit a cookie
    // the browser would throw away, so it falls back to the strict default…
    const plain = await fetch(`${explicit.origin}/api/csrf-token`);
    for (const cookie of plain.headers.getSetCookie()) {
      assert.match(cookie, /SameSite=Lax/, `unusable None cookie avoided: ${cookie}`);
      assert.doesNotMatch(cookie, /Secure/);
    }
    // …and uses None + Secure as soon as the request really arrived over HTTPS.
    const overHttps = await fetch(`${explicit.origin}/api/csrf-token`, { headers: HTTPS });
    for (const cookie of overHttps.headers.getSetCookie()) {
      assert.match(cookie, /SameSite=None/);
      assert.match(cookie, /Secure/);
    }
  } finally {
    explicit.stop();
  }
});

test('the session survives a round trip and is cleared on sign-out', async () => {
  const { res, jar } = await signIn();
  assert.equal(res.status, 200);

  const session = await fetch(`${server.origin}/api/admin/session`, {
    headers: { Cookie: jar.header(), Accept: 'application/json' },
  });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).user.email, server.admin.email);

  const logout = await fetch(`${server.origin}/api/admin/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: jar.header(), 'X-CSRF-Token': await csrfFor(jar), Accept: 'application/json' },
    body: '{}',
  });
  assert.equal(logout.status, 200);
  assert.ok(
    logout.headers.getSetCookie().some((c) => c.startsWith('cj-session=;')),
    'the session cookie is expired on sign-out'
  );
});

async function csrfFor(jar) {
  const res = jar.absorb(await fetch(`${server.origin}/api/csrf-token`, { headers: { Cookie: jar.header() } }));
  return (await res.json()).csrfToken;
}

test('a failed sign-in stays generic but explains itself in development', async () => {
  const jar = newJar();
  const tokenRes = jar.absorb(await fetch(`${server.origin}/api/csrf-token`));
  const { csrfToken } = await tokenRes.json();

  const res = await fetch(`${server.origin}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken, Cookie: jar.header() },
    body: JSON.stringify({ email: server.admin.email, password: 'Definitely-Wrong-123!' }),
  });
  assert.equal(res.status, 401);
  const { error } = await res.json();
  assert.match(error.message, /incorrect email or password/i);
  // The hint is identical for every address, so it never reveals account existence.
  assert.match(error.hint || '', /ADMIN_PASSWORD|admin:password/);
});

test('first-login password change keeps the session authenticated in Cairo time', async () => {
  const { res, jar } = await signIn();
  assert.equal(res.status, 200);
  assert.equal((await res.json()).user.mustChangePassword, true);

  // The UI verifies the session and loads dashboard data before submitting.
  for (const path of ['/session', '/dashboard', '/session']) {
    const response = await fetch(`${server.origin}/api/admin${path}`, { headers: { Cookie: jar.header() } });
    assert.equal(response.status, 200, path);
  }
  const changed = await fetch(`${server.origin}/api/admin/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': await csrfFor(jar), Cookie: jar.header() },
    body: JSON.stringify({ currentPassword: server.admin.password, newPassword: 'Updated-Admin-Pass-456!' }),
  });
  assert.equal(changed.status, 200);
  const session = await fetch(`${server.origin}/api/admin/session`, { headers: { Cookie: jar.header() } });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).user.mustChangePassword, false);
});
