import { config } from '../config.js';

/** Typed HTTP error used across the API layer. */
export class ApiError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (details) this.details = details;
  }

  static badRequest(code = 'bad_request', message = 'Bad request', details) {
    return new ApiError(400, code, message, details);
  }

  static unauthorized(code = 'unauthorized', message = 'Authentication required') {
    return new ApiError(401, code, message);
  }

  static forbidden(code = 'forbidden', message = 'Forbidden') {
    return new ApiError(403, code, message);
  }

  static notFound(code = 'not_found', message = 'Resource not found') {
    return new ApiError(404, code, message);
  }

  static conflict(code = 'conflict', message = 'Conflict') {
    return new ApiError(409, code, message);
  }

  static tooMany(code = 'too_many_requests', message = 'Too many requests') {
    return new ApiError(429, code, message);
  }
}

/**
 * Real client IP. Only honours proxy headers when TRUST_PROXY is enabled,
 * otherwise a client could forge X-Forwarded-For to evade rate limiting.
 */
export function clientIp(req) {
  if (config.trustProxy && Array.isArray(req.ips) && req.ips.length) {
    return req.ips[0];
  }
  return req.socket?.remoteAddress || req.ip || '';
}

export function isJsonRequest(req) {
  const type = req.headers['content-type'] || '';
  return type.toLowerCase().includes('application/json');
}

export function userAgent(req, max = 250) {
  return String(req.get('user-agent') || '').slice(0, max);
}

/** Wraps async route handlers so rejected promises reach the error middleware. */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export function ok(res, data, status = 200) {
  return res.status(status).json(data);
}
