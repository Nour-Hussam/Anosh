import '../core/main.js';

import { api } from '../core/api.js';
import { destinationCard, emptyState, skeletonDestCards } from '../core/components.js';
import { field, getLang, onChange, t } from '../core/i18n.js';
import { initReveal } from '../core/ui.js';

const grid = document.getElementById('destinations-grid');
const filters = document.getElementById('destination-filters');
let destinations = [];
let activeRegion = '';

function regions() {
  const seen = new Map();
  destinations.forEach((d) => {
    const key = getLang() === 'ar' ? d.regionAr : d.regionEn;
    if (key && !seen.has(key)) seen.set(key, key);
  });
  return [...seen.keys()];
}

function renderFilters() {
  if (!filters) return;
  const items = [
    `<button type="button" class="chip" data-region="" aria-pressed="${activeRegion === ''}">${t('common.all')}</button>`,
    ...regions().map(
      (region) =>
        `<button type="button" class="chip" data-region="${region.replace(/"/g, '&quot;')}" aria-pressed="${activeRegion === region}">${region.replace(/</g, '&lt;')}</button>`
    ),
  ];
  filters.innerHTML = items.join('');
}

function render() {
  if (!grid) return;
  const visible = activeRegion
    ? destinations.filter((d) => (getLang() === 'ar' ? d.regionAr : d.regionEn) === activeRegion)
    : destinations;

  grid.innerHTML = visible.length
    ? visible.map((d) => destinationCard(d)).join('')
    : emptyState(t('destinations.empty'));
  grid.setAttribute('aria-busy', 'false');
  renderFilters();
  initReveal(grid);
}

filters?.addEventListener('click', (event) => {
  const chip = event.target.closest('[data-region]');
  if (!chip) return;
  activeRegion = chip.dataset.region;
  render();
});

async function load() {
  if (grid) grid.innerHTML = skeletonDestCards(8);
  try {
    const data = await api.get('/content/destinations');
    destinations = data.items || [];
  } catch {
    destinations = [];
    if (grid) grid.innerHTML = emptyState(t('common.errorGeneric'));
  }
  render();
}

load();
onChange(render);
