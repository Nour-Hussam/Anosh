import { z } from 'zod';

import { botFields, emailField, langField, phoneField, slugField, text } from './primitives.js';

/* ---------------------------- pagination ---------------------------- */
export const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(60).default(12),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
  sort: z
    .enum(['featured', 'price-asc', 'price-desc', 'duration-asc', 'duration-desc', 'rating', 'newest'])
    .default('featured'),
});

/* ---------------------------- packages list ------------------------- */
export const packageListQuery = paginationQuery.extend({
  featured: z.enum(['true', 'false', '0', '1']).optional(),
  destination: z.string().trim().min(1).max(80).optional(),
  category: z.enum(['guided', 'family', 'adventure', 'luxury', 'honeymoon', 'umrah-plus']).optional(),
  difficulty: z.enum(['easy', 'moderate', 'active']).optional(),
  minPrice: z.coerce.number().int().min(0).max(1_000_000).optional(),
  maxPrice: z.coerce.number().int().min(0).max(1_000_000).optional(),
  minDays: z.coerce.number().int().min(1).max(60).optional(),
  maxDays: z.coerce.number().int().min(1).max(60).optional(),
  q: z.string().trim().min(1).max(80).optional(),
});

/* ---------------------------- public leads -------------------------- */
export const contactSchema = z
  .object({
    name: text(2, 90),
    email: emailField,
    phone: phoneField.optional().default(''),
    topic: z.enum(['general', 'booking', 'groups', 'support', 'partnership']).default('general'),
    subject: text(0, 140).optional().default(''),
    message: text(5, 3000),
    lang: langField.default('ar'),
    consent: z.literal(true, { message: 'You must accept the privacy policy' }),
    ...botFields,
  })
  .strict();

export const bookingSchema = z
  .object({
    packageSlug: slugField.optional().or(z.literal('')),
    packageId: z.coerce.number().int().positive().max(1_000_000_000).optional(),
    fullName: text(2, 90),
    email: emailField,
    phone: phoneField,
    country: text(0, 80).optional().default(''),
    adults: z.coerce.number().int().min(1).max(40).default(1),
    children: z.coerce.number().int().min(0).max(40).default(0),
    travelDate: z.iso.date().optional().or(z.literal('')),
    preferredContact: z.enum(['email', 'phone', 'whatsapp']).default('email'),
    notes: text(0, 2000).optional().default(''),
    lang: langField.default('ar'),
    consent: z.literal(true, { message: 'You must accept the terms and privacy policy' }),
    ...botFields,
  })
  .strict();

export const newsletterSchema = z
  .object({
    email: emailField,
    lang: langField.default('ar'),
    ...botFields,
  })
  .strict();

export const reviewSchema = z
  .object({
    name: text(2, 90),
    city: text(0, 60).optional().default(''),
    rating: z.coerce.number().int().min(1).max(5),
    text: text(10, 1500),
    packageSlug: slugField.optional().or(z.literal('')),
    lang: langField.default('ar'),
    consent: z.literal(true),
    ...botFields,
  })
  .strict();
