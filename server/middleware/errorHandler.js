import path from 'node:path';

import { config, ROOT_DIR } from '../config.js';
import { ApiError } from '../utils/http.js';
import logger from '../utils/logger.js';

/** 404 for unknown /api routes — always JSON. */
export function apiNotFound(req, res, _next) {
  res.status(404).json({
    error: { code: 'not_found', message: `No API route for ${req.method} ${req.path}` },
  });
}

/** 404 for unknown pages — serves the static 404.html when it exists. */
export function pageNotFound(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return apiNotFound(req, res, next);

  const page = path.join(ROOT_DIR, 'public', '404.html');
  res.status(404);
  return res.sendFile(page, (err) => {
    if (err) {
      res.type('text/plain; charset=utf-8').send('404 — Page not found');
    }
  });
}

/** Central error handler: uniform JSON errors, no stack traces leaked to clients. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let error = err;

  // express.json() body parser failures
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    error = ApiError.badRequest('invalid_json', 'Request body is not valid JSON.');
  } else if (err.type === 'entity.too.large') {
    error = new ApiError(413, 'payload_too_large', 'Request body is too large.');
  } else if (err.code === 'EBADCSRFTOKEN') {
    error = new ApiError(403, 'csrf_failed', 'Invalid CSRF token.');
  } else if (err.code === 'SQLITE_CONSTRAINT' || /UNIQUE constraint failed/i.test(err.message || '')) {
    error = new ApiError(409, 'conflict', 'This record already exists.');
  } else if (err.code === 'LIMIT_FILE_SIZE') {
    error = new ApiError(413, 'payload_too_large', 'Upload is too large.');
  }

  if (!(error instanceof ApiError)) {
    logger.error('unhandled_error', {
      message: err.message,
      stack: config.isProduction ? undefined : err.stack,
      path: req.originalUrl,
    });
    error = new ApiError(500, 'internal_error', 'Something went wrong on our side. Please try again later.');
  } else if (error.status >= 500) {
    logger.error('api_error', { message: error.message, path: req.originalUrl });
  } else {
    logger.debug('api_rejected', { code: error.code, status: error.status, path: req.originalUrl });
  }

  if (res.headersSent) return res.end();

  const body = {
    error: {
      code: error.code || 'error',
      message: error.message,
    },
  };
  if (error.details) body.error.details = error.details;
  if (error.hint) body.error.hint = error.hint;
  if (!config.isProduction && error.status >= 500) body.error.stack = err.stack;

  return res.status(error.status || 500).json(body);
}
