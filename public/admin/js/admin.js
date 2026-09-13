/* ---------------------------------------------------------------------
   Kingdom Journeys — admin console (single-page app).
   Vanilla ES modules, hash routing, no build step.
   Every mutation goes through the CSRF-protected JSON API.
--------------------------------------------------------------------- */
import { api } from '../../js/core/api.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  user: null,
  view: 'dashboard',
  forcedPasswordChange: false,
};

/* ------------------------------ tiny helpers ----------------------------- */

/** Named form access that works everywhere (jsdom lacks form.<name>). */
function field(form, name) {
  return form.elements?.namedItem(name) || form.querySelector(`[name="${name}"]`);
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function money(value) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0));
}

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

function toast(message, type = 'success') {
  const el = $('#admin-toast');
  el.textContent = message;
  el.className = `admin-toast${type === 'error' ? ' admin-toast--error' : ''}`;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 3600);
}

function setAlerts(host, type, message) {
  if (!host) return;
  host.innerHTML = message ? `<div class="admin-alert admin-alert--${type}">${esc(message)}</div>` : '';
}

function errorText(err) {
  if (!err) return 'Something went wrong.';
  if (err.code === 'validation_failed' && Array.isArray(err.details) && err.details.length) {
    return err.details.map((d) => `${d.field}: ${d.message}`).join(' · ');
  }
  if (err.message && err.message !== 'Request failed') return err.message;
  if (err.status === 401) return 'Your session expired — please sign in again.';
  if (err.status === 403) return 'You do not have permission to do that.';
  return 'Something went wrong.';
}

/** Reads a form into a flat object; `x__ar`/`x__en` become {ar,en} and
    `x__list_ar`/`x__list_en` become {ar:[],en:[]} (one entry per line). */
function readForm(form) {
  const out = {};
  $$('input, select, textarea', form).forEach((input) => {
    if (!input.name) return;
    let value;
    if (input.type === 'checkbox') value = input.checked;
    else if (input.type === 'number') value = input.value === '' ? '' : Number(input.value);
    else value = input.value;

    const list = input.name.match(/^(.+)__list_(ar|en)$/);
    if (list) {
      const [, key, lang] = list;
      out[key] = out[key] || { ar: [], en: [] };
      out[key][lang] = String(value)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      return;
    }
    const nested = input.name.match(/^(.+)__([a-z]+)$/);
    if (nested) {
      const [, key, sub] = nested;
      out[key] = out[key] || {};
      out[key][sub] = value;
      return;
    }
    out[input.name] = value;
  });
  return out;
}

function biField(label, key, value = { ar: '', en: '' }, opts = {}) {
  const ar = esc(value?.ar ?? '');
  const en = esc(value?.en ?? '');
  if (opts.textarea) {
    return `
      <label class="admin-field"><span>${esc(label)} — AR${opts.required ? ' *' : ''}</span><textarea name="${key}__ar">${ar}</textarea></label>
      <label class="admin-field"><span>${esc(label)} — EN${opts.required ? ' *' : ''}</span><textarea name="${key}__en">${en}</textarea></label>`;
  }
  return `
    <label class="admin-field"><span>${esc(label)} — AR${opts.required ? ' *' : ''}</span><input name="${key}__ar" type="text" value="${ar}" /></label>
    <label class="admin-field"><span>${esc(label)} — EN${opts.required ? ' *' : ''}</span><input name="${key}__en" type="text" value="${en}" /></label>`;
}

function listField(label, key, value = { ar: [], en: [] }) {
  return `
    <label class="admin-field"><span>${esc(label)} — AR (one per line)</span><textarea name="${key}__list_ar">${esc((value?.ar || []).join('\n'))}</textarea></label>
    <label class="admin-field"><span>${esc(label)} — EN (one per line)</span><textarea name="${key}__list_en">${esc((value?.en || []).join('\n'))}</textarea></label>`;
}

function numField(label, name, value, { step = 1, min = 0, max = 999999 } = {}) {
  return `<label class="admin-field"><span>${esc(label)}</span><input name="${name}" type="number" step="${step}" min="${min}" max="${max}" value="${esc(value ?? '')}" /></label>`;
}

function textField(label, name, value, { type = 'text', hint = '' } = {}) {
  return `<label class="admin-field"><span>${esc(label)}</span><input name="${name}" type="${type}" value="${esc(value ?? '')}" />${hint ? `<small class="admin-hint">${esc(hint)}</small>` : ''}</label>`;
}

function checkField(label, name, checked) {
  return `<label class="admin-check"><input name="${name}" type="checkbox" ${checked ? 'checked' : ''} /><span>${esc(label)}</span></label>`;
}

function selectField(label, name, options, value) {
  return `<label class="admin-field"><span>${esc(label)}</span><select name="${name}">${options
    .map(([val, text]) => `<option value="${esc(val)}" ${String(val) === String(value) ? 'selected' : ''}>${esc(text)}</option>`)
    .join('')}</select></label>`;
}

/** Server responses are flat (titleAr/titleEn); forms & schemas are nested. */
function bi(obj, base) {
  return { ar: obj?.[`${base}Ar`] ?? '', en: obj?.[`${base}En`] ?? '' };
}

function pill(value) {
  return `<span class="pill pill--${esc(String(value).toLowerCase())}">${esc(value)}</span>`;
}

/* --------------------------------- drawer -------------------------------- */

function closeDrawer() {
  $$('.admin-drawer, .admin-drawer__scrim').forEach((node) => node.remove());
}

function openDrawer(title, html) {
  closeDrawer();
  const scrim = document.createElement('div');
  scrim.className = 'admin-drawer__scrim';
  scrim.addEventListener('click', closeDrawer);
  const drawer = document.createElement('aside');
  drawer.className = 'admin-drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');
  drawer.innerHTML = `<h3>${esc(title)}</h3>${html}`;
  document.body.append(scrim, drawer);
  return drawer;
}

/* ------------------------------- auth flows ------------------------------ */

async function refreshSession() {
  try {
    const data = await api.get('/admin/session');
    state.user = data.user;
    return data.user;
  } catch {
    state.user = null;
    return null;
  }
}

function showLogin() {
  $('#app-view').hidden = true;
  $('#login-view').hidden = false;
  $('#login-form').reset();
}

function showApp() {
  $('#login-view').hidden = true;
  $('#app-view').hidden = false;
  $('#whoami').textContent = `${state.user.name} · ${state.user.email}`;
  $('#side-role').textContent = state.user.role;
  renderNav();
  navigate(location.hash.slice(2) || 'dashboard');
}

