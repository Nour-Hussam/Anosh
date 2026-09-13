import { getDb, nowIso, parseJson } from '../db/index.js';

/* ------------------------------------------------------------------ */
/*  Destinations                                                       */
/* ------------------------------------------------------------------ */

const DEST_COLUMNS = `id, slug, name_ar, name_en, region_ar, region_en, tagline_ar, tagline_en,
  description_ar, description_en, image, best_season_ar, best_season_en, highlights, active, sort_order,
  created_at, updated_at`;

function shapeDestination(row, { withCount = false } = {}) {
  if (!row) return null;
  const out = {
    id: row.id,
    slug: row.slug,
    nameAr: row.name_ar,
    nameEn: row.name_en,
    regionAr: row.region_ar,
    regionEn: row.region_en,
    taglineAr: row.tagline_ar,
    taglineEn: row.tagline_en,
    descriptionAr: row.description_ar,
    descriptionEn: row.description_en,
    image: row.image,
    bestSeasonAr: row.best_season_ar,
    bestSeasonEn: row.best_season_en,
    highlights: parseJson(row.highlights, { ar: [], en: [] }),
    active: Boolean(row.active),
    sortOrder: row.sort_order,
  };
  if (withCount) out.packagesCount = row.packages_count ?? 0;
  return out;
}

export function listDestinations({ includeInactive = false, withCount = true } = {}) {
  const sql = `SELECT ${DEST_COLUMNS.split(',').map((c) => `d.${c.trim()}`).join(', ')}
                    ${withCount ? ', (SELECT COUNT(*) FROM packages p WHERE p.destination_id = d.id AND p.active = 1) AS packages_count' : ''}
                 FROM destinations d
                ${includeInactive ? '' : 'WHERE d.active = 1'}
                ORDER BY d.sort_order ASC, d.name_en ASC`;
  return getDb()
    .prepare(sql)
    .all()
    .map((r) => shapeDestination(r, { withCount }));
}

export function getDestinationBySlug(slug, { includeInactive = false } = {}) {
  const row = getDb()
    .prepare(`SELECT ${DEST_COLUMNS} FROM destinations WHERE slug = ? ${includeInactive ? '' : 'AND active = 1'} LIMIT 1`)
    .get(String(slug).slice(0, 80));
  return shapeDestination(row);
}

export function getDestinationById(id, { includeInactive = true } = {}) {
  const row = getDb()
    .prepare(`SELECT ${DEST_COLUMNS} FROM destinations WHERE id = ? ${includeInactive ? '' : 'AND active = 1'} LIMIT 1`)
    .get(Number(id));
  return shapeDestination(row);
}

const DEST_WRITABLE = [
  'slug', 'name_ar', 'name_en', 'region_ar', 'region_en', 'tagline_ar', 'tagline_en',
  'description_ar', 'description_en', 'image', 'best_season_ar', 'best_season_en',
  'highlights', 'active', 'sort_order',
];

function toRow(data, writable) {
  const row = {};
  for (const key of writable) {
    if (data[key] === undefined) continue;
    const value = data[key];
    row[key] = typeof value === 'object' && value !== null ? JSON.stringify(value) : value;
  }
  return row;
}

export function insertDestination(data) {
  const row = toRow(data, DEST_WRITABLE);
  const keys = Object.keys(row);
  const info = getDb()
    .prepare(
      `INSERT INTO destinations (${keys.join(', ')}, created_at, updated_at)
       VALUES (${keys.map((k) => `@${k}`).join(', ')}, @now, @now)`
    )
    .run({ ...row, now: nowIso() });
  return getDestinationById(info.lastInsertRowid);
}

export function updateDestination(id, data) {
  const row = toRow(data, DEST_WRITABLE);
  const keys = Object.keys(row);
  if (!keys.length) return getDestinationById(id);
  getDb()
    .prepare(`UPDATE destinations SET ${keys.map((k) => `${k} = @${k}`).join(', ')}, updated_at = @now WHERE id = @id`)
    .run({ ...row, now: nowIso(), id: Number(id) });
  return getDestinationById(id);
}

export function deleteDestination(id) {
  return getDb().prepare('DELETE FROM destinations WHERE id = ?').run(Number(id)).changes > 0;
}

/* ------------------------------------------------------------------ */
/*  Testimonials                                                       */
/* ------------------------------------------------------------------ */

