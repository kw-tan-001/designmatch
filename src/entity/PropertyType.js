'use strict';

const db = require('../config/db');

/** Entity: PropertyType (table property_types) - HDB, Condominium, Landed, ... (story 33). */
class PropertyType {
  static async findAll(client = db) {
    const { rows } = await client.query('SELECT property_type_id, name FROM property_types ORDER BY property_type_id');
    return rows;
  }

  static async exists(id, client = db) {
    const { rows } = await client.query('SELECT 1 FROM property_types WHERE property_type_id = $1', [id]);
    return rows.length > 0;
  }
}

module.exports = PropertyType;
