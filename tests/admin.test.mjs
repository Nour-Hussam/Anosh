/* Admin console SPA in jsdom: auth gate, login, forced password change,
   dashboard and the main management views. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/server.mjs';
import { loadPage, loadModule, sleep } from './helpers/dom.mjs';

const server = await startTestServer();
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
  document.getElementById('pw-modal').hidden = true;

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
});