function shapeTestimonial(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    cityAr: row.city_ar,
    cityEn: row.city_en,
    rating: row.rating,
    textAr: row.text_ar,
    textEn: row.text_en,
    packageId: row.package_id,
    packageTitleAr: row.package_title_ar ?? null,
    packageTitleEn: row.package_title_en ?? null,
    tripDate: row.trip_date,
    active: Boolean(row.active),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export function listTestimonials({ includeInactive = false, limit = 50 } = {}) {
  const rows = getDb()
    .prepare(
      `SELECT t.*, p.title_ar AS package_title_ar, p.title_en AS package_title_en
         FROM testimonials t LEFT JOIN packages p ON p.id = t.package_id
        ${includeInactive ? '' : 'WHERE t.active = 1'}
        ORDER BY t.sort_order ASC, t.id DESC
        LIMIT ?`
    )
    .all(Math.min(Math.max(Number(limit) || 50, 1), 200));
  return rows.map(shapeTestimonial);
}

export function insertTestimonial(data) {
  const row = toRow(data, ['name', 'city_ar', 'city_en', 'rating', 'text_ar', 'text_en', 'package_id', 'trip_date', 'active', 'sort_order']);
  const keys = Object.keys(row);
  const info = getDb()
    .prepare(`INSERT INTO testimonials (${keys.join(', ')}, created_at) VALUES (${keys.map((k) => `@${k}`).join(', ')}, @now)`)
    .run({ ...row, now: nowIso() });
  return shapeTestimonial(getDb().prepare('SELECT * FROM testimonials WHERE id = ?').get(info.lastInsertRowid));
}

export function updateTestimonial(id, data) {
  const row = toRow(data, ['name', 'city_ar', 'city_en', 'rating', 'text_ar', 'text_en', 'package_id', 'trip_date', 'active', 'sort_order']);
  const keys = Object.keys(row);
  if (!keys.length) return shapeTestimonial(getDb().prepare('SELECT * FROM testimonials WHERE id = ?').get(Number(id)));
  getDb()
    .prepare(`UPDATE testimonials SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`)
    .run({ ...row, id: Number(id) });
  return shapeTestimonial(getDb().prepare('SELECT * FROM testimonials WHERE id = ?').get(Number(id)));
}

export function deleteTestimonial(id) {
  return getDb().prepare('DELETE FROM testimonials WHERE id = ?').run(Number(id)).changes > 0;
}

/* ------------------------------------------------------------------ */
/*  FAQs                                                               */
/* ------------------------------------------------------------------ */

function shapeFaq(row) {
  if (!row) return null;
  return {
    id: row.id,
    questionAr: row.question_ar,
    questionEn: row.question_en,
    answerAr: row.answer_ar,
    answerEn: row.answer_en,
    topic: row.topic,
    active: Boolean(row.active),
    sortOrder: row.sort_order,
  };
}

export function listFaqs({ includeInactive = false, topic = null } = {}) {
  const where = [];
  const params = {};
  if (!includeInactive) where.push('active = 1');
  if (topic) {
    where.push('topic = @topic');
    params.topic = String(topic).slice(0, 40);
  }
  const rows = getDb()
    .prepare(`SELECT * FROM faqs ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY sort_order ASC, id ASC`)
    .all(params);
  return rows.map(shapeFaq);
}

export function insertFaq(data) {
  const row = toRow(data, ['question_ar', 'question_en', 'answer_ar', 'answer_en', 'topic', 'active', 'sort_order']);
  const keys = Object.keys(row);
  const info = getDb()
    .prepare(`INSERT INTO faqs (${keys.join(', ')}, created_at) VALUES (${keys.map((k) => `@${k}`).join(', ')}, @now)`)
    .run({ ...row, now: nowIso() });
  return shapeFaq(getDb().prepare('SELECT * FROM faqs WHERE id = ?').get(info.lastInsertRowid));
}

export function updateFaq(id, data) {
  const row = toRow(data, ['question_ar', 'question_en', 'answer_ar', 'answer_en', 'topic', 'active', 'sort_order']);
  const keys = Object.keys(row);
  if (keys.length) {
    getDb()
      .prepare(`UPDATE faqs SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`)
      .run({ ...row, id: Number(id) });
  }
  return shapeFaq(getDb().prepare('SELECT * FROM faqs WHERE id = ?').get(Number(id)));
}

export function deleteFaq(id) {
  return getDb().prepare('DELETE FROM faqs WHERE id = ?').run(Number(id)).changes > 0;
}
