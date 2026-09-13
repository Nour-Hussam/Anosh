import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
delete process.env.DATABASE_FILE;
process.env.TZ = 'Africa/Cairo';
process.env.SESSION_TTL_MINUTES = '120';
process.env.SESSION_IDLE_MINUTES = '45';

const { getDb, closeDb } = await import('../server/db/index.js');
const { createSession, touchSession, readSession, purgeExpiredSessions } = await import('../server/services/auth.js');
const { SESSION_COOKIE } = await import('../server/utils/cookies.js');
const db = getDb();
const user = { id: db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
  .run('Test admin', 'expiry@test.local', 'unused').lastInsertRowid };
test.after(closeDb);

test('renewal uses UTC and the idle deadline, survives reads and maintenance', () => {
  const session = createSession(user, { get: () => "test-agent" });
  const before = Date.now();
  touchSession(session.id);
  const { expires_at } = db.prepare('SELECT expires_at FROM sessions WHERE id = ?').get(session.id);
  assert.match(expires_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  // SQLite's system clock can have coarser resolution than Date.now on Windows.
  assert.ok(Date.parse(expires_at) >= before + 45 * 60_000 - 1000);
  assert.ok(Date.parse(expires_at) <= Date.now() + 45 * 60_000 + 1000);
  assert.equal(purgeExpiredSessions(), 0, 'maintenance must retain a live session');
  assert.equal(readSession({ cookies: { [SESSION_COOKIE]: session.token } })?.user.id, user.id);
});

test('renewal never extends the absolute lifetime', () => {
  const session = createSession(user, { get: () => "test-agent" });
  const created = new Date(Date.now() - 110 * 60_000).toISOString();
  db.prepare('UPDATE sessions SET created_at = ? WHERE id = ?').run(created, session.id);
  touchSession(session.id);
  const { expires_at } = db.prepare('SELECT expires_at FROM sessions WHERE id = ?').get(session.id);
  assert.equal(Date.parse(expires_at), Date.parse(created) + 120 * 60_000);
});

test('expired and idle sessions are still rejected', () => {
  for (const column of ['expires_at', 'last_seen_at']) {
    const session = createSession(user, { get: () => "test-agent" });
    const past = new Date(Date.now() - 46 * 60_000).toISOString();
    db.prepare(`UPDATE sessions SET ${column} = ? WHERE id = ?`).run(past, session.id);
    assert.equal(readSession({ cookies: { [SESSION_COOKIE]: session.token } }), null);
    assert.equal(db.prepare('SELECT id FROM sessions WHERE id = ?').get(session.id), undefined);
  }
});
