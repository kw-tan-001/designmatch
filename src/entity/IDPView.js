'use strict';

const db = require('../config/db');

/** Entity: IDPView (table idp_views) - one row per IDP detail view. */
class IDPView {
  static async record(idpId, viewerId = null, client = db) {
    await client.query('INSERT INTO idp_views (idp_id, viewer_id) VALUES ($1, $2)', [idpId, viewerId]);
  }
}

module.exports = IDPView;
