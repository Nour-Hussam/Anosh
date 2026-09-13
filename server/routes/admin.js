import { Router } from 'express';

import { config } from '../config.js';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  destroyUserSessions,
  findUserByEmail,
  hashPassword,
  isLocked,
  publicUser,
  registerFailedAttempt,
  resetFailedAttempts,
  setSessionCookie,
  verifyPassword,
} from '../services/auth.js';
import { attachUser, requireAuth, requireRole } from '../middleware/auth.js';
import { adminLimiter, loginLimiter, loginSlowDown } from '../middleware/rateLimit.js';
import { csrfProtection } from '../middleware/csrf.js';
import { validate } from '../middleware/validate.js';
import {
  bookingPatchSchema,
  changePasswordSchema,
  destinationPatchSchema,
  destinationSchema,
  exportQuery,
  faqPatchSchema,
  faqSchema,
  idParam,
  listQuery,
  loginSchema,
  messagePatchSchema,
  packagePatchSchema,
  packageSchema,
  siteSettingsSchema,
  slugParam,
  testimonialPatchSchema,
  testimonialSchema,
} from '../schemas/admin.js';
import {
  deleteBooking,
  deleteMessage,
  deleteSubscriber,
  getBookingById,
  listBookings,
  listMessages,
  listSubscribers,
  updateBooking,
  updateMessage,
} from '../repositories/leads.js';
import {
  deleteDestination,
  deleteFaq,
  deleteTestimonial,
  getDestinationById,
  getDestinationBySlug,
  insertDestination,
  insertFaq,
  insertTestimonial,
  listDestinations,
  listFaqs,
  listTestimonials,
  updateDestination,
  updateFaq,
  updateTestimonial,
} from '../repositories/content.js';
import {
  deletePackage,
  getPackageById,
  getPackageBySlug,
  insertPackage,
  listPackages,
  packageExists,
  updatePackage,
} from '../repositories/packages.js';
import { dashboardStats, getSiteSettings, updateSiteSettings } from '../repositories/settings.js';
import { getDb } from '../db/index.js';
import { audit, recentAudit } from '../services/audit.js';
import { ApiError, asyncHandler, ok } from '../utils/http.js';
import { slugify } from '../utils/crypto.js';
import logger from '../utils/logger.js';

const router = Router();

/* ================================================================== */
/*  Authentication                                                     */
/* ================================================================== */

router.post(
  '/login',
  csrfProtection,
  loginLimiter,
  loginSlowDown,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = findUserByEmail(email);

    // Generic message: never reveal whether the account exists.
    const invalid = () => {
      audit(req, { action: 'login.failed', entity: 'user', entityId: user?.id ?? '', meta: { email }, success: 0 });
      throw ApiError.unauthorized('invalid_credentials', 'Incorrect email or password.');
    };

    if (!user) invalid();
    if (isLocked(user)) {
      const minutes = Math.max(1, Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000));
      audit(req, { action: 'login.locked', entity: 'user', entityId: user.id, success: 0 });
      throw ApiError.forbidden('account_locked', `Too many failed attempts. Try again in ${minutes} minutes.`);
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      const result = registerFailedAttempt(user);
      if (result.locked) {
        audit(req, { action: 'login.locked_now', entity: 'user', entityId: user.id, success: 0 });
        throw ApiError.forbidden('account_locked', `Too many failed attempts. Try again in ${config.security.loginLockMinutes} minutes.`);
      }
      invalid();
    }

    resetFailedAttempts(user);
    destroyUserSessions(user.id); // one active session per admin
    const session = createSession(user, req);
    setSessionCookie(res, session.token);

    audit(req, { action: 'login.success', entity: 'user', entityId: user.id, actor: user.email });
    logger.info('admin.login', { user: user.email });

    return ok(res, { user: publicUser(user), expiresAt: session.expires });
  })
);

router.post(
  '/logout',
  csrfProtection,
  attachUser,
  asyncHandler(async (req, res) => {
    if (req.session) {
      destroySession(req.session.id);
      audit(req, { action: 'logout', entity: 'user', entityId: req.user.id });
    }
    clearSessionCookie(res);
    return ok(res, { success: true });
  })
);

router.get(
  '/session',
  attachUser,
  asyncHandler(async (req, res) => {
    if (!req.user) throw ApiError.unauthorized();
    return ok(res, { user: req.user, site: getSiteSettings() });
  })
);