async function boot() {
  const user = await refreshSession();
  if (!user) return showLogin();
  state.forcedPasswordChange = Boolean(user.mustChangePassword);
  showApp();
  if (state.forcedPasswordChange) openPasswordModal(true);
  return null;
}

function openPasswordModal(forced = false) {
  $('#pw-modal').hidden = false;
  $('#pw-reason').hidden = !forced;
  $('#pw-cancel').hidden = forced;
  $('#pw-form').reset();
  setAlerts($('#pw-alerts'), 'info', '');
}

async function initAuth() {
  $('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const button = $('button[type="submit"]', form);
    button.disabled = true;
    setAlerts($('#login-alerts'), 'info', '');
    try {
      const data = await api.post('/admin/login', {
        email: field(form, 'email').value.trim(),
        password: field(form, 'password').value,
        remember: field(form, 'remember').checked,
      });
      state.user = data.user;
      state.forcedPasswordChange = Boolean(data.user.mustChangePassword);
      showApp();
      toast(`Welcome back, ${data.user.name}`);
      if (state.forcedPasswordChange) openPasswordModal(true);
    } catch (err) {
      setAlerts($('#login-alerts'), 'error', errorText(err));
    } finally {
      button.disabled = false;
    }
  });

  $('#btn-logout').addEventListener('click', async () => {
    try { await api.post('/admin/logout', {}); } catch { /* ignore */ }
    state.user = null;
    showLogin();
  });

  $('#btn-change-password').addEventListener('click', () => openPasswordModal(false));
  $('#pw-cancel').addEventListener('click', () => { $('#pw-modal').hidden = true; });

  $('#pw-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const button = $('button[type="submit"]', form);
    button.disabled = true;
    try {
      await api.post('/admin/change-password', {
        currentPassword: field(form, 'currentPassword').value,
        newPassword: field(form, 'newPassword').value,
      });
      $('#pw-modal').hidden = true;
      state.forcedPasswordChange = false;
      toast('Password updated — other devices were signed out.');
    } catch (err) {
      setAlerts($('#pw-alerts'), 'error', errorText(err));
    } finally {
      button.disabled = false;
    }
  });
}

/* ------------------------------- navigation ------------------------------ */

const VIEWS = [
  ['dashboard', 'Dashboard', '▦'],
  ['bookings', 'Bookings', '🧳'],
  ['messages', 'Messages', '✉️'],
  ['subscribers', 'Newsletter', '👥'],
  ['packages', 'Trips & packages', '🗺️'],
  ['destinations', 'Destinations', '📍'],
  ['testimonials', 'Reviews', '⭐'],
  ['faqs', 'FAQs', '❓'],
  ['settings', 'Site settings', '⚙️'],
  ['audit', 'Audit log', '🕘'],
];

function renderNav() {
  const nav = $('#admin-nav');
  nav.innerHTML = VIEWS.map(
    ([id, label, ico]) => `<button type="button" data-view="${id}" class="${state.view === id ? 'is-active' : ''}"><span class="nav-ico">${ico}</span>${esc(label)}</button>`
  ).join('');
  $$('button', nav).forEach((btn) => btn.addEventListener('click', () => { location.hash = `#/${btn.dataset.view}`; }));
}

function navigate(view) {
  if (!VIEWS.some(([id]) => id === view)) view = 'dashboard';
  state.view = view;
  renderNav();
  $('#view-title').textContent = VIEWS.find(([id]) => id === view)[1];
  const root = $('#view-root');
  root.innerHTML = '<div class="admin-empty">Loading…</div>';
  RENDERERS[view](root).catch((err) => {
    if (err?.status === 401) { showLogin(); return; }
    root.innerHTML = `<div class="admin-alert admin-alert--error">${esc(errorText(err))}</div>`;
  });
}

/* ------------------------------- dashboard ------------------------------- */

async function renderDashboard(root) {
  const [{ stats }, { items: recent }] = await Promise.all([
    api.get('/admin/dashboard'),
    api.get('/admin/bookings', { limit: 6, offset: 0 }),
  ]);

  root.innerHTML = `
    <div class="admin-stats">
      <div class="admin-stat"><b>${money(stats.bookings.total)}</b><span>Total bookings</span></div>
      <div class="admin-stat admin-stat--info"><b>${money(stats.bookings.new)}</b><span>Awaiting first contact</span></div>
      <div class="admin-stat"><b>${money(stats.bookings.confirmed)}</b><span>Confirmed trips</span></div>
      <div class="admin-stat admin-stat--gold"><b>${money(stats.bookings.revenue)}</b><span>Confirmed value (SAR)</span></div>
      <div class="admin-stat admin-stat--warn"><b>${money(stats.bookings.last30d)}</b><span>Bookings · last 30 days</span></div>
      <div class="admin-stat admin-stat--info"><b>${money(stats.messages.unread)}</b><span>Unread messages</span></div>
      <div class="admin-stat"><b>${money(stats.subscribers.total)}</b><span>Newsletter subscribers</span></div>
      <div class="admin-stat"><b>${money(stats.content.packages)} / ${money(stats.content.destinations)}</b><span>Live trips / destinations</span></div>
    </div>

    <section class="admin-card">
      <div class="admin-card__head">
        <h3>Latest booking requests</h3>
        <div class="admin-actions"><button class="btn btn--ghost btn--small" type="button" data-goto="bookings">Open bookings</button></div>
      </div>
      <div class="admin-tablewrap">
        <table class="admin-table">
          <thead><tr><th>Reference</th><th>Guest</th><th>Trip</th><th>Travelers</th><th>Total (SAR)</th><th>Status</th><th>Received</th></tr></thead>
          <tbody>
            ${recent.map((b) => `
              <tr>
                <td class="mono">${esc(b.reference)}</td>
                <td>${esc(b.fullName)}<div class="sub">${esc(b.email)}</div></td>
                <td>${esc(b.packageTitleEn || b.packageTitleAr || 'Custom trip')}</td>
                <td>${esc(b.travelers)}</td>
                <td>${money(b.totalSar)}</td>
                <td>${pill(b.status)}</td>
                <td class="sub">${fmtDate(b.createdAt)}</td>
              </tr>`).join('') || '<tr><td colspan="7"><div class="admin-empty">No bookings yet.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </section>`;
  $('[data-goto="bookings"]', root).addEventListener('click', () => { location.hash = '#/bookings'; });
}

/* -------------------------------- bookings ------------------------------- */

const BOOKING_STATUSES = ['new', 'contacted', 'confirmed', 'cancelled', 'completed'];

