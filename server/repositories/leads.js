import { getDb, nowIso } from '../db/index.js';
import { hashIp, makeReference } from '../utils/crypto.js';
import { clientIp, userAgent } from '../utils/http.js';

/* ------------------------------------------------------------------ */
/*  Bookings                                                           */
/* ------------------------------------------------------------------ */

export function createBooking(data, req) {
  const db = getDb();
  const pkg = data.packageId
    ? db.prepare('SELECT id, title_ar, title_en, price_sar FROM packages WHERE id = ? AND active = 1').get(data.packageId)
    : null;

  const travelers = Number(data.adults || 1) + Number(data.children || 0);
  const unitPrice = pkg?.price_sar ?? 0;

  // Reference collisions are astronomically unlikely, but retry anyway.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const reference = makeReference('KJ');
    try {
      const info = db
        .prepare(
          `INSERT INTO bookings (reference, package_id, package_snapshot, full_name, email, phone, country,
              adults, children, travelers, travel_date, preferred_contact, notes, total_sar, status, lang,
              ip_hash, user_agent, created_at, updated_at)
           VALUES (@reference, @package_id, @package_snapshot, @full_name, @email, @phone, @country,
              @adults, @children, @travelers, @travel_date, @preferred_contact, @notes, @total_sar, 'new', @lang,
              @ip_hash, @user_agent, @now, @now)`
        )
        .run({
          reference,
          package_id: pkg?.id ?? null,
          package_snapshot: JSON.stringify({
            titleAr: pkg?.title_ar ?? null,
            titleEn: pkg?.title_en ?? null,
            priceSar: unitPrice,
          }),
          full_name: data.fullName,
          email: data.email,
          phone: data.phone || '',
          country: data.country || '',
          adults: Number(data.adults || 1),
          children: Number(data.children || 0),
          travelers,
          travel_date: data.travelDate || null,
          preferred_contact: data.preferredContact || 'email',
          notes: data.notes || '',
          total_sar: unitPrice * travelers,
          lang: data.lang === 'en' ? 'en' : 'ar',
          ip_hash: hashIp(clientIp(req)),
          user_agent: userAgent(req),
          now: nowIso(),
        });
      return getBookingById(info.lastInsertRowid);
    } catch (err) {
      if (!/UNIQUE constraint failed: bookings.reference/.test(err.message)) throw err;
    }
  }
  throw new Error('Unable to allocate a booking reference');
}

