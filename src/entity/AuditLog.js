'use strict';

const db = require('../config/db');

/** Entity: AuditLog (table admin_audit_log) - changes made by User Admins. */
const ACTIONS = {
  'account.create': 'Account created',
  'account.update': 'Account updated',
  'account.suspend': 'Account suspended',
  'account.reactivate': 'Account reactivated',
  'account.reset_password': 'Password reset',
  'registration.approve': 'Designer approved',
  'registration.reject': 'Designer rejected',
  'profile.create': 'Profile created',
  'profile.update': 'Profile updated',
  'profile.suspend': 'Profile suspended',
  'profile.reactivate': 'Profile reactivated',
};

function escapeLike(s) { return s.replace(/[\\%_]/g, '\\$&'); }

class AuditLog {
  static get ACTIONS() { return ACTIONS; }

  static async record({ actorId, action, targetType, targetId = null, summary }, client = db) {
    await client.query(
      `INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, summary)
       VALUES ($1, $2, $3, $4, $5)`,
      [actorId, action, targetType, targetId, String(summary).slice(0, 300)],
    );
  }

  static async search({ q, action, actorId, limit = 25, offset = 0 } = {}, client = db) {
    const where = [];
    const params = [];
    if (q) {
      params.push(`%${escapeLike(q)}%`);
      where.push(`(l.summary ILIKE $${params.length} OR COALESCE(a.full_name, '') ILIKE $${params.length})`);
    }
    if (action) {
      params.push(action.endsWith('.') ? `${escapeLike(action)}%` : action);
      where.push(action.endsWith('.') ? `l.action LIKE $${params.length}` : `l.action = $${params.length}`);
    }
    if (actorId) { params.push(actorId); where.push(`l.actor_id = $${params.length}`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const from = 'FROM admin_audit_log l LEFT JOIN user_accounts a ON a.account_id = l.actor_id';
    const count = await client.query(`SELECT COUNT(*)::int AS n ${from} ${whereSql}`, params);
    params.push(limit, offset);
    const { rows } = await client.query(
      `SELECT l.audit_id, l.action, l.target_type, l.target_id, l.summary, l.created_at,
              l.actor_id, a.full_name AS actor_name
       ${from} ${whereSql}
       ORDER BY l.created_at DESC, l.audit_id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { rows, total: count.rows[0].n };
  }
}

module.exports = AuditLog;
