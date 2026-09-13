import { ApiError } from '../utils/http.js';

export * from '../schemas/primitives.js';

/**
 * Validates `req[source]` against a zod schema and replaces it with the parsed
 * (type-safe, trimmed, length-capped) value. Unknown keys are stripped by the
 * `.strict()` schemas, which makes mass-assignment impossible.
 */
export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.slice(0, 12).map((issue) => ({
        field: issue.path.join('.') || source,
        code: issue.code,
        message: issue.message,
      }));
      return next(new ApiError(422, 'validation_failed', 'The submitted data is not valid.', details));
    }
    req[source] = result.data;
    if (source === 'body') req.validated = result.data;
    return next();
  };
}

/** Validates several sources at once (e.g. body + query + params). */
export function validateAll(map) {
  return [
    map.params ? validate(map.params, 'params') : null,
    map.query ? validate(map.query, 'query') : null,
    map.body ? validate(map.body, 'body') : null,
  ].filter(Boolean);
}
