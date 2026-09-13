import { doubleCsrf } from 'csrf-csrf';

import { config } from '../config.js';
import logger from '../utils/logger.js';
import { CSRF_COOKIE, COOKIE_BASE_OPTIONS } from '../utils/cookies.js';

/**
 * CSRF: double-submit-cookie pattern (csrf-csrf).
 * The HMAC cookie is httpOnly, so cross-origin JS can neither read the token nor
 * forge a matching pair; every state-changing request must carry the token in the
 * `X-CSRF-Token` header (or `_csrf` body field) that the SPA obtained from
 * `GET /api/csrf-token`.
 */
const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => config.security.csrfSecret,
  // Binds the token to the visitor (or to the signed-in admin session).
  getSessionIdentifier: (req) => req.visitorId || req.cookies?.[CSRF_COOKIE] || 'anonymous',
  cookieName: CSRF_COOKIE,
  cookieOptions: {
    ...COOKIE_BASE_OPTIONS,
    maxAge: 1000 * 60 * 60 * 8,
  },
  size: 32,
  getCsrfTokenFromRequest: (req) => {
    const header = req.headers['x-csrf-token'];
    if (typeof header === 'string' && header.length) return header;
    const bodyToken = req.body?._csrf;
    if (typeof bodyToken === 'string' && bodyToken.length) return bodyToken;
    return '';
  },
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
});

/** Turns csrf-csrf's thrown error into a uniform JSON 403 and logs the attempt. */
function csrfErrorHandler(err, req, res, next) {
  if (err && err.code === 'EBADCSRFTOKEN') {
    logger.warn('csrf.rejected', { path: req.originalUrl, method: req.method });
    return res.status(403).json({
      error: {
        code: 'csrf_failed',
        message: 'Security token invalid or expired. Please refresh the page and try again.',
        message_ar: 'رمز الحماية غير صالح أو منتهي. حدّث الصفحة ثم حاول مرة أخرى.',
      },
    });
  }
  return next(err);
}

export const csrfProtection = [doubleCsrfProtection, csrfErrorHandler];

export const csrfTokenHandler = (req, res) => {
  res.json({ csrfToken: generateCsrfToken(req, res) });
};

export { generateCsrfToken };
