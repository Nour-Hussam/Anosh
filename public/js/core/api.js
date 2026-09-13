/* ---------------------------------------------------------------------
   API client — JSON + CSRF (double submit cookie) + friendly errors.
   --------------------------------------------------------------------- */

const BASE = '/api';

export class ApiClientError extends Error {
  constructor(status, code, message, details) {
    super(message || 'Request failed');
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isNetwork() {
    return this.status === 0;
  }

  get isAuth() {
    return this.status === 401;
  }
}

let csrfToken = null;
let csrfPromise = null;

export async function fetchCsrfToken(force = false) {
  if (csrfToken && !force) return csrfToken;
  if (!csrfPromise || force) {
    csrfPromise = (async () => {
      const res = await fetch(`${BASE}/csrf-token`, {
        method: 'GET',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new ApiClientError(res.status, 'csrf_unavailable', 'Could not obtain a security token');
      const data = await res.json();
      csrfToken = data.csrfToken;
      return csrfToken;
    })().finally(() => {
      csrfPromise = null;
    });
  }
  return csrfPromise;
}

/** Drops the cached token (used after login/logout or a CSRF rejection). */
export function clearCsrfToken() {
  csrfToken = null;
}

function buildUrl(path, query) {
  const url = `${BASE}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function request(method, path, { body, query, retryOnCsrf = true } = {}) {
  const headers = { Accept: 'application/json' };
  let payload;

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const needsCsrf = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  if (needsCsrf) headers['X-CSRF-Token'] = await fetchCsrfToken();

  let res;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: payload,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiClientError(0, 'network_error', 'Network unreachable');
  }

  // Token expired / rotated → refresh once and replay.
  if (res.status === 403 && needsCsrf && retryOnCsrf) {
    clearCsrfToken();
    return request(method, path, { body, query, retryOnCsrf: false });
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const err = data?.error || {};
    throw new ApiClientError(res.status, err.code || 'error', err.message || res.statusText, err.details);
  }

  return data;
}

export const api = {
  get: (path, query) => request('GET', path, { query }),
  post: (path, body, query) => request('POST', path, { body, query }),
  put: (path, body) => request('PUT', path, { body }),
  patch: (path, body) => request('PATCH', path, { body }),
  delete: (path) => request('DELETE', path),
};

export default api;
