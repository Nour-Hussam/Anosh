import '../core/main.js';

import { api } from '../core/api.js';
import { emptyState, skeletonTripCards, tripCard } from '../core/components.js';
import { bilingual, field, onChange, t } from '../core/i18n.js';
import { icon } from '../core/icons.js';
import { initReveal } from '../core/ui.js';

const slug = decodeURIComponent((location.pathname.split('/').filter(Boolean).pop() || '').split('?')[0]) ||
  new URLSearchParams(location.search).get('slug') || '';

const $ = (id) => document.getElementById(id);

let state = null;

function render() {
  if (!state) return;
  const { destination, packages } = state;

  const name = field(destination, 'name');
  document.title = `${name} | ${t('meta.siteName')}`;
  $('destination-name').textContent = name;
  $('crumb-name').textContent = name;
  $('destination-tagline').textContent = field(destination, 'tagline');

  const heroMedia = $('hero-media');
  if (heroMedia && destination.image) {
    heroMedia.innerHTML = `<img src="${destination.image.replace(/"/g, '&quot;')}" alt="" width="1408" height="768" decoding="async">`;
  }

  const description = $('destination-description');
  if (description) {
    const p = document.createElement('p');
    p.textContent = field(destination, 'description');
    description.replaceChildren(p);
  }

  $('fact-season').textContent = field(destination, 'bestSeason') || '—';
  $('fact-region').textContent = field(destination, 'region') || '—';
  $('fact-trips').textContent = String(packages.length);

  const meta = $('destination-meta');
  if (meta) {
    meta.innerHTML = [
      `<span class="pill">${icon('mapPin', { size: 14 })} ${escape(field(destination, 'region'))}</span>`,
      `<span class="pill pill--gold">${icon('calendar', { size: 14 })} ${escape(field(destination, 'bestSeason'))}</span>`,
      `<span class="pill pill--brand">${icon('ticket', { size: 14 })} ${packages.length} ${escape(t('destinations.trips'))}</span>`,
    ].join('');
  }

  const highlights = (destination.highlights?.[document.documentElement.lang === 'ar' ? 'ar' : 'en'] || []);
  const list = $('destination-highlights');
  if (list) {
    list.innerHTML = highlights.map(() => `${icon('check', { size: 19 })}<span></span>`).join('');
    [...list.querySelectorAll('span')].forEach((span, index) => {
      span.textContent = highlights[index];
    });
  }
  if ($('highlights-head')) $('highlights-head').hidden = highlights.length === 0;

  const trips = $('destination-trips');
  if (trips) {
    trips.innerHTML = packages.length ? packages.map((p) => tripCard(p)).join('') : '';
    trips.setAttribute('aria-busy', 'false');
  }
  const empty = $('destination-empty');
  if (empty) empty.innerHTML = packages.length ? '' : emptyState(t('packages.noTrips'));

  // JSON-LD for search engines.
  const ld = document.getElementById('org-jsonld');
  if (ld) {
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Place',
      name,
      description: field(destination, 'description'),
      containedInPlace: { '@type': 'Country', name: 'Saudi Arabia' },
    });
  }

  initReveal();
}

function escape(value) {
  return String(value ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

async function load() {
  const trips = $('destination-trips');
  if (trips) trips.innerHTML = skeletonTripCards(3);

  if (!slug) {
    $('destination-name').textContent = t('destination.notFound');
    return;
  }

  try {
    state = await api.get(`/content/destinations/${encodeURIComponent(slug)}`);
  } catch {
    state = null;
    $('destination-name').textContent = t('destination.notFound');
    if (trips) trips.innerHTML = emptyState(t('destination.notFound'));
    return;
  }
  render();
}

load();
onChange(render);
