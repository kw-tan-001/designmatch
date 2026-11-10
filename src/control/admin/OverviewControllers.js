'use strict';

/**
 * User Admin - console tools that support stories 1-16.
 *   ViewAdminOverviewController ........... overview dashboard (accounts, approvals, activity)
 *   ViewAdminActivityController ........... activity log of every admin change
 *   RecordAdminActionController ........... writes one activity-log entry
 *   ExportUserAccountsController .......... CSV export of the (filtered) account list
 *   BulkUpdateAccountStatusController ..... suspend / reactivate several accounts at once
 */
const AppError = require('../../utils/AppError');
const v = require('../../utils/validate');
const AccountStatistics = require('../../entity/AccountStatistics');
const AuditLog = require('../../entity/AuditLog');
const UserAccount = require('../../entity/UserAccount');
const UserProfile = require('../../entity/UserProfile');
const InteriorDesigner = require('../../entity/InteriorDesigner');
const { csvCell } = require('../../services/ReportExporter');
const { SuspendUserAccountController } = require('./AccountControllers');

const DEFAULTS = { AccountStatistics, AuditLog, UserAccount, UserProfile, InteriorDesigner };
const STATUSES = ['active', 'suspended'];
const MAX_EXPORT = 5000;
const MAX_BULK = 100;

class ViewAdminOverviewController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute() {
    const [totals, byRole, trend, recentSignups, pending, activity] = await Promise.all([
      this.e.AccountStatistics.totals(),
      this.e.AccountStatistics.byRole(),
      this.e.AccountStatistics.signupTrend(30),
      this.e.AccountStatistics.recentSignups(6),
      this.e.InteriorDesigner.listByStatus('pending', { limit: 4 }),
      this.e.AuditLog.search({ limit: 6 }),
    ]);
    return {
      totals, by_role: byRole, signup_trend: trend, recent_signups: recentSignups,
      pending_registrations: pending.rows, recent_activity: activity.rows,
    };
  }
}

class ViewAdminActivityController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(query = {}) {
    const { page, pageSize, offset } = v.pagination(query, { defaultSize: 25, maxSize: 100 });
    const q = v.str(query.q, 'Search', { required: false, max: 100 });
    const groups = ['account.', 'registration.', 'profile.'];
    let action = null;
    if (query.action) {
      if (!groups.includes(query.action) && !this.e.AuditLog.ACTIONS[query.action]) {
        throw AppError.badRequest('Unknown activity type.');
      }
      action = query.action;
    }
    const result = await this.e.AuditLog.search({ q, action, limit: pageSize, offset });
    return {
      results: result.rows.map((r) => ({ ...r, action_label: this.e.AuditLog.ACTIONS[r.action] || r.action })),
      total: result.total, page, pageSize, totalPages: Math.max(1, Math.ceil(result.total / pageSize)),
      actions: this.e.AuditLog.ACTIONS,
    };
  }
}

class RecordAdminActionController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(actor, { action, targetType, targetId = null, summary }) {
    if (!this.e.AuditLog.ACTIONS[action]) throw AppError.badRequest(`Unknown admin action: ${action}`);
    await this.e.AuditLog.record({ actorId: actor.accountId, action, targetType, targetId, summary });
  }
}

class ExportUserAccountsController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(query = {}) {
    const q = v.str(query.q, 'Search', { required: false, max: 100 });
    const status = query.status ? v.oneOf(query.status, STATUSES, 'Status') : null;
    const role = query.role ? v.oneOf(query.role, UserProfile.ROLES, 'Role') : null;
    const { rows, total } = await this.e.UserAccount.search({ q, status, role, limit: MAX_EXPORT, offset: 0 });
    const header = ['Account ID', 'Full name', 'Email', 'Phone', 'Area', 'Profile', 'Role', 'Status',
      'Designer registration', 'Registered', 'Last login'];
    const iso = (d) => (d ? new Date(d).toISOString() : '');
    const lines = [header, ...rows.map((a) => [
      a.account_id, a.full_name, a.email, a.phone, a.location, a.profile_name, a.role, a.status,
      a.registration_status || '', iso(a.created_at), iso(a.last_login_at),
    ])].map((r) => r.map(csvCell).join(','));
    return {
      filename: `designmatch-accounts-${new Date().toISOString().slice(0, 10)}.csv`,
      csv: `${lines.join('\n')}\n`,
      count: rows.length,
      truncated: total > rows.length,
    };
  }
}

class BulkUpdateAccountStatusController {
  constructor(deps = {}) {
    this.e = { ...DEFAULTS, ...deps };
    this.single = deps.single || new SuspendUserAccountController({ UserAccount: this.e.UserAccount });
  }

  async execute(actor, input = {}) {
    const status = v.oneOf(input.status, STATUSES, 'Status');
    const ids = [...new Set(v.idList(input.accountIds, 'Accounts'))];
    if (!ids.length) throw AppError.badRequest('Select at least one account.');
    if (ids.length > MAX_BULK) throw AppError.badRequest(`Select at most ${MAX_BULK} accounts at a time.`);
    const updated = [];
    const skipped = [];
    for (const id of ids) {
      try {
        const r = await this.single.execute(actor, id, status);
        updated.push(r.account);
      } catch (err) {
        if (!(err instanceof AppError)) throw err;
        skipped.push({ account_id: id, reason: err.message });
      }
    }
    const verb = status === 'suspended' ? 'suspended' : 'reactivated';
    const message = `${updated.length} account${updated.length === 1 ? '' : 's'} ${verb}`
      + (skipped.length ? `, ${skipped.length} skipped.` : '.');
    return { updated, skipped, message };
  }
}

module.exports = {
  ViewAdminOverviewController,
  ViewAdminActivityController,
  RecordAdminActionController,
  ExportUserAccountsController,
  BulkUpdateAccountStatusController,
};
