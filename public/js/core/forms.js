/* ---------------------------------------------------------------------
   Form engine shared by the contact, booking, newsletter and admin forms:
   client-side validation that mirrors the server schema, busy states,
   inline errors, honeypot/timestamp handling and unified error mapping.
   --------------------------------------------------------------------- */
import { getLang, t } from './i18n.js';
import { icon } from './icons.js';
import { applyServerErrors, clearFormErrors, setBusy, setFieldError, toastError, toastSuccess } from './ui.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+()\-.\s\d]{6,32}$/;

export const validators = {
  required: (value) => (String(value ?? '').trim().length ? null : t('forms.errRequired')),
  name: (value) => (String(value ?? '').trim().length >= 2 ? null : t('forms.errName')),
  email: (value) => (EMAIL_RE.test(String(value ?? '').trim()) ? null : t('forms.errEmail')),
  phone: (value, { required = false } = {}) => {
    const v = String(value ?? '').trim();
    if (!v) return required ? t('forms.errRequired') : null;
    if (!PHONE_RE.test(v) || v.replace(/\D/g, '').length < 6) return t('forms.errPhone');
    return null;
  },
  message: (value) => (String(value ?? '').trim().length >= 5 ? null : t('forms.errMessage')),
  consent: (checked) => (checked ? null : t('forms.errConsent')),
  futureDate: (value) => {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return t('forms.errDate');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date >= today ? null : t('forms.errDate');
  },
};

function formData(form) {
  const data = {};
  new FormData(form).forEach((value, key) => {
    data[key] = value;
  });
  // Checkboxes are absent from FormData when unchecked.
  form.querySelectorAll('input[type="checkbox"]').forEach((box) => {
    data[box.name] = box.checked;
  });
  return data;
}

function alert(containerId, type, message) {
  const host = document.getElementById(containerId);
  if (!host) return;
  host.innerHTML = `<div class="alert alert--${type}">${icon(type === 'success' ? 'checkCircle' : type === 'error' ? 'alert' : 'info')}<span></span></div>`;
  host.querySelector('span').textContent = message;
}

export function clearAlert(containerId) {
  const host = document.getElementById(containerId);
  if (host) host.innerHTML = '';
}

/**
 * @param {HTMLFormElement} form
 * @param {object} options
 *   rules    — { fieldName: fn(value, data) => string|null }
 *   payload  — (data) => object sent to the server
 *   endpoint — API path
 *   button   — submit button element
 *   busyText — label while submitting
 *   onSuccess(res, data, helpers) / onError(err, helpers)
 */
export function attachForm(form, options) {
  const {
    rules = {},
    payload = (data) => data,
    endpoint,
    method = 'POST',
    button,
    busyText,
    alertsId,
    onSuccess,
    onError,
  } = options;

  const helpers = { alert: (type, msg) => alertsId && alert(alertsId, type, msg), clearAlert: () => alertsId && clearAlert(alertsId) };

  // Page-load timestamp: the server rejects/flags submissions that arrive
  // impossibly fast or suspiciously late without ever blaming a real visitor.
  if (!form.dataset.formTs) form.dataset.formTs = String(Date.now());

  // Live clearing of errors as the visitor types.
  form.addEventListener('input', (event) => {
    const field = event.target.closest('.field');
    if (field?.classList.contains('has-error')) {
      field.classList.remove('has-error');
      event.target.removeAttribute('aria-invalid');
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFormErrors(form);
    helpers.clearAlert();

    const data = formData(form);
    let firstInvalid = null;

    for (const [name, rule] of Object.entries(rules)) {
      const input = form.querySelector(`[name="${name}"]`);
      if (!input) continue;
      const message = rule(input.type === 'checkbox' ? input.checked : data[name], data);
      if (message) {
        setFieldError(input, message);
        firstInvalid = firstInvalid || input;
      }
    }

    if (firstInvalid) {
      firstInvalid.focus({ preventScroll: false });
      helpers.alert('error', t('forms.errGeneric'));
      return;
    }

    setBusy(button, true, busyText || t('common.sending'));

    try {
      const { api } = await import('./api.js');
      const body = { ...payload(data), lang: getLang() };
      // Anti-bot signals travel with every submission so the server can
      // silently flag automated posts (never shown to the visitor).
      for (const field of ['website', 'company_url', 'fax_number']) {
        if (typeof data[field] === 'string') body[field] = data[field];
      }
      body.form_ts = Number(form.dataset.formTs || Date.now());
      const response = method === 'POST' ? await api.post(endpoint, body) : await api.put(endpoint, body);

      if (alertsId) alert(alertsId, 'success', options.successMessage || t('toast.contactSuccess'));
      if (onSuccess) await onSuccess(response, data, helpers);
    } catch (err) {
      const mapped = mapError(err);
      if (!applyServerErrors(err.details || [], form)) helpers.alert('error', mapped);
      if (onError) onError(err, helpers);
      else toastError(mapped);
    } finally {
      setBusy(button, false);
    }
  });

  return helpers;
}

/** Turns any ApiClientError into a visitor-friendly message in the active language. */
export function mapError(err) {
  if (!err) return t('forms.errGeneric');
  if (err.status === 0) return t('forms.errNetwork');
  if (err.status === 429) return t('forms.errTooMany');
  if (err.status >= 500) return t('forms.errServer');
  if (err.status === 403 && err.code === 'csrf_failed') return t('common.errorGeneric');
  if (err.code === 'validation_failed') {
    const first = Array.isArray(err.details) ? err.details[0] : null;
    return first?.message ? `${first.field}: ${first.message}` : t('forms.errGeneric');
  }
  return err.message && err.message !== 'Request failed' ? err.message : t('forms.errGeneric');
}

/** Character counter for textareas (pure CSSOM writes, CSP friendly). */
export function attachCounter(textarea, counterEl, max) {
  if (!textarea || !counterEl) return;
  const update = () => {
    counterEl.textContent = t('forms.fieldLength', { current: textarea.value.length, max });
  };
  textarea.addEventListener('input', update);
  update();
}

/** +/− counters used for adults & children. */
export function initSteppers(root = document) {
  root.querySelectorAll('.counter__btn').forEach((btn) => {
    if (btn.dataset.bound === 'true') return;
    btn.dataset.bound = 'true';
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      const step = Number(btn.dataset.step) || 1;
      const min = Number(target.dataset.min ?? (target.name === 'adults' ? 1 : 0));
      const max = Number(target.dataset.max ?? 40);
      const next = Math.min(max, Math.max(min, (Number(target.value) || 0) + step));
      target.value = String(next);
      target.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}

export { formData, toastSuccess };
