/* Admin console SPA in jsdom: auth gate, login, forced password change,
   dashboard and the main management views. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/server.mjs';
import { loadPage, loadModule, sleep } from './helpers/dom.mjs';

const server = await startTestServer();
let adminPassword = server.admin.password;
test.after(() => server.stop());

test('admin SPA end-to-end', async () => {
  const { window, document, consoleErrors } = loadPage('admin/index.html', server.origin, '/admin/');
  window.confirm = () => true;
  await loadModule('admin/js/admin.js');
  await sleep(700);

  assert.equal(document.getElementById('login-view').hidden, false, 'login gate for anonymous');
  assert.equal(document.getElementById('app-view').hidden, true);

  // Wrong password is rejected with a generic message.
  document.querySelector('#login-form [name="email"]').value = server.admin.email;
  document.querySelector('#login-form [name="password"]').value = 'Wrong-Password-123';
  document.getElementById('login-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(1400);
  assert.match(document.getElementById('login-alerts').textContent, /incorrect/i);

  // Correct password signs in and forces a password change on first use.
  document.querySelector('#login-form [name="password"]').value = server.admin.password;
  document.getElementById('login-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(1600);
  assert.equal(document.getElementById('app-view').hidden, false, 'app shell after login');
  assert.equal(document.getElementById('pw-modal').hidden, false, 'forced password change');
  document.querySelector('#pw-form [name="currentPassword"]').value = 'Wrong-Current-Pass-123!';
  document.querySelector('#pw-form [name="newPassword"]').value = 'Updated-Admin-Pass-456!';
  document.getElementById('pw-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(1000);
  assert.equal(document.getElementById('pw-modal').hidden, false, 'wrong password keeps the form open');
  assert.match(document.getElementById('pw-alerts').textContent, /current password is incorrect/i);

  document.querySelector('#pw-form [name="currentPassword"]').value = adminPassword;
  document.getElementById('pw-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(1000);
  assert.equal(document.getElementById('pw-modal').hidden, true, 'password change succeeds');
  adminPassword = 'Updated-Admin-Pass-456!';

  assert.ok(document.querySelectorAll('#view-root .admin-stat').length >= 6, 'dashboard stats');

  const go = async (view, wait = 1100) => {
    document.querySelector(`#admin-nav [data-view="${view}"]`).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await sleep(wait);
  };

  await go('bookings');
  const rows = document.querySelectorAll('#bk-body tr[data-id]');
  assert.ok(rows.length > 0, 'bookings listed');

  rows[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(800);
  const drawer = document.querySelector('.admin-drawer');
  assert.ok(drawer, 'booking drawer opens');
  drawer.querySelector('[name="status"]').value = 'contacted';
  drawer.querySelector('#bk-status-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(1100);

  await go('messages');
  assert.ok(document.querySelectorAll('#ms-body tr').length > 0, 'messages listed');

  await go('packages');
  assert.ok(document.querySelectorAll('#pk-body tr').length > 0, 'packages listed');

  await go('faqs');
  assert.ok(document.querySelectorAll('#fq-body tr').length > 0, 'faqs listed');
  document.querySelector('#fq-body [data-edit]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(700);
  const arQuestion = document.querySelector('.admin-drawer [name="question__ar"]')?.value || '';
  assert.ok(arQuestion.length > 3, 'faq editor maps flat → bilingual fields');
  document.querySelector('.admin-drawer__scrim')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  await go('settings');
  assert.ok((document.querySelector('#st-form [name="phone"]')?.value || '').length > 5, 'settings pre-filled');

  await go('audit');
  assert.ok(document.querySelectorAll('#view-root table.admin-table tbody tr').length > 0, 'audit log');

  assert.deepEqual(consoleErrors, [], 'no console errors in admin SPA');

  document.getElementById('btn-change-password').click();
  document.cookie = 'cj-session=';
  document.querySelector('#pw-form [name="currentPassword"]').value = adminPassword;
  document.querySelector('#pw-form [name="newPassword"]').value = 'Another-Admin-Pass-789!';
  document.getElementById('pw-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(1000);
  assert.equal(document.getElementById('pw-modal').hidden, true, 'expired session dismisses the modal');
  assert.equal(document.getElementById('login-view').hidden, false, 'sign-in is accessible again');
  assert.equal(document.getElementById('app-view').hidden, true);
  assert.equal(document.querySelector('#pw-form [name="currentPassword"]').value, '');
  assert.equal(document.querySelector('#pw-form [name="newPassword"]').value, '');
  assert.match(document.getElementById('login-alerts').textContent, /session expired/i);
});

/* A browser that refuses to keep the session cookie (blocked third-party cookies,
   cross-site frame, private mode…) used to bounce silently back to the sign-in card.
   The console must say what happened and how to get in. */
test('the console explains a session cookie the browser refused to keep', async () => {
  const { window, document } = loadPage('admin/index.html', server.origin, '/admin/', {
    dropCookies: [/^cj-session=/],
  });
  await loadModule('admin/js/admin.js');
  await sleep(700);

  document.querySelector('#login-form [name="email"]').value = server.admin.email;
  document.querySelector('#login-form [name="password"]').value = adminPassword;
  document.getElementById('login-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(1800);

  assert.equal(document.getElementById('app-view').hidden, true, 'no half-signed-in console');
  const alert = document.getElementById('login-alerts').textContent;
  assert.match(alert, /could not stay signed in/i, `explains the missing cookie: ${alert}`);
  assert.match(alert, /did not keep the session cookie/i, alert);
  assert.match(alert, /cookies for this site/i, `tells the user what to do: ${alert}`);
});

/* Embedded in another page (hosted preview / portal) the browser may reject the
   security cookie outright: the sign-in never reaches the server. Say so. */
test('the console reports a sign-in that never reached the server', async () => {
  const { window, document } = loadPage('admin/index.html', server.origin, '/admin/');
  await loadModule('admin/js/admin.js');
  await sleep(700);

  const json = (body, status) => ({
    ok: status < 300,
    status,
    statusText: '',
    headers: { getSetCookie: () => [] },
    text: async () => JSON.stringify(body),
    json: async () => body,
  });
  const reject = async (input) => {
    const url = String(typeof input === 'string' ? input : input.url);
    if (url.includes('/api/csrf-token')) return json({ csrfToken: 'token-from-a-dropped-cookie' }, 200);
    return json(
      { error: { code: 'csrf_failed', message: 'Security token invalid or expired. Please refresh the page and try again.' } },
      403
    );
  };
  window.fetch = reject;
  globalThis.fetch = reject;

  document.querySelector('#login-form [name="email"]').value = server.admin.email;
  document.querySelector('#login-form [name="password"]').value = server.admin.password;
  document.getElementById('login-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(900);

  assert.equal(document.getElementById('app-view').hidden, true);
  const alert = document.getElementById('login-alerts').textContent;
  assert.match(alert, /stopped before it reached the server/i, alert);
  assert.match(alert, /cookies/i, `explains what the browser blocked: ${alert}`);
  // Inside a real frame the console additionally offers "Open the console in its own
  // tab" (verified in a browser against a cross-site iframe).
});
