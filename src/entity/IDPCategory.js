'use strict';

const db = require('../config/db');

/** Entity: IDPCategory (table idp_categories). Managed by Platform Management. */
// Projects count as public only when their designer is approved and active (same rule as IDP.search)
const PUBLIC_JOIN = `JOIN interior_designers d ON d.designer_id = i.designer_id
  JOIN user_accounts a ON a.account_id = d.designer_id JOIN user_profiles p ON p.profile_id = a.profile_id`;
const PUBLIC_ONLY = "d.registration_status = 'approved' AND a.status = 'active' AND p.is_suspended = FALSE";
const SELECT = `
  SELECT c.category_id, c.name, c.description, c.created_at, c.updated_at,
         (SELECT COUNT(*)::int FROM idps i WHERE i.category_id = c.category_id) AS idp_count,
         (SELECT COUNT(*)::int FROM idps i ${PUBLIC_JOIN} WHERE i.category_id = c.category_id AND ${PUBLIC_ONLY}) AS public_count,
         (SELECT ph.url FROM idps i ${PUBLIC_JOIN}
            JOIN idp_photos ph ON ph.idp_id = i.idp_id
           WHERE i.category_id = c.category_id AND ${PUBLIC_ONLY}
           ORDER BY i.created_at DESC, ph.sort_order LIMIT 1) AS cover_url
  FROM idp_categories c`;

class IDPCategory {
  static async findAll({ q } = {}, client = db) {
    const params = [];
    let where = '';
    if (q) {
      params.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
      where = 'WHERE c.name ILIKE $1 OR c.description ILIKE $1';
    }
    const { rows } = await client.query(`${SELECT} ${where} ORDER BY c.name`, params);
    return rows;
  }

  static async findById(categoryId, client = db) {
    const { rows } = await client.query(`${SELECT} WHERE c.category_id = $1`, [categoryId]);
    return rows[0] || null;
  }

  static async nameExists(name, excludeId = null, client = db) {
    const { rows } = await client.query(
      'SELECT 1 FROM idp_categories WHERE LOWER(name) = LOWER($1) AND ($2::int IS NULL OR category_id <> $2)',
      [name, excludeId],
    );
    return rows.length > 0;
  }

  static async create({ name, description = '' }, client = db) {
    const { rows } = await client.query(
      'INSERT INTO idp_categories (name, description) VALUES ($1, $2) RETURNING category_id',
      [name, description],
    );
    return IDPCategory.findById(rows[0].category_id, client);
  }

  static async update(categoryId, { name, description }, client = db) {
    await client.query(
      `UPDATE idp_categories SET name = COALESCE($2, name), description = COALESCE($3, description),
       updated_at = NOW() WHERE category_id = $1`,
      [categoryId, name ?? null, description ?? null],
    );
    return IDPCategory.findById(categoryId, client);
  }

  static async delete(categoryId, client = db) {
    const { rowCount } = await client.query('DELETE FROM idp_categories WHERE category_id = $1', [categoryId]);
    return rowCount > 0;
  }
}

module.exports = IDPCategory;
