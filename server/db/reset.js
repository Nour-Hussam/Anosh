import { closeDb, getDb } from './index.js';
import logger from '../utils/logger.js';

const force = process.argv.includes('--force');

if (!force) {
  // eslint-disable-next-line no-console
  console.error('Refusing to delete the database without --force');
  process.exit(1);
}

const db = getDb();
const tables = db
  .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
  .all()
  .map((r) => r.name);

db.pragma('foreign_keys = OFF');
for (const table of tables) {
  db.prepare(`DELETE FROM ${table}`).run(); // table names come from sqlite_master, never user input
  try {
    db.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).run(table);
  } catch {
    /* sqlite_sequence does not exist yet */
  }
}
db.pragma('foreign_keys = ON');

logger.info('db.reset', { tables: tables.length });
closeDb();
// eslint-disable-next-line no-console
console.log(`✅ Cleared ${tables.length} tables. Run \`npm run seed\` to refill the content.`);
