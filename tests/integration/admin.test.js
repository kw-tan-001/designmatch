'use strict';

const request = require('supertest');
const { setup, app, login, db } = require('../helpers/fixtures');

let ids;
let server;
let admin;
beforeAll(async () => {
  ids = await setup();
  server = app();
  admin = request.agent(server);
  await login(admin, 'admin@test.sg');
});
afterAll(() => db.pool.end());

describe('IT-ADM user accounts', () => {
  test('IT-ADM-01 list all accounts with pagination (story 1)', async () => {
    const res = await admin.get('/api/admin/accounts?pageSize=5');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(8);
    expect(res.body.results).toHaveLength(5);
    expect(res.body.results[0].password_hash).toBeUndefined();
  });

  test('IT-ADM-02 search accounts by keyword, role and status (story 10)', async () => {
    const res = await admin.get('/api/admin/accounts?q=dana&role=designer');
    expect(res.body.total).toBe(1);
    expect(res.body.results[0].email).toBe('designer@test.sg');
    expect((await admin.get('/api/admin/accounts?status=suspended')).body.total).toBe(0);
  });

  test('IT-ADM-03 create, view and update an account (stories 7, 8, 9)', async () => {
    const profiles = (await admin.get('/api/admin/profiles')).body.results;
    const customerProfile = profiles.find((p) => p.role === 'customer');
    const created = await admin.post('/api/admin/accounts').send({ email: 'made@test.sg', fullName: 'Made User', profileId: customerProfile.profile_id });
    expect(created.status).toBe(201);
    expect(created.body.temporaryPassword).toHaveLength(12);
    const id = created.body.account.account_id;
    const view = await admin.get(`/api/admin/accounts/${id}`);
    expect(view.body).toMatchObject({ email: 'made@test.sg', must_change_password: true });
    const upd = await admin.put(`/api/admin/accounts/${id}`).send({ fullName: 'Made Updated', phone: '+65 9999 1111' });
    expect(upd.body.account.full_name).toBe('Made Updated');
    expect((await admin.get('/api/admin/accounts/999999')).status).toBe(404);
  });

  test('IT-ADM-04 suspend blocks access immediately and reactivate restores it (story 2)', async () => {
    const customer = request.agent(server);
    await login(customer, 'customer2@test.sg');
    expect((await admin.patch(`/api/admin/accounts/${ids.customer2}/status`).send({ status: 'suspended' })).status).toBe(200);
    const blocked = await customer.get('/api/customer/favourites');
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toMatch(/suspended/);
    expect((await request(server).post('/api/auth/login').send({ email: 'customer2@test.sg', password: ids.password })).status).toBe(403);
    await admin.patch(`/api/admin/accounts/${ids.customer2}/status`).send({ status: 'active' });
    await login(request.agent(server), 'customer2@test.sg');
    expect((await admin.patch(`/api/admin/accounts/${ids.admin}/status`).send({ status: 'suspended' })).status).toBe(400);
  });

  test('IT-ADM-05 password reset forces a password change (story 4)', async () => {
    const res = await admin.post(`/api/admin/accounts/${ids.customer}/reset-password`);
    expect(res.status).toBe(200);
    const user = request.agent(server);
    const u = await login(user, 'customer@test.sg', res.body.temporaryPassword);
    expect(u.mustChangePassword).toBe(true);
    const blocked = await user.get('/api/customer/favourites');
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    await user.put('/api/auth/me/password').send({ currentPassword: res.body.temporaryPassword, newPassword: ids.password });
    expect((await user.get('/api/customer/favourites')).status).toBe(200);
  });
});

