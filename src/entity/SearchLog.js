'use strict';

const db = require('../config/db');

/** Entity: SearchLog (table search_logs) - every public IDP search, for reporting. */
class SearchLog {
  static async record({ accountId = null, keyword = null, filters = {}, resultCount = 0 }, client = db) {
    await client.query(
      'INSERT INTO search_logs (account_id, keyword, filters, result_count) VALUES ($1, $2, $3, $4)',
      [accountId, keyword, JSON.stringify(filters), resultCount],
    );
  }
}

module.exports = SearchLog;
