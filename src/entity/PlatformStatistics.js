'use strict';

const db = require('../config/db');

/**
 * Entity: PlatformStatistics - read-only aggregate queries over the platform
 * tables, used for membership statistics (story 49) and reports (51-53, 58).
 * All periods are inclusive calendar dates ('YYYY-MM-DD') in the platform timezone.
 *
 * Engagement score used for "top performing" rankings:
 *   score = views + 3 x favourites + 5 x enquiries   (within the period)
 */
const IN_PERIOD = (col) => `${col} >= $1::date AND ${col} < ($2::date + 1)`;

class PlatformStatistics {
  static async membership(client = db) {
    const byRole = await client.query(
      `SELECT p.role, COUNT(a.account_id)::int AS total,
              COUNT(a.account_id) FILTER (WHERE a.status = 'active')::int AS active,
              COUNT(a.account_id) FILTER (WHERE a.status = 'suspended')::int AS suspended
       FROM user_profiles p LEFT JOIN user_accounts a ON a.profile_id = p.profile_id
       GROUP BY p.role ORDER BY p.role`,
    );
    const designers = await client.query(
      `SELECT registration_status AS status, COUNT(*)::int AS total
       FROM interior_designers GROUP BY registration_status`,
    );
    const totals = await client.query(
      `SELECT (SELECT COUNT(*)::int FROM user_accounts) AS total_users,
              (SELECT COUNT(*)::int FROM user_accounts WHERE created_at >= NOW() - INTERVAL '30 days') AS new_users_30d,
              (SELECT COUNT(*)::int FROM idps) AS total_idps,
              (SELECT COUNT(*)::int FROM idp_categories) AS total_categories,
              (SELECT COUNT(*)::int FROM favourites) AS total_favourites,
              (SELECT COUNT(*)::int FROM enquiries) AS total_enquiries,
              (SELECT COUNT(*)::int FROM search_logs) AS total_searches`,
    );
    const growth = await client.query(
      `SELECT to_char(m.month, 'YYYY-MM') AS month,
              (SELECT COUNT(*)::int FROM user_accounts a
                WHERE a.created_at >= m.month AND a.created_at < m.month + INTERVAL '1 month') AS new_users
       FROM generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
                            date_trunc('month', CURRENT_DATE), INTERVAL '1 month') AS m(month)
       ORDER BY m.month`,
    );
    const roles = {};
    byRole.rows.forEach((r) => {
      if (!roles[r.role]) roles[r.role] = { total: 0, active: 0, suspended: 0 };
      roles[r.role].total += r.total;
      roles[r.role].active += r.active;
      roles[r.role].suspended += r.suspended;
    });
    const designerStatus = { pending: 0, approved: 0, rejected: 0 };
    designers.rows.forEach((r) => { designerStatus[r.status] = r.total; });
    return { ...totals.rows[0], by_role: roles, designer_registrations: designerStatus, monthly_growth: growth.rows };
  }

