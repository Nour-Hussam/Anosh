/* ---------------------------------------------------------------------
   Site bootstrap — imported by every page before its own script.
   Sets the language, wires the chrome (header, nav, toasts, reveal),
   loads contact details and handles the footer newsletter form.
   --------------------------------------------------------------------- */
import { api } from './api.js';
import { initI18n, getLang, onChange, setLang, t } from './i18n.js';
import { icon } from './icons.js';
import { initSiteInfo, loadSite, applySiteInfo, getCachedSite } from './site.js';
import {
  clearFormErrors,
  debounce,
  initBackToTop,
  initCounters,
  initHeader,
  initReveal,
  setBusy,
  setFieldError,
  toast,
  toastError,
  toastSuccess,
} from './ui.js';

/* --------------------------- language boot --------------------------- */
const lang = initI18n();

/* ---------------------------- chrome wiring -------------------------- */
initHeader();
initBackToTop();

document.querySelectorAll('[data-lang-switch]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.langSwitch || (getLang() === 'ar' ? 'en' : 'ar');
    setLang(target);
  });
});

function syncLangSwitch() {
  const current = getLang();
  document.querySelectorAll('[data-lang-switch]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.langSwitch === current));
  });
}

function refreshChrome() {
  // Re-apply translations to nodes rendered by JS, and reset dynamic labels.
  syncLangSwitch();
  document.querySelectorAll('[data-fab-whatsapp]').forEach((el) => {
    el.setAttribute('aria-label', t('common.whatsapp'));
  });
  document.querySelectorAll('[data-back-to-top]').forEach((el) => {
    el.setAttribute('aria-label', t('common.backToTop'));
  });
  initReveal();
  initCounters();
}
onChange(refreshChrome);
syncLangSwitch();

const yearEl = document.getElementById('footer-year');
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

/* ------------------------------ site info ---------------------------- */
export const siteReady = initSiteInfo();

/* --------------------------- anti-bot fields ------------------------- */
/** Stamps every form with a load timestamp (used by the server bot filter). */
function stampForms(root = document) {
  root.querySelectorAll('form[data-bot-protected]').forEach((form) => {
    let input = form.querySelector('input[name="form_ts"]');
    if (!input) {
      input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'form_ts';
      form.append(input);
    }
    input.value = String(Date.now());
  });
}
stampForms();

/* --------------------------- newsletter form ------------------------- */
function initNewsletter() {
  document.querySelectorAll('form[data-newsletter]').forEach((form) => {
    if (form.dataset.bound === 'true') return;
    form.dataset.bound = 'true';
    stampForms(form);

    const input = form.querySelector('input[type="email"]');
    const button = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFormErrors(form);

      const email = (input?.value || '').trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        if (input) setFieldError(input, t('forms.errEmail'));
        return;
      }

      setBusy(button, true, t('common.loading'));
      try {
        await api.post('/leads/newsletter', { email, lang: getLang() });
        toastSuccess(t('footer.newsletterSuccess'));
        form.reset();
        stampForms(form);
      } catch (err) {
        if (err.status === 429) toastError(t('forms.errTooMany'));
        else if (err.code === 'conflict') toastSuccess(t('footer.newsletterExists'));
        else toastError(err.message || t('common.errorGeneric'));
      } finally {
        setBusy(button, false);
      }
    });

    input?.addEventListener(
      'input',
      debounce(() => {
        input.closest('.field')?.classList.remove('has-error');
      }, 300)
    );
  });
}
initNewsletter();
onChange(initNewsletter);

/* ------------------------------ exports ------------------------------ */
export { api, icon, t, getLang, setLang, onChange, toast, toastError, toastSuccess, loadSite, applySiteInfo, getCachedSite, stampForms };

// Reveal anything already in the DOM on first paint.
requestAnimationFrame(() => {
  initReveal();
  initCounters();
});
