'use strict';

const db = require('../config/db');

/**
 * Entity: InteriorDesigner (table interior_designers).
 * Holds professional details and the registration review state
 * (pending -> approved | rejected with reason).
 */
const SELECT = `
  SELECT d.designer_id, d.registration_status, d.rejection_reason, d.reviewed_at,
         d.license_number, d.years_experience, d.specialisation, d.bio,
         a.full_name, a.email, a.phone, a.status AS account_status, a.created_at AS registered_at,
         c.company_id, c.company_name, c.logo_url,
         r.full_name AS reviewed_by_name
  FROM interior_designers d
  JOIN user_accounts a ON a.account_id = d.designer_id
  LEFT JOIN companies c ON c.designer_id = d.designer_id
  LEFT JOIN user_accounts r ON r.account_id = d.reviewed_by`;

class InteriorDesigner {
  static async create({ designerId, licenseNumber = null, yearsExperience = 0, specialisation = null, bio = null }, client = db) {
    await client.query(
      `INSERT INTO interior_designers (designer_id, license_number, years_experience, specialisation, bio)
       VALUES ($1, $2, $3, $4, $5)`,
      [designerId, licenseNumber, yearsExperience, specialisation, bio],
    );
    return InteriorDesigner.findById(designerId, client);
  }

  static async findById(designerId, client = db) {
    const { rows } = await client.query(`${SELECT} WHERE d.designer_id = $1`, [designerId]);
    return rows[0] || null;
  }

  static async listByStatus(status, { limit = 50, offset = 0 } = {}, client = db) {
    const params = [];
    let where = '';
    if (status) { params.push(status); where = 'WHERE d.registration_status = $1'; }
    const count = await client.query(`SELECT COUNT(*)::int AS n FROM interior_designers d ${where}`, params);
    params.push(limit, offset);
    const { rows } = await client.query(
      `${SELECT} ${where} ORDER BY a.created_at ASC LIMIT $${params.length - 1} OFFSET $${params.length}`, params,
    );
    return { rows, total: count.rows[0].n };
  }

  static async approve(designerId, reviewerId, client = db) {
    await client.query(
      `UPDATE interior_designers
       SET registration_status = 'approved', rejection_reason = NULL, reviewed_by = $2, reviewed_at = NOW()
       WHERE designer_id = $1`,
      [designerId, reviewerId],
    );
    return InteriorDesigner.findById(designerId, client);
  }

  static async reject(designerId, reviewerId, reason, client = db) {
    await client.query(
      `UPDATE interior_designers
       SET registration_status = 'rejected', rejection_reason = $3, reviewed_by = $2, reviewed_at = NOW()
       WHERE designer_id = $1`,
      [designerId, reviewerId, reason],
    );
    return InteriorDesigner.findById(designerId, client);
  }

  static async updateProfessional(designerId, { licenseNumber, yearsExperience, specialisation, bio }, client = db) {
    await client.query(
      `UPDATE interior_designers SET
         license_number = COALESCE($2, license_number),
         years_experience = COALESCE($3, years_experience),
         specialisation = COALESCE($4, specialisation),
         bio = COALESCE($5, bio)
       WHERE designer_id = $1`,
      [designerId, licenseNumber ?? null, yearsExperience ?? null, specialisation ?? null, bio ?? null],
    );
    return InteriorDesigner.findById(designerId, client);
  }

  /** Approved, active designers for the public showcase, ranked by engagement. */
  static async listPublic({ limit = 8 } = {}, client = db) {
    const { rows } = await client.query(
      `SELECT d.designer_id, d.years_experience, d.specialisation, c.company_id, c.company_name, c.logo_url,
              (SELECT COUNT(*)::int FROM idps i WHERE i.designer_id = d.designer_id) AS idp_count,
              (SELECT COUNT(*)::int FROM idps i JOIN idp_views v ON v.idp_id = i.idp_id
                WHERE i.designer_id = d.designer_id) AS total_views,
              (SELECT ph.url FROM idps i JOIN idp_photos ph ON ph.idp_id = i.idp_id
                WHERE i.designer_id = d.designer_id ORDER BY i.created_at DESC, ph.sort_order LIMIT 1) AS cover_url,
              ARRAY(SELECT sa.area_name FROM company_service_areas sa WHERE sa.company_id = c.company_id
                    ORDER BY sa.area_name) AS service_areas
       FROM interior_designers d
       JOIN user_accounts a ON a.account_id = d.designer_id
       JOIN user_profiles p ON p.profile_id = a.profile_id
       JOIN companies c ON c.designer_id = d.designer_id
       WHERE d.registration_status = 'approved' AND a.status = 'active' AND p.is_suspended = FALSE
       ORDER BY total_views DESC, d.designer_id
       LIMIT $1`,
      [limit],
    );
    return rows;
  }

  /** True when the designer may be shown publicly (approved and not suspended). */
  static async isPubliclyVisible(designerId, client = db) {
    const { rows } = await client.query(
      `SELECT 1 FROM interior_designers d
       JOIN user_accounts a ON a.account_id = d.designer_id
       JOIN user_profiles p ON p.profile_id = a.profile_id
       WHERE d.designer_id = $1 AND d.registration_status = 'approved'
         AND a.status = 'active' AND p.is_suspended = FALSE`,
      [designerId],
    );
    return rows.length > 0;
  }
}

module.exports = InteriorDesigner;
