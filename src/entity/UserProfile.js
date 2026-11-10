'use strict';

const db = require('../config/db');

/**
 * Entity: UserProfile (table user_profiles).
 * A profile is a named role definition with a permission set. Every account
 * belongs to exactly one profile.
 */
const ROLES = ['admin', 'designer', 'customer', 'manager'];

/** Permission catalogue - the only codes a profile may hold, grouped by role. */
const PERMISSIONS = {
  admin: ['accounts.view', 'accounts.manage', 'registrations.review', 'profiles.manage'],
  designer: ['company.manage', 'idp.manage', 'analytics.view', 'enquiries.view'],
  customer: ['favourites.manage', 'enquiries.send'],
  manager: ['stats.view', 'categories.manage', 'reports.generate'],
};

const PERMISSION_LABELS = {
  'accounts.view': 'View user accounts',
  'accounts.manage': 'Create, update, suspend accounts and reset passwords',
  'registrations.review': 'Approve or reject designer registrations',
  'profiles.manage': 'Create, update and suspend user profiles',
  'company.manage': 'Manage company profile and certifications',
  'idp.manage': 'Create, edit and delete own IDP listings',
  'analytics.view': 'View IDP views, shortlists and performance dashboard',
  'enquiries.view': 'View customer enquiries',
  'favourites.manage': 'Save and manage favourite IDPs',
  'enquiries.send': 'Send enquiries to interior designers',
  'stats.view': 'View platform membership statistics',
  'categories.manage': 'Create, edit and delete IDP categories',
  'reports.generate': 'Generate, view and export platform reports',
};

const SELECT = `
  SELECT p.profile_id, p.name, p.role, p.description, p.permissions, p.is_suspended,
         p.created_at, p.updated_at,
         (SELECT COUNT(*)::int FROM user_accounts a WHERE a.profile_id = p.profile_id) AS account_count
  FROM user_profiles p`;

class UserProfile {
  static get ROLES() { return ROLES; }
  static get PERMISSIONS() { return PERMISSIONS; }
  static get PERMISSION_LABELS() { return PERMISSION_LABELS; }

  static async search({ q, role, limit = 50, offset = 0 } = {}, client = db) {
    const where = [];
    const params = [];
    if (q) {
      params.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
      where.push(`(p.name ILIKE $${params.length} OR p.description ILIKE $${params.length} OR p.role ILIKE $${params.length})`);
    }
    if (role) { params.push(role); where.push(`p.role = $${params.length}`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = await client.query(`SELECT COUNT(*)::int AS n FROM user_profiles p ${whereSql}`, params);
    params.push(limit, offset);
    const { rows } = await client.query(
      `${SELECT} ${whereSql} ORDER BY p.role, p.name LIMIT $${params.length - 1} OFFSET $${params.length}`, params,
    );
    return { rows, total: total.rows[0].n };
  }

  static async findById(profileId, client = db) {
    const { rows } = await client.query(`${SELECT} WHERE p.profile_id = $1`, [profileId]);
    return rows[0] || null;
  }

  static async findByName(name, client = db) {
    const { rows } = await client.query(`${SELECT} WHERE LOWER(p.name) = LOWER($1)`, [name]);
    return rows[0] || null;
  }

  /** The default (first created, non-suspended) profile for a role. */
  static async findDefaultForRole(role, client = db) {
    const { rows } = await client.query(
      `${SELECT} WHERE p.role = $1 AND p.is_suspended = FALSE ORDER BY p.profile_id LIMIT 1`, [role],
    );
    return rows[0] || null;
  }

  static async create({ name, role, description = '', permissions = [] }, client = db) {
    const { rows } = await client.query(
      `INSERT INTO user_profiles (name, role, description, permissions)
       VALUES ($1, $2, $3, $4) RETURNING profile_id`,
      [name, role, description, permissions],
    );
    return UserProfile.findById(rows[0].profile_id, client);
  }

  static async update(profileId, { name, description, permissions }, client = db) {
    await client.query(
      `UPDATE user_profiles SET
         name = COALESCE($2, name),
         description = COALESCE($3, description),
         permissions = COALESCE($4, permissions),
         updated_at = NOW()
       WHERE profile_id = $1`,
      [profileId, name ?? null, description ?? null, permissions ?? null],
    );
    return UserProfile.findById(profileId, client);
  }

  static async setSuspended(profileId, suspended, client = db) {
    await client.query(
      'UPDATE user_profiles SET is_suspended = $2, updated_at = NOW() WHERE profile_id = $1',
      [profileId, suspended],
    );
    return UserProfile.findById(profileId, client);
  }
}

module.exports = UserProfile;