describe('IT-REG designer approvals', () => {
  test('IT-REG-01 pending queue, approval then login (story 3)', async () => {
    const queue = await admin.get('/api/admin/registrations');
    expect(queue.body.results.map((r) => r.designer_id)).toContain(ids.pending);
    const res = await admin.post(`/api/admin/registrations/${ids.pending}/approve`);
    expect(res.body.designer.registration_status).toBe('approved');
    await login(request.agent(server), 'pending@test.sg');
    expect((await admin.post(`/api/admin/registrations/${ids.pending}/approve`)).status).toBe(409);
  });

  test('IT-REG-02 rejection stores the reason (story 11)', async () => {
    const reg = await request(server).post('/api/auth/register/designer').send({
      email: 'reject.me@test.sg', password: 'Reject123', fullName: 'Rae Reject', phone: '+65 8000 1111', companyName: 'Rae Co', licenseNumber: 'LIC-77', yearsExperience: 1,
    });
    const id = reg.body.designerId;
    expect((await admin.post(`/api/admin/registrations/${id}/reject`).send({ reason: 'short' })).status).toBe(400);
    const res = await admin.post(`/api/admin/registrations/${id}/reject`).send({ reason: 'Company UEN does not match the company name.' });
    expect(res.body.designer.rejection_reason).toBe('Company UEN does not match the company name.');
    const all = await admin.get('/api/admin/registrations?status=rejected');
    expect(all.body.results.some((d) => d.designer_id === id)).toBe(true);
  });
});

describe('IT-PRF user profiles', () => {
  test('IT-PRF-01 create, view, update and search profiles (stories 12, 13, 14, 16)', async () => {
    const created = await admin.post('/api/admin/profiles').send({ name: 'Junior Designer', role: 'designer', permissions: ['idp.manage', 'company.manage'] });
    expect(created.status).toBe(201);
    const id = created.body.profile.profile_id;
    const view = await admin.get(`/api/admin/profiles/${id}`);
    expect(view.body.permission_details.map((p) => p.code)).toEqual(['idp.manage', 'company.manage']);
    const upd = await admin.put(`/api/admin/profiles/${id}`).send({ permissions: ['idp.manage', 'analytics.view'] });
    expect(upd.body.profile.permissions).toEqual(['idp.manage', 'analytics.view']);
    expect((await admin.post('/api/admin/profiles').send({ name: 'Bad', role: 'customer', permissions: ['reports.generate'] })).status).toBe(400);
    const search = await admin.get('/api/admin/profiles?q=junior');
    expect(search.body.total).toBe(1);
    expect(Object.keys((await admin.get('/api/admin/permissions')).body)).toHaveLength(4);
  });

  test('IT-PRF-02 suspending a profile blocks its accounts but keeps them (story 15)', async () => {
    const custProfile = (await admin.get('/api/admin/profiles?role=customer')).body.results[0];
    const before = (await admin.get('/api/admin/accounts?role=customer')).body.total;
    await admin.patch(`/api/admin/profiles/${custProfile.profile_id}/status`).send({ suspended: true });
    const res = await request(server).post('/api/auth/login').send({ email: 'customer2@test.sg', password: ids.password });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/profile/);
    expect((await admin.get('/api/admin/accounts?role=customer')).body.total).toBe(before);
    await admin.patch(`/api/admin/profiles/${custProfile.profile_id}/status`).send({ suspended: false });
  });

  test('IT-PRF-03 a profile without a permission cannot use that function', async () => {
    const readOnly = await admin.post('/api/admin/profiles').send({ name: 'Read-only Admin', role: 'admin', permissions: ['accounts.view'] });
    const acc = await admin.post('/api/admin/accounts').send({ email: 'ro@test.sg', fullName: 'Read Only', profileId: readOnly.body.profile.profile_id, password: 'Readonly123' });
    expect(acc.status).toBe(201);
    const ro = request.agent(server);
    await login(ro, 'ro@test.sg', 'Readonly123');
    expect((await ro.get('/api/admin/accounts')).status).toBe(200);
    expect((await ro.post('/api/admin/accounts').send({ email: 'z@test.sg', fullName: 'Zed', profileId: 1 })).status).toBe(403);
  });
});
