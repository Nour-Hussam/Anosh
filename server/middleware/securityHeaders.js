import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import helmet from 'helmet';

import { config, ROOT_DIR } from '../config.js';
import logger from '../utils/logger.js';

const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

/* ---------------------------------------------------------------------
   Inline-script allowlist
   ---------------------------------------------------------------------
   The policy forbids 'unsafe-inline', but the pages ship one tiny inline
   bootstrap script (it applies the saved language before first paint so
   there is no RTL/LTR flash). Instead of weakening the policy we hash
   every inline <script> that ships with the app and allow exactly those.
   Hashes are re-read at most once every CACHE_MS, so editing a page in
   development does not require a restart.
--------------------------------------------------------------------- */
const INLINE_SCRIPT_RE = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
const CACHE_MS = 10_000;

let cachedHashes = [];
let cachedAt = 0;

function hashContent(content) {
  return `'sha256-${crypto.createHash('sha256').update(content, 'utf8').digest('base64')}'`;
}

function scanDir(dir, found) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git'].includes(entry.name)) continue;
      scanDir(full, found);
    } else if (entry.name.endsWith('.html')) {
      try {
        const html = fs.readFileSync(full, 'utf8');
        for (const match of html.matchAll(INLINE_SCRIPT_RE)) {
          found.add(hashContent(match[1]));
        }
      } catch (err) {
        logger.debug('csp.scan_failed', { file: full, message: err.message });
      }
    }
  }
}

export function inlineScriptHashes({ force = false } = {}) {
  const now = Date.now();
  if (!force && cachedHashes.length && now - cachedAt < CACHE_MS) return cachedHashes;

  const found = new Set(cachedHashes); // keep previous hashes so a stale tab is not broken
  scanDir(PUBLIC_DIR, found);
  cachedHashes = [...found];
  cachedAt = now;
  return cachedHashes;
}

/* ---------------------------------------------------------------------
   Content Security Policy
   ---------------------------------------------------------------------
   • no 'unsafe-inline' and no 'unsafe-eval'
   • no third-party scripts, frames or objects
   • fonts/styles may come from Google Fonts unless ALLOW_GOOGLE_FONTS=false
--------------------------------------------------------------------- */
const allowGoogleFonts = (process.env.ALLOW_GOOGLE_FONTS ?? 'true').toLowerCase() !== 'false';

function buildCsp() {
  const hashes = inlineScriptHashes();
  const directives = {
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    'script-src': ["'self'", ...hashes],
    'style-src': ["'self'", ...(allowGoogleFonts ? ['https://fonts.googleapis.com'] : [])],
    'font-src': ["'self'", 'data:', ...(allowGoogleFonts ? ['https://fonts.gstatic.com'] : [])],
    'img-src': ["'self'", 'data:', 'blob:'],
    'media-src': ["'self'"],
    'connect-src': ["'self'"],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    // Only used by the optional office-map embed on the contact page.
    'frame-src': ["'self'", 'https://www.openstreetmap.org', 'https://www.google.com'],
  };

  if (config.isProduction) directives['upgrade-insecure-requests'] = [];

  return Object.entries(directives)
    .map(([name, values]) => (values.length ? `${name} ${values.join(' ')}` : null))
    .filter(Boolean)
    .join('; ');
}

let cspValue = null;
let cspBuiltAt = 0;

export function contentSecurityPolicy(req, res, next) {
  const now = Date.now();
  if (!cspValue || now - cspBuiltAt > CACHE_MS) {
    cspValue = buildCsp();
    cspBuiltAt = now;
  }
  res.setHeader('Content-Security-Policy', cspValue);
  next();
}

/* ---------------------------------------------------------------------
   Helmet (everything except CSP, which is handled above)
   --------------------------------------------------------------------- */
export const securityHeaders = helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: config.isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  ieNoOpen: true,
  noSniff: true,
  xssFilter: true,
  dnsPrefetchControl: { allow: false },
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  originAgentCluster: true,
});

/** Extra headers helmet does not cover. */
export function extraSecurityHeaders(req, res, next) {
  res.removeHeader('X-Powered-By');
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=(), usb=(), bluetooth=(), interest-cohort=()'
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
}

/** Long-lived caching for immutable static assets only. */
export function staticAssetHeaders(req, res, next) {
  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  next();
}
