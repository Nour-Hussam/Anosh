import { z } from 'zod';

import { bilingual, bilingualList, emailField, idParam, langField, slugField, slugParam, text } from './primitives.js';

/* ------------------------------- auth ------------------------------- */

export const loginSchema = z
  .object({
    email: emailField,
    password: z.string().min(1).max(200),
    remember: z.boolean().optional().default(false),
  })
  .strict();

const strongPassword = z
  .string()
  .min(12)
  .max(200)
  .refine((v) => /[a-z]/.test(v), 'Include a lowercase letter')
  .refine((v) => /[A-Z]/.test(v), 'Include an uppercase letter')
  .refine((v) => /\d/.test(v), 'Include a number')
  .refine((v) => /[^A-Za-z0-9]/.test(v), 'Include a symbol');

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: strongPassword,
  })
  .strict();

/* ------------------------------ params ------------------------------ */

export { idParam, slugParam };

export const listQuery = z.object({
  status: z.string().trim().max(24).optional(),
  q: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
  sort: z.enum(['newest', 'oldest', 'value']).optional(),
});

export const exportQuery = z.object({ entity: z.enum(['bookings', 'messages', 'subscribers']) });

/* ----------------------------- bookings ----------------------------- */

export const bookingPatchSchema = z
  .object({
    status: z.enum(['new', 'contacted', 'confirmed', 'cancelled', 'completed']).optional(),
    adminNotes: text(0, 2000).optional(),
  })
  .strict()
  .refine((v) => v.status !== undefined || v.adminNotes !== undefined, 'Nothing to update');

export const messagePatchSchema = z
  .object({ status: z.enum(['new', 'read', 'replied', 'archived', 'spam']) })
  .strict();

/* ----------------------------- packages ----------------------------- */

const itineraryItem = z.object({
  day: z.coerce.number().int().min(1).max(60),
  titleAr: text(1, 140),
  titleEn: text(1, 140),
  textAr: text(0, 1200).optional().default(''),
  textEn: text(0, 1200).optional().default(''),
});

export const packageSchema = z
  .object({
    slug: slugField.optional(),
    title: bilingual(140),
    summary: bilingual(320).optional().default({ ar: '', en: '' }),
    description: bilingual(6000).optional().default({ ar: '', en: '' }),
    region: bilingual(80).optional().default({ ar: '', en: '' }),
    destinationSlug: slugField.optional().or(z.literal('')),
    days: z.coerce.number().int().min(1).max(60),
    nights: z.coerce.number().int().min(0).max(60).default(0),
    priceSar: z.coerce.number().int().min(0).max(1_000_000),
    oldPriceSar: z.coerce.number().int().min(0).max(1_000_000).nullable().optional(),
    groupSize: z.coerce.number().int().min(1).max(200).default(12),
    difficulty: z.enum(['easy', 'moderate', 'active']).default('easy'),
    category: z.enum(['guided', 'family', 'adventure', 'luxury', 'honeymoon', 'umrah-plus']).default('guided'),
    rating: z.coerce.number().min(0).max(5).default(0),
    reviewsCount: z.coerce.number().int().min(0).max(100000).default(0),
    image: text(0, 300).optional().default(''),
    gallery: z.array(text(1, 300)).max(12).default([]),
    highlights: bilingualList(200).optional().default({ ar: [], en: [] }),
    includes: bilingualList(200).optional().default({ ar: [], en: [] }),
    excludes: bilingualList(200).optional().default({ ar: [], en: [] }),
    itinerary: z.array(itineraryItem).max(60).default([]),
    featured: z.coerce.boolean().default(false),
    active: z.coerce.boolean().default(true),
    sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  })
  .strict();

export const packagePatchSchema = packageSchema.partial().strict();

/* --------------------------- destinations --------------------------- */

export const destinationSchema = z
  .object({
    slug: slugField.optional(),
    name: bilingual(120),
    region: bilingual(80).optional().default({ ar: '', en: '' }),
    tagline: bilingual(200).optional().default({ ar: '', en: '' }),
    description: bilingual(4000).optional().default({ ar: '', en: '' }),
    image: text(0, 300).optional().default(''),
    bestSeason: bilingual(120).optional().default({ ar: '', en: '' }),
    highlights: bilingualList(160).optional().default({ ar: [], en: [] }),
    active: z.coerce.boolean().default(true),
    sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  })
  .strict();

export const destinationPatchSchema = destinationSchema.partial().strict();

/* --------------------------- testimonials --------------------------- */

export const testimonialSchema = z
  .object({
    name: text(2, 90),
    city: bilingual(60).optional().default({ ar: '', en: '' }),
    rating: z.coerce.number().int().min(1).max(5).default(5),
    text: bilingual(1500),
    packageId: z.coerce.number().int().positive().nullable().optional(),
    tripDate: text(0, 40).optional().default(''),
    active: z.coerce.boolean().default(true),
    sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  })
  .strict();

export const testimonialPatchSchema = testimonialSchema.partial().strict();

/* -------------------------------- faqs -------------------------------- */

export const faqSchema = z
  .object({
    question: bilingual(220),
    answer: bilingual(3000),
    topic: text(2, 40).optional().default('general'),
    active: z.coerce.boolean().default(true),
    sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  })
  .strict();

export const faqPatchSchema = faqSchema.partial().strict();

/* ------------------------------ settings ------------------------------ */

const url = z.union([z.url().max(300), z.literal('')]);

export const siteSettingsSchema = z
  .object({
    brand: bilingual(80).optional(),
    tagline: bilingual(200).optional(),
    phone: text(0, 40).optional(),
    phoneHref: text(0, 40).optional(),
    whatsapp: text(0, 30).optional(),
    email: emailField.optional(),
    bookingsEmail: emailField.optional(),
    address: bilingual(300).optional(),
    hours: bilingual(160).optional(),
    license: bilingual(160).optional(),
    crNumber: text(0, 40).optional(),
    vatNumber: text(0, 40).optional(),
    social: z
      .object({
        instagram: url.optional(),
        x: url.optional(),
        youtube: url.optional(),
        tiktok: url.optional(),
        snapchat: url.optional(),
      })
      .strict()
      .optional(),
    mapEmbed: z.string().trim().max(600).optional(),
    announcement: bilingual(240).optional(),
  })
  .strict();

/* --------------------------- public reviews --------------------------- */

export const reviewModerationSchema = z.object({ active: z.coerce.boolean() }).strict();

export { langField, strongPassword };
