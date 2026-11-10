'use strict';

/**
 * User Admin - user account use cases.
 *   ViewUserAccountsController ..... story 1
 *   SuspendUserAccountController ... story 2 (suspend / reactivate)
 *   ResetUserPasswordController .... story 4
 *   CreateUserAccountController .... story 7
 *   ViewUserAccountController ...... story 8
 *   UpdateUserAccountController .... story 9
 *   SearchUserAccountsController ... story 10
 */
const db = require('../../config/db');
const AppError = require('../../utils/AppError');
const v = require('../../utils/validate');
const PasswordService = require('../../services/PasswordService');
const UserAccount = require('../../entity/UserAccount');
const UserProfile = require('../../entity/UserProfile');
const InteriorDesigner = require('../../entity/InteriorDesigner');
const Company = require('../../entity/Company');

const DEFAULTS = { UserAccount, UserProfile, InteriorDesigner, Company, PasswordService, db };
const STATUSES = ['active', 'suspended'];

function paged(result, page, pageSize) {
  return {
    results: result.rows, total: result.total, page, pageSize,
    totalPages: Math.max(1, Math.ceil(result.total / pageSize)),
  };
}

class ViewUserAccountsController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(query = {}) {
    const { page, pageSize, offset } = v.pagination(query, { defaultSize: 20, maxSize: 100 });
    const result = await this.e.UserAccount.search({ limit: pageSize, offset });
    return paged(result, page, pageSize);
  }
}

class SearchUserAccountsController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(query = {}) {
    const { page, pageSize, offset } = v.pagination(query, { defaultSize: 20, maxSize: 100 });
    const q = v.str(query.q, 'Search', { required: false, max: 100 });
    const status = query.status ? v.oneOf(query.status, STATUSES, 'Status') : null;
    const role = query.role ? v.oneOf(query.role, UserProfile.ROLES, 'Role') : null;
    const result = await this.e.UserAccount.search({ q, status, role, limit: pageSize, offset });
    return paged(result, page, pageSize);
  }
}

class ViewUserAccountController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(accountId) {
    const account = await this.e.UserAccount.findById(v.id(accountId, 'Account id'));
    if (!account) throw AppError.notFound('User account not found.');
    const designer = account.role === 'designer' ? await this.e.InteriorDesigner.findById(account.account_id) : null;
    return { ...account, designer };
  }
}

class CreateUserAccountController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(actor, input) {
    const email = v.email(input.email);
    const fullName = v.str(input.fullName, 'Full name', { min: 2, max: 120 });
    const phone = v.str(input.phone, 'Phone', { required: false, max: 30 });
    const location = v.str(input.location, 'Location', { required: false, max: 80 });
    const profileId = v.id(input.profileId, 'User profile');
    const providedPassword = input.password ? v.password(input.password) : null;

    const profile = await this.e.UserProfile.findById(profileId);
    if (!profile) throw AppError.badRequest('Selected user profile does not exist.');
    if (profile.is_suspended) throw AppError.badRequest('Cannot assign a suspended user profile.');
    if (await this.e.UserAccount.emailExists(email)) throw AppError.conflict('An account with this email already exists.');

    const temporaryPassword = providedPassword ? null : this.e.PasswordService.generateTemporary();
    const passwordHash = await this.e.PasswordService.hash(providedPassword || temporaryPassword);

    const account = await this.e.db.withTransaction(async (client) => {
      const created = await this.e.UserAccount.create({
        profileId, email, passwordHash, fullName, phone, location, mustChangePassword: !providedPassword,
      }, client);
      if (profile.role === 'designer') {
        // Accounts created by an admin are pre-approved and get a starter company profile
        await this.e.InteriorDesigner.create({ designerId: created.account_id }, client);
        await this.e.InteriorDesigner.approve(created.account_id, actor.accountId, client);
        await this.e.Company.create(created.account_id, {
          companyName: `${fullName} Interiors`, contactEmail: email, contactPhone: phone,
        }, client);
      }
      return this.e.UserAccount.findById(created.account_id, client);
    });
    return { account, temporaryPassword };
  }
}

class UpdateUserAccountController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(actor, accountId, input) {
    const id = v.id(accountId, 'Account id');
    const existing = await this.e.UserAccount.findById(id);
    if (!existing) throw AppError.notFound('User account not found.');
    const fields = {};
    if (input.fullName !== undefined) fields.fullName = v.str(input.fullName, 'Full name', { min: 2, max: 120 });
    if (input.phone !== undefined) fields.phone = v.str(input.phone, 'Phone', { required: false, max: 30 });
    if (input.location !== undefined) fields.location = v.str(input.location, 'Location', { required: false, max: 80 });
    if (input.email !== undefined) {
      fields.email = v.email(input.email);
      if (await this.e.UserAccount.emailExists(fields.email, id)) throw AppError.conflict('An account with this email already exists.');
    }
    if (input.profileId !== undefined && Number(input.profileId) !== existing.profile_id) {
      const profile = await this.e.UserProfile.findById(v.id(input.profileId, 'User profile'));
      if (!profile) throw AppError.badRequest('Selected user profile does not exist.');
      // Role-specific records (designer portfolio etc.) depend on the role, so only same-role moves are allowed
      if (profile.role !== existing.role) {
        throw AppError.badRequest(`An account can only be moved to another ${existing.role} profile.`);
      }
      if (id === actor.accountId && !profile.permissions.includes('accounts.manage')) {
        throw AppError.badRequest('You cannot move your own account to a profile without account management permission.');
      }
      fields.profileId = profile.profile_id;
    }
    if (!Object.keys(fields).length) throw AppError.badRequest('No changes were provided.');
    return this.e.UserAccount.update(id, fields);
  }
}

class SuspendUserAccountController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  /** status: 'suspended' to suspend, 'active' to reactivate. */
  async execute(actor, accountId, status) {
    const id = v.id(accountId, 'Account id');
    v.oneOf(status, STATUSES, 'Status');
    if (id === actor.accountId) throw AppError.badRequest('You cannot change the status of your own account.');
    const account = await this.e.UserAccount.findById(id);
    if (!account) throw AppError.notFound('User account not found.');
    if (account.status === status) {
      throw AppError.conflict(`Account is already ${status}.`);
    }
    const updated = await this.e.UserAccount.setStatus(id, status);
    return {
      account: updated,
      message: status === 'suspended' ? 'Account suspended. The user can no longer log in.' : 'Account reactivated.',
    };
  }
}

class ResetUserPasswordController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  /**
   * Issues a one-time temporary password. The admin never sees the old password
   * (only its hash exists) and the user must choose a new one at next login.
   */
  async execute(accountId) {
    const id = v.id(accountId, 'Account id');
    const account = await this.e.UserAccount.findById(id);
    if (!account) throw AppError.notFound('User account not found.');
    const temporaryPassword = this.e.PasswordService.generateTemporary();
    await this.e.UserAccount.setPassword(id, await this.e.PasswordService.hash(temporaryPassword), true);
    return {
      temporaryPassword,
      message: `Temporary password issued for ${account.email}. It is shown once; the user must change it at next login.`,
    };
  }
}

module.exports = {
  ViewUserAccountsController,
  SearchUserAccountsController,
  ViewUserAccountController,
  CreateUserAccountController,
  UpdateUserAccountController,
  SuspendUserAccountController,
  ResetUserPasswordController,
};
