'use strict';

const fs = require('fs');
const request = require('supertest');
const { setup, app, login, db } = require('../helpers/fixtures');

// 1x1 PNG
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5a10000000049454e44ae426082', 'hex');

let ids;
let server;
let designer;
let other;
beforeAll(async () => {
  ids = await setup();
  server = app();
  designer = request.agent(server);
  other = request.agent(server);
  await login(designer, 'designer@test.sg');
  await login(other, 'designer2@test.sg');
});
afterAll(() => {
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
  return db.pool.end();
});

describe('IT-DES company profile', () => {
  test('IT-DES-01 view and edit company profile with service areas and logo (stories 19, 29)', async () => {
    const view = await designer.get('/api/designer/company');
    expect(view.body.company.company_name).toBe('Dana Studio');
    const res = await designer.put('/api/designer/company')
      .field('companyName', 'Dana Design Studio').field('description', 'Calm homes').field('website', 'https://dana.example.com')
      .field('serviceAreas', JSON.stringify(['East', 'Central'])).attach('logo', PNG, { filename: 'logo.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.company.service_areas).toEqual(['Central', 'East']);
    expect(res.body.company.logo_url).toMatch(/^\/uploads\/.+\.png$/);
  });

  test('IT-DES-02 rejects non-image uploads', async () => {
    const res = await designer.put('/api/designer/company').field('companyName', 'Dana Design Studio')
      .attach('logo', Buffer.from('hello'), { filename: 'evil.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });

  test('IT-DES-03 add and remove certifications (story 20)', async () => {
    const add = await designer.post('/api/designer/company/certifications').send({ title: 'CaseTrust', issuer: 'CASE', yearObtained: 2021 });
    expect(add.status).toBe(201);
    const certId = add.body.certification.certification_id;
    expect((await other.delete(`/api/designer/company/certifications/${certId}`)).status).toBe(404);
    expect((await designer.delete(`/api/designer/company/certifications/${certId}`)).status).toBe(200);
  });

  test('IT-DES-04 edit professional details (story 18)', async () => {
    const res = await designer.put('/api/designer/profile').send({ yearsExperience: 9, specialisation: 'Condo interiors' });
    expect(res.body.designer).toMatchObject({ years_experience: 9, specialisation: 'Condo interiors' });
  });

  test('IT-DES-05 preview company profile as customers see it (story 30)', async () => {
    const res = await designer.get('/api/designer/company/preview');
    expect(res.body).toMatchObject({ preview: true, publicly_visible: true });
    expect(res.body.idp_total).toBe(2);
  });
});

describe('IT-IDP portfolio management', () => {
  let newId;
  test('IT-IDP-01 create an IDP with uploaded photos, category, budget and tags (stories 21, 24, 33)', async () => {
    const res = await designer.post('/api/designer/idps')
      .field('title', 'Scandinavian Living Room').field('description', 'Bright living room with light oak and linen textures.')
      .field('location', 'Punggol').field('categoryId', String(ids.kitchen)).field('budgetMin', '25000').field('budgetMax', '35000')
      .field('styleIds', '3').field('styleIds', '2').field('propertyTypeId', '2')
      .attach('photos', PNG, { filename: 'a.png', contentType: 'image/png' })
      .attach('photos', PNG, { filename: 'b.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    newId = res.body.idp.idp_id;
    expect(res.body.idp.photos).toHaveLength(2);
    expect(res.body.idp.styles.sort()).toEqual(['Minimalist', 'Scandinavian']);
    expect(res.body.idp.property_type_name).toBe('Condominium');
  });

  test('IT-IDP-02 invalid listings are rejected', async () => {
    const res = await designer.post('/api/designer/idps').send({ title: 'Tiny', description: 'short', location: 'X', categoryId: ids.kitchen, budgetMin: 10, budgetMax: 5 });
    expect(res.status).toBe(400);
    const noPhoto = await designer.post('/api/designer/idps').send({ title: 'Valid title', description: 'A valid description for the project.', location: 'Bedok', categoryId: ids.kitchen, budgetMin: 10, budgetMax: 50 });
    expect(noPhoto.body.error).toMatch(/photo/);
  });

  test('IT-IDP-03 mark current/past, recategorise and retag (stories 22, 24, 33)', async () => {
    expect((await designer.patch(`/api/designer/idps/${newId}/status`).send({ status: 'past' })).body.idp.status).toBe('past');
    expect((await designer.patch(`/api/designer/idps/${newId}/category`).send({ categoryId: ids.bedroom })).body.idp.category_name).toBe('Bedroom');
    const tags = await designer.put(`/api/designer/idps/${newId}/tags`).send({ styleIds: [4], propertyTypeId: 1 });
    expect(tags.body.idp).toMatchObject({ styles: ['Japandi'], property_type_name: 'HDB' });
  });

  test('IT-IDP-04 edit an IDP and replace a photo (story 23)', async () => {
    const before = (await designer.get(`/api/designer/idps/${newId}`)).body;
    const res = await designer.put(`/api/designer/idps/${newId}`).send({
      title: 'Scandinavian Living Room (updated)', budgetMax: 40000, removePhotoIds: [before.photos[0].photo_id], photoUrls: ['https://example.com/new.jpg'],
    });
    expect(res.status).toBe(200);
    expect(res.body.idp).toMatchObject({ title: 'Scandinavian Living Room (updated)', budget_max: 40000 });
    expect(res.body.idp.photos).toHaveLength(2);
  });

  test('IT-IDP-05 view own IDP and search own portfolio (stories 31, 32)', async () => {
    expect((await designer.get(`/api/designer/idps/${ids.idpKitchen}`)).body.title).toBe('Japandi Kitchen in Tampines');
    const search = await designer.get('/api/designer/idps?q=living&status=past');
    expect(search.body.total).toBe(1);
    expect((await designer.get('/api/designer/idps')).body.total).toBe(3);
  });

  test('IT-IDP-06 designers cannot touch another designer\'s IDPs', async () => {
    expect((await other.put(`/api/designer/idps/${newId}`).send({ title: 'Hijacked title' })).status).toBe(403);
    expect((await other.delete(`/api/designer/idps/${newId}`)).status).toBe(403);
    expect((await other.patch(`/api/designer/idps/${newId}/status`).send({ status: 'current' })).status).toBe(403);
    expect((await other.get(`/api/designer/idps/${newId}`)).status).toBe(403);
  });

  test('IT-IDP-07 deleting an IDP removes its favourites, views and enquiries (story 23)', async () => {
    const customer = request.agent(server);
    await login(customer, 'customer@test.sg');
    await customer.get(`/api/idps/${newId}`);
    await customer.post('/api/customer/favourites').send({ idpId: newId });
    await customer.post('/api/customer/enquiries').send({ idpId: newId, message: 'Please contact me about this project.' });
    expect((await designer.delete(`/api/designer/idps/${newId}`)).status).toBe(200);
    const { rows } = await db.query(
      `SELECT (SELECT COUNT(*)::int FROM favourites WHERE idp_id = $1) AS f, (SELECT COUNT(*)::int FROM idp_views WHERE idp_id = $1) AS v,
              (SELECT COUNT(*)::int FROM enquiries WHERE idp_id = $1) AS e, (SELECT COUNT(*)::int FROM idp_photos WHERE idp_id = $1) AS p`, [newId],
    );
    expect(rows[0]).toEqual({ f: 0, v: 0, e: 0, p: 0 });
  });
});

describe('IT-ANA engagement tracking', () => {
  test('IT-ANA-01 view and shortlist counts come from real records (stories 25, 26, 27)', async () => {
    const customer = request.agent(server);
    await login(customer, 'customer@test.sg');
    await request(server).get(`/api/idps/${ids.idpKitchen}`);
    await customer.get(`/api/idps/${ids.idpKitchen}`);
    await designer.get(`/api/idps/${ids.idpKitchen}`); // owner views are not counted
    await customer.post('/api/customer/favourites').send({ idpId: ids.idpKitchen });
    const views = await designer.get('/api/designer/analytics/views');
    expect(views.body.results.find((r) => r.idp_id === ids.idpKitchen).view_count).toBe(2);
    const shorts = await designer.get('/api/designer/analytics/shortlists');
    expect(shorts.body.results.find((r) => r.idp_id === ids.idpKitchen).favourite_count).toBe(1);
    const dash = await designer.get('/api/designer/dashboard');
    expect(dash.body).toMatchObject({ total_idps: 2, total_views: 2, total_favourites: 1 });
    expect(dash.body.trend).toHaveLength(14);
  });

  test('IT-ANA-02 enquiries reach the right designer and can be marked read (story 34)', async () => {
    const customer = request.agent(server);
    await login(customer, 'customer2@test.sg');
    await customer.post('/api/customer/enquiries').send({ idpId: ids.idpBedroom, message: 'Could you quote for a similar bedroom?' });
    const list = await designer.get('/api/designer/enquiries?status=new');
    expect(list.body.total).toBe(1);
    const enq = list.body.results[0];
    expect(enq.customer_email).toBe('customer2@test.sg');
    expect((await other.patch(`/api/designer/enquiries/${enq.enquiry_id}/read`)).status).toBe(404);
    expect((await designer.patch(`/api/designer/enquiries/${enq.enquiry_id}/read`)).status).toBe(200);
    expect((await other.get('/api/designer/enquiries')).body.total).toBe(0);
  });
});
