/* =====================================================================
   i18n — Arabic (RTL) / English (LTR) with zero page reloads.
   Priority: ?lang= → localStorage → cookie → <html lang> → navigator → ar
   ===================================================================== */
import AR from '../i18n/ar.js';
import EN from '../i18n/en.js';

const DICTIONARIES = { ar: AR, en: EN };
const STORAGE_KEY = 'kj-lang';
const COOKIE_NAME = 'cj-lang';
export const SUPPORTED = ['ar', 'en'];
const FALLBACK = 'ar';

let current = FALLBACK;
const listeners = new Set();

function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name, value) {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

export function detectLanguage() {
  const params = new URLSearchParams(location.search);
  const fromQuery = params.get('lang');
  if (fromQuery && SUPPORTED.includes(fromQuery)) return fromQuery;

  let stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* storage blocked (private mode) — fall through */
  }
  if (stored && SUPPORTED.includes(stored)) return stored;

  const cookie = readCookie(COOKIE_NAME);
  if (cookie && SUPPORTED.includes(cookie)) return cookie;

  const htmlLang = document.documentElement.getAttribute('lang');
  if (htmlLang && SUPPORTED.includes(htmlLang.slice(0, 2))) return htmlLang.slice(0, 2);

  const nav = (navigator.language || '').slice(0, 2).toLowerCase();
  if (SUPPORTED.includes(nav)) return nav;

  return FALLBACK;
}

export function getLang() {
  return current;
}

export function isRtl() {
  return current === 'ar';
}

/** Looks up a key with dot notation: t('home.hero.title') */
export function t(key, vars) {
  const dict = DICTIONARIES[current] || DICTIONARIES[FALLBACK];
  const value = key.split('.').reduce((acc, part) => (acc == null ? undefined : acc[part]), dict);
  let out = typeof value === 'string' ? value : undefined;

  if (out === undefined) {
    const fallbackValue = key.split('.').reduce((acc, part) => (acc == null ? undefined : acc[part]), DICTIONARIES[FALLBACK]);
    out = typeof fallbackValue === 'string' ? fallbackValue : key;
  }

  if (vars) {
    for (const [name, replacement] of Object.entries(vars)) {
      out = out.replaceAll(`{${name}}`, String(replacement));
    }
  }
  return out;
}

/** Picks the correct field from a bilingual API object: pick(item.titleAr, item.titleEn) */
export function bilingual(arValue, enValue) {
  return (current === 'ar' ? arValue : enValue) || arValue || enValue || '';
}

/** Convenience for the API shape { …Ar, …En }. */
export function field(obj, base) {
  if (!obj) return '';
  return obj[`${base}${current === 'ar' ? 'Ar' : 'En'}`] || obj[`${base}${current === 'ar' ? 'En' : 'Ar'}`] || '';
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function applyAttributes(root) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });

  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  });

  // Localised alt text for decorative/hero images.
  root.querySelectorAll('[data-alt-ar], [data-alt-en]').forEach((el) => {
    el.setAttribute('alt', current === 'ar' ? el.dataset.altAr || '' : el.dataset.altEn || el.dataset.altAr || '');
  });

  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    // Only ever used with our own trusted dictionary strings.
    el.innerHTML = t(el.dataset.i18nHtml);
  });
}

export function applyTranslations(root = document) {
  applyAttributes(root);

  const titleKey = root === document ? document.body?.dataset?.pageTitle : null;
  if (titleKey) document.title = t(titleKey);

  const descKey = document.body?.dataset?.pageDescription;
  if (descKey) {
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', t(descKey));
  }

  document.documentElement.lang = current;
  document.documentElement.dir = current === 'ar' ? 'rtl' : 'ltr';
}

export function setLang(lang, { reload = false, silent = false } = {}) {
  if (!SUPPORTED.includes(lang)) return;
  current = lang;

  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
  writeCookie(COOKIE_NAME, lang);

  const url = new URL(location.href);
  url.searchParams.set('lang', lang);
  history.replaceState(null, '', url);

  applyTranslations();

  if (!silent) {
    listeners.forEach((fn) => {
      try {
        fn(lang);
      } catch (err) {
        console.error('[i18n] listener failed', err);
      }
    });
  }

  if (reload) location.reload();
}

export function toggleLang() {
  setLang(current === 'ar' ? 'en' : 'ar');
}

/** Money / number formatting that follows the active locale. */
export function formatMoney(value, { withCurrency = true } = {}) {
  const number = Number(value) || 0;
  const formatted = new Intl.NumberFormat(current === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', {
    maximumFractionDigits: 0,
  }).format(number);
  return withCurrency ? `${formatted} ${t('common.currency')}` : formatted;
}

export function formatDate(value, opts = { year: 'numeric', month: 'long', day: 'numeric' }) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(current === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', opts).format(date);
}

export function formatDateTime(value) {
  return formatDate(value, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function initI18n() {
  current = detectLanguage();
  applyTranslations();
  return current;
}
