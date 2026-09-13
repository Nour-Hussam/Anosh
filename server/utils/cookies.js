import { config } from '../config.js';

/**
 * Cookie names. The `__Host-` prefix (secure contexts) guarantees the cookie is
 * Secure, has no Domain attribute and Path=/ — which blocks sub-domain cookie tossing.
 */
function name(base) {
  return config.security.cookieSecure ? `__Host-cj-${base}` : `cj-${base}`;
}

export const SESSION_COOKIE = name('session');
export const VISITOR_COOKIE = name('vid');
export const CSRF_COOKIE = name('csrf');
export const LANG_COOKIE = 'cj-lang'; // intentionally readable by JS + not host-bound

/**
 * Baseline attributes. `sameSite`/`secure` are refined per request by
 * `cookieSecurityOptions()` (see below) so the app also works when it is served
 * over HTTPS through a proxy — e.g. a hosted preview that embeds it in a frame.
 */
export const COOKIE_BASE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.security.cookieSecure,
  path: '/',
};

/** True when this request reached us over HTTPS (directly, or through a proxy). */
export function isSecureRequest(req) {
  if (config.security.cookieSecure) return true;
  if (!req) return false;
  // `req.secure` is only true when TRUST_PROXY is on, so also look at the header
  // directly. Forging it can at most make us set *stricter* cookies.
  if (req.secure) return true;
  const proto = String(req.get?.('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  return proto === 'https';
}

/**
 * Resolves the cookie attributes for a request.
 *
 * SameSite=Lax cookies are dropped by browsers in a cross-site <iframe>, which is
 * exactly how hosted previews/sandboxes render the app — the dashboard would then
 * look like it "ignores" a correct sign-in, because neither the CSRF cookie nor the
 * session cookie survives. Over HTTPS (and outside production, where the lax policy
 * is still the safe default) we therefore relax to `SameSite=None; Secure`, which
 * browsers accept in third-party frames.
 *
 * Set `COOKIE_SAMESITE=none` explicitly to also allow this in production, e.g. when
 * the dashboard is embedded in a company portal.
 */
export function cookieSecurityOptions(req) {
  const configured = config.security.cookieSameSite;
  let sameSite = configured;
  if (configured === 'auto') {
    sameSite = !config.isProduction && isSecureRequest(req) ? 'none' : 'lax';
  }

  const secure = isSecureRequest(req);
  // Browsers reject `SameSite=None` unless the cookie is also Secure, so never emit
  // that combination — fall back to the strict default instead of losing the cookie.
  if (sameSite === 'none' && !secure) sameSite = 'lax';

  return { sameSite, secure: secure || sameSite === 'none' };
}

/**
 * Applies the policy to every cookie a request writes (ours and the libraries'),
 * whichever code path sets it — session, visitor id and the CSRF double-submit.
 */
export function cookiePolicy(req, res, next) {
  for (const method of ['cookie', 'clearCookie']) {
    const original = res[method].bind(res);
    res[method] = (cookieName, value, options = {}) =>
      original(cookieName, value, { ...options, ...cookieSecurityOptions(req) });
  }
  next();
}
