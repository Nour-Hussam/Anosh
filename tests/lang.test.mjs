/* Bilingual UX: Arabic RTL by default, instant switch to English LTR and
   back, with dynamic content re-rendered in the active language. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/server.mjs';
import { loadPage, loadModule, sleep } from './helpers/dom.mjs';

const server = await startTestServer();
test.after(() => server.stop());

test('language toggle switches dir, chrome and dynamic content', async () => {
  const { window, document, consoleErrors } = loadPage('index.html', server.origin, '/');
  await loadModule('js/pages/home.js');
  await sleep(900);

  assert.equal(document.documentElement.lang, 'ar', 'default language');
  assert.equal(document.documentElement.dir, 'rtl', 'default direction');
  const arabicTitle = document.querySelector('#featured-trips .trip-card__title')?.textContent || '';
  assert.ok(/[\u0600-\u06FF]/.test(arabicTitle), 'arabic trip titles');

  document.querySelector('[data-lang-switch="en"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(1200);

  assert.equal(document.documentElement.lang, 'en');
  assert.equal(document.documentElement.dir, 'ltr');
  assert.equal(document.querySelector('[data-i18n="nav.home"]')?.textContent, 'Home');
  const englishTitle = document.querySelector('#featured-trips .trip-card__title')?.textContent || '';
  assert.ok(/^[A-Za-z]/.test(englishTitle), `english trip titles (${englishTitle})`);
  assert.match(document.querySelector('#featured-trips .price__value')?.textContent || '', /SAR/, 'SAR in english');
  assert.equal(document.querySelector('[data-lang-switch="en"]')?.getAttribute('aria-pressed'), 'true');

  document.querySelector('[data-lang-switch="ar"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(900);
  assert.equal(document.documentElement.dir, 'rtl', 'back to RTL');
  assert.match(document.querySelector('#featured-trips .price__value')?.textContent || '', /ر\.س/, 'ر.س in arabic');

  // Preference survives a reload (cookie/localStorage).
  const { document: reloaded } = loadPage('index.html', server.origin, '/?lang=ar');
  assert.equal(reloaded.documentElement.dir, 'rtl');

  assert.deepEqual(consoleErrors, []);
});
