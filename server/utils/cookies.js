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

export const COOKIE_BASE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.security.cookieSecure,
  path: '/',
};
