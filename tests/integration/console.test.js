'use strict';

/**
 * Admin console tools (overview, activity log, bulk status, CSV export) and the
 * search improvements (word-based keywords, option counts, zero-result suggestions).
 */
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

describe('IT-CON admin console tools', () => {
  test('IT-CON-01 overview reports live account and approval figures', async () => {
    const res = await admin.get('/api/admin/overview');
    expect(res.status).toBe(200);
    expect(res.body.totals).toMatchObject({ total_accounts: 8, suspended_accounts: 0, pending_registrations: 1 });
    expect(res.body.by_role.find((r) => r.role === 'customer').accounts).toBe(2);
    expect(res.body.signup_trend).toHaveLength(30);
    expect(res.body.pending_registrations[0].designer_id).toBe(ids.pending);
    expect(res.body.recent_signups.length).toBeGreaterThan(0);
  });

  test('IT-CON-02 every admin change is written to the activity log', async () => {
    await admin.post(`/api/admin/registrations/${ids.pending}/reject`).send({ reason: 'Licence number could not be verified.' });
    await admin.patch(`/api/admin/accounts/${ids.customer2}/status`).send({ status: 'suspended' });
    await admin.patch(`/api/admin/accounts/${ids.customer2}/status`).send({ status: 'active' });
    const log = await admin.get('/api/admin/activity');
    expect(log.status).toBe(200);
    expect(log.body.results.map((r) => r.action)).toEqual(['account.reactivate', 'account.suspend', 'registration.reject']);
    expect(log.body.results[2]).toMatchObject({ target_id: ids.pending, actor_name: 'Ada Admin', action_label: 'Designer rejected' });
    expect(log.body.results[2].summary).toMatch(/Pat Pending of Pending Co: Licence number could not be verified/);
    // the overview badge figure drops straight away
    expect((await admin.get('/api/admin/overview')).body.totals.pending_registrations).toBe(0);
    // filters: by group, by exact action and by text
    expect((await admin.get('/api/admin/activity?action=account.')).body.total).toBe(2);
    expect((await admin.get('/api/admin/activity?action=registration.reject')).body.total).toBe(1);
    expect((await admin.get('/api/admin/activity?q=cody')).body.total).toBe(2);
    expect((await admin.get('/api/admin/activity?action=nonsense')).status).toBe(400);
  });

  test('IT-CON-03 bulk suspend and reactivate several accounts, skipping your own', async () => {
    const res = await admin.post('/api/admin/accounts/bulk-status')
      .send({ accountIds: [ids.customer, ids.customer2, ids.admin], status: 'suspended' });
    expect(res.status).toBe(200);
    expect(res.body.updated.map((a) => a.account_id).sort()).toEqual([ids.customer, ids.customer2].sort());
    expect(res.body.skipped).toEqual([{ account_id: ids.admin, reason: expect.stringMatching(/own account/) }]);
    expect(res.body.message).toBe('2 accounts suspended, 1 skipped.');
    expect((await request(server).post('/api/auth/login').send({ email: 'customer@test.sg', password: ids.password })).status).toBe(403);
    const back = await admin.post('/api/admin/accounts/bulk-status').send({ accountIds: [ids.customer, ids.customer2], status: 'active' });
    expect(back.body.message).toBe('2 accounts reactivated.');
    expect((await admin.get('/api/admin/activity?q=bulk')).body.total).toBe(4);
    expect((await admin.post('/api/admin/accounts/bulk-status').send({ accountIds: [], status: 'active' })).status).toBe(400);
    expect((await admin.post('/api/admin/accounts/bulk-status').send({ accountIds: [ids.customer], status: 'gone' })).status).toBe(400);
  });

  test('IT-CON-04 CSV export follows the filters and neutralises spreadsheet formulas', async () => {
    const profiles = (await admin.get('/api/admin/profiles?role=customer')).body.results;
    await admin.post('/api/admin/accounts').send({ email: 'formula@test.sg', fullName: '=HYPERLINK("x")', profileId: profiles[0].profile_id });
    const res = await admin.get('/api/admin/accounts/export.csv?role=customer');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="designmatch-accounts-\d{4}-\d{2}-\d{2}\.csv"/);
    const lines = res.text.trim().split('\n');
    expect(lines[0]).toBe('Account ID,Full name,Email,Phone,Area,Profile,Role,Status,Designer registration,Registered,Last login');
    expect(lines).toHaveLength(4); // header + 3 customers
    expect(res.text).toContain(`"'=HYPERLINK(""x"")"`);
    expect(res.text).not.toContain('password');
  });

  test('IT-CON-05 console tools are for User Admins only', async () => {
    const customer = request.agent(server);
    await login(customer, 'customer@test.sg');
    expect((await customer.get('/api/admin/overview')).status).toBe(403);
    expect((await customer.get('/api/admin/activity')).status).toBe(403);
    expect((await customer.get('/api/admin/accounts/export.csv')).status).toBe(403);
    expect((await request(server).post('/api/admin/accounts/bulk-status').send({})).status).toBe(401);
  });
});

describe('IT-SRCH search filters that guide the customer', () => {
  test('IT-SRCH-08 keywords match every word in any order, across rooms and styles', async () => {
    const anyOrder = await request(server).get('/api/idps?keyword=tampines%20japandi');
    expect(anyOrder.body.results.map((r) => r.idp_id)).toEqual([ids.idpKitchen]);
    const plural = await request(server).get('/api/idps?keyword=kitchens');
    expect(plural.body.total).toBe(2);
    // "Minimalist" is only a style tag on the Bedok bedroom, not in its title or description
    const byStyle = await request(server).get('/api/idps?keyword=minimalist');
    expect(byStyle.body.results.map((r) => r.idp_id)).toEqual([ids.idpBedroom]);
    expect((await request(server).get('/api/idps?keyword=kitchen%20bedok')).body.total).toBe(0);
  });

  test('IT-SRCH-09 option counts ignore their own filter so each option shows what it would return', async () => {
    const res = await request(server).get(`/api/idps?categoryId=${ids.kitchen}&facets=1`);
    expect(res.body.total).toBe(2);
    const f = res.body.facets;
    expect(f.categories).toEqual({ [ids.kitchen]: 2, [ids.bedroom]: 1 });
    expect(f.locations).toEqual({ Bishan: 1, Tampines: 1 });
    expect(f.status).toEqual({ current: 2 });
    expect(f.styles).toEqual({ 4: 1, 5: 1 });
    expect(f.property_types).toEqual({ 1: 1, 3: 1 });
    expect(res.body.suggestions).toBeUndefined();
    // without facets=1 the response is unchanged
    expect((await request(server).get('/api/idps')).body.facets).toBeUndefined();
  });

  test('IT-SRCH-10 an empty result explains which filter is hiding projects', async () => {
    const res = await request(server).get(`/api/idps?keyword=calm&categoryId=${ids.kitchen}&location=Bedok&facets=1`);
    expect(res.body.total).toBe(0);
    expect(res.body.suggestions).toEqual([{ remove: 'categoryId', total: 1 }]);
    const two = await request(server).get(`/api/idps?categoryId=${ids.bedroom}&budgetMax=40000&facets=1`);
    expect(two.body.suggestions).toEqual([{ remove: 'categoryId', total: 1 }, { remove: 'budget', total: 1 }]);
    // conflicting filters where no single removal helps: keep just the keyword
    const clash = await request(server).get(`/api/idps?keyword=tampines&categoryId=${ids.bedroom}&propertyTypeId=3&facets=1`);
    expect(clash.body.suggestions).toEqual([{ keep: 'keyword', total: 1 }]);
  });
});
