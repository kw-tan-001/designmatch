'use strict';

const request = require('supertest');
const { setup, app, login, db } = require('../helpers/fixtures');

let ids;
let server;
beforeAll(async () => { ids = await setup(); server = app(); });
afterAll(() => db.pool.end());

describe('IT-AUTH authentication and registration', () => {
  test('IT-AUTH-01 login succeeds for every role and /me returns the user (stories 5, 18, 36, 54)', async () => {
    for (const email of ['admin@test.sg', 'designer@test.sg', 'customer@test.sg', 'manager@test.sg']) {
      const agent = request.agent(server);
      const user = await login(agent, email);
      expect(user.email).toBe(email);
      const me = await agent.get('/api/auth/me');
      expect(me.body.user.accountId).toBe(user.accountId);
    }
  });

  test('IT-AUTH-02 invalid credentials return 401 with a generic message', async () => {
    const res = await request(server).post('/api/auth/login').send({ email: 'admin@test.sg', password: 'Wrong999' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password.');
  });

  test('IT-AUTH-03 pending and rejected designers are told why they cannot log in', async () => {
    const p = await request(server).post('/api/auth/login').send({ email: 'pending@test.sg', password: ids.password });
    expect(p.status).toBe(403);
    expect(p.body.error).toMatch(/pending approval/);
    const r = await request(server).post('/api/auth/login').send({ email: 'rejected@test.sg', password: ids.password });
    expect(r.body.error).toMatch(/Licence could not be verified/);
  });

  test('IT-AUTH-04 logout ends the session (stories 6, 28, 42, 55)', async () => {
    const agent = request.agent(server);
    await login(agent, 'customer@test.sg');
    expect((await agent.post('/api/auth/logout')).status).toBe(200);
    expect((await agent.get('/api/customer/favourites')).status).toBe(401);
  });

  test('IT-AUTH-05 customer self-registration logs the user in (story 35)', async () => {
    const agent = request.agent(server);
    const res = await agent.post('/api/auth/register/customer').send({ email: 'new@test.sg', password: 'Newpass123', fullName: 'New Customer' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('customer');
    expect((await agent.get('/api/customer/favourites')).status).toBe(200);
    const dup = await request(server).post('/api/auth/register/customer').send({ email: 'NEW@test.sg', password: 'Newpass123', fullName: 'Dup' });
    expect(dup.status).toBe(409);
    const { rows } = await db.query("SELECT password_hash FROM user_accounts WHERE email = 'new@test.sg'");
    expect(rows[0].password_hash).not.toBe('Newpass123');
  });

  test('IT-AUTH-06 designer registration is created as pending with a company (story 17)', async () => {
    const res = await request(server).post('/api/auth/register/designer').send({
      email: 'studio@test.sg', password: 'Studio123', fullName: 'Sam Studio', phone: '+65 8111 2222', companyName: 'Sam Studio Pte Ltd', licenseNumber: 'LIC-9', yearsExperience: 4,
    });
    expect(res.status).toBe(201);
    expect(res.body.registrationStatus).toBe('pending');
    const { rows } = await db.query("SELECT c.company_name FROM companies c JOIN user_accounts a ON a.account_id = c.designer_id WHERE a.email = 'studio@test.sg'");
    expect(rows[0].company_name).toBe('Sam Studio Pte Ltd');
    const bad = await request(server).post('/api/auth/register/designer').send({ email: 'x@test.sg', password: 'Studio123', fullName: 'X' });
    expect(bad.status).toBe(400);
  });

  test('IT-AUTH-07 users edit their personal profile and password (stories 18, 36)', async () => {
    const agent = request.agent(server);
    await login(agent, 'customer2@test.sg');
    const res = await agent.put('/api/auth/me').send({ fullName: 'Cody C', location: 'Bedok' });
    expect(res.body.user).toMatchObject({ fullName: 'Cody C', location: 'Bedok' });
    expect((await agent.put('/api/auth/me').send({ email: 'customer@test.sg' })).status).toBe(409);
    expect((await agent.put('/api/auth/me/password').send({ currentPassword: 'nope', newPassword: 'Another123' })).status).toBe(400);
    expect((await agent.put('/api/auth/me/password').send({ currentPassword: ids.password, newPassword: 'Another123' })).status).toBe(200);
    await agent.post('/api/auth/logout');
    await login(request.agent(server), 'customer2@test.sg', 'Another123');
  });

  test('IT-AUTH-08 unauthenticated and wrong-role access is refused', async () => {
    expect((await request(server).get('/api/admin/accounts')).status).toBe(401);
    const agent = request.agent(server);
    await login(agent, 'customer@test.sg');
    expect((await agent.get('/api/admin/accounts')).status).toBe(403);
    expect((await agent.get('/api/designer/dashboard')).status).toBe(403);
    expect((await agent.get('/api/manager/stats')).status).toBe(403);
  });

  test('IT-AUTH-09 malformed JSON and unknown API routes are handled', async () => {
    const bad = await request(server).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(bad.status).toBe(400);
    expect((await request(server).get('/api/nothing-here')).status).toBe(404);
    expect((await request(server).get('/api/health')).body.status).toBe('ok');
  });
});
