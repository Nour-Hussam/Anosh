/**
 * Sets (or resets) an admin password from the command line — the escape hatch when
 * the first-run password was changed and forgotten, or the account is locked out.
 *
 *   npm run admin:password                          uses ADMIN_PASSWORD from .env
 *   npm run admin:password -- "New-Pass-123!"       uses the given password
 *   npm run admin:password -- --email a@b.c "…"     targets another admin account
 *
 * Requires shell access to the host, exactly like `npm run reset-db`. The password
 * must satisfy the same rules as the dashboard's own password form.
 */
import { closeDb, getDb, nowIso } from './index.js';
import { config } from '../config.js';
import { BCRYPT_ROUNDS, hashPassword } from '../services/auth.js';

/** `--email a@b.c` / `--email=a@b.c` plus one optional positional password. */
function parseArgs(argv) {
  let email;
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--email') {
      email = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--email=')) {
      email = arg.slice('--email='.length);
    } else if (!arg.startsWith('--')) {
      positional.push(arg);
    }
  }
  return { email, password: positional[0] };
}

const { email: emailArg, password: passwordArg } = parseArgs(process.argv.slice(2));

const password = passwordArg || config.security.adminBootstrap.password;
const email = (emailArg || config.security.adminBootstrap.email || '').trim().toLowerCase();

if (!password) {
  // eslint-disable-next-line no-console
  console.error(
    'No password given. Pass one explicitly or set ADMIN_PASSWORD in .env:\n' +
      '  npm run admin:password -- "My-New-Pass-123!"'
  );
  process.exit(1);
}

// Same policy as the "change password" form in the console.
const problems = [];
if (password.length < 12) problems.push('at least 12 characters');
if (!/[a-z]/.test(password)) problems.push('a lowercase letter');
if (!/[A-Z]/.test(password)) problems.push('an uppercase letter');
if (!/\d/.test(password)) problems.push('a number');
if (!/[^A-Za-z0-9]/.test(password)) problems.push('a symbol');

if (problems.length) {
  // eslint-disable-next-line no-console
  console.error(`That password is too weak — it needs ${problems.join(', ')}.`);
  process.exit(1);
}

const db = getDb();
const user = email
  ? db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email)
  : db.prepare(`SELECT * FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`).get();

if (!user) {
  // eslint-disable-next-line no-console
  console.error(
    `No admin account found${email ? ` for ${email}` : ''}. Start the server once (it creates the first ` +
      'admin from ADMIN_EMAIL/ADMIN_PASSWORD), or pass --email for an existing account.'
  );
  closeDb();
  process.exit(1);
}

const hash = await hashPassword(password); // bcrypt, rounds follow NODE_ENV
db.prepare(
  `UPDATE users
      SET password_hash = ?, must_change_pw = 0, failed_attempts = 0, locked_until = NULL,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?`
).run(hash, user.id);

// Any open session of that account is no longer trustworthy.
const revoked = db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id).changes;
db.prepare(
  `INSERT INTO audit_log (actor_id, actor, action, entity, entity_id, meta, ip_hash, success, created_at)
   VALUES (NULL, ?, ?, ?, ?, ?, '', 1, ?)`
).run('cli', 'password.reset', 'user', String(user.id), JSON.stringify({ email: user.email, bcryptRounds: BCRYPT_ROUNDS }), nowIso());

// eslint-disable-next-line no-console
console.log(
  `✅ Password updated for ${user.email}${revoked ? ` (${revoked} active session${revoked === 1 ? '' : 's'} signed out)` : ''}.\n` +
    '   Sign in at /admin/ — the console will not ask you to change it again.'
);

closeDb();