function shapeBooking(row) {
  if (!row) return null;
  let snapshot = {};
  try {
    snapshot = JSON.parse(row.package_snapshot || '{}');
  } catch {
    snapshot = {};
  }
  return {
    id: row.id,
    reference: row.reference,
    packageId: row.package_id,
    packageTitleAr: row.package_title_ar ?? snapshot.titleAr ?? null,
    packageTitleEn: row.package_title_en ?? snapshot.titleEn ?? null,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    country: row.country,
    adults: row.adults,
    children: row.children,
    travelers: row.travelers,
    travelDate: row.travel_date,
    preferredContact: row.preferred_contact,
    notes: row.notes,
    totalSar: row.total_sar,
    status: row.status,
    lang: row.lang,
    adminNotes: row.admin_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getBookingById(id) {
  const row = getDb()
    .prepare(
      `SELECT b.*, p.title_ar AS package_title_ar, p.title_en AS package_title_en
         FROM bookings b LEFT JOIN packages p ON p.id = b.package_id WHERE b.id = ? LIMIT 1`
    )
    .get(Number(id));
  return shapeBooking(row);
}

export function listBookings({ status = null, q = null, limit = 25, offset = 0, sort = 'newest' } = {}) {
  const where = [];
  const params = { limit: Math.min(Math.max(Number(limit) || 25, 1), 100), offset: Math.max(Number(offset) || 0, 0) };

  if (status && status !== 'all') {
    where.push('b.status = @status');
    params.status = String(status).slice(0, 20);
  }
  if (q) {
    where.push('(b.reference LIKE @q OR b.full_name LIKE @q OR b.email LIKE @q OR b.phone LIKE @q)');
    params.q = `%${String(q).slice(0, 60).replace(/[%_]/g, (c) => `\\${c}`)}%`;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderSql =
    sort === 'oldest' ? 'b.created_at ASC' : sort === 'value' ? 'b.total_sar DESC' : 'b.created_at DESC';

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT b.*, p.title_ar AS package_title_ar, p.title_en AS package_title_en
         FROM bookings b LEFT JOIN packages p ON p.id = b.package_id
         ${whereSql} ORDER BY ${orderSql} LIMIT @limit OFFSET @offset`
    )
    .all(params);
  const total = db.prepare(`SELECT COUNT(*) AS c FROM bookings b ${whereSql}`).get(params).c;

  return { items: rows.map(shapeBooking), total, limit: params.limit, offset: params.offset };
}

const BOOKING_STATUSES = ['new', 'contacted', 'confirmed', 'cancelled', 'completed'];

export function updateBooking(id, { status, adminNotes }) {
  const sets = ['updated_at = @now'];
  const params = { now: nowIso(), id: Number(id) };
  if (status !== undefined) {
    if (!BOOKING_STATUSES.includes(status)) throw new Error('invalid_status');
    sets.push('status = @status');
    params.status = status;
  }
  if (adminNotes !== undefined) {
    sets.push('admin_notes = @admin_notes');
    params.admin_notes = String(adminNotes).slice(0, 2000);
  }
  getDb().prepare(`UPDATE bookings SET ${sets.join(', ')} WHERE id = @id`).run(params);
  return getBookingById(id);
}

export function deleteBooking(id) {
  return getDb().prepare('DELETE FROM bookings WHERE id = ?').run(Number(id)).changes > 0;
}

/* ------------------------------------------------------------------ */
/*  Contact messages                                                   */
/* ------------------------------------------------------------------ */

export function createMessage(data, req) {
  const info = getDb()
    .prepare(
      `INSERT INTO messages (name, email, phone, subject, topic, body, status, lang, ip_hash, user_agent, created_at, updated_at)
       VALUES (@name, @email, @phone, @subject, @topic, @body, @status, @lang, @ip_hash, @user_agent, @now, @now)`
    )
    .run({
      name: data.name,
      email: data.email,
      phone: data.phone || '',
      subject: data.subject || '',
      topic: data.topic || 'general',
      body: data.message,
      status: data.spam ? 'spam' : 'new',
      lang: data.lang === 'en' ? 'en' : 'ar',
      ip_hash: hashIp(clientIp(req)),
      user_agent: userAgent(req),
      now: nowIso(),
    });
  return getMessageById(info.lastInsertRowid);
}

function shapeMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    subject: row.subject,
    topic: row.topic,
    body: row.body,
    status: row.status,
    lang: row.lang,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getMessageById(id) {
  return shapeMessage(getDb().prepare('SELECT * FROM messages WHERE id = ?').get(Number(id)));
}

export function listMessages({ status = null, q = null, limit = 25, offset = 0 } = {}) {
  const where = [];
  const params = { limit: Math.min(Math.max(Number(limit) || 25, 1), 100), offset: Math.max(Number(offset) || 0, 0) };
  if (status && status !== 'all') {
    where.push('status = @status');
    params.status = String(status).slice(0, 20);
  }
  if (q) {
    where.push('(name LIKE @q OR email LIKE @q OR subject LIKE @q OR body LIKE @q)');
    params.q = `%${String(q).slice(0, 60).replace(/[%_]/g, (c) => `\\${c}`)}%`;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM messages ${whereSql} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`).all(params);
  const total = db.prepare(`SELECT COUNT(*) AS c FROM messages ${whereSql}`).get(params).c;
  return { items: rows.map(shapeMessage), total, limit: params.limit, offset: params.offset };
}

const MESSAGE_STATUSES = ['new', 'read', 'replied', 'archived', 'spam'];

export function updateMessage(id, { status }) {
  if (status !== undefined) {
    if (!MESSAGE_STATUSES.includes(status)) throw new Error('invalid_status');
    getDb().prepare('UPDATE messages SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), Number(id));
  }
  return getMessageById(id);
}

export function deleteMessage(id) {
  return getDb().prepare('DELETE FROM messages WHERE id = ?').run(Number(id)).changes > 0;
}

/* ------------------------------------------------------------------ */
/*  Newsletter subscribers                                             */
/* ------------------------------------------------------------------ */

export function addSubscriber({ email, lang }, req) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM subscribers WHERE email = ? COLLATE NOCASE').get(email);
  if (existing) {
    db.prepare('UPDATE subscribers SET active = 1, lang = ? WHERE id = ?').run(lang, existing.id);
    return { subscriber: shapeSubscriber(db.prepare('SELECT * FROM subscribers WHERE id = ?').get(existing.id)), created: false };
  }
  const info = db
    .prepare('INSERT INTO subscribers (email, lang, ip_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(email, lang, hashIp(clientIp(req)), nowIso());
  return { subscriber: shapeSubscriber(db.prepare('SELECT * FROM subscribers WHERE id = ?').get(info.lastInsertRowid)), created: true };
}

function shapeSubscriber(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    lang: row.lang,
    active: Boolean(row.active),
    createdAt: row.created_at,
  };
}

export function listSubscribers({ q = null, limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = { limit: Math.min(Math.max(Number(limit) || 50, 1), 200), offset: Math.max(Number(offset) || 0, 0) };
  if (q) {
    where.push('email LIKE @q');
    params.q = `%${String(q).slice(0, 80).replace(/[%_]/g, (c) => `\\${c}`)}%`;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM subscribers ${whereSql} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`).all(params);
  const total = db.prepare(`SELECT COUNT(*) AS c FROM subscribers ${whereSql}`).get(params).c;
  return { items: rows.map(shapeSubscriber), total, limit: params.limit, offset: params.offset };
}

export function deleteSubscriber(id) {
  return getDb().prepare('DELETE FROM subscribers WHERE id = ?').run(Number(id)).changes > 0;
}

export { BOOKING_STATUSES, MESSAGE_STATUSES };
