import fs from 'node:fs';
import path from 'node:path';

import { config, ROOT_DIR } from '../config.js';

const LOG_DIR = path.join(ROOT_DIR, 'logs');
if (!config.isTest) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch {
    /* read-only filesystem: fall back to console only */
  }
}

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LEVELS[(process.env.LOG_LEVEL || (config.isProduction ? 'info' : 'debug')).toLowerCase()] ?? 2;

function write(level, message, meta) {
  if (LEVELS[level] > currentLevel) return;

  const entry = {
    time: new Date().toISOString(),
    level,
    message,
    ...(meta && Object.keys(meta).length ? { meta } : {}),
  };
  const line = JSON.stringify(entry);

  // Structured logs on stdout (12-factor); the stream below keeps a local copy.
  const stream = level === 'error' ? process.stderr : process.stdout;
  stream.write(`${line}\n`);

  if (!config.isTest) {
    try {
      fs.appendFileSync(path.join(LOG_DIR, 'app.log'), `${line}\n`);
    } catch {
      /* ignore */
    }
  }
}

/** Redacts obvious secrets before anything reaches the log. */
export function redact(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const SENSITIVE = new Set(['password', 'newpassword', 'currentpassword', 'token', 'secret', 'authorization', 'cookie']);
  const out = Array.isArray(obj) ? [] : {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = SENSITIVE.has(key.toLowerCase()) ? '[redacted]' : redact(value);
  }
  return out;
}

export const logger = {
  error: (msg, meta) => write('error', msg, meta && redact(meta)),
  warn: (msg, meta) => write('warn', msg, meta && redact(meta)),
  info: (msg, meta) => write('info', msg, meta && redact(meta)),
  debug: (msg, meta) => write('debug', msg, meta && redact(meta)),
};

export default logger;
