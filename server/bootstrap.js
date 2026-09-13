import { config } from './config.js';
import { getDb, getSetting, setSetting } from './db/index.js';
import { createUser, findUserByEmail, hashPassword } from './services/auth.js';
import { DEFAULT_SITE_SETTINGS } from './repositories/settings.js';
import { purgeExpiredSessions } from './services/auth.js';
import logger from './utils/logger.js';

/**
 * Creates the first admin account from the environment (once).
 * In development a default password is allowed; in production `assertValidConfig()`
 * already refuses to boot without a strong ADMIN_PASSWORD.
 */
export async function ensureAdminUser() {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;

  const { name, email, password } = config.security.adminBootstrap;
  if (!email) return null;

  const existing = findUserByEmail(email);
  if (existing) {
    if (count === 1 && password && !existing.last_login_at && existing.must_change_pw) {
      // Keep the configured password in sync until the admin has signed in once.
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(password), existing.id);
    }
    return existing;
  }

  if (!password) {
    logger.warn('bootstrap.no_admin_password', { hint: 'Set ADMIN_PASSWORD in .env to create the first admin.' });
    return null;
  }

  const user = await createUser({ name, email, password, role: 'admin' });
  db.prepare('UPDATE users SET must_change_pw = 1 WHERE id = ?').run(user.id);
  logger.info('bootstrap.admin_created', { email: user.email });
  return user;
}

/** Writes default site settings on first boot. */
export function ensureDefaultSettings() {
  if (!getSetting('site')) setSetting('site', DEFAULT_SITE_SETTINGS);
}

/** Housekeeping that runs on a timer (cheap, idempotent). */
export function startMaintenance(intervalMinutes = 15) {
  if (config.isTest) return null;
  const timer = setInterval(() => {
    try {
      const purged = purgeExpiredSessions();
      if (purged) logger.debug('maintenance.sessions_purged', { purged });
    } catch (err) {
      logger.error('maintenance.failed', { message: err.message });
    }
  }, intervalMinutes * 60_000);
  timer.unref?.();
  return timer;
}
