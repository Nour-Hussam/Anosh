import { config } from '../config.js';
import { ApiError } from '../utils/http.js';

const HONEYPOT_FIELDS = ['website', 'company_url', 'fax_number'];

/**
 * Cheap, privacy-friendly bot filter for public forms:
 *   1. honeypot field that must stay empty (bots auto-fill everything)
 *   2. minimum time between page load and submit (humans need > 3 seconds)
 *   3. maximum form age (replayed submissions)
 *
 * Returns `true` when the submission looks automated — the caller stores it as
 * spam/hidden instead of hard-rejecting (so a false positive never loses a lead).
 */
export function looksLikeBot(req) {
  const body = req.body || {};

  for (const field of HONEYPOT_FIELDS) {
    if (typeof body[field] === 'string' && body[field].trim() !== '') return { bot: true, reason: 'honeypot' };
  }

  const submittedAt = Number(body.form_ts);
  if (Number.isFinite(submittedAt) && submittedAt > 0) {
    const elapsedSeconds = (Date.now() - submittedAt) / 1000;
    if (elapsedSeconds < 3) return { bot: true, reason: 'too_fast' };
    if (elapsedSeconds > 60 * 60 * 12) return { bot: true, reason: 'stale_form' };
  }

  const ua = String(req.get('user-agent') || '');
  if (!ua) return { bot: true, reason: 'no_user_agent' };
  if (/curl|wget|python-requests|scrapy|httpie|postman|node-fetch|go-http-client/i.test(ua)) {
    return { bot: true, reason: 'scripted_client' };
  }

  return { bot: false, reason: null };
}

/** Rejects requests whose body arrived from a cross-origin form post without our token. */
export function sameSiteFormGuard(req, _res, next) {
  const origin = req.get('origin');
  const referer = req.get('referer');
  const source = origin || referer;

  if (source) {
    try {
      const url = new URL(source);
      const allowed = new URL(config.baseUrl);
      const host = req.get('host') || '';
      const sameOrigin = url.host === allowed.host || url.host === host;
      if (!sameOrigin) {
        return next(ApiError.forbidden('origin_mismatch', 'Cross-origin form submission blocked.'));
      }
    } catch {
      return next(ApiError.badRequest('bad_origin', 'Malformed Origin header.'));
    }
  }
  return next();
}
