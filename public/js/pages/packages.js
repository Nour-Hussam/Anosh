import '../core/main.js';

import { api } from '../core/api.js';
import { emptyState, skeletonTripCards, tripCard } from '../core/components.js';
import { field, onChange, t } from '../core/i18n.js';
import { debounce, initReveal } from '../core/ui.js';

const PAGE_SIZE = 9;
const grid = document.getElementById('packages-grid');
const form = document.getElementById('trip-filters');
const resultsCount = document.getElementById('results-count');
const clearButton = document.getElementById('clear-filters');
const pagination = document.getElementById('pagination');
const emptyHost = document.getElementById('packages-empty');

const url = new URL(location.href);
const state = {
  q: url.searchParams.get('q') || '',
  destination: url.searchParams.get('destination') || '',
  category: url.searchParams.get('category') || '',
  sort: url.searchParams.get('sort') || 'featured',
  page: Number(url.searchParams.get('page')) || 1,
};

let destinations = [];

/* ------------------------------- filters ------------------------------ */
function renderDestinationOptions() {
  const select = form?.querySelector('#filter-destination');
  if (!select) return;
  const current = state.destination;
  select.innerHTML = `<option value="">${t('packages.allDestinations')}</option>` + destinations
    .map((d) => {
      const name = field(d, 'name');
      const value = d.slug;
      const safe = String(name).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
      return `<option value="${value}"${value === current ? ' selected' : ''}>${safe}</option>`;
    })
    .join('');
}

function syncUrl() {
  const params = new URLSearchParams();
  Object.entries(state).forEach(([key, value]) => {
    if (value && !(key === 'page' && value === 1)) params.set(key, String(value));
  });
  const qs = params.toString();
  history.replaceState(null, '', qs ? `${location.pathname}?${qs}` : location.pathname);
}

function readForm() {
  if (!form) return;
  state.q = form.querySelector('#filter-q').value.trim();
  state.destination = form.querySelector('#filter-destination').value;
  state.category = form.querySelector('#filter-category').value;
  state.sort = form.querySelector('#filter-sort').value;
}

function hasActiveFilters() {
  return Boolean(state.q || state.destination || state.category || state.sort !== 'featured');
}

/* -------------------------------- render ------------------------------ */
function renderPagination(total) {
  if (!pagination) return;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) {
    pagination.innerHTML = '';
    return;
  }

  const buttons = [];
  buttons.push(`<button type="button" data-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''} aria-label="${t('common.previous')}">${t('common.previous')}</button>`);
  for (let index = 1; index <= pages; index += 1) {
    buttons.push(
      `<button type="button" data-page="${index}" ${index === state.page ? 'aria-current="page"' : ''} class="num">${index}</button>`
    );
  }
  buttons.push(`<button type="button" data-page="${state.page + 1}" ${state.page === pages ? 'disabled' : ''} aria-label="${t('common.next')}">${t('common.next')}</button>`);
  pagination.innerHTML = buttons.join('');
}

function render(data) {
  if (!grid) return;
  grid.innerHTML = data.items.length ? data.items.map((pkg) => tripCard(pkg)).join('') : '';
  grid.setAttribute('aria-busy', 'false');

  if (emptyHost) {
    emptyHost.innerHTML = data.items.length ? '' : emptyState(t('packages.noTrips'), t('common.noResultsHint'));
  }

  if (resultsCount) {
    resultsCount.textContent =
      data.total === 1 ? t('packages.resultsCountOne') : t('packages.resultsCount', { count: data.total });
  }

  if (clearButton) clearButton.hidden = !hasActiveFilters();
  renderPagination(data.total);
  initReveal(grid);
}

async function load() {
  if (grid) {
    grid.innerHTML = skeletonTripCards(6);
    grid.setAttribute('aria-busy', 'true');
  }
  syncUrl();

  const query = {
    limit: PAGE_SIZE,
    offset: (state.page - 1) * PAGE_SIZE,
    sort: state.sort,
  };
  if (state.q) query.q = state.q;
  if (state.destination) query.destination = state.destination;
  if (state.category) query.category = state.category;

  try {
    render(await api.get('/content/packages', query));
  } catch {
    if (grid) grid.innerHTML = emptyState(t('common.errorGeneric'));
    grid?.setAttribute('aria-busy', 'false');
  }
}

/* -------------------------------- events ------------------------------ */
form?.addEventListener('submit', (event) => {
  event.preventDefault();
  readForm();
  state.page = 1;
  load();
});

form?.querySelector('#filter-q')?.addEventListener(
  'input',
  debounce(() => {
    readForm();
    state.page = 1;
    load();
  }, 400)
);

['#filter-destination', '#filter-category', '#filter-sort'].forEach((selector) => {
  form?.querySelector(selector)?.addEventListener('change', () => {
    readForm();
    state.page = 1;
    load();
  });
});

clearButton?.addEventListener('click', () => {
  state.q = '';
  state.destination = '';
  state.category = '';
  state.sort = 'featured';
  state.page = 1;
  if (form) form.reset();
  load();
});

pagination?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-page]');
  if (!button || button.disabled) return;
  state.page = Number(button.dataset.page) || 1;
  load();
  window.scrollTo({ top: grid.offsetTop - 120, behavior: 'smooth' });
});

/* ------------------------------- bootstrap ---------------------------- */
async function init() {
  try {
    const data = await api.get('/content/destinations');
    destinations = data.items || [];
  } catch {
    destinations = [];
  }
  renderDestinationOptions();
  if (form) {
    form.querySelector('#filter-q').value = state.q;
    form.querySelector('#filter-category').value = state.category;
    form.querySelector('#filter-sort').value = state.sort;
  }
  await load();
}

init();
onChange(() => {
  renderDestinationOptions();
  load();
});
