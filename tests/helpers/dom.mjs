/* jsdom harness: loads a shipped HTML page, wires cookies + fetch to a live
   test server, and lets us import the page's ES module directly (jsdom does
   not execute <script type="module">). */
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

const PUBLIC = path.resolve(import.meta.dirname, '..', '..', 'public');
const REAL_FETCH = globalThis.fetch.bind(globalThis);

function setGlobal(key, value) {
  try {
    globalThis[key] = value;
  } catch {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
}

export function loadPage(page, origin, pageUrl = '/', { dropCookies = [] } = {}) {
  const virtualConsole = new VirtualConsole();
  const consoleErrors = [];
  virtualConsole.on('jsdomError', (err) => consoleErrors.push(`jsdomError: ${err.message}`));
  virtualConsole.on('error', (...args) => consoleErrors.push(`console.error: ${args.join(' ')}`));

  const html = fs.readFileSync(path.join(PUBLIC, page), 'utf8').replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { url: origin + pageUrl, pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole });
  const { window } = dom;

  const jar = new Map();
  Object.defineProperty(window.document, 'cookie', {
    get() { return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '); },
    set(value) {
      const [pair] = String(value).split(';');
      const idx = pair.indexOf('=');
      if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    },
    configurable: true,
  });

  window.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; }
    observe(el) { this.cb([{ isIntersecting: true, target: el }], this); }
    unobserve() {} disconnect() {} takeRecords() { return []; }
  };
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = function () {};

  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, origin);
    const headers = new Headers(init.headers || {});
    const cookieHeader = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookieHeader) headers.set('Cookie', cookieHeader);
    const res = await REAL_FETCH(url, { ...init, headers });
    for (const raw of res.headers.getSetCookie?.() || []) {
      const [pair] = raw.split(';');
      // `dropCookies` models a browser that refuses to store a cookie (blocked
      // third-party cookies, embedded frames, private mode…).
      if (dropCookies.some((pattern) => pattern.test(pair))) continue;
      const idx = pair.indexOf('=');
      if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
    return res;
  };

  setGlobal('window', window);
  setGlobal('document', window.document);
  setGlobal('navigator', window.navigator);
  setGlobal('location', window.location);
  setGlobal('localStorage', window.localStorage);
  setGlobal('history', window.history);
  setGlobal('fetch', window.fetch);
  setGlobal('IntersectionObserver', window.IntersectionObserver);
  setGlobal('CustomEvent', window.CustomEvent);
  setGlobal('Event', window.Event);
  setGlobal('FormData', window.FormData);
  setGlobal('Headers', window.Headers);
  setGlobal('HTMLElement', window.HTMLElement);
  setGlobal('getComputedStyle', window.getComputedStyle);
  setGlobal('requestAnimationFrame', (cb) => setTimeout(() => cb(Date.now()), 0));
  setGlobal('cancelAnimationFrame', clearTimeout);

  return { dom, window, document: window.document, consoleErrors };
}

/** Imports a frontend module with a cache-buster so each page test gets a fresh instance. */
export function loadModule(relativePath) {
  return import(`file://${path.join(PUBLIC, relativePath)}?t=${Date.now()}-${Math.random()}`);
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function fill(window, selector, value) {
  const el = window.document.querySelector(selector);
  if (!el) throw new Error(`missing field ${selector}`);
  el.value = value;
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
  return el;
}

export function submit(window, selector) {
  window.document.querySelector(selector).dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
}
