'use strict';

/**
 * Control classes for authentication and self-service account use cases.
 *   LoginController ............... stories 5, 18, 36, 54 (log in, all roles)
 *   LogoutController .............. stories 6, 28, 42, 55 (log out, all roles)
 *   RegisterCustomerController .... story 35
 *   RegisterInteriorDesignerController story 17
 *   EditPersonalProfileController . stories 18, 36 (edit own personal details)
 *   ChangePasswordController ...... stories 18, 36 (and forced change after admin reset, story 4)
 *   AuthenticateSessionController . re-validates the session user on every request
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

/** Shape returned to the client for the signed-in user (never includes the hash). */
function toSessionUser(a) {
  return {
    accountId: a.account_id,
    email: a.email,
    fullName: a.full_name,
    phone: a.phone,
    location: a.location,
    role: a.role,
    profileName: a.profile_name,
    permissions: a.permissions || [],
    mustChangePassword: !!a.must_change_password,
    registrationStatus: a.registration_status || null,
  };
}

/** Business rule shared by login and per-request session checks. */
function assertMayAccess(account) {
  if (account.status === 'suspended') {
    throw AppError.forbidden('Your account has been suspended. Please contact the User Admin.');
  }
  if (account.profile_suspended) {
    throw AppError.forbidden(`Your user profile "${account.profile_name}" is currently suspended. Please contact the User Admin.`);
  }
  if (account.role === 'designer') {
    if (account.registration_status === 'pending') {
      throw AppError.forbidden('Your interior designer registration is pending approval by a User Admin.');
    }
    if (account.registration_status === 'rejected') {
      throw new AppError(403, `Your interior designer registration was rejected. Reason: ${account.rejection_reason}`);
    }
  }
}

class LoginController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute({ email, password }) {
    if (!email || !password) throw AppError.badRequest('Email and password are required.');
    const account = await this.e.UserAccount.findByEmailWithHash(String(email).trim());
    const ok = account && await this.e.PasswordService.verify(String(password), account.password_hash);
    if (!ok) throw AppError.unauthorized('Invalid email or password.');
    assertMayAccess(account);
    await this.e.UserAccount.recordLogin(account.account_id);
    return toSessionUser(account);
  }
}

class LogoutController {
  /** `endSession` is supplied by the Boundary and destroys the HTTP session. */
  async execute({ endSession }) {
    await endSession();
    return { message: 'You have been logged out.' };
  }
}

class AuthenticateSessionController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  /** Returns the current user, or throws if the account may no longer access the system. */
  async execute(accountId) {
    if (!accountId) throw AppError.unauthorized();
    const account = await this.e.UserAccount.findById(accountId);
    if (!account) throw AppError.unauthorized('Your session has expired. Please log in again.');
    assertMayAccess(account);
    return toSessionUser(account);
  }
}

class RegisterCustomerController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(input) {
    const email = v.email(input.email);
    const password = v.password(input.password);
    const fullName = v.str(input.fullName, 'Full name', { min: 2, max: 120 });
    const phone = v.str(input.phone, 'Phone', { required: false, max: 30 });
    const location = v.str(input.location, 'Location', { required: false, max: 80 });

    if (await this.e.UserAccount.emailExists(email)) {
      throw AppError.conflict('An account with this email already exists.');
    }
    const profile = await this.e.UserProfile.findDefaultForRole('customer');
    if (!profile) throw new AppError(503, 'Customer registration is temporarily unavailable.');
    const passwordHash = await this.e.PasswordService.hash(password);
    const account = await this.e.UserAccount.create({
      profileId: profile.profile_id, email, passwordHash, fullName, phone, location,
    });
    return toSessionUser(account);
  }
}

class RegisterInteriorDesignerController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(input) {
    const email = v.email(input.email);
    const password = v.password(input.password);
    const fullName = v.str(input.fullName, 'Full name', { min: 2, max: 120 });
    const phone = v.str(input.phone, 'Phone', { max: 30 });
    const companyName = v.str(input.companyName, 'Company name', { min: 2, max: 150 });
    const licenseNumber = v.str(input.licenseNumber, 'Licence / registration number', { min: 3, max: 60 });
    const yearsExperience = v.int(input.yearsExperience, 'Years of experience', { min: 0, max: 70 });
    const specialisation = v.str(input.specialisation, 'Specialisation', { required: false, max: 120 });
    const bio = v.str(input.bio, 'Professional summary', { required: false, max: 2000 });

    if (await this.e.UserAccount.emailExists(email)) {
      throw AppError.conflict('An account with this email already exists.');
    }
    const profile = await this.e.UserProfile.findDefaultForRole('designer');
    if (!profile) throw new AppError(503, 'Designer registration is temporarily unavailable.');
    const passwordHash = await this.e.PasswordService.hash(password);

    // Account, designer record and company are created atomically
    const designer = await this.e.db.withTransaction(async (client) => {
      const account = await this.e.UserAccount.create({
        profileId: profile.profile_id, email, passwordHash, fullName, phone,
      }, client);
      await this.e.InteriorDesigner.create({
        designerId: account.account_id, licenseNumber, yearsExperience, specialisation, bio,
      }, client);
      await this.e.Company.create(account.account_id, { companyName, contactEmail: email, contactPhone: phone }, client);
      return this.e.InteriorDesigner.findById(account.account_id, client);
    });
    return {
      designerId: designer.designer_id,
      registrationStatus: designer.registration_status,
      message: 'Registration submitted. You can log in once a User Admin approves your application.',
    };
  }
}

class EditPersonalProfileController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(actor, input) {
    const fields = {};
    if (input.fullName !== undefined) fields.fullName = v.str(input.fullName, 'Full name', { min: 2, max: 120 });
    if (input.phone !== undefined) fields.phone = v.str(input.phone, 'Phone', { required: false, max: 30 });
    if (input.location !== undefined) fields.location = v.str(input.location, 'Location', { required: false, max: 80 });
    if (input.email !== undefined) {
      fields.email = v.email(input.email);
      if (await this.e.UserAccount.emailExists(fields.email, actor.accountId)) {
        throw AppError.conflict('An account with this email already exists.');
      }
    }
    if (!Object.keys(fields).length) throw AppError.badRequest('No changes were provided.');
    const account = await this.e.UserAccount.update(actor.accountId, fields);
    return toSessionUser(account);
  }
}

class ChangePasswordController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(actor, { currentPassword, newPassword }) {
    const next = v.password(newPassword, 'New password');
    const hash = await this.e.UserAccount.getPasswordHash(actor.accountId);
    if (!(await this.e.PasswordService.verify(String(currentPassword || ''), hash))) {
      throw AppError.badRequest('Current password is incorrect.');
    }
    if (currentPassword === next) throw AppError.badRequest('New password must be different from the current password.');
    await this.e.UserAccount.setPassword(actor.accountId, await this.e.PasswordService.hash(next), false);
    return { message: 'Password updated successfully.' };
  }
}

module.exports = {
  LoginController,
  LogoutController,
  AuthenticateSessionController,
  RegisterCustomerController,
  RegisterInteriorDesignerController,
  EditPersonalProfileController,
  ChangePasswordController,
  toSessionUser,
  assertMayAccess,
};
