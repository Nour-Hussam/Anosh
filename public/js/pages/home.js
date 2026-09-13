import '../core/main.js';

import { api } from '../core/api.js';
import { destinationCard, emptyState, faqItem, skeletonTripCards, testimonialCard, tripCard } from '../core/components.js';
import { field, getLang, onChange, t } from '../core/i18n.js';
import { initAccordion, initCounters, initReveal, number, toastError } from '../core/ui.js';

let payload = null;

const $ = (id) => document.getElementById(id);

function setHtml(id, html) {
  const el = $(id);
  if (el) {
    el.innerHTML = html;
    el.setAttribute('aria-busy', 'false');
  }
}

function renderStats() {
  if (!payload?.stats) return;
  document.querySelectorAll('[data-stat]').forEach((el) => {
    const value = payload.stats[el.dataset.stat];
    if (value === undefined || value === null) return;
    el.dataset.count = String(value);
    el.textContent = number(value);
  });
  initCounters();
}

function render() {
  if (!payload) return;

  renderStats();

  setHtml('destinations-grid', payload.destinations.slice(0, 8).map((d) => destinationCard(d)).join(''));
  setHtml(
    'featured-trips',
    payload.featuredPackages.length
      ? payload.featuredPackages.slice(0, 6).map((p) => tripCard(p)).join('')
      : emptyState(t('common.noResults'))
  );
  setHtml(
    'testimonials-grid',
    payload.testimonials.slice(0, 6).map((item) => testimonialCard(item)).join('')
  );
  setHtml('home-faq', payload.faqs.slice(0, 5).map((faq, index) => faqItem(faq, index)).join(''));

  initAccordion($('home-faq') || document);
  initReveal();
}

async function load() {
  setHtml('destinations-grid', skeletonTripCards(4));
  setHtml('featured-trips', skeletonTripCards(3));

  try {
    payload = await api.get('/content/bootstrap');
  } catch (err) {
    setHtml('featured-trips', emptyState(t('common.errorGeneric'), err.message));
    toastError(t('common.networkError'));
    return;
  }
  render();
}

load();
onChange(render);
