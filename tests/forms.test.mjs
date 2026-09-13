/* Public form flows in jsdom: live estimate, client validation, successful
   submission with reference, contact flow and silent bot flagging. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/server.mjs';
import { loadPage, loadModule, sleep, fill, submit } from './helpers/dom.mjs';

const server = await startTestServer();
test.after(() => server.stop());

test('booking form: preselect, estimate, validation, submit', async () => {
  const { window, document, consoleErrors } = loadPage('booking.html', server.origin, '/booking?package=alula-heritage-3-days');
  await loadModule('js/pages/booking.js');
  await sleep(800);

  assert.equal(document.getElementById('bf-package')?.value, 'alula-heritage-3-days');
  assert.ok((document.getElementById('sum-package')?.textContent || '').length > 3, 'summary shows trip');

  fill(window, '#bf-adults', '2');
  const children = document.getElementById('bf-children');
  children.value = '1';
  children.dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(120);
  assert.equal((document.getElementById('sum-total')?.textContent || '').replace(/\D/g, ''), '11850', 'live estimate 3 × 3950');

  fill(window, '#bf-name', 'أحمد محمد التجريبي');
  fill(window, '#bf-email', 'not-an-email');
  fill(window, '#bf-phone', '+966551234567');
  fill(window, '#bf-date', '2026-12-01');
  document.getElementById('bf-consent').checked = true;
  submit(window, '#booking-form');
  await sleep(500);
  assert.ok(document.getElementById('bf-email').closest('.field')?.classList.contains('has-error'), 'inline email error');
  assert.notEqual(document.getElementById('booking-success')?.hidden, false, 'no success before valid submit');

  document.getElementById('booking-form').dataset.formTs = String(Date.now() - 45_000); // human pace
  fill(window, '#bf-email', 'ahmed.test@example.com');
  submit(window, '#booking-form');
  await sleep(1500);
  const reference = document.getElementById('booking-reference')?.textContent || '';
  assert.match(reference, /^KJ-[A-Z0-9]{6}$/, 'booking reference issued');
  assert.equal(document.getElementById('booking-success')?.hidden, false, 'success panel visible');
  assert.deepEqual(consoleErrors, []);
});

test('contact form: success flow', async () => {
  const { window, document, consoleErrors } = loadPage('contact.html', server.origin, '/contact');
  await loadModule('js/pages/contact.js');
  await sleep(600);

  document.getElementById('contact-form').dataset.formTs = String(Date.now() - 40_000);
  fill(window, '#cf-name', 'سارة الاختبار');
  fill(window, '#cf-email', 'sara.test@example.com');
  fill(window, '#cf-subject', 'استفسار');
  fill(window, '#cf-message', 'هل تتوفر رحلة خاصة لعائلة من ستة أشخاص؟');
  document.getElementById('cf-consent').checked = true;
  submit(window, '#contact-form');
  await sleep(1400);

  assert.equal(document.getElementById('contact-success')?.hidden, false, 'success panel');
  assert.equal(document.getElementById('contact-form')?.hidden, true, 'form hidden after success');
  assert.deepEqual(consoleErrors, []);
});

test('honeypot submission is accepted but flagged as spam', async () => {
  const { window, document, consoleErrors } = loadPage('contact.html', server.origin, '/contact');
  await loadModule('js/pages/contact.js');
  await sleep(600);

  fill(window, '#cf-name', 'Bot User');
  fill(window, '#cf-email', 'bot@example.com');
  fill(window, '#cf-message', 'spam spam spam spam spam');
  fill(window, '#cf-company', 'https://spam.example'); // honeypot must stay empty
  document.getElementById('cf-consent').checked = true;
  submit(window, '#contact-form');
  await sleep(1200);

  // Visitor never learns they were flagged.
  assert.equal(document.getElementById('contact-success')?.hidden, false, 'silent success for bots');
  assert.deepEqual(consoleErrors, []);

  // …but the inbox keeps it out of the main queue.
  const csrf = await fetch(`${server.origin}/api/csrf-token`, { headers: { Accept: 'application/json' } });
  const { csrfToken: token } = await csrf.json();
  const cookie = csrf.headers.getSetCookie()?.map((c) => c.split(';')[0]).join('; ') || '';
  const session = await fetch(`${server.origin}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token, Cookie: cookie, Accept: 'application/json' },
    body: JSON.stringify({ email: server.admin.email, password: server.admin.password }),
  });
  assert.equal(session.status, 200, 'admin login for verification');
  const authCookie = `${cookie}; ${session.headers.getSetCookie()?.map((c) => c.split(';')[0]).join('; ')}`;
  const spam = await fetch(`${server.origin}/api/admin/messages?status=spam`, { headers: { Cookie: authCookie, Accept: 'application/json' } });
  const { items } = await spam.json();
  assert.ok(items.some((m) => m.name === 'Bot User'), 'bot message filed as spam');
});
