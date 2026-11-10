'use strict';

const db = require('../config/db');

/** Entity: DesignStyle (table design_styles) - tag applied to IDPs (story 33). */
class DesignStyle {
  static async findAll(client = db) {
    const { rows } = await client.query('SELECT style_id, name FROM design_styles ORDER BY name');
    return rows;
  }

  /** True when every id in `ids` exists. */
  static async allExist(ids, client = db) {
    if (!ids.length) return true;
    const { rows } = await client.query(
      'SELECT COUNT(*)::int AS n FROM design_styles WHERE style_id = ANY($1::int[])', [ids],
    );
    return rows[0].n === ids.length;
  }
}

module.exports = DesignStyle;