  /** Headline counts for an inclusive date range. */
  static async periodTotals(start, end, client = db) {
    const { rows } = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM user_accounts WHERE ${IN_PERIOD('created_at')}) AS new_users,
         (SELECT COUNT(*)::int FROM idps WHERE ${IN_PERIOD('created_at')}) AS new_idps,
         (SELECT COUNT(*)::int FROM search_logs WHERE ${IN_PERIOD('searched_at')}) AS searches,
         (SELECT COUNT(*)::int FROM idp_views WHERE ${IN_PERIOD('viewed_at')}) AS views,
         (SELECT COUNT(*)::int FROM favourites WHERE ${IN_PERIOD('created_at')}) AS favourites,
         (SELECT COUNT(*)::int FROM enquiries WHERE ${IN_PERIOD('created_at')}) AS enquiries`,
      [start, end],
    );
    return rows[0];
  }

  static async newUsersByRole(start, end, client = db) {
    const { rows } = await client.query(
      `SELECT p.role, COUNT(*)::int AS total FROM user_accounts a
       JOIN user_profiles p ON p.profile_id = a.profile_id
       WHERE ${IN_PERIOD('a.created_at')} GROUP BY p.role ORDER BY p.role`,
      [start, end],
    );
    const out = { admin: 0, designer: 0, customer: 0, manager: 0 };
    rows.forEach((r) => { out[r.role] = r.total; });
    return out;
  }

  /** One row per day in the range with the daily counts. */
  static async dailySeries(start, end, client = db) {
    const { rows } = await client.query(
      `SELECT to_char(g.day, 'YYYY-MM-DD') AS day,
         (SELECT COUNT(*)::int FROM user_accounts WHERE created_at::date = g.day) AS new_users,
         (SELECT COUNT(*)::int FROM idps WHERE created_at::date = g.day) AS new_idps,
         (SELECT COUNT(*)::int FROM search_logs WHERE searched_at::date = g.day) AS searches,
         (SELECT COUNT(*)::int FROM idp_views WHERE viewed_at::date = g.day) AS views,
         (SELECT COUNT(*)::int FROM favourites WHERE created_at::date = g.day) AS favourites,
         (SELECT COUNT(*)::int FROM enquiries WHERE created_at::date = g.day) AS enquiries
       FROM generate_series($1::date, $2::date, INTERVAL '1 day') AS g(day)
       ORDER BY g.day`,
      [start, end],
    );
    return rows;
  }

  static async topDesigners(start, end, limit = 5, client = db) {
    const { rows } = await client.query(
      `WITH v AS (SELECT i.designer_id, COUNT(*) AS n FROM idp_views x JOIN idps i ON i.idp_id = x.idp_id
                  WHERE ${IN_PERIOD('x.viewed_at')} GROUP BY i.designer_id),
            f AS (SELECT i.designer_id, COUNT(*) AS n FROM favourites x JOIN idps i ON i.idp_id = x.idp_id
                  WHERE ${IN_PERIOD('x.created_at')} GROUP BY i.designer_id),
            e AS (SELECT designer_id, COUNT(*) AS n FROM enquiries x
                  WHERE ${IN_PERIOD('x.created_at')} GROUP BY designer_id)
       SELECT d.designer_id, COALESCE(c.company_name, a.full_name) AS name,
              COALESCE(v.n, 0)::int AS views, COALESCE(f.n, 0)::int AS favourites, COALESCE(e.n, 0)::int AS enquiries,
              (COALESCE(v.n, 0) + 3 * COALESCE(f.n, 0) + 5 * COALESCE(e.n, 0))::int AS score
       FROM interior_designers d
       JOIN user_accounts a ON a.account_id = d.designer_id
       LEFT JOIN companies c ON c.designer_id = d.designer_id
       LEFT JOIN v ON v.designer_id = d.designer_id
       LEFT JOIN f ON f.designer_id = d.designer_id
       LEFT JOIN e ON e.designer_id = d.designer_id
       WHERE COALESCE(v.n, 0) + COALESCE(f.n, 0) + COALESCE(e.n, 0) > 0
       ORDER BY score DESC, name LIMIT $3`,
      [start, end, limit],
    );
    return rows;
  }

  static async topCategories(start, end, limit = 5, client = db) {
    const { rows } = await client.query(
      `WITH v AS (SELECT i.category_id, COUNT(*) AS n FROM idp_views x JOIN idps i ON i.idp_id = x.idp_id
                  WHERE ${IN_PERIOD('x.viewed_at')} GROUP BY i.category_id),
            f AS (SELECT i.category_id, COUNT(*) AS n FROM favourites x JOIN idps i ON i.idp_id = x.idp_id
                  WHERE ${IN_PERIOD('x.created_at')} GROUP BY i.category_id),
            e AS (SELECT i.category_id, COUNT(*) AS n FROM enquiries x JOIN idps i ON i.idp_id = x.idp_id
                  WHERE ${IN_PERIOD('x.created_at')} GROUP BY i.category_id),
            n AS (SELECT category_id, COUNT(*) AS n FROM idps WHERE ${IN_PERIOD('created_at')} GROUP BY category_id)
       SELECT c.category_id, c.name,
              COALESCE(n.n, 0)::int AS new_idps,
              COALESCE(v.n, 0)::int AS views, COALESCE(f.n, 0)::int AS favourites, COALESCE(e.n, 0)::int AS enquiries,
              (COALESCE(v.n, 0) + 3 * COALESCE(f.n, 0) + 5 * COALESCE(e.n, 0))::int AS score
       FROM idp_categories c
       LEFT JOIN v ON v.category_id = c.category_id
       LEFT JOIN f ON f.category_id = c.category_id
       LEFT JOIN e ON e.category_id = c.category_id
       LEFT JOIN n ON n.category_id = c.category_id
       WHERE COALESCE(v.n, 0) + COALESCE(f.n, 0) + COALESCE(e.n, 0) + COALESCE(n.n, 0) > 0
       ORDER BY score DESC, c.name LIMIT $3`,
      [start, end, limit],
    );
    return rows;
  }

  static async topSearchKeywords(start, end, limit = 5, client = db) {
    const { rows } = await client.query(
      `SELECT LOWER(keyword) AS keyword, COUNT(*)::int AS searches
       FROM search_logs WHERE keyword IS NOT NULL AND keyword <> '' AND ${IN_PERIOD('searched_at')}
       GROUP BY LOWER(keyword) ORDER BY searches DESC, keyword LIMIT $3`,
      [start, end, limit],
    );
    return rows;
  }
}

module.exports = PlatformStatistics;
