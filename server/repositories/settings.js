import { getDb, getSetting, setSetting } from '../db/index.js';

const SITE_KEY = 'site';

export const DEFAULT_SITE_SETTINGS = {
  brand: { ar: 'رحلات المملكة', en: 'Kingdom Journeys' },
  tagline: {
    ar: 'اكتشف السعودية مع أهلها',
    en: 'Discover Saudi Arabia with locals who know every road',
  },
  phone: '+966 11 200 4455',
  phoneHref: '+966112004455',
  whatsapp: '966551234567',
  email: 'hello@kingdom-journeys.sa',
  bookingsEmail: 'bookings@kingdom-journeys.sa',
  address: {
    ar: 'طريق الملك فهد، برج المملكة، الدور 12، حي العليا، الرياض 12214، المملكة العربية السعودية',
    en: 'Kingdom Tower, 12th Floor, Al Olaya, King Fahd Road, Riyadh 12214, Saudi Arabia',
  },
  hours: {
    ar: 'السبت – الخميس: 9:00 ص – 7:00 م',
    en: 'Saturday – Thursday: 9:00 AM – 7:00 PM',
  },
  license: { ar: 'ترخيص وزارة السياحة رقم 1234567', en: 'Ministry of Tourism License No. 1234567' },
  crNumber: '1010XXXXXX',
  vatNumber: '3000XXXXXXXXX0003',
  social: {
    instagram: 'https://instagram.com/',
    x: 'https://x.com/',
    youtube: 'https://youtube.com/',
    tiktok: 'https://tiktok.com/',
    snapchat: 'https://snapchat.com/',
  },
  mapEmbed: '',
  announcement: { ar: '', en: '' },
};

/** Deep-merges plain objects one level down for the known keys. */
function merge(base, patch) {
  const out = { ...base };
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value) && base[key] && typeof base[key] === 'object') {
      out[key] = { ...base[key], ...value };
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

export function getSiteSettings() {
  return merge(DEFAULT_SITE_SETTINGS, getSetting(SITE_KEY, {}) || {});
}

export function updateSiteSettings(patch) {
  const next = merge(getSiteSettings(), patch);
  setSetting(SITE_KEY, next);
  return next;
}

/* ------------------------------------------------------------------ */
/*  Dashboard metrics                                                  */
/* ------------------------------------------------------------------ */

export function dashboardStats() {
  const db = getDb();

  const bookings = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS new_leads,
              SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
              SUM(CASE WHEN status IN ('confirmed','completed') THEN total_sar ELSE 0 END) AS revenue,
              SUM(CASE WHEN created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days') THEN 1 ELSE 0 END) AS last_30d
         FROM bookings`
    )
    .get();

  const messages = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS unread,
              SUM(CASE WHEN created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days') THEN 1 ELSE 0 END) AS last_30d
         FROM messages`
    )
    .get();

  const subscribers = db.prepare(`SELECT COUNT(*) AS total FROM subscribers WHERE active = 1`).get();
  const content = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM packages WHERE active = 1) AS packages,
              (SELECT COUNT(*) FROM destinations WHERE active = 1) AS destinations,
              (SELECT COUNT(*) FROM testimonials WHERE active = 1) AS testimonials`
    )
    .get();

  const monthly = db
    .prepare(
      `SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS bookings,
              SUM(CASE WHEN status IN ('confirmed','completed') THEN total_sar ELSE 0 END) AS revenue
         FROM bookings
        WHERE created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-11 months','start of month')
        GROUP BY month ORDER BY month ASC`
    )
    .all();

  const byStatus = db
    .prepare('SELECT status, COUNT(*) AS count FROM bookings GROUP BY status ORDER BY count DESC')
    .all();

  const topPackages = db
    .prepare(
      `SELECT COALESCE(p.title_ar, json_extract(b.package_snapshot,'$.titleAr'), '—') AS title_ar,
              COALESCE(p.title_en, json_extract(b.package_snapshot,'$.titleEn'), '—') AS title_en,
              COUNT(*) AS bookings, SUM(b.total_sar) AS revenue
         FROM bookings b LEFT JOIN packages p ON p.id = b.package_id
        WHERE b.status <> 'cancelled'
        GROUP BY COALESCE(b.package_id, 0)
        ORDER BY bookings DESC LIMIT 5`
    )
    .all();

  const recent = db
    .prepare(
      `SELECT id, reference, full_name, status, total_sar, created_at FROM bookings ORDER BY id DESC LIMIT 6`
    )
    .all();

  const recentMessages = db
    .prepare(`SELECT id, name, subject, status, created_at FROM messages ORDER BY id DESC LIMIT 6`)
    .all();

  return {
    bookings: {
      total: bookings.total || 0,
      new: bookings.new_leads || 0,
      confirmed: bookings.confirmed || 0,
      revenue: bookings.revenue || 0,
      last30d: bookings.last_30d || 0,
    },
    messages: { total: messages.total || 0, unread: messages.unread || 0, last30d: messages.last_30d || 0 },
    subscribers: subscribers.total || 0,
    content,
    monthly,
    byStatus,
    topPackages,
    recentBookings: recent,
    recentMessages,
  };
}
