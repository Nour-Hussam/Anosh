import { randomToken } from '../utils/crypto.js';
import { COOKIE_BASE_OPTIONS, VISITOR_COOKIE } from '../utils/cookies.js';

/**
 * Gives every browser an opaque, random visitor id (httpOnly cookie).
 *
 * It is used to bind CSRF tokens to a specific visitor and to aggregate
 * rate-limit counters without ever storing personal data.
 */
export function attachVisitor(req, res, next) {
  let visitor = req.cookies?.[VISITOR_COOKIE];
  if (typeof visitor !== 'string' || visitor.length < 16 || visitor.length > 64 || !/^[A-Za-z0-9_-]+$/.test(visitor)) {
    visitor = randomToken(24);
    res.cookie(VISITOR_COOKIE, visitor, { ...COOKIE_BASE_OPTIONS, maxAge: 1000 * 60 * 60 * 24 * 365 });
  }
  req.visitorId = visitor;
  next();
}
