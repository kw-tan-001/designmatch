'use strict';

const request = require('supertest');
const { setup, app, login, db } = require('../helpers/fixtures');

let ids;
let server;
let customer;
beforeAll(async () => {
  ids = await setup();
  server = app();
  customer = request.agent(server);
  await login(customer, 'customer@test.sg');
});
afterAll(() => db.pool.end());

const titles = (res) => res.body.results.map((r) => r.title).sort();

describe('IT-SRCH public search', () => {
  test('IT-SRCH-01 only approved designers\' IDPs are public', async () => {
    const res = await request(server).get('/api/idps');
    expect(res.body.total).toBe(3);
    expect(titles(res)).not.toContain('Hidden Pending Project');
    expect((await request(server).get(`/api/idps/${ids.idpPending}`)).status).toBe(404);
  });

  test('IT-SRCH-02 filter by category, budget range and location (story 37)', async () => {
    expect(titles(await request(server).get(`/api/idps?categoryId=${ids.kitchen}`))).toEqual(['Industrial Loft Kitchen', 'Japandi Kitchen in Tampines']);
    expect(titles(await request(server).get('/api/idps?budgetMin=50000&budgetMax=95000'))).toEqual(['Calm Bedroom in Bedok']);
    expect(titles(await request(server).get('/api/idps?location=bishan'))).toEqual(['Industrial Loft Kitchen']);
    expect(titles(await request(server).get(`/api/idps?categoryId=${ids.kitchen}&location=Tampines&budgetMax=40000`))).toEqual(['Japandi Kitchen in Tampines']);
    // the whole quoted range must fit: S$20k-40k is not "up to S$30k", S$100k-150k is "from S$100k"
    expect(titles(await request(server).get(`/api/idps?categoryId=${ids.kitchen}&budgetMax=30000`))).toEqual([]);
    expect(titles(await request(server).get('/api/idps?budgetMin=100000'))).toEqual(['Industrial Loft Kitchen']);
  });

  test('IT-SRCH-03 keyword search across title, description, location and designer (story 43)', async () => {
    expect(titles(await request(server).get('/api/idps?keyword=japandi'))).toEqual(['Japandi Kitchen in Tampines']);
    expect((await request(server).get('/api/idps?keyword=Drew Interiors')).body.total).toBe(1);
    expect((await request(server).get('/api/idps?keyword=50%25_')).body.total).toBe(0);
    const none = await request(server).get('/api/idps?keyword=zzzz');
    expect(none.body).toMatchObject({ total: 0, results: [] });
  });

  test('IT-SRCH-04 filter by design style and property type (story 44)', async () => {
    expect(titles(await request(server).get('/api/idps?styleIds=5'))).toEqual(['Industrial Loft Kitchen']);
    expect(titles(await request(server).get('/api/idps?styleIds=2,4'))).toEqual(['Calm Bedroom in Bedok', 'Japandi Kitchen in Tampines']);
    expect(titles(await request(server).get('/api/idps?propertyTypeId=2'))).toEqual(['Calm Bedroom in Bedok']);
  });

  test('IT-SRCH-05 sort results and paginate (story 45)', async () => {
    await request(server).get(`/api/idps/${ids.idpOther}`);
    await request(server).get(`/api/idps/${ids.idpOther}`);
    const byViews = await request(server).get('/api/idps?sort=most_viewed');
    expect(byViews.body.results[0].idp_id).toBe(ids.idpOther);
    const cheap = await request(server).get('/api/idps?sort=budget_low');
    expect(cheap.body.results[0].budget_min).toBe(20000);
    const page2 = await request(server).get('/api/idps?pageSize=2&page=2');
    expect(page2.body).toMatchObject({ page: 2, totalPages: 2 });
    expect(page2.body.results).toHaveLength(1);
    expect((await request(server).get('/api/idps?sort=random')).status).toBe(400);
  });

  test('IT-SRCH-06 searches are logged for reports', async () => {
    const { rows } = await db.query("SELECT COUNT(*)::int AS n FROM search_logs WHERE keyword = 'japandi'");
    expect(rows[0].n).toBe(1);
  });

  test('IT-SRCH-07 search options come from the database', async () => {
    const meta = await request(server).get('/api/meta');
    expect(meta.body.categories).toHaveLength(8);
    expect(meta.body.locations.sort()).toEqual(['Bedok', 'Bishan', 'Tampines']);
  });
});

