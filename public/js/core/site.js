/* ---------------------------------------------------------------------
   Site info (contact details, socials, settings) — fetched once per
   page load from /api/content/site and injected into [data-site] nodes.
   --------------------------------------------------------------------- */
import { api } from './api.js';
import { bilingual, getLang, onChange } from './i18n.js';

let cache = null;
let inflight = null;

export function getCachedSite() {
  return cache;
}

export async function loadSite() {
  if (cache) return cache;
  if (!inflight) {
    inflight = api
      .get('/content/site')
      .then((data) => {
        cache = data.site;
        return cache;
      })
      .catch((err) => {
        inflight = null;
        throw err;
      });
  }
  return inflight;
}

function resolve(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

export function applySiteInfo(site = cache) {
  if (!site) return;

  document.querySelectorAll('[data-site]').forEach((el) => {
    const value = resolve(site, el.dataset.site);
    if (value === undefined || value === null) return;
    el.textContent = typeof value === 'object' ? bilingual(value.ar, value.en) : String(value);
  });

  document.querySelectorAll('[data-site-href]').forEach((el) => {
    const kind = el.dataset.siteHref;
    if (kind === 'tel') el.href = `tel:${String(site.phoneHref || site.phone || '').replace(/[^\d+]/g, '')}`;
    if (kind === 'mailto') el.href = `mailto:${site.email || ''}`;
    if (kind === 'mailto-bookings') el.href = `mailto:${site.bookingsEmail || site.email || ''}`;
    if (kind === 'whatsapp') {
      const digits = String(site.whatsapp || '').replace(/\D/g, '');
      el.href = digits ? `https://wa.me/${digits}` : 'https://wa.me/';
      el.target = '_blank';
      el.rel = 'noopener noreferrer';
    }
  });

  document.querySelectorAll('[data-social]').forEach((el) => {
    const url = site.social?.[el.dataset.social];
    if (url) {
      el.href = url;
      el.target = '_blank';
      el.rel = 'noopener noreferrer';
    } else {
      el.hidden = true;
    }
  });

  // Optional announcement strip (hidden when empty).
  document.querySelectorAll('[data-announcement]').forEach((el) => {
    const text = bilingual(site.announcement?.ar, site.announcement?.en);
    if (text && text.trim()) {
      el.textContent = text;
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  });

  // Structured data keeps Google in sync with the real contact details.
  const jsonLd = document.getElementById('org-jsonld');
  if (jsonLd) {
    jsonLd.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'TravelAgency',
      name: { '@language': getLang(), '@value': bilingual(site.brand?.ar, site.brand?.en) },
      telephone: site.phone,
      email: site.email,
      address: {
        '@type': 'PostalAddress',
        streetAddress: bilingual(site.address?.ar, site.address?.en),
        addressCountry: 'SA',
      },
      areaServed: 'SA',
      priceRange: 'SAR 650 - SAR 12000',
    });
  }
}

export function initSiteInfo() {
  const refresh = () => {
    if (cache) applySiteInfo(cache);
  };
  onChange(refresh);
  return loadSite()
    .then((site) => {
      applySiteInfo(site);
      return site;
    })
    .catch(() => {
      // The site works without it — the HTML already contains the defaults.
      return null;
    });
}

export default loadSite;
