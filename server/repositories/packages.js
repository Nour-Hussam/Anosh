import { getDb, nowIso, parseJson } from '../db/index.js';

const COLUMNS = `id, slug, destination_id, title_ar, title_en, summary_ar, summary_en, description_ar, description_en,
  region_ar, region_en, days, nights, price_sar, old_price_sar, group_size, difficulty, category,
  rating, reviews_count, image, gallery, highlights, includes, excludes, itinerary,
  featured, active, sort_order, created_at, updated_at`;

/** Shape returned to the public API (never expose internal flags). */
function shape(row, { full = false } = {}) {
  if (!row) return null;
  const base = {
    id: row.id,
    slug: row.slug,
    titleAr: row.title_ar,
    titleEn: row.title_en,
    summaryAr: row.summary_ar,
    summaryEn: row.summary_en,
    regionAr: row.region_ar,
    regionEn: row.region_en,
    destinationId: row.destination_id,
    destinationSlug: row.destination_slug ?? null,
    days: row.days,
    nights: row.nights,
    priceSar: row.price_sar,
    oldPriceSar: row.old_price_sar,
    groupSize: row.group_size,
    difficulty: row.difficulty,
    category: row.category,
    rating: Number(row.rating ?? 0),
    reviewsCount: row.reviews_count,
    image: row.image,
    featured: Boolean(row.featured),
    active: Boolean(row.active),
    sortOrder: row.sort_order,
  };

  if (full) {
    Object.assign(base, {
      descriptionAr: row.description_ar,
      descriptionEn: row.description_en,
      gallery: parseJson(row.gallery, []),
      highlights: parseJson(row.highlights, { ar: [], en: [] }),
      includes: parseJson(row.includes, { ar: [], en: [] }),
      excludes: parseJson(row.excludes, { ar: [], en: [] }),
      itinerary: parseJson(row.itinerary, []),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
  return base;
}

const SORTS = {
  featured: 'p.featured DESC, p.sort_order ASC, p.id ASC',
  'price-asc': 'p.price_sar ASC',
  'price-desc': 'p.price_sar DESC',
  'duration-asc': 'p.days ASC',
  'duration-desc': 'p.days DESC',
  rating: 'p.rating DESC, p.reviews_count DESC',
  newest: 'p.created_at DESC',
};

/**
 * Whitelisted filtering + sorting. Every value goes through a bound parameter,
 * and column names come from the SORTS map only (no string interpolation of input).
 */
export function listPackages(options = {}) {
  const {
    featured = null,
    destination = null,
    category = null,
    difficulty = null,
    minPrice = null,
    maxPrice = null,
    minDays = null,
    maxDays = null,
    q = null,
    sort = 'featured',
    limit = 12,
    offset = 0,
    includeInactive = false,
  } = options;

  const where = [];
  const params = {};

  if (!includeInactive) where.push('p.active = 1');
  if (featured !== null) {
    where.push('p.featured = @featured');
    params.featured = featured ? 1 : 0;
  }
  if (destination) {
    where.push('d.slug = @destination');
    params.destination = String(destination).slice(0, 80);
  }
  if (category) {
    where.push('p.category = @category');
    params.category = String(category).slice(0, 30);
  }
  if (difficulty) {
    where.push('p.difficulty = @difficulty');
    params.difficulty = String(difficulty).slice(0, 30);
  }
  if (minPrice !== null && minPrice !== undefined) {
    where.push('p.price_sar >= @minPrice');
    params.minPrice = Number(minPrice);
  }
  if (maxPrice !== null && maxPrice !== undefined) {
    where.push('p.price_sar <= @maxPrice');
    params.maxPrice = Number(maxPrice);
  }
  if (minDays !== null && minDays !== undefined) {
    where.push('p.days >= @minDays');
    params.minDays = Number(minDays);
  }
  if (maxDays !== null && maxDays !== undefined) {
    where.push('p.days <= @maxDays');
    params.maxDays = Number(maxDays);
  }
  if (q) {
    where.push('(p.title_ar LIKE @q OR p.title_en LIKE @q OR p.summary_ar LIKE @q OR p.summary_en LIKE @q OR p.region_ar LIKE @q OR p.region_en LIKE @q)');
    params.q = `%${String(q).slice(0, 80).replace(/[%_]/g, (c) => `\\${c}`)}%`;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderSql = SORTS[sort] || SORTS.featured;
  params.limit = Math.min(Math.max(Number(limit) || 12, 1), 60);
  params.offset = Math.max(Number(offset) || 0, 0);

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT ${COLUMNS.split(',').map((c) => `p.${c.trim()}`).join(', ')}, d.slug AS destination_slug
         FROM packages p LEFT JOIN destinations d ON d.id = p.destination_id
         ${whereSql}
        ORDER BY ${orderSql}
        LIMIT @limit OFFSET @offset`
    )
    .all(params);

  const total = db
    .prepare(
      `SELECT COUNT(*) AS c FROM packages p LEFT JOIN destinations d ON d.id = p.destination_id ${whereSql}`
    )
    .get(params).c;

  return { items: rows.map((r) => shape(r)), total, limit: params.limit, offset: params.offset };
}

export function getPackageBySlug(slug, { includeInactive = false } = {}) {
  const row = getDb()
    .prepare(
      `SELECT ${COLUMNS.split(',').map((c) => `p.${c.trim()}`).join(', ')}, d.slug AS destination_slug
         FROM packages p LEFT JOIN destinations d ON d.id = p.destination_id
        WHERE p.slug = @slug ${includeInactive ? '' : 'AND p.active = 1'} LIMIT 1`
    )
    .get({ slug: String(slug).slice(0, 80) });
  return shape(row, { full: true });
}

export function getPackageById(id, { includeInactive = true } = {}) {
  const row = getDb()
    .prepare(`SELECT ${COLUMNS} FROM packages WHERE id = ? ${includeInactive ? '' : 'AND active = 1'} LIMIT 1`)
    .get(Number(id));
  return shape(row, { full: true });
}

export function relatedPackages(pkg, limit = 3) {
  if (!pkg) return [];
  const rows = getDb()
    .prepare(
      `SELECT ${COLUMNS.split(',').map((c) => `p.${c.trim()}`).join(', ')}
         FROM packages p
        WHERE p.active = 1 AND p.id <> @id AND (p.destination_id = @dest OR p.category = @cat)
        ORDER BY p.featured DESC, p.rating DESC LIMIT @limit`
    )
    .all({ id: pkg.id, dest: pkg.destinationId, cat: pkg.category, limit: Number(limit) });
  return rows.map((r) => shape(r));
}

const WRITABLE = [
  'slug', 'destination_id', 'title_ar', 'title_en', 'summary_ar', 'summary_en',
  'description_ar', 'description_en', 'region_ar', 'region_en', 'days', 'nights',
  'price_sar', 'old_price_sar', 'group_size', 'difficulty', 'category', 'rating',
  'reviews_count', 'image', 'gallery', 'highlights', 'includes', 'excludes',
  'itinerary', 'featured', 'active', 'sort_order',
];

function toRow(data) {
  const row = {};
  for (const key of WRITABLE) {
    if (data[key] === undefined) continue;
    const value = data[key];
    row[key] = typeof value === 'object' && value !== null ? JSON.stringify(value) : value;
  }
  return row;
}

export function insertPackage(data) {
  const row = toRow(data);
  const keys = Object.keys(row);
  const sql = `INSERT INTO packages (${keys.join(', ')}, created_at, updated_at)
               VALUES (${keys.map((k) => `@${k}`).join(', ')}, @now, @now)`;
  const info = getDb().prepare(sql).run({ ...row, now: nowIso() });
  return getPackageById(info.lastInsertRowid);
}

export function updatePackage(id, data) {
  const row = toRow(data);
  const keys = Object.keys(row);
  if (!keys.length) return getPackageById(id);
  const sql = `UPDATE packages SET ${keys.map((k) => `${k} = @${k}`).join(', ')}, updated_at = @now WHERE id = @id`;
  getDb().prepare(sql).run({ ...row, now: nowIso(), id: Number(id) });
  return getPackageById(id);
}

export function deletePackage(id) {
  return getDb().prepare('DELETE FROM packages WHERE id = ?').run(Number(id)).changes > 0;
}

export function packageExists(slug, excludeId = null) {
  return Boolean(
    getDb()
      .prepare('SELECT 1 FROM packages WHERE slug = ? AND (? IS NULL OR id <> ?)')
      .get(String(slug), excludeId)
  );
}
