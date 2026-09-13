import { getDb, nowIso } from '../db/index.js';
import { hashIp } from '../utils/crypto.js';
import { clientIp } from '../utils/http.js';
import logger from '../utils/logger.js';

/**
 * Append-only audit trail for admin actions and security events.
 * `meta` is JSON — never put passwords, tokens or full card data in it.
 */
export function audit(req, { action, entity = '', entityId = '', meta = null, actor = null, success = 1 }) {
  try {
    const user = actor || req?.user?.email || 'anonymous';
    getDb()
      .prepare(
        `INSERT INTO audit_log (actor_id, actor, action, entity, entity_id, meta, ip_hash, success, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req?.user?.id ?? null,
        user,
        action,
        entity,
        String(entityId ?? ''),
        meta ? JSON.stringify(meta).slice(0, 4000) : '{}',
        req ? hashIp(clientIp(req)) : '',
        success ? 1 : 0,
        nowIso()
      );
  } catch (err) {
    // Auditing must never break the request path.
    logger.error('audit.write_failed', { message: err.message, action });
  }
}

export function recentAudit(limit = 100, offset = 0, entity = null) {
  const db = getDb();
  const rows = entity
    ? db
        .prepare('SELECT * FROM audit_log WHERE entity = ? ORDER BY id DESC LIMIT ? OFFSET ?')
        .all(entity, limit, offset)
    : db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?').all(limit, offset);
  return rows.map((r) => ({ ...r, meta: safeMeta(r.meta) }));
}

function safeMeta(raw) {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

/** Keeps the table from growing forever. */
export function pruneAudit(keepDays = 180) {
  return getDb()
    .prepare(`DELETE FROM audit_log WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now', ? )`)
    .run(`-${Number(keepDays)} days`).changes;
}

export default audit;
