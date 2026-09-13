/* ---------------------------------------------------------------------
   UI helpers: toasts, scroll reveal, counters, header, accordion,
   form-field errors, small utilities. No dependencies.
   --------------------------------------------------------------------- */
import { icon } from './icons.js';
import { t } from './i18n.js';

/* ------------------------------- toast ------------------------------ */
let toastStack = null;

function ensureStack() {
  if (!toastStack) {
    toastStack = document.createElement('div');
    toastStack.className = 'toast-stack';
    toastStack.setAttribute('role', 'status');
    toastStack.setAttribute('aria-live', 'polite');
    document.body.append(toastStack);
  }
  return toastStack;
}

export function toast(message, type = 'info', timeout = 5000) {
  const stack = ensureStack();
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;

  const iconName = type === 'success' ? 'checkCircle' : type === 'error' ? 'xCircle' : 'info';
  el.innerHTML = `<span class="toast__icon">${icon(iconName, { size: 20 })}</span><span class="toast__text"></span>`;
  el.querySelector('.toast__text').textContent = message;

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast__close';
  close.setAttribute('aria-label', t('common.close'));
  close.innerHTML = icon('x', { size: 16 });
  close.addEventListener('click', () => dismiss());
  el.append(close);

  stack.append(el);
  const timer = setTimeout(dismiss, timeout);

  function dismiss() {
    clearTimeout(timer);
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 260);
  }

  return dismiss;
}

export const toastSuccess = (msg) => toast(msg, 'success');
export const toastError = (msg) => toast(msg, 'error', 7000);

/* ------------------------------ reveal ------------------------------ */
export function initReveal(root = document) {
  const items = root.querySelectorAll('.reveal:not(.is-visible)');
  if (!items.length) return;

  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
  );

  items.forEach((el, index) => {
    el.style.setProperty('transition-delay', `${Math.min(index % 6, 5) * 60}ms`);
    observer.observe(el);
  });
}

/* ----------------------------- counters ----------------------------- */
export function initCounters(root = document) {
  const els = root.querySelectorAll('[data-count]');
  if (!els.length) return;

  const animate = (el) => {
    const target = Number(el.dataset.count) || 0;
    const decimals = Number(el.dataset.decimals || 0);
    const suffix = el.dataset.suffix || '';
    const prefix = el.dataset.prefix || '';
    const duration = Number(el.dataset.duration || 1400);
    const locale = document.documentElement.lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US';
    const started = performance.now();

    const step = (now) => {
      const progress = Math.min((now - started) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = target * eased;
      el.textContent = `${prefix}${new Intl.NumberFormat(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(value)}${suffix}`;
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animate(entry.target);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.4 }
  );

  els.forEach((el) => observer.observe(el));
}

/* ------------------------------ header ------------------------------ */
export function initHeader() {
  const header = document.querySelector('.header');
  const burger = document.querySelector('[data-burger]');
  const nav = document.querySelector('[data-nav]');

  if (header) {
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  if (burger && nav) {
    const setOpen = (open) => {
      nav.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? t('nav.close') : t('nav.open'));
      document.body.classList.toggle('nav-open', open);
    };

    burger.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
    nav.addEventListener('click', (event) => {
      if (event.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setOpen(false);
    });
  }
}

/* --------------------------- back to top ---------------------------- */
export function initBackToTop() {
  const btn = document.querySelector('[data-back-to-top]');
  if (!btn) return;

  const onScroll = () => btn.classList.toggle('is-visible', window.scrollY > 700);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

/* ----------------------------- accordion ---------------------------- */
export function initAccordion(root = document, { single = true } = {}) {
  const items = root.querySelectorAll('.accordion__item');
  items.forEach((item) => {
    const trigger = item.querySelector('.accordion__trigger');
    const panel = item.querySelector('.accordion__panel');
    if (!trigger || !panel || item.dataset.bound === 'true') return;
    item.dataset.bound = 'true';

    trigger.addEventListener('click', () => {
      const willOpen = !item.classList.contains('is-open');
      if (single && willOpen) {
        root.querySelectorAll('.accordion__item.is-open').forEach((other) => {
          if (other !== item) {
            other.classList.remove('is-open');
            other.querySelector('.accordion__trigger')?.setAttribute('aria-expanded', 'false');
          }
        });
      }
      item.classList.toggle('is-open', willOpen);
      trigger.setAttribute('aria-expanded', String(willOpen));
    });
  });
}

/* ------------------------------- tabs ------------------------------- */
export function initTabs(root = document) {
  const groups = root.querySelectorAll('[data-tabs]');
  groups.forEach((group) => {
    if (group.dataset.bound === 'true') return;
    group.dataset.bound = 'true';

    const tabs = [...group.querySelectorAll('[role="tab"]')];
    const select = (tab) => {
      tabs.forEach((other) => {
        const selected = other === tab;
        other.setAttribute('aria-selected', String(selected));
        other.tabIndex = selected ? 0 : -1;
        const panel = document.getElementById(other.getAttribute('aria-controls'));
        if (panel) panel.hidden = !selected;
      });
    };

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', (event) => {
        const index = tabs.indexOf(tab);
        let next = null;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = tabs[(index + 1) % tabs.length];
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = tabs[(index - 1 + tabs.length) % tabs.length];
        if (event.key === 'Home') next = tabs[0];
        if (event.key === 'End') next = tabs.at(-1);
        if (next) {
          event.preventDefault();
          next.focus();
          select(next);
        }
      });
    });
  });
}

