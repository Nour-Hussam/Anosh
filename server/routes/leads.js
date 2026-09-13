import { Router } from 'express';

import { validate } from '../middleware/validate.js';
import { bookingSchema, contactSchema, newsletterSchema, reviewSchema } from '../schemas/public.js';
import { looksLikeBot, sameSiteFormGuard } from '../middleware/antiBot.js';
import { leadLimiter, newsletterLimiter } from '../middleware/rateLimit.js';
import { csrfProtection } from '../middleware/csrf.js';
import { addSubscriber, createBooking, createMessage } from '../repositories/leads.js';
import { insertTestimonial } from '../repositories/content.js';
import { getPackageBySlug, getPackageById } from '../repositories/packages.js';
import { getSiteSettings } from '../repositories/settings.js';
import { bookingAdminEmail, bookingConfirmationEmail, messageAdminEmail } from '../services/mailer.js';
import { ApiError, asyncHandler, ok } from '../utils/http.js';
import logger from '../utils/logger.js';

const router = Router();

// Every public form: CSRF + origin check + rate limit + bot heuristics + strict validation.
router.use(csrfProtection, sameSiteFormGuard);

/** POST /api/leads/contact — "اتصل بنا" form. */
router.post(
  '/contact',
  leadLimiter,
  validate(contactSchema),
  asyncHandler(async (req, res) => {
    const bot = looksLikeBot(req);
    const data = req.body;

    const message = createMessage(
      {
        name: data.name,
        email: data.email,
        phone: data.phone,
        subject: data.subject,
        topic: data.topic,
        message: data.message,
        lang: data.lang,
        spam: bot.bot,
      },
      req
    );

    if (bot.bot) {
      logger.info('lead.contact_flagged_bot', { reason: bot.reason, id: message.id });
    } else {
      messageAdminEmail(message).catch(() => {});
    }

    // Uniform response whether or not it was flagged — never tell a bot it was caught.
    ok(res, { success: true, id: message.id }, 201);
  })
);

/** POST /api/leads/booking — trip request form. */
router.post(
  '/booking',
  leadLimiter,
  validate(bookingSchema),
  asyncHandler(async (req, res) => {
    const data = req.body;
    const bot = looksLikeBot(req);

    const pkg = data.packageId ? getPackageById(data.packageId) : data.packageSlug ? getPackageBySlug(data.packageSlug) : null;
    if ((data.packageId || data.packageSlug) && !pkg) {
      throw ApiError.badRequest('package_not_found', 'The selected trip is no longer available.');
    }

    const booking = createBooking({ ...data, packageId: pkg?.id ?? null }, req);

    if (bot.bot) {
      logger.info('lead.booking_flagged_bot', { reason: bot.reason, id: booking.id });
    } else {
      const title = pkg ? (data.lang === 'en' ? pkg.titleEn : pkg.titleAr) : null;
      bookingAdminEmail(booking, title).catch(() => {});
      bookingConfirmationEmail(booking, title).catch(() => {});
      logger.info('lead.booking_created', { reference: booking.reference, package: pkg?.slug ?? null });
    }

    ok(
      res,
      {
        success: true,
        reference: booking.reference,
        totalSar: booking.totalSar,
        contact: {
          phone: getSiteSettings().phone,
          whatsapp: getSiteSettings().whatsapp,
          email: getSiteSettings().bookingsEmail,
        },
      },
      201
    );
  })
);

/** POST /api/leads/newsletter */
router.post(
  '/newsletter',
  newsletterLimiter,
  validate(newsletterSchema),
  asyncHandler(async (req, res) => {
    const bot = looksLikeBot(req);
    if (bot.bot) return ok(res, { success: true }); // silently ignore bots

    const { subscriber } = addSubscriber({ email: req.body.email, lang: req.body.lang }, req);
    logger.info('lead.subscriber_added', { id: subscriber.id });
    return ok(res, { success: true }, 201);
  })
);

/** POST /api/leads/review — public trip review (moderated: stored inactive by default). */
router.post(
  '/review',
  leadLimiter,
  validate(reviewSchema),
  asyncHandler(async (req, res) => {
    const bot = looksLikeBot(req);
    if (bot.bot) return ok(res, { success: true });

    const data = req.body;
    const pkg = data.packageSlug ? getPackageBySlug(data.packageSlug) : null;
    const isArabic = data.lang === 'ar';

    // Reviews are published only after moderation, so the site cannot be used as a spam board.
    insertTestimonial({
      name: data.name,
      city_ar: isArabic ? data.city : '',
      city_en: isArabic ? '' : data.city,
      rating: data.rating,
      text_ar: isArabic ? data.text : '',
      text_en: isArabic ? '' : data.text,
      package_id: pkg?.id ?? null,
      trip_date: '',
      active: false,
      sort_order: 0,
    });

    return ok(res, { success: true, pending: true }, 201);
  })
);

export default router;