async function renderBookings(root) {
  const filters = { status: '', q: '', offset: 0, limit: 25 };

  root.innerHTML = `
    <div class="admin-toolbar">
      <input type="search" id="bk-q" placeholder="Search name, email, reference…" />
      <select id="bk-status">
        <option value="">All statuses</option>
        ${BOOKING_STATUSES.map((s) => `<option value="${s}">${s}</option>`).join('')}
      </select>
      <select id="bk-sort">
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="value">Highest value</option>
      </select>
      <span class="admin-actions">
        <a class="btn btn--ghost btn--small" href="/api/admin/export.csv?entity=bookings">Export CSV</a>
      </span>
    </div>
    <div class="admin-tablewrap">
      <table class="admin-table">
        <thead><tr><th>Reference</th><th>Guest</th><th>Trip</th><th>Date</th><th>Travelers</th><th>Total (SAR)</th><th>Status</th><th>Received</th></tr></thead>
        <tbody id="bk-body"></tbody>
      </table>
    </div>
    <div class="admin-pager">
      <button class="btn btn--ghost btn--small" id="bk-prev" type="button">← Prev</button>
      <span id="bk-count"></span>
      <button class="btn btn--ghost btn--small" id="bk-next" type="button">Next →</button>
    </div>`;

  const body = $('#bk-body', root);
  let lastItems = [];

  async function load() {
    const params = { limit: filters.limit, offset: filters.offset, sort: $('#bk-sort', root).value };
    if (filters.status) params.status = filters.status;
    if (filters.q) params.q = filters.q;
    const { items, total } = await api.get('/admin/bookings', params);
    lastItems = items;
    $('#bk-count', root).textContent = `${filters.offset + 1}–${filters.offset + items.length} of ${total}`;
    $('#bk-prev', root).disabled = filters.offset === 0;
    $('#bk-next', root).disabled = filters.offset + filters.limit >= total;
    body.innerHTML = items.map((b) => `
      <tr class="is-clickable" data-id="${b.id}">
        <td class="mono">${esc(b.reference)}</td>
        <td>${esc(b.fullName)}<div class="sub">${esc(b.email)}</div></td>
        <td>${esc(b.packageTitleEn || b.packageTitleAr || 'Custom trip')}</td>
        <td class="sub">${esc(b.travelDate || '—')}</td>
        <td>${esc(b.travelers)} <span class="sub">(${esc(b.adults)}A ${esc(b.children)}C)</span></td>
        <td>${money(b.totalSar)}</td>
        <td>${pill(b.status)}</td>
        <td class="sub">${fmtDate(b.createdAt)}</td>
      </tr>`).join('') || '<tr><td colspan="8"><div class="admin-empty">Nothing matches these filters.</div></td></tr>';
    $$('tr[data-id]', body).forEach((tr) => tr.addEventListener('click', () => openBooking(Number(tr.dataset.id))));
  }

  function openBooking(id) {
    const b = lastItems.find((item) => item.id === id);
    if (!b) return toast('Booking not found in the current list.', 'error');

    const drawer = openDrawer(`Booking ${b.reference}`, `
      <dl class="admin-kv">
        <dt>Guest</dt><dd>${esc(b.fullName)}</dd>
        <dt>Email</dt><dd><a href="mailto:${esc(b.email)}">${esc(b.email)}</a></dd>
        <dt>Phone</dt><dd>${esc(b.phone || '—')} <span class="sub">(prefers ${esc(b.preferredContact)})</span></dd>
        <dt>Country</dt><dd>${esc(b.country || '—')}</dd>
        <dt>Trip</dt><dd>${esc(b.packageTitleEn || b.packageTitleAr || 'Custom trip')}</dd>
        <dt>Travel date</dt><dd>${esc(b.travelDate || '—')}</dd>
        <dt>Travelers</dt><dd>${esc(b.adults)} adults, ${esc(b.children)} children</dd>
        <dt>Quoted total</dt><dd>${money(b.totalSar)} SAR</dd>
        <dt>Received</dt><dd>${fmtDate(b.createdAt)}</dd>
        <dt>Language</dt><dd>${esc(b.lang)}</dd>
      </dl>
      ${b.notes ? `<div><p class="admin-section-title">Guest notes</p><div class="admin-card">${esc(b.notes)}</div></div>` : ''}
      <p class="admin-section-title">Update</p>
      <form id="bk-status-form" class="admin-formgrid">
        <div class="admin-grid">
          ${selectField('Status', 'status', BOOKING_STATUSES.map((s) => [s, s]), b.status)}
          <div class="admin-actions"><button class="btn btn--primary btn--small" type="submit">Save status</button></div>
        </div>
        <label class="admin-field"><span>Internal notes (not visible to the guest)</span><textarea name="adminNotes">${esc(b.adminNotes || '')}</textarea></label>
        <div class="admin-actions"><button class="btn btn--ghost btn--small" type="submit">Save notes</button></div>
      </form>
      <div class="admin-actions">
        <button class="btn btn--danger btn--small" id="bk-delete" type="button">Delete booking</button>
      </div>`);

    $('#bk-status-form', drawer).addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = readForm(event.target);
      try {
        await api.patch(`/admin/bookings/${b.id}`, { status: data.status, adminNotes: data.adminNotes });
        toast('Booking updated.');
        closeDrawer();
        load();
      } catch (err) { toast(errorText(err), 'error'); }
    });

    $('#bk-delete', drawer).addEventListener('click', async () => {
      if (!window.confirm(`Delete booking ${b.reference} permanently?`)) return;
      try {
        await api.delete(`/admin/bookings/${b.id}`);
        toast('Booking deleted.');
        closeDrawer();
        load();
      } catch (err) { toast(errorText(err), 'error'); }
    });
  }

  let searchTimer;
  $('#bk-q', root).addEventListener('input', (event) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { filters.q = event.target.value.trim(); filters.offset = 0; load().catch((err) => toast(errorText(err), 'error')); }, 350);
  });
  $('#bk-status', root).addEventListener('change', (event) => { filters.status = event.target.value; filters.offset = 0; load(); });
  $('#bk-sort', root).addEventListener('change', () => load());
  $('#bk-prev', root).addEventListener('click', () => { filters.offset = Math.max(0, filters.offset - filters.limit); load(); });
  $('#bk-next', root).addEventListener('click', () => { filters.offset += filters.limit; load(); });

  await load();
}

/* -------------------------------- messages ------------------------------- */

const MESSAGE_STATUSES = ['new', 'read', 'replied', 'archived', 'spam'];