/* --------------------------- form helpers --------------------------- */
export function fieldOf(input) {
  return input.closest('.field') || input.parentElement;
}

export function setFieldError(input, message) {
  const field = fieldOf(input);
  if (!field) return;
  field.classList.add('has-error');
  input.setAttribute('aria-invalid', 'true');
  const slot = field.querySelector('.field__error');
  if (slot) slot.textContent = message;
}

export function clearFieldError(input) {
  const field = fieldOf(input);
  if (!field) return;
  field.classList.remove('has-error');
  input.removeAttribute('aria-invalid');
  const slot = field.querySelector('.field__error');
  if (slot) slot.textContent = '';
}

export function clearFormErrors(form) {
  form.querySelectorAll('.field.has-error').forEach((field) => {
    field.classList.remove('has-error');
    field.querySelector('[aria-invalid]')?.removeAttribute('aria-invalid');
  });
  form.querySelectorAll('.field__error').forEach((slot) => (slot.textContent = ''));
}

/** Applies the server's zod issue list to the matching inputs. */
export function applyServerErrors(details = [], form) {
  if (!Array.isArray(details) || !details.length) return false;
  details.forEach(({ field, message }) => {
    const name = field.split('.').pop();
    const input = form.querySelector(`[name="${name}"]`);
    if (input) setFieldError(input, message);
  });
  const first = form.querySelector('.field.has-error input, .field.has-error textarea, .field.has-error select');
  first?.focus();
  return true;
}

export function setBusy(button, busy, labelBusy) {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.innerHTML;
    button.setAttribute('aria-busy', 'true');
    button.disabled = true;
    button.innerHTML = `<span class="btn__spinner"></span><span>${labelBusy || ''}</span>`;
  } else {
    button.removeAttribute('aria-busy');
    button.disabled = false;
    if (button.dataset.label) button.innerHTML = button.dataset.label;
  }
}

/* ------------------------------ utilities --------------------------- */
export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function debounce(fn, wait = 280) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function throttle(fn, wait = 200) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= wait) {
      last = now;
      fn(...args);
    }
  };
}

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

export function stars(rating, count) {
  const rounded = Math.round(Number(rating) || 0);
  let html = '<span class="stars" aria-hidden="true">';
  for (let i = 1; i <= 5; i += 1) {
    html += icon('star', { size: 15, filled: i <= rounded });
  }
  html += '</span>';
  if (count !== undefined && count !== null) {
    html += `<span class="stars__count num">(${new Intl.NumberFormat(document.documentElement.lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US').format(count)})</span>`;
  }
  return html;
}

export function number(value) {
  return new Intl.NumberFormat(document.documentElement.lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US').format(Number(value) || 0);
}

export function duration(days, nights) {
  const d = `${number(days)} ${t(days === 1 ? 'common.day' : 'common.days')}`;
  if (!nights || Number(nights) === 0) return d;
  return `${d} · ${number(nights)} ${t(nights === 1 ? 'common.night' : 'common.nights')}`;
}

export function skeletonCards(count = 3, selector = '.grid') {
  const grid = qs(selector);
  if (!grid) return;
  grid.innerHTML = Array.from({ length: count }, () => '<div class="skeleton skeleton--card"></div>').join('');
}

export async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    toastSuccess(t('toast.copySuccess'));
    return true;
  } catch {
    toastError(t('toast.copyFail'));
    return false;
  }
}
