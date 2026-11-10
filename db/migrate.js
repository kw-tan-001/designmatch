'use strict';

/**
 * Applies SQL files in db/migrations in filename order and records them in
 * schema_migrations so each runs only once.
 *   node db/migrate.js          apply pending migrations
 *   node db/migrate.js --reset  drop everything, then apply all migrations
 */
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/db');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function migrate({ reset = false, quiet = false } = {}) {
  const log = quiet ? () => {} : console.log;
  const client = await pool.connect();
  try {
    if (reset) {
      log('Resetting database schema...');
      await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    }
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(200) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    const { rows } = await client.query('SELECT filename FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.filename));
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      log(`Applying ${file}`);
      await client.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    }
    log('Migrations complete.');
  } finally {
    client.release();
  }
}

module.exports = { migrate };

if (require.main === module) {
  migrate({ reset: process.argv.includes('--reset') })
    .then(() => pool.end())
    .catch((err) => {
      console.error('Migration failed:', err.message);
      pool.end();
      process.exit(1);
    });
}