async function renderMessages(root) {
  const filters = { status: '', offset: 0, limit: 25 };

  root.innerHTML = `
    <div class="admin-toolbar">
      <select id="ms-status">
        <option value="">All statuses</option>
        ${MESSAGE_STATUSES.map((s) => `<option value="${s}">${s}</option>`).join('')}
      </select>
      <span class="admin-actions"><a class="btn btn--ghost btn--small" href="/api/admin/export.csv?entity=messages">Export CSV</a></span>
    </div>
    <div class="admin-tablewrap">
      <table class="admin-table">
        <thead><tr><th>From</th><th>Topic / subject</th><th>Message</th><th>Status</th><th>Received</th><th></th></tr></thead>
        <tbody id="ms-body"></tbody>
      </table>
    </div>
    <div class="admin-pager">
      <button class="btn btn--ghost btn--small" id="ms-prev" type="button">← Prev</button>
      <span id="ms-count"></span>
      <button class="btn btn--ghost btn--small" id="ms-next" type="button">Next →</button>
    </div>`;

  const body = $('#ms-body', root);

  async function load() {
    const params = { limit: filters.limit, offset: filters.offset };
    if (filters.status) params.status = filters.status;
    const { items, total } = await api.get('/admin/messages', params);
    $('#ms-count', root).textContent = `${items.length ? filters.offset + 1 : 0}–${filters.offset + items.length} of ${total}`;
    $('#ms-prev', root).disabled = filters.offset === 0;
    $('#ms-next', root).disabled = filters.offset + filters.limit >= total;
    body.innerHTML = items.map((m) => `
      <tr class="is-clickable" data-id="${m.id}">
        <td>${esc(m.name)}<div class="sub">${esc(m.email)}</div></td>
        <td>${esc(m.topic)}<div class="sub">${esc(m.subject || '—')}</div></td>
        <td class="sub">${esc(String(m.body).slice(0, 90))}${String(m.body).length > 90 ? '…' : ''}</td>
        <td>${pill(m.status)}</td>
        <td class="sub">${fmtDate(m.createdAt)}</td>
        <td><button class="btn btn--ghost btn--small" data-open="${m.id}" type="button">Open</button></td>
      </tr>`).join('') || '<tr><td colspan="6"><div class="admin-empty">Inbox zero 🎉</div></td></tr>';
    $$('[data-open]', body).forEach((btn) => btn.addEventListener('click', (event) => { event.stopPropagation(); openMessage(Number(btn.dataset.open), items); }));
    $$('tr[data-id]', body).forEach((tr) => tr.addEventListener('click', () => openMessage(Number(tr.dataset.id), items)));
  }

  function openMessage(id, items) {
    const m = items.find((item) => item.id === id);
    if (!m) return;
    const drawer = openDrawer(`Message from ${m.name}`, `
      <dl class="admin-kv">
        <dt>Email</dt><dd><a href="mailto:${esc(m.email)}">${esc(m.email)}</a></dd>
        <dt>Phone</dt><dd>${esc(m.phone || '—')}</dd>
        <dt>Topic</dt><dd>${esc(m.topic)}</dd>
        <dt>Subject</dt><dd>${esc(m.subject || '—')}</dd>
        <dt>Received</dt><dd>${fmtDate(m.createdAt)}</dd>
      </dl>
      <p class="admin-section-title">Message</p>
      <div class="admin-card">${esc(m.body).replaceAll('\n', '<br />')}</div>
      <p class="admin-section-title">Set status</p>
      <div class="admin-actions">
        ${MESSAGE_STATUSES.map((s) => `<button class="btn ${s === m.status ? 'btn--primary' : 'btn--ghost'} btn--small" data-status="${s}" type="button">${s}</button>`).join('')}
      </div>
      <div class="admin-actions"><button class="btn btn--danger btn--small" id="ms-delete" type="button">Delete message</button></div>`);

    $$('[data-status]', drawer).forEach((btn) => btn.addEventListener('click', async () => {
      try {
        await api.patch(`/admin/messages/${m.id}`, { status: btn.dataset.status });
        toast(`Marked as ${btn.dataset.status}.`);
        closeDrawer();
        load();
      } catch (err) { toast(errorText(err), 'error'); }
    }));
    $('#ms-delete', drawer).addEventListener('click', async () => {
      if (!window.confirm('Delete this message permanently?')) return;
      try {
        await api.delete(`/admin/messages/${m.id}`);
        toast('Message deleted.');
        closeDrawer();
        load();
      } catch (err) { toast(errorText(err), 'error'); }
    });

    if (m.status === 'new') {
      api.patch(`/admin/messages/${m.id}`, { status: 'read' }).catch(() => {});
    }
  }

  $('#ms-status', root).addEventListener('change', (event) => { filters.status = event.target.value; filters.offset = 0; load(); });
  $('#ms-prev', root).addEventListener('click', () => { filters.offset = Math.max(0, filters.offset - filters.limit); load(); });
  $('#ms-next', root).addEventListener('click', () => { filters.offset += filters.limit; load(); });

  await load();
}

/* ------------------------------- subscribers ----------------------------- */

async function renderSubscribers(root) {
  const filters = { offset: 0, limit: 25 };
  root.innerHTML = `
    <div class="admin-toolbar">
      <span class="admin-hint">Subscribers confirmed via the public newsletter form.</span>
      <span class="admin-actions"><a class="btn btn--ghost btn--small" href="/api/admin/export.csv?entity=subscribers">Export CSV</a></span>
    </div>
    <div class="admin-tablewrap">
      <table class="admin-table">
        <thead><tr><th>Email</th><th>Language</th><th>Subscribed</th><th>Status</th><th></th></tr></thead>
        <tbody id="sb-body"></tbody>
      </table>
    </div>
    <div class="admin-pager">
      <button class="btn btn--ghost btn--small" id="sb-prev" type="button">← Prev</button>
      <span id="sb-count"></span>
      <button class="btn btn--ghost btn--small" id="sb-next" type="button">Next →</button>
    </div>`;

  const body = $('#sb-body', root);
  async function load() {
    const { items, total } = await api.get('/admin/subscribers', filters);
    $('#sb-count', root).textContent = `${items.length ? filters.offset + 1 : 0}–${filters.offset + items.length} of ${total}`;
    $('#sb-prev', root).disabled = filters.offset === 0;
    $('#sb-next', root).disabled = filters.offset + filters.limit >= total;
    body.innerHTML = items.map((s) => `
      <tr>
        <td>${esc(s.email)}</td>
        <td>${esc(s.lang)}</td>
        <td class="sub">${fmtDate(s.createdAt)}</td>
        <td>${pill(s.active ? 'active' : 'inactive')}</td>
        <td><button class="btn btn--danger btn--small" data-remove="${s.id}" type="button">Remove</button></td>
      </tr>`).join('') || '<tr><td colspan="5"><div class="admin-empty">No subscribers yet.</div></td></tr>';
    $$('[data-remove]', body).forEach((btn) => btn.addEventListener('click', async () => {
      if (!window.confirm('Remove this subscriber?')) return;
      try {
        await api.delete(`/admin/subscribers/${btn.dataset.remove}`);
        toast('Subscriber removed.');
        load();
      } catch (err) { toast(errorText(err), 'error'); }
    }));
  }

  $('#sb-prev', root).addEventListener('click', () => { filters.offset = Math.max(0, filters.offset - filters.limit); load(); });
  $('#sb-next', root).addEventListener('click', () => { filters.offset += filters.limit; load(); });
  await load();
}

