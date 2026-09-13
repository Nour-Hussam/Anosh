import crypto from 'node:crypto';

import { config } from '../config.js';

/**
 * Hashes a client IP with a per-deployment salt so we can throttle/audit abuse
 * without storing personal data in plain text (GDPR / PDPL friendly).
 */
export function hashIp(ip) {
  if (!ip) return '';
  return crypto.createHmac('sha256', config.security.ipHashSalt).update(String(ip)).digest('hex').slice(0, 32);
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Timing-safe string comparison (prevents length/timing oracles). */
export function safeEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ''));
  const bufB = Buffer.from(String(b ?? ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Human friendly booking reference, e.g. KJ-7Q4M2X. */
export function makeReference(prefix = 'KJ') {
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 6; i += 1) out += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
  return `${prefix}-${out}`;
}

export function slugify(input, fallback = 'item') {
  const ascii = String(input || '')
    .toLowerCase()
    .replace(/[\u0600-\u06FF]/g, '') // Arabic letters are dropped; caller supplies an explicit slug
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return ascii || fallback;
}

/** Strips control characters and trims oversized whitespace. */
export function cleanText(value, max = 2000) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
