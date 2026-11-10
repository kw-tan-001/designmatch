'use strict';

const { Pool } = require('pg');
const config = require('./env');

/**
 * Single connection pool shared by the Entity layer.
 * Only Entity classes (src/entity) may import this module - see docs/architecture.md.
 */
const pool = new Pool({
  connectionString: config.databaseUrl,
  max: config.isTest ? 5 : 10,
});

// Report periods (daily/weekly/monthly) are calculated in the platform's timezone
pool.on('connect', (client) => {
  client.query(`SET TIME ZONE '${config.timezone.replace(/'/g, '')}'`).catch(() => {});
});

/** Run a parameterised query. Never interpolate user input into `text`. */
function query(text, params = []) {
  return pool.query(text, params);
}

/**
 * Run `work(client)` inside a transaction. Used for operations that modify
 * several related records (designer registration, IDP create/update, ...).
 */
async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
