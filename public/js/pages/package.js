import '../core/main.js';

import { api } from '../core/api.js';
import { emptyState, testimonialCard, tripCard } from '../core/components.js';
import { formatMoney, getLang, onChange, t } from '../core/i18n.js';
import { icon } from '../core/icons.js';
import { duration, initReveal, initTabs, number } from '../core/ui.js';

const slug =
  decodeURIComponent((location.pathname.split('/').filter(Boolean).pop() || '').split('?')[0]) ||
  new URLSearchParams(location.search).get('slug') ||
  '';

const $ = (id) => document.getElementById(id);
const lang = () => getLang();

let state = null;

function safe(value) {
  return String(value ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
}

function pick(pkg, key) {
  return lang() === 'ar' ? pkg[`${key}Ar`] : pkg[`${key}En`];
}

/** Builds a <ul class="check-list"> from a plain array of strings (no HTML injection). */
function renderCheckList(containerId, items, icon_ = 'check') {
  const host = $(containerId);
  if (!host) return;
  host.replaceChildren();
  (items || []).forEach((text) => {
    const li = document.createElement('li');
    li.innerHTML = icon(icon_);
    const span = document.createElement('span');
    span.textContent = text;
    li.append(span);
    host.append(li);
  });
}

function renderGallery(pkg) {
  const gallery = [pkg.image, ...(pkg.gallery || [])]
    .filter(Boolean)
    .filter((value, index, arr) => arr.indexOf(value) === index);
  const main = $('gallery-main');
  const thumbs = $('gallery-thumbs');
  if (!main) return;

  const title = pick(pkg, 'title');
  main.src = gallery[0] || pkg.image || '';
  main.alt = title;

  if (!thumbs) return;
  if (gallery.length < 2) {
    thumbs.remove();
    return;
  }

  thumbs.replaceChildren();
  gallery.forEach((src, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'detail-gallery__thumb';
    button.setAttribute('aria-current', String(index === 0));
    button.setAttribute('aria-label', `${title} — ${index + 1}`);
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.width = 84;
    img.height = 60;
    button.append(img);
    button.addEventListener('click', () => {
      main.src = src;
      [...thumbs.children].forEach((other) => other.setAttribute('aria-current', String(other === button)));
    });
    thumbs.append(button);
  });
}

function factRows(rows) {
  return rows
    .map(
      ([ic, label, value]) =>
        `<span class="trip-meta__item">${icon(ic)}<span><span class="trip-meta__label">${safe(label)}</span><span class="trip-meta__value">${safe(value)}</span></span></span>`
    )
    .join('');
}

function render() {
  if (!state) return;
  const pkg = state.package;
  const title = pick(pkg, 'title');

  document.title = `${title} | ${t('meta.siteName')}`;
  $('trip-title').textContent = title;
  $('crumb-name').textContent = title;
  $('trip-summary').textContent = pick(pkg, 'summary');

  const heroMedia = $('hero-media');
  if (heroMedia && pkg.image) {
    heroMedia.replaceChildren();
    const img = document.createElement('img');
    img.src = pkg.image;
    img.alt = '';
    img.width = 1408;
    img.height = 768;
    img.decoding = 'async';
    heroMedia.append(img);
  }

  const badges = $('trip-badges');
  if (badges) {
    badges.innerHTML = [
      `<span class="pill pill--brand">${icon('mapPin', { size: 14 })} ${safe(pick(pkg, 'region'))}</span>`,
      `<span class="pill">${icon('calendar', { size: 14 })} ${safe(duration(pkg.days, pkg.nights))}</span>`,
      `<span class="pill">${icon('route', { size: 14 })} ${safe(t(`difficulty.${pkg.difficulty}`))}</span>`,
      `<span class="pill pill--gold">${icon('award', { size: 14 })} ${safe(t(`category.${pkg.category}`))}</span>`,
    ].join('');
  }

  const meta = $('trip-meta');
  if (meta) {
    meta.innerHTML = factRows([
      ['calendar', t('trip.factsDuration'), duration(pkg.days, pkg.nights)],
      ['users', t('trip.factsGroup'), `${number(pkg.groupSize)} ${t('common.people')}`],
      ['route', t('trip.factsDifficulty'), t(`difficulty.${pkg.difficulty}`)],
      ['award', t('trip.factsCategory'), t(`category.${pkg.category}`)],
      ['star', t('trip.factsRating'), `${Number(pkg.rating).toFixed(1)} · ${number(pkg.reviewsCount)} ${t('common.reviews')}`],
    ]);
  }

  const description = $('trip-description');
  if (description) {
    description.replaceChildren();
    const p = document.createElement('p');
    p.textContent = pick(pkg, 'description');
    description.append(p);
  }

  renderGallery(pkg);

  renderCheckList('trip-highlights', pkg.highlights?.[lang()] || [], 'check');
  renderCheckList('trip-includes', pkg.includes?.[lang()] || [], 'check');
  renderCheckList('trip-excludes', pkg.excludes?.[lang()] || [], 'x');

  const itinerary = $('trip-itinerary');
  if (itinerary) {
    itinerary.replaceChildren();
    (pkg.itinerary || []).forEach((day) => {
      const li = document.createElement('li');
      li.className = 'timeline__item';

      const dayBox = document.createElement('span');
      dayBox.className = 'timeline__day num';
      dayBox.textContent = String(day.day);

      const heading = document.createElement('h3');
      heading.className = 'timeline__title';
      heading.textContent = lang() === 'ar' ? day.titleAr : day.titleEn;

      const text = document.createElement('p');
      text.className = 'timeline__text';
      text.textContent = lang() === 'ar' ? day.textAr : day.textEn;

      li.append(dayBox, heading, text);
      itinerary.append(li);
    });
  }

  const reviews = $('trip-reviews');
  if (reviews) {
    const items = state.testimonials || [];
    reviews.innerHTML = items.map((item) => testimonialCard(item, { reveal: false })).join('');
    const emptyHost = $('trip-reviews-empty');
    if (emptyHost) emptyHost.innerHTML = items.length ? '' : emptyState(t('trip.noReviews'));
  }

  const price = $('card-price');
  if (price) price.textContent = formatMoney(pkg.priceSar, { withCurrency: false });

  const old = $('card-old-price');
  if (old) {
    old.textContent = pkg.oldPriceSar && pkg.oldPriceSar > pkg.priceSar ? formatMoney(pkg.oldPriceSar) : '';
    old.classList.toggle('price__old', Boolean(old.textContent));
  }

  const facts = $('card-facts');
  if (facts) {
    facts.innerHTML = [
      ['calendar', t('trip.factsDuration'), duration(pkg.days, pkg.nights)],
      ['users', t('trip.factsGroup'), `${number(pkg.groupSize)} ${t('common.people')}`],
      ['route', t('trip.factsDifficulty'), t(`difficulty.${pkg.difficulty}`)],
      ['mapPin', t('destinations.breadcrumb'), pick(pkg, 'region')],
    ]
      .map(([ic, label, value]) => `<div class="fact">${icon(ic)}<span class="fact__label">${safe(label)}</span><span class="fact__value">${safe(value)}</span></div>`)
      .join('');
  }

  const book = $('card-book');
  if (book) book.href = `/booking?package=${encodeURIComponent(pkg.slug)}`;

  const related = $('related-trips');
  if (related) related.innerHTML = (state.related || []).map((item) => tripCard(item, { reveal: false })).join('');

  const ld = document.getElementById('org-jsonld');
  if (ld) {
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'TouristTrip',
      name: pkg.titleEn,
      alternateName: pkg.titleAr,
      description: pkg.summaryEn,
      image: `${location.origin}${pkg.image}`,
      offers: {
        '@type': 'Offer',
        price: pkg.priceSar,
        priceCurrency: 'SAR',
        availability: 'https://schema.org/InStock',
      },
      provider: { '@type': 'TravelAgency', name: 'Kingdom Journeys' },
    });
  }

  initTabs();
  initReveal();
}

async function load() {
  const titleEl = $('trip-title');
  if (titleEl) titleEl.textContent = t('common.loading');

  if (!slug) {
    if (titleEl) titleEl.textContent = t('trip.notFound');
    return;
  }

  try {
    state = await api.get(`/content/packages/${encodeURIComponent(slug)}`);
  } catch {
    state = null;
    if (titleEl) titleEl.textContent = t('trip.notFound');
    const description = $('trip-description');
    if (description) description.innerHTML = emptyState(t('trip.notFound'));
    return;
  }
  render();
}

load();
onChange(render);