router.post(
  '/change-password',
  csrfProtection,
  requireAuth,
  validate(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const user = findUserByEmail(req.user.email);
    if (!user) throw ApiError.unauthorized();

    const valid = await verifyPassword(req.body.currentPassword, user.password_hash);
    if (!valid) {
      audit(req, { action: 'password.change_failed', entity: 'user', entityId: user.id, success: 0 });
      throw ApiError.badRequest('wrong_password', 'Your current password is incorrect.');
    }

    const hash = await hashPassword(req.body.newPassword);
    getDb().prepare(`UPDATE users SET password_hash = ?, must_change_pw = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(hash, user.id);

    // Force every other device to sign in again.
    destroyUserSessions(user.id, req.session.id);
    audit(req, { action: 'password.changed', entity: 'user', entityId: user.id });
    return ok(res, { success: true });
  })
);

/* ================================================================== */
/*  Everything below requires an authenticated admin                   */
/* ================================================================== */

router.use(requireAuth, adminLimiter);

router.get('/dashboard', (_req, res) => ok(res, { stats: dashboardStats(), site: getSiteSettings() }));

/* ------------------------------ bookings --------------------------- */

router.get(
  '/bookings',
  validate(listQuery, 'query'),
  asyncHandler(async (req, res) => {
    const { status, q, limit, offset, sort } = req.query;
    return ok(res, listBookings({ status, q, limit, offset, sort }));
  })
);

router.get(
  '/bookings/:id',
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    const booking = getBookingById(req.params.id);
    if (!booking) throw ApiError.notFound();
    return ok(res, { booking });
  })
);

router.patch(
  '/bookings/:id',
  csrfProtection,
  validate(idParam, 'params'),
  validate(bookingPatchSchema),
  asyncHandler(async (req, res) => {
    const booking = updateBooking(req.params.id, req.body);
    if (!booking) throw ApiError.notFound();
    audit(req, { action: 'booking.update', entity: 'booking', entityId: booking.id, meta: req.body });
    return ok(res, { booking });
  })
);

router.delete(
  '/bookings/:id',
  csrfProtection,
  requireRole('admin'),
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    const removed = deleteBooking(req.params.id);
    if (!removed) throw ApiError.notFound();
    audit(req, { action: 'booking.delete', entity: 'booking', entityId: req.params.id });
    return ok(res, { success: true });
  })
);

/* ------------------------------ messages --------------------------- */

router.get(
  '/messages',
  validate(listQuery, 'query'),
  asyncHandler(async (req, res) => ok(res, listMessages(req.query)))
);

router.patch(
  '/messages/:id',
  csrfProtection,
  validate(idParam, 'params'),
  validate(messagePatchSchema),
  asyncHandler(async (req, res) => {
    const message = updateMessage(req.params.id, req.body);
    if (!message) throw ApiError.notFound();
    audit(req, { action: 'message.update', entity: 'message', entityId: message.id, meta: req.body });
    return ok(res, { message });
  })
);

router.delete(
  '/messages/:id',
  csrfProtection,
  requireRole('admin'),
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    const removed = deleteMessage(req.params.id);
    if (!removed) throw ApiError.notFound();
    audit(req, { action: 'message.delete', entity: 'message', entityId: req.params.id });
    return ok(res, { success: true });
  })
);

/* ----------------------------- subscribers ------------------------- */

router.get(
  '/subscribers',
  validate(listQuery, 'query'),
  asyncHandler(async (req, res) => ok(res, listSubscribers(req.query)))
);

router.delete(
  '/subscribers/:id',
  csrfProtection,
  requireRole('admin'),
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    const removed = deleteSubscriber(req.params.id);
    if (!removed) throw ApiError.notFound();
    audit(req, { action: 'subscriber.delete', entity: 'subscriber', entityId: req.params.id });
    return ok(res, { success: true });
  })
);

/* ------------------------------ packages --------------------------- */

function toPackageRow(input, existing) {
  const row = {};
  if (input.slug) row.slug = input.slug;
  else if (!existing) row.slug = slugify(input.title?.en || input.title?.ar, 'trip');

  if (input.title) {
    row.title_ar = input.title.ar;
    row.title_en = input.title.en;
  }
  if (input.summary) {
    row.summary_ar = input.summary.ar;
    row.summary_en = input.summary.en;
  }
  if (input.description) {
    row.description_ar = input.description.ar;
    row.description_en = input.description.en;
  }
  if (input.region) {
    row.region_ar = input.region.ar;
    row.region_en = input.region.en;
  }
  if (input.highlights) row.highlights = input.highlights;
  if (input.includes) row.includes = input.includes;
  if (input.excludes) row.excludes = input.excludes;
  if (input.itinerary) row.itinerary = input.itinerary;
  if (input.gallery) row.gallery = input.gallery;

  if (input.destinationSlug !== undefined) {
    row.destination_id = input.destinationSlug ? getDestinationBySlug(input.destinationSlug, { includeInactive: true })?.id ?? null : null;
  }

  const scalarMap = {
    days: 'days',
    nights: 'nights',
    priceSar: 'price_sar',
    oldPriceSar: 'old_price_sar',
    groupSize: 'group_size',
    difficulty: 'difficulty',
    category: 'category',
    rating: 'rating',
    reviewsCount: 'reviews_count',
    image: 'image',
    sortOrder: 'sort_order',
  };
  for (const [from, to] of Object.entries(scalarMap)) {
    if (input[from] !== undefined) row[to] = input[from];
  }
  if (input.featured !== undefined) row.featured = input.featured ? 1 : 0;
  if (input.active !== undefined) row.active = input.active ? 1 : 0;

  return row;
}

router.get(
  '/packages',
  validate(listQuery, 'query'),
  asyncHandler(async (req, res) =>
    ok(res, listPackages({ includeInactive: true, q: req.query.q ?? null, limit: req.query.limit, offset: req.query.offset }))
  )
);

router.get(
  '/packages/:slug',
  validate(slugParam, 'params'),
  asyncHandler(async (req, res) => {
    const pkg = getPackageBySlug(req.params.slug, { includeInactive: true });
    if (!pkg) throw ApiError.notFound();
    return ok(res, { package: pkg });
  })
);

router.post(
  '/packages',
  csrfProtection,
  requireRole('admin'),
  validate(packageSchema),
  asyncHandler(async (req, res) => {
    const row = toPackageRow(req.body, null);
    if (row.slug && packageExists(row.slug)) {
      throw ApiError.conflict('slug_taken', 'Another trip already uses this URL slug.');
    }
    const created = insertPackage(row);
    audit(req, { action: 'package.create', entity: 'package', entityId: created.id, meta: { slug: created.slug } });
    return ok(res, { package: created }, 201);
  })
);

router.put(
  '/packages/:id',
  csrfProtection,
  requireRole('admin'),
  validate(idParam, 'params'),
  validate(packagePatchSchema),
  asyncHandler(async (req, res) => {
    const existing = getPackageById(req.params.id);
    if (!existing) throw ApiError.notFound();

    const row = toPackageRow(req.body, existing);
    if (row.slug && row.slug !== existing.slug && packageExists(row.slug, Number(req.params.id))) {
      throw ApiError.conflict('slug_taken', 'Another trip already uses this URL slug.');
    }
    const updated = updatePackage(req.params.id, row);
    audit(req, { action: 'package.update', entity: 'package', entityId: updated.id, meta: { slug: updated.slug } });
    return ok(res, { package: updated });
  })
);

router.delete(
  '/packages/:id',
  csrfProtection,
  requireRole('admin'),
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    const removed = deletePackage(req.params.id);
    if (!removed) throw ApiError.notFound();
    audit(req, { action: 'package.delete', entity: 'package', entityId: req.params.id });
    return ok(res, { success: true });
  })
);

/* ---------------------------- destinations ------------------------- */

function toDestinationRow(input, existing) {
  const row = {};
  if (input.slug) row.slug = input.slug;
  else if (!existing) row.slug = slugify(input.name?.en || input.name?.ar, 'destination');
  if (input.name) {
    row.name_ar = input.name.ar;
    row.name_en = input.name.en;
  }
  if (input.region) {
    row.region_ar = input.region.ar;
    row.region_en = input.region.en;
  }
  if (input.tagline) {
    row.tagline_ar = input.tagline.ar;
    row.tagline_en = input.tagline.en;
  }
  if (input.description) {
    row.description_ar = input.description.ar;
    row.description_en = input.description.en;
  }
  if (input.bestSeason) {
    row.best_season_ar = input.bestSeason.ar;
    row.best_season_en = input.bestSeason.en;
  }
  if (input.highlights) row.highlights = input.highlights;
  if (input.image !== undefined) row.image = input.image;
  if (input.sortOrder !== undefined) row.sort_order = input.sortOrder;
  if (input.active !== undefined) row.active = input.active ? 1 : 0;
  return row;
}

router.get('/destinations', (_req, res) => ok(res, { items: listDestinations({ includeInactive: true }) }));

router.post(
  '/destinations',
  csrfProtection,
  requireRole('admin'),
  validate(destinationSchema),
  asyncHandler(async (req, res) => {
    const created = insertDestination(toDestinationRow(req.body, null));
    audit(req, { action: 'destination.create', entity: 'destination', entityId: created.id, meta: { slug: created.slug } });
    return ok(res, { destination: created }, 201);
  })
);

router.put(
  '/destinations/:id',
  csrfProtection,
  requireRole('admin'),
  validate(idParam, 'params'),
  validate(destinationPatchSchema),
  asyncHandler(async (req, res) => {
    const existing = getDestinationById(req.params.id);
    if (!existing) throw ApiError.notFound();
    const updated = updateDestination(req.params.id, toDestinationRow(req.body, existing));
    audit(req, { action: 'destination.update', entity: 'destination', entityId: updated.id });
    return ok(res, { destination: updated });
  })
);

router.delete(
  '/destinations/:id',
  csrfProtection,
  requireRole('admin'),
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    const removed = deleteDestination(req.params.id);
    if (!removed) throw ApiError.notFound();
    audit(req, { action: 'destination.delete', entity: 'destination', entityId: req.params.id });
    return ok(res, { success: true });
  })
);

/* ---------------------------- testimonials ------------------------- */

function toTestimonialRow(input) {
  const row = {};
  if (input.name !== undefined) row.name = input.name;
  if (input.city) {
    row.city_ar = input.city.ar;
    row.city_en = input.city.en;
  }
  if (input.text) {
    row.text_ar = input.text.ar;
    row.text_en = input.text.en;
  }
  if (input.rating !== undefined) row.rating = input.rating;
  if (input.packageId !== undefined) row.package_id = input.packageId;
  if (input.tripDate !== undefined) row.trip_date = input.tripDate;
  if (input.sortOrder !== undefined) row.sort_order = input.sortOrder;
  if (input.active !== undefined) row.active = input.active ? 1 : 0;
  return row;
}

router.get('/testimonials', (_req, res) => ok(res, { items: listTestimonials({ includeInactive: true, limit: 200 }) }));

router.post(
  '/testimonials',
  csrfProtection,
  requireRole('admin'),
  validate(testimonialSchema),
  asyncHandler(async (req, res) => {
    const created = insertTestimonial(toTestimonialRow(req.body));
    audit(req, { action: 'testimonial.create', entity: 'testimonial', entityId: created.id });
    return ok(res, { testimonial: created }, 201);
  })
);

router.put(
  '/testimonials/:id',
  csrfProtection,
  requireRole('admin'),
  validate(idParam, 'params'),
  validate(testimonialPatchSchema),
  asyncHandler(async (req, res) => {
    const updated = updateTestimonial(req.params.id, toTestimonialRow(req.body));
    if (!updated) throw ApiError.notFound();
    audit(req, { action: 'testimonial.update', entity: 'testimonial', entityId: updated.id });
    return ok(res, { testimonial: updated });
  })
);

router.delete(
  '/testimonials/:id',
  csrfProtection,
  requireRole('admin'),
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    const removed = deleteTestimonial(req.params.id);
    if (!removed) throw ApiError.notFound();
    audit(req, { action: 'testimonial.delete', entity: 'testimonial', entityId: req.params.id });
    return ok(res, { success: true });
  })
);

/* --------------------------------- faqs ---------------------------- */

function toFaqRow(input) {
  const row = {};
  if (input.question) {
    row.question_ar = input.question.ar;
    row.question_en = input.question.en;
  }
  if (input.answer) {
    row.answer_ar = input.answer.ar;
    row.answer_en = input.answer.en;
  }
  if (input.topic !== undefined) row.topic = input.topic;
  if (input.sortOrder !== undefined) row.sort_order = input.sortOrder;
  if (input.active !== undefined) row.active = input.active ? 1 : 0;
  return row;
}

router.get('/faqs', (_req, res) => ok(res, { items: listFaqs({ includeInactive: true }) }));

router.post(
  '/faqs',
  csrfProtection,
  requireRole('admin'),
  validate(faqSchema),
  asyncHandler(async (req, res) => {
    const created = insertFaq(toFaqRow(req.body));
    audit(req, { action: 'faq.create', entity: 'faq', entityId: created.id });
    return ok(res, { faq: created }, 201);
  })
);

router.put(
  '/faqs/:id',
  csrfProtection,
  requireRole('admin'),
  validate(idParam, 'params'),
  validate(faqPatchSchema),
  asyncHandler(async (req, res) => {
    const updated = updateFaq(req.params.id, toFaqRow(req.body));
    if (!updated) throw ApiError.notFound();
    audit(req, { action: 'faq.update', entity: 'faq', entityId: updated.id });
    return ok(res, { faq: updated });
  })
);

router.delete(
  '/faqs/:id',
  csrfProtection,
  requireRole('admin'),
  validate(idParam, 'params'),
  asyncHandler(async (req, res) => {
    const removed = deleteFaq(req.params.id);
    if (!removed) throw ApiError.notFound();
    audit(req, { action: 'faq.delete', entity: 'faq', entityId: req.params.id });
    return ok(res, { success: true });
  })
);

/* ------------------------------- settings -------------------------- */

router.get('/settings', (_req, res) => ok(res, { settings: getSiteSettings() }));

router.put(
  '/settings',
  csrfProtection,
  requireRole('admin'),
  validate(siteSettingsSchema),
  asyncHandler(async (req, res) => {
    const settings = updateSiteSettings(req.body);
    audit(req, { action: 'settings.update', entity: 'settings', meta: { keys: Object.keys(req.body) } });
    return ok(res, { settings });
  })
);

/* -------------------------------- audit ---------------------------- */

router.get(
  '/audit',
  requireRole('admin'),
  validate(listQuery, 'query'),
  asyncHandler(async (req, res) => {
    const limit = Math.min(req.query.limit || 50, 100);
    return ok(res, { items: recentAudit(limit, req.query.offset || 0) });
  })
);

/* -------------------------------- export --------------------------- */

/** CSV escaping + formula-injection guard (a leading =,+,-,@ is neutralised). */
function csvCell(value) {
  let v = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}

function toCsv(columns, rows) {
  const header = columns.map((c) => csvCell(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => csvCell(c.get(row))).join(',')).join('\r\n');
  return `\uFEFF${header}\r\n${body}`; // BOM so Excel opens UTF-8/Arabic correctly
}

router.get(
  '/export.csv',
  requireRole('admin'),
  validate(exportQuery, 'query'),
  asyncHandler(async (req, res) => {
    const entity = req.query.entity;
    let csv = '';

    if (entity === 'bookings') {
      const { items } = listBookings({ limit: 100, offset: 0 });
      csv = toCsv(
        [
          { label: 'Reference', get: (b) => b.reference },
          { label: 'Name', get: (b) => b.fullName },
          { label: 'Email', get: (b) => b.email },
          { label: 'Phone', get: (b) => b.phone },
          { label: 'Country', get: (b) => b.country },
          { label: 'Trip', get: (b) => b.packageTitleEn || b.packageTitleAr || '' },
          { label: 'Travelers', get: (b) => b.travelers },
          { label: 'Travel date', get: (b) => b.travelDate || '' },
          { label: 'Total (SAR)', get: (b) => b.totalSar },
          { label: 'Status', get: (b) => b.status },
          { label: 'Created', get: (b) => b.createdAt },
        ],
        items
      );
    } else if (entity === 'messages') {
      const { items } = listMessages({ limit: 100, offset: 0 });
      csv = toCsv(
        [
          { label: 'Name', get: (m) => m.name },
          { label: 'Email', get: (m) => m.email },
          { label: 'Phone', get: (m) => m.phone },
          { label: 'Subject', get: (m) => m.subject },
          { label: 'Message', get: (m) => m.body },
          { label: 'Status', get: (m) => m.status },
          { label: 'Created', get: (m) => m.createdAt },
        ],
        items
      );
    } else {
      const { items } = listSubscribers({ limit: 100, offset: 0 });
      csv = toCsv(
        [
          { label: 'Email', get: (s) => s.email },
          { label: 'Language', get: (s) => s.lang },
          { label: 'Subscribed', get: (s) => s.createdAt },
        ],
        items
      );
    }

    audit(req, { action: 'export.csv', entity, meta: { rows: csv.split('\r\n').length - 1 } });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${entity}-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(csv);
  })
);

export default router;
