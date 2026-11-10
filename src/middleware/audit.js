'use strict';

/**
 * Boundary helper: records a User Admin change in the activity log through
 * RecordAdminActionController. A logging failure is reported on the server
 * console but never undoes or blocks the admin's action, which has already
 * been saved by the time this runs.
 */
const { RecordAdminActionController } = require('../control/admin/OverviewControllers');

const recorder = new RecordAdminActionController();

async function logAdminAction(user, entry) {
  try {
    await recorder.execute(user, entry);
  } catch (err) {
    console.error(`Activity log entry not saved (${entry.action}): ${err.message}`);
  }
}

module.exports = { logAdminAction };
