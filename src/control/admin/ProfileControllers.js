'use strict';

/**
 * User Admin - user profile (role + permission set) use cases.
 *   CreateUserProfileController .. story 12
 *   ViewUserProfileController .... story 13
 *   UpdateUserProfileController .. story 14
 *   SuspendUserProfileController . story 15 (accounts are kept, but cannot log in)
 *   SearchUserProfilesController . story 16
 */
const AppError = require('../../utils/AppError');
const v = require('../../utils/validate');
const UserProfile = require('../../entity/UserProfile');

const DEFAULTS = { UserProfile };

function validatePermissions(role, permissions) {
  const allowed = UserProfile.PERMISSIONS[role];
  const list = v.strList(permissions, 'Permissions', { max: 60, maxItems: 20 });
  const invalid = list.filter((p) => !allowed.includes(p));
  if (invalid.length) {
    throw AppError.badRequest(`Permissions not valid for the ${role} role: ${invalid.join(', ')}.`);
  }
  if (!list.length) throw AppError.badRequest('A profile must have at least one permission.');
  return list;
}

function withLabels(profile) {
  return {
    ...profile,
    permission_details: profile.permissions.map((code) => ({ code, label: UserProfile.PERMISSION_LABELS[code] || code })),
    available_permissions: UserProfile.PERMISSIONS[profile.role].map((code) => ({ code, label: UserProfile.PERMISSION_LABELS[code] })),
  };
}

class SearchUserProfilesController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(query = {}) {
    const q = v.str(query.q, 'Search', { required: false, max: 100 });
    const role = query.role ? v.oneOf(query.role, UserProfile.ROLES, 'Role') : null;
    const { rows, total } = await this.e.UserProfile.search({ q, role, limit: 100 });
    return { results: rows, total };
  }
}

class ViewUserProfileController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(profileId) {
    const profile = await this.e.UserProfile.findById(v.id(profileId, 'Profile id'));
    if (!profile) throw AppError.notFound('User profile not found.');
    return withLabels(profile);
  }

  /** Permission catalogue for building the create/edit forms. */
  catalogue() {
    return Object.fromEntries(UserProfile.ROLES.map((role) => [
      role, UserProfile.PERMISSIONS[role].map((code) => ({ code, label: UserProfile.PERMISSION_LABELS[code] })),
    ]));
  }
}

class CreateUserProfileController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(input) {
    const name = v.str(input.name, 'Profile name', { min: 3, max: 60 });
    const role = v.oneOf(input.role, UserProfile.ROLES, 'Role');
    const description = v.str(input.description, 'Description', { required: false, max: 500 }) || '';
    const permissions = input.permissions === undefined || (Array.isArray(input.permissions) && !input.permissions.length)
      ? UserProfile.PERMISSIONS[role]
      : validatePermissions(role, input.permissions);
    if (await this.e.UserProfile.findByName(name)) throw AppError.conflict('A profile with this name already exists.');
    const profile = await this.e.UserProfile.create({ name, role, description, permissions });
    return withLabels(profile);
  }
}

class UpdateUserProfileController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(actor, profileId, input) {
    const id = v.id(profileId, 'Profile id');
    const profile = await this.e.UserProfile.findById(id);
    if (!profile) throw AppError.notFound('User profile not found.');
    if (input.role !== undefined && input.role !== profile.role) {
      throw AppError.badRequest('The role of an existing profile cannot be changed.');
    }
    const fields = {};
    if (input.name !== undefined) {
      fields.name = v.str(input.name, 'Profile name', { min: 3, max: 60 });
      const clash = await this.e.UserProfile.findByName(fields.name);
      if (clash && clash.profile_id !== id) throw AppError.conflict('A profile with this name already exists.');
    }
    if (input.description !== undefined) fields.description = v.str(input.description, 'Description', { required: false, max: 500 }) || '';
    if (input.permissions !== undefined) {
      fields.permissions = validatePermissions(profile.role, input.permissions);
      if (actor.profileName === profile.name && !fields.permissions.includes('profiles.manage')) {
        throw AppError.badRequest('You cannot remove profile management permission from your own profile.');
      }
    }
    if (!Object.keys(fields).length) throw AppError.badRequest('No changes were provided.');
    return withLabels(await this.e.UserProfile.update(id, fields));
  }
}

class SuspendUserProfileController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(actor, profileId, suspended) {
    const id = v.id(profileId, 'Profile id');
    if (typeof suspended !== 'boolean') throw AppError.badRequest('suspended must be true or false.');
    const profile = await this.e.UserProfile.findById(id);
    if (!profile) throw AppError.notFound('User profile not found.');
    if (actor.profileName === profile.name) throw AppError.badRequest('You cannot suspend your own user profile.');
    if (profile.is_suspended === suspended) {
      throw AppError.conflict(`Profile is already ${suspended ? 'suspended' : 'active'}.`);
    }
    const updated = await this.e.UserProfile.setSuspended(id, suspended);
    return {
      profile: withLabels(updated),
      message: suspended
        ? `Profile suspended. Its ${updated.account_count} account(s) are kept but cannot log in.`
        : 'Profile reactivated.',
    };
  }
}

module.exports = {
  SearchUserProfilesController,
  ViewUserProfileController,
  CreateUserProfileController,
  UpdateUserProfileController,
  SuspendUserProfileController,
};
