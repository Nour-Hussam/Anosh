import { ApiError } from '../utils/http.js';
import { readSession, touchSession } from '../services/auth.js';

/**
 * Resolves the signed-in admin (if any) without failing the request.
 */
export function attachUser(req, _res, next) {
  const session = readSession(req);
  if (session) {
    req.session = session;
    req.user = session.user;
    touchSession(session.id);
  }
  next();
}

/**
 * Gate for every /api/admin/* route except login.
 */
export function requireAuth(req, _res, next) {
  if (!req.user) {
    return next(ApiError.unauthorized('unauthorized', 'You must sign in to continue.'));
  }
  return next();
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden('forbidden', 'Your role does not allow this action.'));
    }
    return next();
  };
}
