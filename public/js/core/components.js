/* ---------------------------------------------------------------------
   Shared render helpers. Every function returns an HTML string built
   from escaped values only — no user input is ever interpolated raw.
   --------------------------------------------------------------------- */
import { bilingual, field, formatMoney, getLang, t } from './i18n.js';
import { icon } from './icons.js';
import { duration, escapeHtml, number, stars } from './ui.js';

const isAr = () => getLang() === 'ar';

/* ------------------------------ trip card ---------------------------- */
export function tripCard(pkg, { reveal = true } = {}) {
  const title = escapeHtml(field(pkg, 'title'));
  const summary = escapeHtml(field(pkg, 'summary'));
  const region = escapeHtml(field(pkg, 'region'));
  const image = escapeHtml(pkg.image || '/images/hero-alula.jpg');
  const href = `/trip/${encodeURIComponent(pkg.slug)}`;
  const discounted = pkg.oldPriceSar && pkg.oldPriceSar > pkg.priceSar;

  return `
  <article class="card trip-card ${reveal ? 'reveal' : ''}">
    <div class="card__media">
      <a href="${href}" tabindex="-1" aria-hidden="true">
        <img src="${image}" alt="${title}" loading="lazy" decoding="async" width="640" height="400">
      </a>
      ${discounted ? `<span class="tag tag--gold">${icon('sparkle', { size: 14 })}<span data-i18n="common.from"></span></span>` : ''}
      ${pkg.featured ? `<span class="tag ${discounted ? 'tag--end' : ''}">${icon('award', { size: 14 })}<span>${escapeHtml(t('category.' + pkg.category))}</span></span>` : ''}
    </div>
    <div class="trip-card__body">
      <div class="chips">
        <span class="pill pill--brand">${icon('mapPin', { size: 13 })} ${region || escapeHtml(t('nav.destinations'))}</span>
        <span class="pill">${icon('calendar', { size: 13 })} ${escapeHtml(duration(pkg.days, pkg.nights))}</span>
      </div>

      <h3 class="trip-card__title"><a href="${href}">${title}</a></h3>
      <p class="trip-card__summary">${summary}</p>

      <div class="trip-card__meta">
        <span>${icon('users', { size: 15 })} <span class="num">${number(pkg.groupSize)}</span> ${escapeHtml(t('common.people'))}</span>
        <span>${icon('route', { size: 15 })} ${escapeHtml(t('difficulty.' + pkg.difficulty))}</span>
        <span>${stars(pkg.rating)}</span>
      </div>

      <div class="trip-card__footer">
        <div class="price">
          <span class="price__from" data-i18n="common.from"></span>
          <span class="price__value num">${formatMoney(pkg.priceSar)}</span>
          ${discounted ? `<span class="price__old num">${formatMoney(pkg.oldPriceSar)}</span>` : `<span class="price__unit" data-i18n="common.perPerson"></span>`}
        </div>
        <a class="btn btn--sm" href="${href}"><span data-i18n="common.viewDetails"></span>${icon('arrowRight', { size: 16 })}</a>
      </div>
    </div>
  </article>`;
}

/* --------------------------- destination card ------------------------ */
export function destinationCard(dest, { wide = false, reveal = true } = {}) {
  const name = escapeHtml(field(dest, 'name'));
  const region = escapeHtml(field(dest, 'region'));
  const image = escapeHtml(dest.image || '/images/hero-alula.jpg');
  const count = Number(dest.packagesCount || 0);
  const href = `/destination/${encodeURIComponent(dest.slug)}`;

  return `
  <a class="dest-card ${wide ? 'dest-card--wide' : ''} ${reveal ? 'reveal' : ''}" href="${href}">
    <img src="${image}" alt="${name}" loading="lazy" decoding="async" width="640" height="800">
    <span class="dest-card__body">
      <span class="dest-card__name">${name}</span>
      <span class="dest-card__region">${icon('mapPin', { size: 14 })} ${region}</span>
      ${count ? `<span class="dest-card__count">${icon('ticket', { size: 14 })} <span class="num">${number(count)}</span> ${escapeHtml(t('destinations.trips'))}</span>` : ''}
    </span>
  </a>`;
}

/* --------------------------- testimonial card ------------------------ */
export function testimonialCard(item, { reveal = true } = {}) {
  const text = escapeHtml(bilingual(item.textAr, item.textEn) || '');
  const name = escapeHtml(item.name);
  const city = escapeHtml(bilingual(item.cityAr, item.cityEn));
  const initial = escapeHtml((item.name || '?').trim().charAt(0));
  const pkgTitle = item.packageTitleAr || item.packageTitleEn ? escapeHtml(bilingual(item.packageTitleAr, item.packageTitleEn)) : '';

  return `
  <figure class="testimonial ${reveal ? 'reveal' : ''}">
    <div class="stars" aria-label="${escapeHtml(t('common.rating'))} ${item.rating}/5">${Array.from({ length: 5 }, (_, i) => icon('star', { size: 15, filled: i < item.rating })).join('')}</div>
    <blockquote class="testimonial__quote">${text}</blockquote>
    <figcaption class="testimonial__person">
      <span class="avatar" aria-hidden="true">${initial}</span>
      <span>
        <span class="testimonial__name">${name}</span>
        <span class="testimonial__meta">${city}${pkgTitle ? ` · ${pkgTitle}` : ''}</span>
      </span>
    </figcaption>
  </figure>`;
}

/* ------------------------------ FAQ item ----------------------------- */
export function faqItem(faq, index) {
  const id = `faq-panel-${faq.id ?? index}`;
  const triggerId = `faq-trigger-${faq.id ?? index}`;
  return `
  <div class="accordion__item reveal">
    <h3>
      <button class="accordion__trigger" id="${triggerId}" type="button" aria-expanded="false" aria-controls="${id}">
        <span>${escapeHtml(bilingual(faq.questionAr, faq.questionEn))}</span>
        <span class="accordion__icon">${icon('plus', { size: 16 })}</span>
      </button>
    </h3>
    <div class="accordion__panel" id="${id}" role="region" aria-labelledby="${triggerId}">
      <div><p class="accordion__answer">${escapeHtml(bilingual(faq.answerAr, faq.answerEn))}</p></div>
    </div>
  </div>`;
}

/* ------------------------------ empty state -------------------------- */
export function emptyState(message, hint = '') {
  return `
  <div class="empty-state reveal">
    ${icon('search', { size: 58 })}
    <p class="empty-state__title">${escapeHtml(message)}</p>
    ${hint ? `<p>${escapeHtml(hint)}</p>` : ''}
  </div>`;
}

/* ------------------------------ skeletons ---------------------------- */
export function skeletonTripCards(count = 3) {
  return Array.from({ length: count }, () => '<div class="skeleton skeleton--card reveal is-visible"></div>').join('');
}

export function skeletonDestCards(count = 4) {
  return Array.from({ length: count }, () => '<div class="skeleton skeleton--card reveal is-visible"></div>').join('');
}

/* --------------------------- misc formatting ------------------------- */
export { isAr };
