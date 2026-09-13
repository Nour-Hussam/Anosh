import bcrypt from 'bcryptjs';

import { getDb, nowIso } from '../db/index.js';
import { config } from '../config.js';
import { randomToken, sha256 } from '../utils/crypto.js';
import { COOKIE_BASE_OPTIONS, SESSION_COOKIE } from '../utils/cookies.js';
import { userAgent } from '../utils/http.js';
import logger from '../utils/logger.js';

export const BCRYPT_ROUNDS = config.isProduction ? 12 : 10;

export async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain, hash) {
  if (!hash || !plain) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch (err) {
    logger.error('auth.compare_failed', { message: err.message });
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Users                                                              */
/* ------------------------------------------------------------------ */

export function findUserByEmail(email) {
  return getDb()
    .prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE')
    .get(String(email || '').trim().toLowerCase());
}

export function findUserById(id) {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    mustChangePassword: Boolean(user.must_change_pw),
    lastLoginAt: user.last_login_at,
  };
}

export async function createUser({ name, email, password, role = 'admin' }) {
  const passwordHash = await hashPassword(password);
  const info = getDb()
    .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(name, String(email).toLowerCase(), passwordHash, role);
  return findUserById(info.lastInsertRowid);
}

/* ------------------------------------------------------------------ */
/*  Login throttling / lockout                                         */
/* ------------------------------------------------------------------ */

export function isLocked(user) {
  if (!user?.locked_until) return false;
  return new Date(user.locked_until).getTime() > Date.now();
}

export function registerFailedAttempt(user) {
  const attempts = (user.failed_attempts || 0) + 1;
  const db = getDb();
  if (attempts >= config.security.loginMaxAttempts) {
    const until = new Date(Date.now() + config.security.loginLockMinutes * 60_000).toISOString();
    db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?').run(attempts, until, user.id);
    return { locked: true, until };
  }
  db.prepare('UPDATE users SET failed_attempts = ? WHERE id = ?').run(attempts, user.id);
  return { locked: false, remaining: config.security.loginMaxAttempts - attempts };
}

export function resetFailedAttempts(user) {
  getDb()
    .prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?')
    .run(nowIso(), user.id);
}

/* ------------------------------------------------------------------ */
/*  Sessions (opaque token in an httpOnly cookie; only its hash is kept) */
/* ------------------------------------------------------------------ */

export function createSession(user, req) {
  const token = randomToken(32);
  const id = randomToken(16);
  const now = Date.now();
  const expires = new Date(now + config.security.sessionTtlMinutes * 60_000).toISOString();

  getDb()
    .prepare(
      `INSERT INTO sessions (id, token_hash, user_id, user_agent, created_at, expires_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, sha256(token), user.id, userAgent(req), nowIso(), expires, nowIso());

  return { id, token, expires };
}

export function readSession(req) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string' || token.length < 20) return null;

  const session = getDb()
    .prepare(
      `SELECT s.*, u.email AS user_email, u.name AS user_name, u.role AS user_role, u.must_change_pw AS user_must_change_pw
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ?`
    )
    .get(sha256(token));

  if (!session) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    destroySession(session.id);
    return null;
  }

  const idleLimit = Date.now() - config.security.sessionIdleMinutes * 60_000;
  if (new Date(session.last_seen_at).getTime() < idleLimit) {
    destroySession(session.id); // idle timeout
    return null;
  }

  return {
    id: session.id,
    user: {
      id: session.user_id,
      email: session.user_email,
      name: session.user_name,
      role: session.user_role,
      mustChangePassword: Boolean(session.user_must_change_pw),
    },
    expiresAt: session.expires_at,
  };
}

/** Sliding expiration: pushes the deadline forward (never past the absolute TTL). */
export function touchSession(sessionId) {
  const db = getDb();
  db.prepare(
    `UPDATE sessions
        SET last_seen_at = ?,
            expires_at = MIN(strftime('%Y-%m-%dT%H:%M:%fZ','now', '+' || ? || ' minutes'),
                              datetime(created_at, '+' || ? || ' minutes'))
      WHERE id = ?`
  ).run(nowIso(), config.security.sessionIdleMinutes, config.security.sessionTtlMinutes, sessionId);
}

export function destroySession(sessionId) {
  getDb().prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function destroyUserSessions(userId, exceptId = null) {
  getDb()
    .prepare('DELETE FROM sessions WHERE user_id = ? AND (? IS NULL OR id <> ?)')
    .run(userId, exceptId, exceptId);
}

export function purgeExpiredSessions() {
  const info = getDb()
    .prepare(`DELETE FROM sessions WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
    .run();
  return info.changes;
}

export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    ...COOKIE_BASE_OPTIONS,
    maxAge: config.security.sessionTtlMinutes * 60_000,
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { ...COOKIE_BASE_OPTIONS, maxAge: undefined, expires: new Date(0) });
}
