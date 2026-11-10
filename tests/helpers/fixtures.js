'use strict';

/**
 * Integration-test fixtures: rebuilds the test schema and inserts a small,
 * known dataset. Passwords are hashed exactly as in production.
 */
const db = require('../../src/config/db');
const { migrate } = require('../../db/migrate');
const PasswordService = require('../../src/services/PasswordService');
const { createApp } = require('../../src/app');

const PASSWORD = 'Password123';

async function profileId(role) {
  const { rows } = await db.query('SELECT profile_id FROM user_profiles WHERE role = $1 ORDER BY profile_id LIMIT 1', [role]);
  return rows[0].profile_id;
}

async function account(role, email, name) {
  const hash = await PasswordService.hash(PASSWORD);
  const { rows } = await db.query(
    `INSERT INTO user_accounts (profile_id, email, password_hash, full_name, phone)
     VALUES ($1, $2, $3, $4, '+65 9000 0000') RETURNING account_id`,
    [await profileId(role), email, hash, name],
  );
  return rows[0].account_id;
}

async function designer(email, name, status, company) {
  const id = await account('designer', email, name);
  await db.query(
    `INSERT INTO interior_designers (designer_id, registration_status, rejection_reason, license_number, years_experience)
     VALUES ($1, $2, $3, 'LIC-001', 5)`,
    [id, status, status === 'rejected' ? 'Licence could not be verified.' : null],
  );
  await db.query('INSERT INTO companies (designer_id, company_name, description) VALUES ($1, $2, $3)', [id, company, 'Test studio']);
  return id;
}

async function idp(designerId, { title, categoryId, status = 'current', budgetMin = 20000, budgetMax = 40000, location = 'Tampines', propertyTypeId = 1, styleIds = [1] }) {
  const { rows } = await db.query(
    `INSERT INTO idps (designer_id, category_id, property_type_id, title, description, status, budget_min, budget_max, location)
     VALUES ($1, $2, $3, $4, 'A detailed description of this test project and its materials.', $5, $6, $7, $8) RETURNING idp_id`,
    [designerId, categoryId, propertyTypeId, title, status, budgetMin, budgetMax, location],
  );
  const id = rows[0].idp_id;
  await db.query("INSERT INTO idp_photos (idp_id, url, sort_order) VALUES ($1, 'https://example.com/a.jpg', 0)", [id]);
  for (const s of styleIds) await db.query('INSERT INTO idp_styles (idp_id, style_id) VALUES ($1, $2)', [id, s]); // eslint-disable-line no-await-in-loop
  return id;
}

/** Resets the schema and returns ids of the fixture records. */
async function setup() {
  await migrate({ reset: true, quiet: true });
  const cat = (await db.query("SELECT category_id FROM idp_categories WHERE name = 'Kitchen'")).rows[0].category_id;
  const cat2 = (await db.query("SELECT category_id FROM idp_categories WHERE name = 'Bedroom'")).rows[0].category_id;
  const ids = {
    password: PASSWORD,
    kitchen: cat,
    bedroom: cat2,
    admin: await account('admin', 'admin@test.sg', 'Ada Admin'),
    manager: await account('manager', 'manager@test.sg', 'Max Manager'),
    customer: await account('customer', 'customer@test.sg', 'Cara Customer'),
    customer2: await account('customer', 'customer2@test.sg', 'Cody Customer'),
    designer: await designer('designer@test.sg', 'Dana Designer', 'approved', 'Dana Studio'),
    designer2: await designer('designer2@test.sg', 'Drew Designer', 'approved', 'Drew Interiors'),
    pending: await designer('pending@test.sg', 'Pat Pending', 'pending', 'Pending Co'),
    rejected: await designer('rejected@test.sg', 'Rex Rejected', 'rejected', 'Rejected Co'),
  };
  ids.idpKitchen = await idp(ids.designer, { title: 'Japandi Kitchen in Tampines', categoryId: cat, styleIds: [4], propertyTypeId: 1 });
  ids.idpBedroom = await idp(ids.designer, { title: 'Calm Bedroom in Bedok', categoryId: cat2, status: 'past', location: 'Bedok', budgetMin: 60000, budgetMax: 90000, propertyTypeId: 2, styleIds: [2] });
  ids.idpOther = await idp(ids.designer2, { title: 'Industrial Loft Kitchen', categoryId: cat, location: 'Bishan', budgetMin: 100000, budgetMax: 150000, propertyTypeId: 3, styleIds: [5] });
  ids.idpPending = await idp(ids.pending, { title: 'Hidden Pending Project', categoryId: cat });
  return ids;
}

function app() {
  return createApp({ sessionStore: null });
}

/** Logs a supertest agent in. */
async function login(agent, email, password = PASSWORD) {
  const res = await agent.post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.user;
}

module.exports = { setup, app, login, db, PASSWORD };
