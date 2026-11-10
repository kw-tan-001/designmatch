'use strict';

const db = require('../config/db');

/** Entity: Report (table reports) - saved, re-viewable platform reports. */
const SELECT = `
  SELECT r.report_id, r.report_type, r.title,
         to_char(r.period_start, 'YYYY-MM-DD') AS period_start,
         to_char(r.period_end, 'YYYY-MM-DD') AS period_end,
         r.generated_by, a.full_name AS generated_by_name, r.created_at`;

class Report {
  static async create({ reportType, title, periodStart, periodEnd, generatedBy, data }, client = db) {
    const { rows } = await client.query(
      `INSERT INTO reports (report_type, title, period_start, period_end, generated_by, data)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING report_id`,
      [reportType, title, periodStart, periodEnd, generatedBy, JSON.stringify(data)],
    );
    return Report.findById(rows[0].report_id, client);
  }

  static async findAll({ type, limit = 20, offset = 0 } = {}, client = db) {
    const params = [];
    let where = '';
    if (type) { params.push(type); where = 'WHERE r.report_type = $1'; }
    const count = await client.query(`SELECT COUNT(*)::int AS n FROM reports r ${where}`, params);
    params.push(limit, offset);
    const { rows } = await client.query(
      `${SELECT} FROM reports r LEFT JOIN user_accounts a ON a.account_id = r.generated_by ${where}
       ORDER BY r.created_at DESC, r.report_id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { rows, total: count.rows[0].n };
  }

  static async findById(reportId, client = db) {
    const { rows } = await client.query(
      `${SELECT}, r.data FROM reports r LEFT JOIN user_accounts a ON a.account_id = r.generated_by
       WHERE r.report_id = $1`,
      [reportId],
    );
    return rows[0] || null;
  }
}

module.exports = Report;