describe('IT-CUS details, designers, favourites and enquiries', () => {
  test('IT-CUS-01 IDP details include photos and designer info (story 38)', async () => {
    const res = await request(server).get(`/api/idps/${ids.idpKitchen}`);
    expect(res.body).toMatchObject({ title: 'Japandi Kitchen in Tampines', company_name: 'Dana Studio', registration_status: 'approved' });
    expect(res.body.photos).toHaveLength(1);
    expect(res.body.more_from_designer.map((i) => i.idp_id)).toEqual([ids.idpBedroom]);
  });

  test('IT-CUS-02 designer company profile and all their IDPs (stories 46, 47)', async () => {
    const page = await request(server).get(`/api/designers/${ids.designer}`);
    expect(page.body.company.company_name).toBe('Dana Studio');
    expect(page.body.designer.verified).toBe(true);
    const list = await request(server).get(`/api/designers/${ids.designer}/idps?status=past`);
    expect(titles(list)).toEqual(['Calm Bedroom in Bedok']);
    expect((await request(server).get(`/api/designers/${ids.pending}`)).status).toBe(404);
    expect((await request(server).get('/api/designers')).body).toHaveLength(2);
  });

  test('IT-CUS-03 favourites require login and cannot be duplicated (story 39)', async () => {
    expect((await request(server).post('/api/customer/favourites').send({ idpId: ids.idpKitchen })).status).toBe(401);
    expect((await customer.post('/api/customer/favourites').send({ idpId: ids.idpKitchen })).status).toBe(201);
    expect((await customer.post('/api/customer/favourites').send({ idpId: ids.idpKitchen })).status).toBe(409);
    expect((await customer.post('/api/customer/favourites').send({ idpId: ids.idpPending })).status).toBe(404);
    await customer.post('/api/customer/favourites').send({ idpId: ids.idpOther });
    expect((await customer.get(`/api/idps/${ids.idpKitchen}`)).body.is_favourite).toBe(true);
  });

  test('IT-CUS-04 favourites persist after logout and can be removed (story 40)', async () => {
    await customer.post('/api/auth/logout');
    await login(customer, 'customer@test.sg');
    const list = await customer.get('/api/customer/favourites');
    expect(list.body.total).toBe(2);
    expect((await customer.get('/api/customer/favourites/ids')).body.ids.sort()).toEqual([ids.idpKitchen, ids.idpOther].sort());
    expect((await customer.delete(`/api/customer/favourites/${ids.idpOther}`)).status).toBe(200);
    expect((await customer.delete(`/api/customer/favourites/${ids.idpOther}`)).status).toBe(404);
    expect((await customer.get('/api/customer/favourites')).body.total).toBe(1);
  });

  test('IT-CUS-05 search within favourites (story 48)', async () => {
    await customer.post('/api/customer/favourites').send({ idpId: ids.idpBedroom });
    const res = await customer.get('/api/customer/favourites?q=bedok');
    expect(res.body.results.map((f) => f.title)).toEqual(['Calm Bedroom in Bedok']);
    expect((await customer.get('/api/customer/favourites?q=nothing')).body.total).toBe(0);
  });

  test('IT-CUS-06 contact a designer from an IDP page (story 41)', async () => {
    const res = await customer.post('/api/customer/enquiries').send({ idpId: ids.idpOther, message: 'Hello, are you available next month?', contactPhone: '+65 9123 4567' });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/Drew Interiors/);
    const { rows } = await db.query('SELECT designer_id FROM enquiries WHERE enquiry_id = $1', [res.body.enquiry.enquiry_id]);
    expect(rows[0].designer_id).toBe(ids.designer2);
    expect((await customer.post('/api/customer/enquiries').send({ idpId: ids.idpOther, message: 'hi' })).status).toBe(400);
    expect((await customer.get('/api/customer/enquiries')).body.results).toHaveLength(1);
    const designer = request.agent(server);
    await login(designer, 'designer@test.sg');
    expect((await designer.post('/api/customer/enquiries').send({ idpId: ids.idpOther, message: 'Designers cannot send enquiries.' })).status).toBe(403);
  });
});
