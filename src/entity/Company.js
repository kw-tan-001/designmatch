'use strict';

const db = require('../config/db');

/**
 * Entity: Company (tables companies + company_service_areas).
 * One company profile per interior designer.
 */
const SELECT = `
  SELECT c.company_id, c.designer_id, c.company_name, c.description, c.logo_url,
         c.contact_email, c.contact_phone, c.website, c.address, c.created_at, c.updated_at,
         ARRAY(SELECT sa.area_name FROM company_service_areas sa
               WHERE sa.company_id = c.company_id ORDER BY sa.area_name) AS service_areas
  FROM companies c`;

class Company {
  static async findByDesigner(designerId, client = db) {
    const { rows } = await client.query(`${SELECT} WHERE c.designer_id = $1`, [designerId]);
    return rows[0] || null;
  }

  static async findById(companyId, client = db) {
    const { rows } = await client.query(`${SELECT} WHERE c.company_id = $1`, [companyId]);
    return rows[0] || null;
  }

  static async create(designerId, fields, client = db) {
    const { rows } = await client.query(
      `INSERT INTO companies (designer_id, company_name, description, logo_url, contact_email, contact_phone, website, address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING company_id`,
      [designerId, fields.companyName, fields.description || '', fields.logoUrl || null,
        fields.contactEmail || null, fields.contactPhone || null, fields.website || null, fields.address || null],
    );
    if (fields.serviceAreas) await Company.setServiceAreas(rows[0].company_id, fields.serviceAreas, client);
    return Company.findById(rows[0].company_id, client);
  }

  static async update(companyId, fields, client = db) {
    const map = {
      companyName: 'company_name', description: 'description', logoUrl: 'logo_url', contactEmail: 'contact_email',
      contactPhone: 'contact_phone', website: 'website', address: 'address',
    };
    const sets = [];
    const params = [companyId];
    Object.entries(map).forEach(([key, col]) => {
      if (fields[key] !== undefined) { params.push(fields[key]); sets.push(`${col} = $${params.length}`); }
    });
    if (sets.length) {
      await client.query(`UPDATE companies SET ${sets.join(', ')}, updated_at = NOW() WHERE company_id = $1`, params);
    }
    if (fields.serviceAreas !== undefined) await Company.setServiceAreas(companyId, fields.serviceAreas, client);
    return Company.findById(companyId, client);
  }

  static async setServiceAreas(companyId, areas, client = db) {
    await client.query('DELETE FROM company_service_areas WHERE company_id = $1', [companyId]);
    for (const area of areas) {
      await client.query(
        'INSERT INTO company_service_areas (company_id, area_name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [companyId, area],
      );
    }
  }
}

module.exports = Company;