/* -------------------------------- packages ------------------------------- */

const DIFFICULTIES = ['easy', 'moderate', 'active'];
const CATEGORIES = ['guided', 'family', 'adventure', 'luxury', 'honeymoon', 'umrah-plus'];

async function renderPackages(root) {
  root.innerHTML = `
    <div class="admin-toolbar">
      <span class="admin-hint">Trips shown on the public site respect the “active” and “featured” flags.</span>
      <span class="admin-actions"><button class="btn btn--primary btn--small" id="pk-new" type="button">+ New trip</button></span>
    </div>
    <div class="admin-tablewrap">
      <table class="admin-table">
        <thead><tr><th>Trip</th><th>Destination</th><th>Days</th><th>Price (SAR)</th><th>Category</th><th>Flags</th><th></th></tr></thead>
        <tbody id="pk-body"></tbody>
      </table>
    </div>`;

  let destinations = [];
  async function load() {
    const [{ items }, dest] = await Promise.all([
      api.get('/admin/packages', { limit: 100, offset: 0 }),
      destinations.length ? Promise.resolve({ items: destinations }) : api.get('/admin/destinations'),
    ]);
    destinations = dest.items;
    const destByid = new Map(destinations.map((d) => [d.id, d]));
    $('#pk-body', root).innerHTML = items.map((p) => `
      <tr>
        <td><strong>${esc(p.titleEn || p.titleAr)}</strong><div class="sub admin-bidi-ar">${esc(p.titleAr)}</div><div class="sub mono">/trip/${esc(p.slug)}</div></td>
        <td>${esc(p.destinationId ? (destByid.get(p.destinationId)?.name?.en ?? '—') : '—')}</td>
        <td>${esc(p.days)}d / ${esc(p.nights)}n</td>
        <td>${money(p.priceSar)}${p.oldPriceSar ? `<div class="sub"><s>${money(p.oldPriceSar)}</s></div>` : ''}</td>
        <td>${pill(p.category)}</td>
        <td>${p.featured ? pill('featured') : ''} ${p.active ? pill('active') : pill('inactive')}</td>
        <td>
          <div class="admin-actions">
            <button class="btn btn--ghost btn--small" data-edit="${esc(p.slug)}" type="button">Edit</button>
            <button class="btn btn--danger btn--small" data-del="${p.id}" type="button">Delete</button>
          </div>
        </td>
      </tr>`).join('') || '<tr><td colspan="7"><div class="admin-empty">No trips yet.</div></td></tr>';

    $$('[data-edit]', root).forEach((btn) => btn.addEventListener('click', () => editor(btn.dataset.edit)));
    $$('[data-del]', root).forEach((btn) => btn.addEventListener('click', async () => {
      if (!window.confirm('Delete this trip? Bookings keep their snapshot.')) return;
      try {
        await api.delete(`/admin/packages/${btn.dataset.del}`);
        toast('Trip deleted.');
        load();
      } catch (err) { toast(errorText(err), 'error'); }
    }));
  }

  async function editor(slug) {
    let pkg = null;
    if (slug) {
      try { pkg = (await api.get(`/admin/packages/${slug}`)).package; }
      catch (err) { return toast(errorText(err), 'error'); }
    }
    const p = pkg || {};
    const f = {
      title: bi(p, 'title'),
      summary: bi(p, 'summary'),
      region: bi(p, 'region'),
      description: bi(p, 'description'),
      highlights: p.highlights || { ar: [], en: [] },
      includes: p.includes || { ar: [], en: [] },
      excludes: p.excludes || { ar: [], en: [] },
    };
    const drawer = openDrawer(pkg ? `Edit — ${pkg.titleEn || pkg.titleAr}` : 'New trip', `
      <form id="pk-form" class="admin-formgrid">
        <div id="pk-alerts" class="admin-alerts"></div>
        ${biField('Title', 'title', f.title, { required: true })}
        ${biField('Short summary', 'summary', f.summary)}
        ${biField('Region', 'region', f.region)}
        <div class="admin-grid">
          ${numField('Days', 'days', p.days ?? 1, { min: 1, max: 60 })}
          ${numField('Nights', 'nights', p.nights ?? 0, { min: 0, max: 60 })}
          ${numField('Price (SAR)', 'priceSar', p.priceSar ?? 0)}
          ${numField('Old price (SAR, optional)', 'oldPriceSar', p.oldPriceSar ?? '')}
          ${numField('Max group size', 'groupSize', p.groupSize ?? 12, { min: 1, max: 200 })}
          ${numField('Sort order', 'sortOrder', p.sortOrder ?? 0)}
          ${numField('Rating (0–5)', 'rating', p.rating ?? 0, { step: 0.1, max: 5 })}
          ${numField('Review count', 'reviewsCount', p.reviewsCount ?? 0)}
        </div>
        <div class="admin-grid">
          ${selectField('Difficulty', 'difficulty', DIFFICULTIES.map((d) => [d, d]), p.difficulty || 'easy')}
          ${selectField('Category', 'category', CATEGORIES.map((c) => [c, c]), p.category || 'guided')}
        </div>
        ${textField('Destination slug', 'destinationSlug', p.destinationSlug || '', { hint: 'e.g. alula — leave empty for none' })}
        ${textField('Cover image path', 'image', p.image || '', { hint: 'e.g. /images/alula.jpg' })}
        ${textField('Gallery paths (comma separated)', 'gallery', (p.gallery || []).join(', '))}
        ${listField('Highlights', 'highlights', f.highlights)}
        ${listField('Included', 'includes', f.includes)}
        ${listField('Not included', 'excludes', f.excludes)}
        ${biField('Full description', 'description', f.description, { textarea: true })}
        <label class="admin-field"><span>Itinerary (JSON array of {day, titleAr, titleEn, textAr, textEn})</span>
          <textarea name="itinerary" class="mono">${esc(JSON.stringify(p.itinerary || [], null, 2))}</textarea></label>
        <div class="admin-actions">
          ${checkField('Featured on homepage', 'featured', Boolean(p.featured))}
          ${checkField('Active (visible on site)', 'active', p.active !== false)}
        </div>
        <div class="admin-actions">
          <button class="btn btn--primary" type="submit">${pkg ? 'Save changes' : 'Create trip'}</button>
          <button class="btn btn--ghost" type="button" data-cancel>Cancel</button>
        </div>
      </form>`);

    $('[data-cancel]', drawer).addEventListener('click', closeDrawer);
    $('#pk-form', drawer).addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = readForm(event.target);
      let itinerary = [];
      try {
        itinerary = data.itinerary.trim() ? JSON.parse(data.itinerary) : [];
      } catch {
        setAlerts($('#pk-alerts', drawer), 'error', 'Itinerary must be valid JSON.');
        return;
      }
      const payload = {
        title: data.title,
        summary: data.summary,
        description: data.description,
        region: data.region,
        destinationSlug: data.destinationSlug || '',
        days: Number(data.days),
        nights: Number(data.nights),
        priceSar: Number(data.priceSar),
        oldPriceSar: data.oldPriceSar === '' || data.oldPriceSar === null ? null : Number(data.oldPriceSar),
        groupSize: Number(data.groupSize),
        difficulty: data.difficulty,
        category: data.category,
        rating: Number(data.rating),
        reviewsCount: Number(data.reviewsCount),
        image: data.image || '',
        gallery: String(data.gallery || '').split(',').map((s) => s.trim()).filter(Boolean),
        highlights: data.highlights,
        includes: data.includes,
        excludes: data.excludes,
        itinerary,
        featured: Boolean(data.featured),
        active: Boolean(data.active),
        sortOrder: Number(data.sortOrder),
      };
      try {
        if (pkg) await api.put(`/admin/packages/${pkg.id}`, payload);
        else await api.post('/admin/packages', payload);
        toast(pkg ? 'Trip saved.' : 'Trip created.');
        closeDrawer();
        load();
      } catch (err) {
        setAlerts($('#pk-alerts', drawer), 'error', errorText(err));
      }
    });
  }

  $('#pk-new', root).addEventListener('click', () => editor(null));
  await load();
}

