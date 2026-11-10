'use strict';

const db = require('../config/db');

/**
 * Entity: Favourite (table favourites) - a customer's shortlist of IDPs.
 * UNIQUE(customer_id, idp_id) prevents duplicates at the database level.
 */
class Favourite {
  /** Returns the new favourite, or null when it already existed. */
  static async add(customerId, idpId, client = db) {
    const { rows } = await client.query(
      `INSERT INTO favourites (customer_id, idp_id) VALUES ($1, $2)
       ON CONFLICT (customer_id, idp_id) DO NOTHING
       RETURNING favourite_id, customer_id, idp_id, created_at`,
      [customerId, idpId],
    );
    return rows[0] || null;
  }

  static async remove(customerId, idpId, client = db) {
    const { rowCount } = await client.query(
      'DELETE FROM favourites WHERE customer_id = $1 AND idp_id = $2', [customerId, idpId],
    );
    return rowCount > 0;
  }

  /** The customer's favourites, optionally filtered by keyword (story 48). */
  static async listByCustomer(customerId, { q } = {}, client = db) {
    const params = [customerId];
    let filter = '';
    if (q) {
      params.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
      filter = `AND (i.title ILIKE $2 OR i.description ILIKE $2 OR i.location ILIKE $2
                OR COALESCE(co.company_name,'') ILIKE $2 OR COALESCE(cat.name,'') ILIKE $2)`;
    }
    const { rows } = await client.query(
      `SELECT f.favourite_id, f.created_at AS saved_at,
              i.idp_id, i.title, i.status, i.budget_min, i.budget_max, i.location, i.designer_id,
              COALESCE(cat.name, 'Uncategorised') AS category_name, co.company_name,
              (SELECT ph.url FROM idp_photos ph WHERE ph.idp_id = i.idp_id ORDER BY ph.sort_order, ph.photo_id LIMIT 1) AS cover_url
       FROM favourites f
       JOIN idps i ON i.idp_id = f.idp_id
       LEFT JOIN companies co ON co.designer_id = i.designer_id
       LEFT JOIN idp_categories cat ON cat.category_id = i.category_id
       WHERE f.customer_id = $1 ${filter}
       ORDER BY f.created_at DESC, f.favourite_id DESC`,
      params,
    );
    return rows;
  }

  static async idsByCustomer(customerId, client = db) {
    const { rows } = await client.query('SELECT idp_id FROM favourites WHERE customer_id = $1', [customerId]);
    return rows.map((r) => r.idp_id);
  }
}

module.exports = Favourite;
