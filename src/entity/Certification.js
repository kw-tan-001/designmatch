'use strict';

const db = require('../config/db');

/** Entity: Certification (table certifications) - qualifications on a company profile. */
class Certification {
  static async listByCompany(companyId, client = db) {
    const { rows } = await client.query(
      `SELECT certification_id, company_id, title, issuer, year_obtained, created_at
       FROM certifications WHERE company_id = $1 ORDER BY year_obtained DESC NULLS LAST, certification_id`,
      [companyId],
    );
    return rows;
  }

  static async create(companyId, { title, issuer, yearObtained = null }, client = db) {
    const { rows } = await client.query(
      `INSERT INTO certifications (company_id, title, issuer, year_obtained)
       VALUES ($1, $2, $3, $4)
       RETURNING certification_id, company_id, title, issuer, year_obtained, created_at`,
      [companyId, title, issuer, yearObtained],
    );
    return rows[0];
  }

  /** Deletes only if the certification belongs to the given company. */
  static async delete(companyId, certificationId, client = db) {
    const { rowCount } = await client.query(
      'DELETE FROM certifications WHERE certification_id = $1 AND company_id = $2',
      [certificationId, companyId],
    );
    return rowCount > 0;
  }
}

module.exports = Certification;