/* ------------------------------ destinations ----------------------------- */

async function renderDestinations(root) {
  root.innerHTML = `
    <div class="admin-toolbar">
      <span class="admin-hint">Destinations group trips on the public catalog.</span>
      <span class="admin-actions"><button class="btn btn--primary btn--small" id="ds-new" type="button">+ New destination</button></span>
    </div>
    <div class="admin-tablewrap">
      <table class="admin-table">
        <thead><tr><th>Destination</th><th>Region</th><th>Season</th><th>Flags</th><th></th></tr></thead>
        <tbody id="ds-body"></tbody>
      </table>
    </div>`;

  let lastItems = [];
  async function load() {
    const { items } = await api.get('/admin/destinations');
    lastItems = items;
    $('#ds-body', root).innerHTML = items.map((d) => `
      <tr>
        <td><strong>${esc(d.nameEn || d.nameAr)}</strong><div class="sub admin-bidi-ar">${esc(d.nameAr)}</div><div class="sub mono">/destination/${esc(d.slug)}</div></td>
        <td>${esc(d.regionEn || d.regionAr || '—')}</td>
        <td>${esc(d.bestSeasonEn || d.bestSeasonAr || '—')}</td>
        <td>${d.active ? pill('active') : pill('inactive')}</td>
        <td>
          <div class="admin-actions">
            <button class="btn btn--ghost btn--small" data-edit="${d.id}" type="button">Edit</button>
            <button class="btn btn--danger btn--small" data-del="${d.id}" type="button">Delete</button>
          </div>
        </td>
      </tr>`).join('') || '<tr><td colspan="5"><div class="admin-empty">No destinations yet.</div></td></tr>';

    $$('[data-edit]', root).forEach((btn) => btn.addEventListener('click', () => editor(btn.dataset.edit)));
    $$('[data-del]', root).forEach((btn) => btn.addEventListener('click', async () => {
      if (!window.confirm('Delete this destination?')) return;
      try {
        await api.delete(`/admin/destinations/${btn.dataset.del}`);
        toast('Destination deleted.');
        load();
      } catch (err) { toast(errorText(err), 'error'); }
    }));
  }

  function editor(id) {
    const dest = id ? lastItems.find((d) => String(d.id) === String(id)) : null;
    const d = dest || {};
    const f = {
      name: bi(d, 'name'),
      region: bi(d, 'region'),
      tagline: bi(d, 'tagline'),
      bestSeason: bi(d, 'bestSeason'),
      description: bi(d, 'description'),
      highlights: d.highlights || { ar: [], en: [] },
    };
    const drawer = openDrawer(dest ? `Edit — ${dest.nameEn || dest.nameAr}` : 'New destination', `
      <form id="ds-form" class="admin-formgrid">
        <div id="ds-alerts" class="admin-alerts"></div>
        ${biField('Name', 'name', f.name, { required: true })}
        ${biField('Region', 'region', f.region)}
        ${biField('Tagline', 'tagline', f.tagline)}
        ${biField('Best season', 'bestSeason', f.bestSeason)}
        ${textField('Cover image path', 'image', d.image || '')}
        ${listField('Highlights', 'highlights', f.highlights)}
        ${biField('Description', 'description', f.description, { textarea: true })}
        <div class="admin-grid">
          ${numField('Sort order', 'sortOrder', d.sortOrder ?? 0)}
          <div>${checkField('Active (visible on site)', 'active', d.active !== false)}</div>
        </div>
        <div class="admin-actions">
          <button class="btn btn--primary" type="submit">${dest ? 'Save changes' : 'Create destination'}</button>
          <button class="btn btn--ghost" type="button" data-cancel>Cancel</button>
        </div>
      </form>`);

    $('[data-cancel]', drawer).addEventListener('click', closeDrawer);
    $('#ds-form', drawer).addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = readForm(event.target);
      const payload = {
        name: data.name,
        region: data.region,
        tagline: data.tagline,
        description: data.description,
        image: data.image || '',
        bestSeason: data.bestSeason,
        highlights: data.highlights,
        active: Boolean(data.active),
        sortOrder: Number(data.sortOrder),
      };
      try {
        if (dest) await api.put(`/admin/destinations/${dest.id}`, payload);
        else await api.post('/admin/destinations', payload);
        toast(dest ? 'Destination saved.' : 'Destination created.');
        closeDrawer();
        load();
      } catch (err) { setAlerts($('#ds-alerts', drawer), 'error', errorText(err)); }
    });
  }

  $('#ds-new', root).addEventListener('click', () => editor(null));
  await load();
}

