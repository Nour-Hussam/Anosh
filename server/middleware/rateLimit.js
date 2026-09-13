import rateLimit from 'express-rate-limit';
import { slowDown } from 'express-slow-down';

import { config } from '../config.js';
import { ApiError, clientIp } from '../utils/http.js';
import { hashIp } from '../utils/crypto.js';
import logger from '../utils/logger.js';

const windowMs = config.rateLimit.windowMinutes * 60 * 1000;

/** All limits key on a salted hash of the IP so raw addresses are never kept in memory. */
const keyGenerator = (req) => hashIp(clientIp(req)) || 'unknown';

function onLimitReached(req) {
  logger.warn('rate_limit.exceeded', {
    path: req.originalUrl,
    ip: hashIp(clientIp(req)),
    ua: String(req.get('user-agent') || '').slice(0, 80),
  });
}

const json429 = (req, res) => {
  onLimitReached(req);
  res.status(429).json({
    error: {
      code: 'too_many_requests',
      message: 'Too many requests. Please try again later.',
      message_ar: 'تم إرسال طلبات كثيرة. من فضلك حاول مرة أخرى بعد قليل.',
    },
  });
};

/** Baseline protection for every /api route. */
export const apiLimiter = rateLimit({
  windowMs,
  limit: config.rateLimit.maxRequests,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator,
  handler: json429,
  skip: () => config.isTest,
});

/** Aggressive protection for form submissions (contact / booking / newsletter). */
export const leadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator,
  handler: json429,
  skip: () => config.isTest,
});

export const newsletterLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator,
  handler: json429,
  skip: () => config.isTest,
});

/** Login brute-force protection. */
export const loginLimiter = rateLimit({
  windowMs: config.security.loginLockMinutes * 60 * 1000,
  limit: config.security.loginMaxAttempts * 2,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `${hashIp(clientIp(req))}:${String(req.body?.email || '').toLowerCase().slice(0, 160)}`,
  handler: json429,
  skip: () => config.isTest,
});

/** Adds latency to repeated login attempts (credential stuffing mitigation). */
export const loginSlowDown = slowDown({
  windowMs: 10 * 60 * 1000,
  delayAfter: 2,
  delayMs: () => 400,
  maxDelayMs: 4000,
  keyGenerator,
  skip: () => config.isTest,
});

/** Protects the admin API surface a little tighter than the public API. */
export const adminLimiter = rateLimit({
  windowMs,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator,
  handler: json429,
  skip: () => config.isTest,
});

export { ApiError };
