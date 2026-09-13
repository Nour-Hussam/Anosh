import '../core/main.js';

import { api } from '../core/api.js';
import { field, formatDate, formatMoney, onChange, t } from '../core/i18n.js';
import { icon } from '../core/icons.js';
import { attachCounter, attachForm, initSteppers, validators } from '../core/forms.js';
import { number } from '../core/ui.js';

const form = document.getElementById('booking-form');
const formCard = document.getElementById('booking-form-card');
const successCard = document.getElementById('booking-success');
const packageSelect = document.getElementById('bf-package');
const dateInput = document.getElementById('bf-date');
const adultsInput = document.getElementById('bf-adults');
const childrenInput = document.getElementById('bf-children');

let packages = [];

const params = new URLSearchParams(location.search);
const preselectSlug = params.get('package') || params.get('slug') || '';

/* ------------------------------- helpers ------------------------------ */
function selectedPackage() {
  return packages.find((pkg) => pkg.slug === packageSelect?.value) || null;
}

function renderOptions() {
  if (!packageSelect) return;
  const current = packageSelect.value;
  packageSelect.replaceChildren();

  const custom = document.createElement('option');
  custom.value = '';
  custom.textContent = t('forms.customTrip');
  packageSelect.append(custom);

  packages.forEach((pkg) => {
    const option = document.createElement('option');
    option.value = pkg.slug;
    option.textContent = `${field(pkg, 'title')} — ${formatMoney(pkg.priceSar)}`;
    packageSelect.append(option);
  });

  packageSelect.value = packages.some((p) => p.slug === current) ? current : '';
  updateSummary();
}

function updateSummary() {
  const pkg = selectedPackage();
  const adults = Number(adultsInput?.value || 0);
  const children = Number(childrenInput?.value || 0);
  const travelers = adults + children;

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText('sum-package', pkg ? field(pkg, 'title') : t('forms.customTrip'));
  setText('sum-travelers', `${number(travelers)} ${t('common.people')}`);
  setText('sum-date', dateInput?.value ? formatDate(dateInput.value) : '—');
  setText('sum-total', pkg ? formatMoney(pkg.priceSar * travelers) : '—');
}

function showSuccess(reference, contact) {
  if (formCard) formCard.hidden = true;
  if (successCard) successCard.hidden = false;
  const refEl = document.getElementById('booking-reference');
  if (refEl) refEl.textContent = reference || '—';

  const host = document.getElementById('success-contacts');
  if (host && contact) {
    host.innerHTML = [
      contact.whatsapp
        ? `<a class="btn btn--outline btn--sm" href="https://wa.me/${contact.whatsapp}" target="_blank" rel="noopener noreferrer">${icon('whatsapp', { size: 16 })} ${t('common.whatsapp')}</a>`
        : '',
      contact.phone ? `<a class="btn btn--outline btn--sm" href="tel:${contact.phone.replace(/[^\d+]/g, '')}">${icon('phone', { size: 16 })} ${t('common.call')}</a>` : '',
      contact.email ? `<a class="btn btn--outline btn--sm" href="mailto:${contact.email}">${icon('mail', { size: 16 })} ${t('common.email')}</a>` : '',
    ].join('');
  }

  successCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* -------------------------------- wiring ------------------------------ */
function init() {
  if (!form) return;

  initSteppers(form);

  // Cannot pick a date in the past.
  if (dateInput) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dateInput.min = today.toISOString().slice(0, 10);
  }

  attachCounter(document.getElementById('bf-notes'), document.getElementById('notes-counter'), 2000);

  [packageSelect, dateInput, adultsInput, childrenInput].forEach((el) => el?.addEventListener('change', updateSummary));

  attachForm(form, {
    endpoint: '/leads/booking',
    button: document.getElementById('booking-submit'),
    busyText: t('common.sending'),
    alertsId: 'booking-alerts',
    rules: {
      fullName: validators.name,
      email: validators.email,
      phone: (value) => validators.phone(value, { required: true }),
      travelDate: validators.futureDate,
      consent: validators.consent,
    },
    payload: (data) => ({
      packageSlug: data.packageSlug || '',
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      country: data.country || '',
      adults: Number(data.adults) || 1,
      children: Number(data.children) || 0,
      travelDate: data.travelDate || '',
      preferredContact: data.preferredContact || 'email',
      notes: data.notes || '',
      consent: true,
    }),
    onSuccess: (response) => showSuccess(response.reference, response.contact),
  });

  document.getElementById('booking-another')?.addEventListener('click', () => {
    form.reset();
    if (adultsInput) adultsInput.value = '2';
    if (childrenInput) childrenInput.value = '0';
    if (successCard) successCard.hidden = true;
    if (formCard) formCard.hidden = false;
    updateSummary();
    form.querySelector('#bf-name')?.focus();
  });

  renderOptions();
}

async function loadPackages() {
  try {
    const data = await api.get('/content/packages', { limit: 60, sort: 'featured' });
    packages = data.items || [];
  } catch {
    packages = [];
  }
  renderOptions();
  // Apply the ?package= deep link *after* the options exist.
  if (preselectSlug && packages.some((pkg) => pkg.slug === preselectSlug) && packageSelect) {
    packageSelect.value = preselectSlug;
    updateSummary();
  }
}

init();
loadPackages();

onChange(() => {
  renderOptions();
  updateSummary();
});