/* ------------------------------ testimonials ----------------------------- */

async function renderTestimonials(root) {
  root.innerHTML = `
    <div class="admin-toolbar">
      <span class="admin-hint">Visitor reviews submitted from the site wait here until you publish them.</span>
      <span class="admin-actions"><button class="btn btn--primary btn--small" id="ts-new" type="button">+ New review</button></span>
    </div>
    <div class="admin-tablewrap">
      <table class="admin-table">
        <thead><tr><th>Guest</th><th>Review</th><th>Rating</th><th>Trip date</th><th>Flags</th><th></th></tr></thead>
        <tbody id="ts-body"></tbody>
      </table>
    </div>`;

  let lastItems = [];
  async function load() {
    const { items } = await api.get('/admin/testimonials');
    lastItems = items;
    $('#ts-body', root).innerHTML = items.map((item) => `
      <tr>
        <td>${esc(item.name)}<div class="sub">${esc(item.cityEn || item.cityAr || '')}</div></td>
        <td class="sub">${esc(String(item.textEn || item.textAr || '').slice(0, 110))}…</td>
        <td>${'★'.repeat(item.rating || 0)}</td>
        <td class="sub">${esc(item.tripDate || '—')}</td>
        <td>${item.active ? pill('active') : pill('inactive')}</td>
        <td>
          <div class="admin-actions">
            <button class="btn btn--ghost btn--small" data-edit="${item.id}" type="button">Edit</button>
            <button class="btn btn--danger btn--small" data-del="${item.id}" type="button">Delete</button>
          </div>
        </td>
      </tr>`).join('') || '<tr><td colspan="6"><div class="admin-empty">No reviews yet.</div></td></tr>';

    $$('[data-edit]', root).forEach((btn) => btn.addEventListener('click', () => editor(btn.dataset.edit)));
    $$('[data-del]', root).forEach((btn) => btn.addEventListener('click', async () => {
      if (!window.confirm('Delete this review?')) return;
      try {
        await api.delete(`/admin/testimonials/${btn.dataset.del}`);
        toast('Review deleted.');
        load();
      } catch (err) { toast(errorText(err), 'error'); }
    }));
  }

  function editor(id) {
    const item = id ? lastItems.find((x) => String(x.id) === String(id)) : null;
    const t = item || {};
    const f = { city: bi(t, 'city'), text: bi(t, 'text') };
    const drawer = openDrawer(item ? `Edit review — ${item.name}` : 'New review', `
      <form id="ts-form" class="admin-formgrid">
        <div id="ts-alerts" class="admin-alerts"></div>
        ${textField('Guest name', 'name', t.name || '')}
        ${biField('City', 'city', f.city)}
        <div class="admin-grid">
          ${numField('Rating (1–5)', 'rating', t.rating ?? 5, { min: 1, max: 5 })}
          ${textField('Trip date label', 'tripDate', t.tripDate || '', { hint: 'e.g. March 2026' })}
          ${numField('Sort order', 'sortOrder', t.sortOrder ?? 0)}
        </div>
        ${biField('Review text', 'text', f.text, { textarea: true, required: true })}
        <div class="admin-actions">
          ${checkField('Published on site', 'active', t.active !== false)}
        </div>
        <div class="admin-actions">
          <button class="btn btn--primary" type="submit">${item ? 'Save changes' : 'Create review'}</button>
          <button class="btn btn--ghost" type="button" data-cancel>Cancel</button>
        </div>
      </form>`);

    $('[data-cancel]', drawer).addEventListener('click', closeDrawer);
    $('#ts-form', drawer).addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = readForm(event.target);
      const payload = {
        name: data.name,
        city: data.city,
        rating: Number(data.rating),
        text: data.text,
        tripDate: data.tripDate || '',
        active: Boolean(data.active),
        sortOrder: Number(data.sortOrder),
      };
      try {
        if (item) await api.put(`/admin/testimonials/${item.id}`, payload);
        else await api.post('/admin/testimonials', payload);
        toast(item ? 'Review saved.' : 'Review created.');
        closeDrawer();
        load();
      } catch (err) { setAlerts($('#ts-alerts', drawer), 'error', errorText(err)); }
    });
  }

  $('#ts-new', root).addEventListener('click', () => editor(null));
  await load();
}

/* ---------------------------------- faqs --------------------------------- */

