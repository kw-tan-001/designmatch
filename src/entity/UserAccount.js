'use strict';

const db = require('../config/db');

/**
 * Entity: UserAccount (table user_accounts).
 * Public reads never return password_hash; only findByEmailWithHash does,
 * and only LoginController uses it.
 */
const SELECT = `
  SELECT a.account_id, a.profile_id, a.email, a.full_name, a.phone, a.location, a.status,
         a.must_change_password, a.last_login_at, a.created_at, a.updated_at,
         p.name AS profile_name, p.role, p.permissions, p.is_suspended AS profile_suspended,
         d.registration_status, d.rejection_reason
  FROM user_accounts a
  JOIN user_profiles p ON p.profile_id = a.profile_id
  LEFT JOIN interior_designers d ON d.designer_id = a.account_id`;

function escapeLike(s) { return s.replace(/[\\%_]/g, '\\$&'); }

class UserAccount {
  static async findById(accountId, client = db) {
    const { rows } = await client.query(`${SELECT} WHERE a.account_id = $1`, [accountId]);
    return rows[0] || null;
  }

  static async findByEmailWithHash(email, client = db) {
    const { rows } = await client.query(
      `${SELECT.replace('SELECT a.account_id', 'SELECT a.password_hash, a.account_id')}
       WHERE LOWER(a.email) = LOWER($1)`,
      [email],
    );
    return rows[0] || null;
  }

  static async getPasswordHash(accountId, client = db) {
    const { rows } = await client.query('SELECT password_hash FROM user_accounts WHERE account_id = $1', [accountId]);
    return rows[0] ? rows[0].password_hash : null;
  }

  static async emailExists(email, excludeId = null, client = db) {
    const { rows } = await client.query(
      'SELECT 1 FROM user_accounts WHERE LOWER(email) = LOWER($1) AND ($2::int IS NULL OR account_id <> $2)',
      [email, excludeId],
    );
    return rows.length > 0;
  }

  /** Search/list accounts with optional keyword, status and role filters. */
  static async search({ q, status, role, profileId, limit = 20, offset = 0 } = {}, client = db) {
    const where = [];
    const params = [];
    if (q) {
      params.push(`%${escapeLike(q)}%`);
      const n = params.length;
      where.push(`(a.full_name ILIKE $${n} OR a.email ILIKE $${n} OR COALESCE(a.phone,'') ILIKE $${n})`);
    }
    if (status) { params.push(status); where.push(`a.status = $${params.length}`); }
    if (role) { params.push(role); where.push(`p.role = $${params.length}`); }
    if (profileId) { params.push(profileId); where.push(`a.profile_id = $${params.length}`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const count = await client.query(
      `SELECT COUNT(*)::int AS n FROM user_accounts a JOIN user_profiles p ON p.profile_id = a.profile_id ${whereSql}`,
      params,
    );
    params.push(limit, offset);
    const { rows } = await client.query(
      `${SELECT} ${whereSql} ORDER BY a.created_at DESC, a.account_id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { rows, total: count.rows[0].n };
  }

  static async create({ profileId, email, passwordHash, fullName, phone = null, location = null, mustChangePassword = false }, client = db) {
    const { rows } = await client.query(
      `INSERT INTO user_accounts (profile_id, email, password_hash, full_name, phone, location, must_change_password)
       VALUES ($1, LOWER($2), $3, $4, $5, $6, $7) RETURNING account_id`,
      [profileId, email, passwordHash, fullName, phone, location, mustChangePassword],
    );
    return UserAccount.findById(rows[0].account_id, client);
  }

  /** Update personal fields. `undefined` keeps a value; `null` clears optional ones. */
  static async update(accountId, fields, client = db) {
    const map = {
      email: 'email', fullName: 'full_name', phone: 'phone', location: 'location', profileId: 'profile_id',
    };
    const sets = [];
    const params = [accountId];
    Object.entries(map).forEach(([key, col]) => {
      if (fields[key] !== undefined) {
        params.push(key === 'email' ? String(fields[key]).toLowerCase() : fields[key]);
        sets.push(`${col} = $${params.length}`);
      }
    });
    if (sets.length) {
      await client.query(`UPDATE user_accounts SET ${sets.join(', ')}, updated_at = NOW() WHERE account_id = $1`, params);
    }
    return UserAccount.findById(accountId, client);
  }

  static async setStatus(accountId, status, client = db) {
    await client.query('UPDATE user_accounts SET status = $2, updated_at = NOW() WHERE account_id = $1', [accountId, status]);
    return UserAccount.findById(accountId, client);
  }

  static async setPassword(accountId, passwordHash, mustChange = false, client = db) {
    await client.query(
      `UPDATE user_accounts SET password_hash = $2, must_change_password = $3, updated_at = NOW()
       WHERE account_id = $1`,
      [accountId, passwordHash, mustChange],
    );
  }

  static async recordLogin(accountId, client = db) {
    await client.query('UPDATE user_accounts SET last_login_at = NOW() WHERE account_id = $1', [accountId]);
  }
}

module.exports = UserAccount;
