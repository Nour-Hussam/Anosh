import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import 'dotenv/config';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(here, '..');

const env = process.env;

export const NODE_ENV = (env.NODE_ENV || 'development').trim();
export const isProduction = NODE_ENV === 'production';
export const isTest = NODE_ENV === 'test';

const HOST = (env.HOST || '0.0.0.0').trim();
const PORT = Number.parseInt(env.PORT || '3000', 10);

function resolvePath(p) {
  if (!p) return null;
  return path.isAbsolute(p) ? p : path.join(ROOT_DIR, p);
}

function readSecret(name, { required = false, min = 32 } = {}) {
  const value = (env[name] || '').trim();
  if (value.length >= min) return value;

  if (required || isProduction) {
    throw new Error(
      `[config] ${name} must be set to a value of at least ${min} characters. ` +
        `Generate one with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
    );
  }

  const generated = crypto.randomBytes(48).toString('hex');
  if (!isTest) {
    // eslint-disable-next-line no-console
    console.warn(
      `[config] ${name} is not set — using a temporary random value for this process. ` +
        `Sessions/CSRF tokens will be invalidated on restart.`
    );
  }
  return generated;
}

function readNumber(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value) || value < min || value > max) {
    throw new Error(`[config] ${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function readBoolean(name, fallback = false) {
  const raw = (env[name] || '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  throw new Error(`[config] ${name} must be a boolean (true/false).`);
}

function readEnum(name, fallback, allowed) {
  const raw = (env[name] || '').trim().toLowerCase();
  if (!raw) return fallback;
  if (!allowed.includes(raw)) {
    throw new Error(`[config] ${name} must be one of: ${allowed.join(', ')}.`);
  }
  return raw;
}

const trustProxy = env.TRUST_PROXY
  ? readBoolean('TRUST_PROXY') || Number.parseInt(env.TRUST_PROXY, 10) || 0
  : 0;

const databaseFile = resolvePath(env.DATABASE_FILE || 'data/kingdom-journeys.db');
if (databaseFile && databaseFile !== ':memory:') {
  fs.mkdirSync(path.dirname(databaseFile), { recursive: true });
}

export const config = {
  env: NODE_ENV,
  isProduction,
  isTest,
  host: HOST,
  port: PORT,
  baseUrl: (env.BASE_URL || `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`).replace(/\/+$/, ''),
  trustProxy,

  db: {
    file: isTest && !env.DATABASE_FILE ? ':memory:' : databaseFile,
  },

  security: {
    sessionSecret: readSecret('SESSION_SECRET'),
    csrfSecret: readSecret('CSRF_SECRET'),
    ipHashSalt: readSecret('IP_HASH_SALT'),
    sessionTtlMinutes: readNumber('SESSION_TTL_MINUTES', 120, { min: 5, max: 60 * 24 * 7 }),
    sessionIdleMinutes: readNumber('SESSION_IDLE_MINUTES', 45, { min: 1, max: 60 * 24 }),
    loginMaxAttempts: readNumber('LOGIN_MAX_ATTEMPTS', 5, { min: 2, max: 100 }),
    loginLockMinutes: readNumber('LOGIN_LOCK_MINUTES', 15, { min: 1, max: 1440 }),
    cookieSecure: readBoolean('COOKIE_SECURE', isProduction),
    // auto = 'lax' normally, 'none' for HTTPS requests outside production (hosted
    // previews embed the app in a frame, where browsers drop Lax cookies).
    cookieSameSite: readEnum('COOKIE_SAMESITE', 'auto', ['auto', 'lax', 'strict', 'none']),
    adminBootstrap: {
      name: (env.ADMIN_NAME || 'Site Administrator').trim().slice(0, 80),
      email: (env.ADMIN_EMAIL || 'admin@kingdom-journeys.local').trim().toLowerCase().slice(0, 160),
      password: env.ADMIN_PASSWORD || '',
    },
  },

  rateLimit: {
    windowMinutes: readNumber('RATE_LIMIT_WINDOW_MINUTES', 15, { min: 1, max: 1440 }),
    maxRequests: readNumber('RATE_LIMIT_MAX_REQUESTS', 300, { min: 10, max: 100000 }),
  },

  mail: {
    host: (env.SMTP_HOST || '').trim(),
    port: readNumber('SMTP_PORT', 587, { min: 1, max: 65535 }),
    secure: readBoolean('SMTP_SECURE', false),
    user: (env.SMTP_USER || '').trim(),
    password: env.SMTP_PASSWORD || '',
    from: (env.MAIL_FROM || 'Kingdom Journeys <no-reply@kingdom-journeys.sa>').trim(),
    to: (env.MAIL_TO || 'bookings@kingdom-journeys.sa').trim(),
    get enabled() {
      return Boolean(this.host);
    },
  },
};

/** Boot-time sanity checks so misconfiguration fails fast instead of silently. */
export function assertValidConfig() {
  const problems = [];

  if (!Number.isFinite(config.port) || config.port < 0 || config.port > 65535) {
    problems.push('PORT must be a valid TCP port.');
  }
  if (config.isProduction && !config.security.cookieSecure) {
    problems.push('COOKIE_SECURE should be enabled in production (HTTPS only cookies).');
  }
  if (config.isProduction) {
    const { password } = config.security.adminBootstrap;
    if (!password || password.length < 12) {
      problems.push('ADMIN_PASSWORD must be at least 12 characters long in production.');
    }
    if (config.security.adminBootstrap.email.endsWith('.local')) {
      problems.push('ADMIN_EMAIL should be a real address in production.');
    }
  }

  if (problems.length) {
    throw new Error(`[config] Invalid configuration:\n  - ${problems.join('\n  - ')}`);
  }
}

export default config;