async function renderFaqs(root) {
  root.innerHTML = `
    <div class="admin-toolbar">
      <span class="admin-hint">FAQs appear on the public help page, grouped by topic.</span>
      <span class="admin-actions"><button class="btn btn--primary btn--small" id="fq-new" type="button">+ New question</button></span>
    </div>
    <div class="admin-tablewrap">
      <table class="admin-table">
        <thead><tr><th>Question</th><th>Topic</th><th>Flags</th><th></th></tr></thead>
        <tbody id="fq-body"></tbody>
      </table>
    </div>`;

  let lastItems = [];
  async function load() {
    const { items } = await api.get('/admin/faqs');
    lastItems = items;
    $('#fq-body', root).innerHTML = items.map((f) => `
      <tr>
        <td><strong>${esc(f.questionEn || f.questionAr)}</strong><div class="sub admin-bidi-ar">${esc(f.questionAr)}</div></td>
        <td>${pill(f.topic)}</td>
        <td>${f.active ? pill('active') : pill('inactive')}</td>
        <td>
          <div class="admin-actions">
            <button class="btn btn--ghost btn--small" data-edit="${f.id}" type="button">Edit</button>
            <button class="btn btn--danger btn--small" data-del="${f.id}" type="button">Delete</button>
          </div>
        </td>
      </tr>`).join('') || '<tr><td colspan="4"><div class="admin-empty">No FAQs yet.</div></td></tr>';

    $$('[data-edit]', root).forEach((btn) => btn.addEventListener('click', () => editor(btn.dataset.edit)));
    $$('[data-del]', root).forEach((btn) => btn.addEventListener('click', async () => {
      if (!window.confirm('Delete this question?')) return;
      try {
        await api.delete(`/admin/faqs/${btn.dataset.del}`);
        toast('Question deleted.');
        load();
      } catch (err) { toast(errorText(err), 'error'); }
    }));
  }

  function editor(id) {
    const faq = id ? lastItems.find((x) => String(x.id) === String(id)) : null;
    const f = faq || {};
    const g = { question: bi(f, 'question'), answer: bi(f, 'answer') };
    const drawer = openDrawer(faq ? 'Edit question' : 'New question', `
      <form id="fq-form" class="admin-formgrid">
        <div id="fq-alerts" class="admin-alerts"></div>
        ${biField('Question', 'question', g.question, { required: true })}
        ${biField('Answer', 'answer', g.answer, { textarea: true, required: true })}
        <div class="admin-grid">
          ${textField('Topic', 'topic', f.topic || 'general')}
          ${numField('Sort order', 'sortOrder', f.sortOrder ?? 0)}
        </div>
        <div class="admin-actions">${checkField('Active (visible on site)', 'active', f.active !== false)}</div>
        <div class="admin-actions">
          <button class="btn btn--primary" type="submit">${faq ? 'Save changes' : 'Create question'}</button>
          <button class="btn btn--ghost" type="button" data-cancel>Cancel</button>
        </div>
      </form>`);

    $('[data-cancel]', drawer).addEventListener('click', closeDrawer);
    $('#fq-form', drawer).addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = readForm(event.target);
      const payload = {
        question: data.question,
        answer: data.answer,
        topic: data.topic || 'general',
        active: Boolean(data.active),
        sortOrder: Number(data.sortOrder),
      };
      try {
        if (faq) await api.put(`/admin/faqs/${faq.id}`, payload);
        else await api.post('/admin/faqs', payload);
        toast(faq ? 'Question saved.' : 'Question created.');
        closeDrawer();
        load();
      } catch (err) { setAlerts($('#fq-alerts', drawer), 'error', errorText(err)); }
    });
  }

  $('#fq-new', root).addEventListener('click', () => editor(null));
  await load();
}

/* -------------------------------- settings ------------------------------- */

async function renderSettings(root) {
  const { settings } = await api.get('/admin/settings');
  const s = settings;
  root.innerHTML = `
    <form id="st-form" class="admin-card admin-formgrid">
      <div id="st-alerts" class="admin-alerts"></div>
      <h3>Brand & contact</h3>
      <div class="admin-grid">
        ${biField('Brand name', 'brand', s.brand)}
        ${biField('Tagline', 'tagline', s.tagline)}
        ${textField('Phone (display)', 'phone', s.phone)}
        ${textField('Phone (tel: link)', 'phoneHref', s.phoneHref)}
        ${textField('WhatsApp number', 'whatsapp', s.whatsapp)}
        ${textField('Public email', 'email', s.email, { type: 'email' })}
        ${textField('Bookings email', 'bookingsEmail', s.bookingsEmail, { type: 'email' })}
      </div>
      <div class="admin-grid">
        ${biField('Address', 'address', s.address)}
        ${biField('Working hours', 'hours', s.hours)}
        ${biField('Licence', 'license', s.license)}
        ${textField('CR number', 'crNumber', s.crNumber)}
        ${textField('VAT number', 'vatNumber', s.vatNumber)}
      </div>
      <h3>Social links</h3>
      <div class="admin-grid">
        ${textField('Instagram', 'social__instagram', s.social?.instagram || '')}
        ${textField('X (Twitter)', 'social__x', s.social?.x || '')}
        ${textField('YouTube', 'social__youtube', s.social?.youtube || '')}
        ${textField('TikTok', 'social__tiktok', s.social?.tiktok || '')}
        ${textField('Snapchat', 'social__snapchat', s.social?.snapchat || '')}
      </div>
      <h3>Extras</h3>
      ${textField('Map embed URL', 'mapEmbed', s.mapEmbed || '')}
      <div class="admin-grid">${biField('Announcement bar', 'announcement', s.announcement)}</div>
      <div class="admin-actions"><button class="btn btn--primary" type="submit">Save settings</button></div>
    </form>`;

  $('#st-form', root).addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = readForm(event.target);
    const payload = {
      brand: data.brand,
      tagline: data.tagline,
      phone: data.phone,
      phoneHref: data.phoneHref,
      whatsapp: data.whatsapp,
      email: data.email,
      bookingsEmail: data.bookingsEmail,
      address: data.address,
      hours: data.hours,
      license: data.license,
      crNumber: data.crNumber,
      vatNumber: data.vatNumber,
      social: {
        instagram: data.social?.instagram ?? '',
        x: data.social?.x ?? '',
        youtube: data.social?.youtube ?? '',
        tiktok: data.social?.tiktok ?? '',
        snapchat: data.social?.snapchat ?? '',
      },
      mapEmbed: data.mapEmbed || '',
      announcement: data.announcement,
    };
    try {
      await api.put('/admin/settings', payload);
      setAlerts($('#st-alerts', root), 'success', 'Settings saved — the public site picks them up immediately.');
      toast('Settings saved.');
    } catch (err) {
      setAlerts($('#st-alerts', root), 'error', errorText(err));
    }
  });
}

/* --------------------------------- audit --------------------------------- */

async function renderAudit(root) {
  const { items } = await api.get('/admin/audit', { limit: 100, offset: 0 });
  root.innerHTML = `
    <div class="admin-tablewrap">
      <table class="admin-table">
        <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Result</th></tr></thead>
        <tbody>
          ${items.map((log) => `
            <tr>
              <td class="sub">${fmtDate(log.createdAt)}</td>
              <td>${esc(log.actor)}</td>
              <td class="mono">${esc(log.action)}</td>
              <td class="sub">${esc(log.entity)}${log.entityId ? ` #${esc(log.entityId)}` : ''}</td>
              <td>${log.success ? pill('completed') : pill('cancelled')}</td>
            </tr>`).join('') || '<tr><td colspan="5"><div class="admin-empty">No activity recorded yet.</div></td></tr>'}
        </tbody>
      </table>
    </div>`;
}

/* --------------------------------- wiring -------------------------------- */

const RENDERERS = {
  dashboard: renderDashboard,
  bookings: renderBookings,
  messages: renderMessages,
  subscribers: renderSubscribers,
  packages: renderPackages,
  destinations: renderDestinations,
  testimonials: renderTestimonials,
  faqs: renderFaqs,
  settings: renderSettings,
  audit: renderAudit,
};

window.addEventListener('hashchange', () => navigate(location.hash.slice(2) || 'dashboard'));
initAuth();
boot();
