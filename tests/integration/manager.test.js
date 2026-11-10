'use strict';

const request = require('supertest');
const { setup, app, login, db } = require('../helpers/fixtures');
const dates = require('../../src/utils/dates');

let ids;
let server;
let manager;
const today = dates.today('Asia/Singapore');

beforeAll(async () => {
  ids = await setup();
  server = app();
  manager = request.agent(server);
  await login(manager, 'manager@test.sg');
  // Activity today: 2 searches, 3 views, 1 favourite (IT-CAT-03 adds one more view before the reports run)
  await request(server).get('/api/idps?keyword=kitchen');
  await request(server).get('/api/idps?keyword=bedroom');
  const customer = request.agent(server);
  await login(customer, 'customer@test.sg');
  for (let i = 0; i < 3; i += 1) await customer.get(`/api/idps/${ids.idpOther}`); // eslint-disable-line no-await-in-loop
  await customer.post('/api/customer/favourites').send({ idpId: ids.idpOther });
});
afterAll(() => db.pool.end());

describe('IT-MGT membership statistics', () => {
  test('IT-MGT-01 users by role match the database (story 49)', async () => {
    const res = await manager.get('/api/manager/stats');
    expect(res.status).toBe(200);
    expect(res.body.total_users).toBe(8);
    expect(res.body.by_role.customer.total).toBe(2);
    expect(res.body.by_role.designer.total).toBe(4);
    expect(res.body.designer_registrations).toEqual({ pending: 1, approved: 2, rejected: 1 });
    expect(res.body.monthly_growth).toHaveLength(6);
  });
});

describe('IT-CAT categories', () => {
  test('IT-CAT-01 view and search categories (stories 56, 57)', async () => {
    expect((await manager.get('/api/manager/categories')).body.total).toBe(8);
    const search = await manager.get('/api/manager/categories?q=room');
    expect(search.body.results.map((c) => c.name)).toEqual(['Bathroom', 'Bedroom', 'Dining Room', 'Living Room', 'Whole-Home']);
  });

  test('IT-CAT-02 create, edit and delete a category (story 50)', async () => {
    const created = await manager.post('/api/manager/categories').send({ name: 'Balcony', description: 'Outdoor spaces' });
    expect(created.status).toBe(201);
    const id = created.body.category.category_id;
    expect((await manager.post('/api/manager/categories').send({ name: 'balcony' })).status).toBe(409);
    expect((await manager.put(`/api/manager/categories/${id}`).send({ name: 'Balcony & Patio' })).body.category.name).toBe('Balcony & Patio');
    expect((await manager.delete(`/api/manager/categories/${id}`)).status).toBe(200);
    expect((await manager.delete(`/api/manager/categories/${id}`)).status).toBe(404);
  });

  test('IT-CAT-03 deleting a used category keeps its IDPs as uncategorised', async () => {
    const res = await manager.delete(`/api/manager/categories/${ids.bedroom}`);
    expect(res.body.affected_idps).toBe(1);
    const idp = await request(server).get(`/api/idps/${ids.idpBedroom}`);
    expect(idp.body.category_name).toBe('Uncategorised');
  });

  test('IT-CAT-04 only Platform Management can manage categories', async () => {
    const designer = request.agent(server);
    await login(designer, 'designer@test.sg');
    expect((await designer.post('/api/manager/categories').send({ name: 'Hack' })).status).toBe(403);
  });
});

describe('IT-RPT reports', () => {
  let reportId;
  test('IT-RPT-01 daily report counts today\'s real activity (story 51)', async () => {
    const res = await manager.post('/api/manager/reports/daily').send({ date: today });
    expect(res.status).toBe(201);
    reportId = res.body.report.report_id;
    expect(res.body.report.data.totals).toMatchObject({ searches: 2, views: 4, favourites: 1, new_users: 8, new_idps: 4 });
    expect(res.body.report.data.new_users_by_role.customer).toBe(2);
  });

  test('IT-RPT-02 weekly report spans Monday to Sunday with growth (story 52)', async () => {
    const res = await manager.post('/api/manager/reports/weekly').send({ weekStart: today });
    const r = res.body.report;
    expect(r.period_start).toBe(dates.startOfWeek(today));
    expect(r.period_end).toBe(dates.addDays(dates.startOfWeek(today), 6));
    expect(r.data.daily_series).toHaveLength(7);
    expect(r.data.growth.views).toBeNull(); // no views in the previous week
  });

  test('IT-RPT-03 monthly report ranks top designers and categories by engagement (story 53)', async () => {
    const res = await manager.post('/api/manager/reports/monthly').send({ month: today.slice(0, 7) });
    const d = res.body.report.data;
    expect(d.top_designers[0]).toMatchObject({ name: 'Drew Interiors', views: 3, favourites: 1, score: 6 });
    expect(d.top_categories[0].name).toBe('Kitchen');
  });

  test('IT-RPT-04 custom date-range report with validation (story 58)', async () => {
    const start = dates.addDays(today, -6);
    const res = await manager.post('/api/manager/reports/custom').send({ start, end: today });
    expect(res.body.report.data.period.days).toBe(7);
    expect((await manager.post('/api/manager/reports/custom').send({ start: today, end: start })).status).toBe(400);
    expect((await manager.post('/api/manager/reports/daily').send({ date: dates.addDays(today, 1) })).status).toBe(400);
  });

  test('IT-RPT-05 previously generated reports are listed and re-opened (story 59)', async () => {
    const list = await manager.get('/api/manager/reports');
    expect(list.body.total).toBe(4);
    expect((await manager.get('/api/manager/reports?type=weekly')).body.total).toBe(1);
    const view = await manager.get(`/api/manager/reports/${reportId}`);
    expect(view.body.data.totals.views).toBe(4);
  });

  test('IT-RPT-06 export as CSV and PDF with the correct period (story 60)', async () => {
    const csv = await manager.get(`/api/manager/reports/${reportId}/export?format=csv`);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.headers['content-disposition']).toContain(`designmatch-daily-report-${today}_to_${today}.csv`);
    expect(csv.text).toContain(`Period start,${today}`);
    expect(csv.text).toContain('IDP views,4');
    const pdf = await manager.get(`/api/manager/reports/${reportId}/export?format=pdf`).buffer(true).parse((res, cb) => {
      const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.slice(0, 5).toString()).toBe('%PDF-');
    expect((await manager.get(`/api/manager/reports/${reportId}/export?format=doc`)).status).toBe(400);
  });

  test('IT-RPT-07 reports are restricted to Platform Management', async () => {
    const admin = request.agent(server);
    await login(admin, 'admin@test.sg');
    expect((await admin.post('/api/manager/reports/daily').send({})).status).toBe(403);
  });
});
