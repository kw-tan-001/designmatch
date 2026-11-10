'use strict';

const db = require('../config/db');

/** Entity: Enquiry (table enquiries) - customer message sent from an IDP page. */
class Enquiry {
  static async create({ idpId, customerId, designerId, message, contactPhone = null }, client = db) {
    const { rows } = await client.query(
      `INSERT INTO enquiries (idp_id, customer_id, designer_id, message, contact_phone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING enquiry_id, idp_id, customer_id, designer_id, message, contact_phone, status, created_at`,
      [idpId, customerId, designerId, message, contactPhone],
    );
    return rows[0];
  }

  static async listByDesigner(designerId, { status, limit = 20, offset = 0 } = {}, client = db) {
    const params = [designerId];
    let filter = '';
    if (status) { params.push(status); filter = 'AND e.status = $2'; }
    const count = await client.query(
      `SELECT COUNT(*)::int AS n FROM enquiries e WHERE e.designer_id = $1 ${filter}`, params,
    );
    params.push(limit, offset);
    const { rows } = await client.query(
      `SELECT e.enquiry_id, e.idp_id, e.message, e.contact_phone, e.status, e.created_at,
              i.title AS idp_title, a.full_name AS customer_name, a.email AS customer_email
       FROM enquiries e
       JOIN idps i ON i.idp_id = e.idp_id
       JOIN user_accounts a ON a.account_id = e.customer_id
       WHERE e.designer_id = $1 ${filter}
       ORDER BY e.created_at DESC, e.enquiry_id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { rows, total: count.rows[0].n };
  }

  static async listByCustomer(customerId, client = db) {
    const { rows } = await client.query(
      `SELECT e.enquiry_id, e.idp_id, e.message, e.status, e.created_at, i.title AS idp_title, co.company_name
       FROM enquiries e JOIN idps i ON i.idp_id = e.idp_id
       LEFT JOIN companies co ON co.designer_id = e.designer_id
       WHERE e.customer_id = $1 ORDER BY e.created_at DESC`,
      [customerId],
    );
    return rows;
  }

  /** Marks an enquiry read if it belongs to the designer. */
  static async markRead(enquiryId, designerId, client = db) {
    const { rowCount } = await client.query(
      "UPDATE enquiries SET status = 'read' WHERE enquiry_id = $1 AND designer_id = $2", [enquiryId, designerId],
    );
    return rowCount > 0;
  }
}

module.exports = Enquiry;
