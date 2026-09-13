import { z } from 'zod';

/* ---------------------------- route params --------------------------- */

export const idParam = z.object({ id: z.coerce.number().int().positive().max(1_000_000_000) });
export const slugParam = z.object({ slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) });

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/** Trimmed string with a hard maximum length; rejects control characters. */
export function text(min, max, opts = {}) {
  let schema = z.string().trim().min(min).max(max);
  if (opts.optional) schema = z.optional(schema);
  if (opts.default !== undefined) schema = schema.default(opts.default);
  return schema.refine((value) => !CONTROL_CHARS.test(value ?? ''), { message: 'Contains invalid characters' });
}

export const emailField = z.email().max(160).transform((value) => value.toLowerCase());

/** International phone numbers: +, digits, spaces, dashes, parentheses. */
export const phoneField = z
  .string()
  .trim()
  .max(32)
  .refine((value) => value === '' || (/^[+()\-.\s\d]{6,32}$/.test(value) && value.replace(/\D/g, '').length >= 6), {
    message: 'Invalid phone number',
  });

export const slugField = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must use lowercase letters, numbers and dashes');

export const langField = z.enum(['ar', 'en']);

/** Bilingual object: { ar: string, en: string } */
export function bilingual(max = 400, { optional = false } = {}) {
  const inner = z.object({
    ar: optional ? z.string().trim().max(max).optional().default('') : z.string().trim().min(1).max(max),
    en: optional ? z.string().trim().max(max).optional().default('') : z.string().trim().min(1).max(max),
  });
  return inner;
}

export function bilingualList(max = 300, maxItems = 20) {
  return z.object({
    ar: z.array(z.string().trim().min(1).max(max)).max(maxItems).default([]),
    en: z.array(z.string().trim().min(1).max(max)).max(maxItems).default([]),
  });
}

/** Rejects open-redirect parameters: only same-origin relative paths pass. */
export const safeRedirect = z
  .string()
  .max(200)
  .refine((value) => /^\/(?!\/)[^\s"'<>]*$/.test(value), 'Only relative paths are allowed')
  .optional();

/**
 * Fields accepted (and ignored) on every public form:
 * honeypots for bots, a form timestamp for timing checks, and the CSRF token
 * for plain HTML form posts.
 */
export const botFields = {
  website: z.string().max(200).optional(),
  company_url: z.string().max(200).optional(),
  fax_number: z.string().max(100).optional(),
  form_ts: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  _csrf: z.string().max(200).optional(),
};
