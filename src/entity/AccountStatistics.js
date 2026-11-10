'use strict';

const db = require('../config/db');

/** Entity: AccountStatistics - read-only aggregates over user_accounts for the User Admin overview. */
class AccountStatistics {
  static async totals(client = db) {
    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS total_accounts,
              COUNT(*) FILTER (WHERE a.status = 'active')::int AS active_accounts,
              COUNT(*) FILTER (WHERE a.status = 'suspended')::int AS suspended_accounts,
              COUNT(*) FILTER (WHERE a.created_at >= NOW() - INTERVAL '7 days')::int AS new_last_7_days,
              COUNT(*) FILTER (WHERE a.last_login_at >= NOW() - INTERVAL '7 days')::int AS logins_last_7_days,
              COUNT(*) FILTER (WHERE a.must_change_password)::int AS temporary_passwords,
              (SELECT COUNT(*)::int FROM interior_designers WHERE registration_status = 'pending') AS pending_registrations,
              (SELECT COUNT(*)::int FROM user_profiles WHERE is_suspended) AS suspended_profiles
       FROM user_accounts a`,
    );
    return rows[0];
  }

  static async byRole(client = db) {
    const { rows } = await client.query(
      `SELECT p.role, COUNT(a.account_id)::int AS accounts,
              COUNT(a.account_id) FILTER (WHERE a.status = 'active')::int AS active
       FROM user_profiles p LEFT JOIN user_accounts a ON a.profile_id = p.profile_id
       GROUP BY p.role ORDER BY accounts DESC`,
    );
    return rows;
  }

  /** New customer and designer accounts per day over the last `days` days. */
  static async signupTrend(days = 30, client = db) {
    const { rows } = await client.query(
      `SELECT to_char(g.day, 'YYYY-MM-DD') AS day,
              COUNT(a.account_id) FILTER (WHERE p.role = 'customer')::int AS customers,
              COUNT(a.account_id) FILTER (WHERE p.role = 'designer')::int AS designers
       FROM generate_series(CURRENT_DATE - ($1::int - 1), CURRENT_DATE, INTERVAL '1 day') AS g(day)
       LEFT JOIN user_accounts a ON a.created_at::date = g.day
       LEFT JOIN user_profiles p ON p.profile_id = a.profile_id
       GROUP BY g.day ORDER BY g.day`,
      [days],
    );
    return rows;
  }

  static async recentSignups(limit = 6, client = db) {
    const { rows } = await client.query(
      `SELECT a.account_id, a.full_name, a.email, a.created_at, a.status, p.role, d.registration_status
       FROM user_accounts a JOIN user_profiles p ON p.profile_id = a.profile_id
       LEFT JOIN interior_designers d ON d.designer_id = a.account_id
       ORDER BY a.created_at DESC, a.account_id DESC LIMIT $1`,
      [limit],
    );
    return rows;
  }
}

module.exports = AccountStatistics;
