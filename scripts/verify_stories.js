'use strict';

/**
 * Story verification: exercises all 60 user stories against a RUNNING DesignMatch
 * server through its public API, and prints one PASS/FAIL line per story.
 *
 *   npm run db:reset            # fresh demo data (the script needs the demo accounts)
 *   npm start                   # in one terminal
 *   npm run verify:stories      # in another (BASE_URL defaults to http://localhost:3000)
 *
 * The script creates its own test records (a designer, a customer, an IDP, a category,
 * reports). Run `npm run db:reset` afterwards if you want clean demo data again.
 * Needs Node 18+ (built-in fetch); no extra packages.
 */
const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const RUN = Date.now().toString(36);
const PW = 'Verify12345';

// ---------- tiny HTTP client with a cookie jar ----------
function agent() {
  let cookie = '';
  const call = async (method, path, body) => {
    const headers = { Accept: 'application/json' };
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, type };
  };
  return {
    get: (p) => call('GET', p), post: (p, b = {}) => call('POST', p, b), put: (p, b) => call('PUT', p, b),
    patch: (p, b) => call('PATCH', p, b), del: (p) => call('DELETE', p),
    login: (email, password) => call('POST', '/api/auth/login', { email, password }),
  };
}

// ---------- result bookkeeping ----------
const STORIES = {
  1: 'Admin: view all registered accounts', 2: 'Admin: suspend / reactivate an account', 3: 'Admin: approve designer registration',
  4: 'Admin: reset a user password', 5: 'Admin: log in', 6: 'Admin: log out', 7: 'Admin: create an account', 8: 'Admin: view account details',
  9: 'Admin: update an account', 10: 'Admin: search accounts', 11: 'Admin: reject designer registration with reason',
  12: 'Admin: create user profile with permissions', 13: 'Admin: view profile and permissions', 14: 'Admin: update a profile',
  15: 'Admin: suspend profile, accounts kept', 16: 'Admin: search profiles',
  17: 'Designer: register with professional details', 18: 'Designer: log in and edit profile', 19: 'Designer: create/edit company profile',
  20: 'Designer: add certifications', 21: 'Designer: create IDP listing', 22: 'Designer: mark IDP current / past', 23: 'Designer: edit / delete IDP',
  24: 'Designer: categorise IDPs', 25: 'Designer: view counts per IDP', 26: 'Designer: shortlist counts per IDP', 27: 'Designer: performance dashboard',
  28: 'Designer: log out', 29: 'Designer: view company profile', 30: 'Designer: preview company profile as customer', 31: 'Designer: view own IDP',
  32: 'Designer: search own IDPs', 33: 'Designer: tag IDP style + property type', 34: 'Designer: view customer enquiries',
  35: 'Customer: register free account', 36: 'Customer: log in and edit profile', 37: 'Customer: search by category, budget, location',
  38: 'Customer: view full IDP details', 39: 'Customer: save IDP to favourites', 40: 'Customer: manage favourites (persists after logout)',
  41: 'Customer: contact designer via enquiry', 42: 'Customer: log out', 43: 'Customer: keyword search', 44: 'Customer: filter by style + property type',
  45: 'Customer: sort results', 46: 'Customer: view designer company profile', 47: 'Customer: browse all IDPs by a designer',
  48: 'Customer: search within favourites',
  49: 'Manager: membership statistics', 50: 'Manager: create/edit/delete categories', 51: 'Manager: daily report', 52: 'Manager: weekly report',
  53: 'Manager: monthly report (top designers/categories)', 54: 'Manager: log in', 55: 'Manager: log out', 56: 'Manager: view all categories',
  57: 'Manager: search categories', 58: 'Manager: custom date-range report', 59: 'Manager: view previous reports', 60: 'Manager: export PDF / CSV',
};
const results = Object.fromEntries(Object.keys(STORIES).map((k) => [k, { checks: 0, failures: [] }]));

async function check(stories, what, fn) {
  const list = [].concat(stories);
  try {
    const ok = await fn();
    if (ok === false) throw new Error('condition not met');
    list.forEach((s) => { results[s].checks += 1; });
  } catch (err) {
    list.forEach((s) => { results[s].checks += 1; results[s].failures.push(`${what}: ${err.message}`); });
  }
}
function expect(res, status, label = '') {
  if (res.status !== status) {
    const msg = res.data && res.data.error ? ` (${res.data.error})` : '';
    throw new Error(`${label}expected HTTP ${status}, got ${res.status}${msg}`);
  }
  return res.data;
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ---------- the walkthrough ----------
async function main() {
  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health || !health.ok) {
    console.error(`Cannot reach ${BASE}. Start the app with "npm start" (and seed it with "npm run db:reset") first.`);
    process.exit(2);
  }
  const admin = agent(); const mgr = agent(); const des = agent(); const cus = agent(); const anon = agent();
  const ctx = {};

  // ===== User Admin =====
  await check(5, 'admin logs in', async () => assert(expect(await admin.login('admin@designmatch.sg', 'Admin123!'), 200).user.role === 'admin', 'role is not admin'));
  await check(1, 'list all accounts', async () => { const d = expect(await admin.get('/api/admin/accounts?pageSize=10'), 200); assert(d.total > 0 && d.results.length > 0, 'no accounts returned'); assert(d.results[0].password_hash === undefined, 'password hash leaked'); });
  await check(16, 'search profiles', async () => { const d = expect(await admin.get('/api/admin/profiles?q=customer'), 200); assert(d.results.some((p) => p.role === 'customer'), 'customer profile not found'); ctx.customerProfile = d.results.find((p) => p.role === 'customer' && !p.is_suspended); });
  await check(7, 'create an account', async () => {
    const d = expect(await admin.post('/api/admin/accounts', { email: `verify.user.${RUN}@example.com`, fullName: 'Verify User', profileId: ctx.customerProfile.profile_id }), 201);
    ctx.userId = d.account.account_id; ctx.userTemp = d.temporaryPassword; assert(ctx.userTemp, 'no temporary password issued');
  });
  await check(8, 'view account details', async () => assert(expect(await admin.get(`/api/admin/accounts/${ctx.userId}`), 200).email === `verify.user.${RUN}@example.com`, 'wrong account'));
  await check(9, 'update an account', async () => assert(expect(await admin.put(`/api/admin/accounts/${ctx.userId}`, { fullName: 'Verify User Updated' }), 200).account.full_name === 'Verify User Updated', 'name not updated'));
  await check(10, 'search accounts', async () => { const d = expect(await admin.get(`/api/admin/accounts?q=verify.user.${RUN}`), 200); assert(d.total === 1, `expected 1 match, got ${d.total}`); });
  await check(2, 'suspend blocks login, reactivate restores it', async () => {
    expect(await admin.patch(`/api/admin/accounts/${ctx.userId}/status`, { status: 'suspended' }), 200);
    expect(await agent().login(`verify.user.${RUN}@example.com`, ctx.userTemp), 403, 'suspended login: ');
    expect(await admin.patch(`/api/admin/accounts/${ctx.userId}/status`, { status: 'active' }), 200);
    expect(await agent().login(`verify.user.${RUN}@example.com`, ctx.userTemp), 200, 'reactivated login: ');
  });
  await check(4, 'reset password issues a one-time password and forces a change', async () => {
    const temp = expect(await admin.post(`/api/admin/accounts/${ctx.userId}/reset-password`), 200).temporaryPassword;
    const u = agent();
    expect(await u.login(`verify.user.${RUN}@example.com`, ctx.userTemp), 401, 'old password: ');
    assert(expect(await u.login(`verify.user.${RUN}@example.com`, temp), 200).user.mustChangePassword, 'mustChangePassword not set');
    expect(await u.put('/api/auth/me/password', { currentPassword: temp, newPassword: PW }), 200);
  });
  await check(12, 'create a profile with chosen permissions', async () => {
    const d = expect(await admin.post('/api/admin/profiles', { name: `Verify Profile ${RUN}`, role: 'customer', description: 'Created by verify_stories', permissions: ['favourites.manage'] }), 201);
    ctx.profileId = d.profile.profile_id; assert(d.profile.permissions.join() === 'favourites.manage', 'wrong permissions');
    expect(await admin.post('/api/admin/profiles', { name: `Bad ${RUN}`, role: 'customer', permissions: ['reports.generate'] }), 400, 'invalid permission: ');
  });
  await check(13, 'view a profile and its permissions', async () => assert(expect(await admin.get(`/api/admin/profiles/${ctx.profileId}`), 200).permission_details.length === 1, 'permissions not listed'));
  await check(14, 'update a profile', async () => assert(expect(await admin.put(`/api/admin/profiles/${ctx.profileId}`, { permissions: ['favourites.manage', 'enquiries.send'] }), 200).profile.permissions.length === 2, 'permissions not updated'));
  await check(15, 'suspend a profile: its account is kept but blocked', async () => {
    const acc = expect(await admin.post('/api/admin/accounts', { email: `verify.profile.${RUN}@example.com`, fullName: 'Profile Member', profileId: ctx.profileId, password: PW }), 201);
    expect(await admin.patch(`/api/admin/profiles/${ctx.profileId}/status`, { suspended: true }), 200);
    expect(await agent().login(`verify.profile.${RUN}@example.com`, PW), 403, 'login under suspended profile: ');
    expect(await admin.get(`/api/admin/accounts/${acc.account.account_id}`), 200, 'account still exists: ');
    expect(await admin.patch(`/api/admin/profiles/${ctx.profileId}/status`, { suspended: false }), 200);
    expect(await agent().login(`verify.profile.${RUN}@example.com`, PW), 200, 'login after reactivation: ');
  });

  // ===== Designer registration + approval / rejection =====
  const designerEmail = `verify.designer.${RUN}@example.com`;
  await check(17, 'register as a designer with professional details', async () => {
    const d = expect(await anon.post('/api/auth/register/designer', { email: designerEmail, password: PW, fullName: 'Vera Verify', phone: '+65 8123 4567', companyName: `Verify Studio ${RUN}`, licenseNumber: 'LIC-VERIFY', yearsExperience: 6, specialisation: 'HDB renovations' }), 201);
    ctx.designerId = d.designerId; assert(d.registrationStatus === 'pending', 'not pending');
  });
  await check(3, 'pending designer blocked, approved designer can log in', async () => {
    expect(await agent().login(designerEmail, PW), 403, 'pending login: ');
    const q = expect(await admin.get('/api/admin/registrations?status=pending&pageSize=100'), 200);
    assert(q.results.some((r) => r.designer_id === ctx.designerId), 'not in approval queue');
    expect(await admin.post(`/api/admin/registrations/${ctx.designerId}/approve`), 200);
  });
  await check(11, 'reject a registration with a reason shown to the designer', async () => {
    const email = `verify.reject.${RUN}@example.com`;
    const d = expect(await anon.post('/api/auth/register/designer', { email, password: PW, fullName: 'Rex Reject', phone: '+65 8000 0001', companyName: `Reject Co ${RUN}`, licenseNumber: 'LIC-REJ', yearsExperience: 1 }), 201);
    expect(await admin.post(`/api/admin/registrations/${d.designerId}/reject`, { reason: 'Licence number could not be verified.' }), 200);
    const r = await agent().login(email, PW);
    assert(r.status === 403 && /Licence number could not be verified/.test(r.data.error), 'reason not shown at login');
  });
  await check(6, 'admin logs out', async () => { expect(await admin.post('/api/auth/logout'), 200); expect(await admin.get('/api/admin/accounts'), 401, 'after logout: '); });

  // ===== Designer =====
  const meta = expect(await anon.get('/api/meta'), 200);
  const kitchen = meta.categories.find((c) => c.name === 'Kitchen') || meta.categories[0];
  const bedroom = meta.categories.find((c) => c.category_id !== kitchen.category_id);
  const japandi = meta.styles.find((s) => s.name === 'Japandi') || meta.styles[0];
  const condo = meta.property_types.find((p) => p.name === 'Condominium') || meta.property_types[0];
  const title = `Verify ${RUN} Kitchen`;

  await check(18, 'designer logs in and edits profile', async () => {
    expect(await des.login(designerEmail, PW), 200);
    expect(await des.put('/api/auth/me', { phone: '+65 8999 0000' }), 200);
    assert(expect(await des.put('/api/designer/profile', { yearsExperience: 7 }), 200).designer.years_experience === 7, 'experience not saved');
  });
  await check(19, 'create / edit company profile', async () => {
    const d = expect(await des.put('/api/designer/company', { companyName: `Verify Studio ${RUN}`, description: 'Calm, practical homes.', website: 'https://verify.example.com', serviceAreas: ['East', 'Central'] }), 200);
    assert(d.company.service_areas.join() === 'Central,East', 'service areas not saved');
  });
  await check(20, 'add a certification', async () => {
    const d = expect(await des.post('/api/designer/company/certifications', { title: 'CaseTrust Accreditation', issuer: 'CASE', yearObtained: 2022 }), 201);
    ctx.certId = d.certification.certification_id;
  });
  await check(29, 'view company profile', async () => { const d = expect(await des.get('/api/designer/company'), 200); assert(d.certifications.some((c) => c.certification_id === ctx.certId), 'certification missing'); });
  await check(21, 'create an IDP with photo, category, budget', async () => {
    const d = expect(await des.post('/api/designer/idps', { title, description: 'Verification project with oak cabinetry and hidden storage.', location: 'Punggol', categoryId: kitchen.category_id, budgetMin: 41000, budgetMax: 43000, photoUrls: ['/img/rooms/kitchen-2.jpg'] }), 201);
    ctx.idpId = d.idp.idp_id; assert(d.idp.photos.length === 1, 'photo not saved');
  });
  await check(33, 'tag with design style and property type', async () => {
    const d = expect(await des.put(`/api/designer/idps/${ctx.idpId}/tags`, { styleIds: [japandi.style_id], propertyTypeId: condo.property_type_id }), 200);
    assert(d.idp.styles.includes(japandi.name) && d.idp.property_type_name === condo.name, 'tags not saved');
  });
  await check(24, 'organise into a category', async () => {
    assert(expect(await des.patch(`/api/designer/idps/${ctx.idpId}/category`, { categoryId: bedroom.category_id }), 200).idp.category_id === bedroom.category_id, 'category not changed');
    expect(await des.patch(`/api/designer/idps/${ctx.idpId}/category`, { categoryId: kitchen.category_id }), 200);
  });
  await check(22, 'mark past then current', async () => {
    assert(expect(await des.patch(`/api/designer/idps/${ctx.idpId}/status`, { status: 'past' }), 200).idp.status === 'past', 'not past');
    assert(expect(await des.patch(`/api/designer/idps/${ctx.idpId}/status`, { status: 'current' }), 200).idp.status === 'current', 'not current');
  });
  await check(23, 'edit an IDP', async () => assert(expect(await des.put(`/api/designer/idps/${ctx.idpId}`, { description: 'Edited verification project with oak cabinetry and hidden storage.' }), 200).idp.description.startsWith('Edited'), 'edit not saved'));
  await check(31, 'view own IDP', async () => assert(expect(await des.get(`/api/designer/idps/${ctx.idpId}`), 200).title === title, 'wrong IDP'));
  await check(32, 'search own IDPs', async () => assert(expect(await des.get(`/api/designer/idps?q=${encodeURIComponent(title)}`), 200).total === 1, 'not found by own search'));
  await check(30, 'preview company profile as a customer sees it', async () => { const d = expect(await des.get('/api/designer/company/preview'), 200); assert(d.preview && d.idps.some((i) => i.idp_id === ctx.idpId), 'IDP missing from preview'); });
  const before = {
    views: expect(await des.get('/api/designer/analytics/views'), 200).results.find((r) => r.idp_id === ctx.idpId).view_count,
    favs: expect(await des.get('/api/designer/analytics/shortlists'), 200).results.find((r) => r.idp_id === ctx.idpId).favourite_count,
  };

  // ===== Customer =====
  const custEmail = `verify.customer.${RUN}@example.com`;
  await check(35, 'register a free account', async () => assert(expect(await cus.post('/api/auth/register/customer', { email: custEmail, password: PW, fullName: 'Cass Verify' }), 201).user.role === 'customer', 'not a customer'));
  await check(42, 'customer logs out', async () => { expect(await cus.post('/api/auth/logout'), 200); expect(await cus.get('/api/customer/favourites'), 401, 'after logout: '); });
  await check(36, 'customer logs in and edits profile', async () => {
    expect(await cus.login(custEmail, PW), 200);
    assert(expect(await cus.put('/api/auth/me', { location: 'Tampines', phone: '+65 9111 2222' }), 200).user.location === 'Tampines', 'profile not saved');
  });
  await check(37, 'search by category + budget + location', async () => {
    const d = expect(await cus.get(`/api/idps?categoryId=${kitchen.category_id}&budgetMin=41000&budgetMax=43000&location=punggol&pageSize=48`), 200);
    assert(d.results.some((i) => i.idp_id === ctx.idpId), 'IDP not matched by filters');
    assert(d.results.every((i) => i.category_id === kitchen.category_id && /punggol/i.test(i.location) && i.budget_min >= 41000 && i.budget_max <= 43000), 'filters returned a non-matching IDP');
  });
  await check(43, 'keyword search', async () => assert(expect(await cus.get(`/api/idps?keyword=${encodeURIComponent(RUN)}`), 200).results.some((i) => i.idp_id === ctx.idpId), 'not found by keyword'));
  await check(44, 'filter by design style + property type', async () => {
    const d = expect(await cus.get(`/api/idps?styleIds=${japandi.style_id}&propertyTypeId=${condo.property_type_id}&pageSize=48`), 200);
    assert(d.total > 0 && d.results.every((i) => i.styles.includes(japandi.name) && i.property_type_id === condo.property_type_id), 'filter returned a non-matching IDP');
  });
  await check(45, 'sort results', async () => {
    for (const [sort, field, dir] of [['most_viewed', 'view_count', -1], ['budget_low', 'budget_min', 1], ['newest', 'created_at', -1]]) {
      const r = expect(await cus.get(`/api/idps?sort=${sort}&pageSize=20`), 200).results.map((i) => (field === 'created_at' ? Date.parse(i[field]) : i[field]));
      assert(r.every((v, i) => i === 0 || (dir < 0 ? r[i - 1] >= v : r[i - 1] <= v)), `${sort} not in order`);
    }
  });
  await check([38, 25], 'view details (designer sees the view count rise)', async () => {
    const d = expect(await cus.get(`/api/idps/${ctx.idpId}`), 200);
    assert(d.photos.length >= 1 && d.company_name && d.description, 'details incomplete');
    const after = expect(await des.get('/api/designer/analytics/views'), 200).results.find((r) => r.idp_id === ctx.idpId).view_count;
    assert(after === before.views + 1, `view count ${before.views} -> ${after}, expected +1`);
  });
  await check([39, 26], 'save to favourites (designer sees the shortlist count rise)', async () => {
    expect(await cus.post('/api/customer/favourites', { idpId: ctx.idpId }), 201);
    expect(await cus.post('/api/customer/favourites', { idpId: ctx.idpId }), 409, 'duplicate: ');
    const after = expect(await des.get('/api/designer/analytics/shortlists'), 200).results.find((r) => r.idp_id === ctx.idpId).favourite_count;
    assert(after === before.favs + 1, `shortlist count ${before.favs} -> ${after}, expected +1`);
  });
  await check(48, 'search within favourites', async () => {
    assert(expect(await cus.get(`/api/customer/favourites?q=${RUN}`), 200).results.some((f) => f.idp_id === ctx.idpId), 'not found');
    assert(expect(await cus.get('/api/customer/favourites?q=zzzz-no-match'), 200).total === 0, 'non-matching search returned results');
  });
  await check(40, 'favourites persist after logout, then remove', async () => {
    await cus.post('/api/auth/logout'); expect(await cus.login(custEmail, PW), 200);
    assert(expect(await cus.get('/api/customer/favourites'), 200).results.some((f) => f.idp_id === ctx.idpId), 'favourite lost after re-login');
    expect(await cus.del(`/api/customer/favourites/${ctx.idpId}`), 200);
    assert(!expect(await cus.get('/api/customer/favourites'), 200).results.some((f) => f.idp_id === ctx.idpId), 'not removed');
    expect(await cus.post('/api/customer/favourites', { idpId: ctx.idpId }), 201); // keep one for the reports
  });
  await check([41, 34], 'send an enquiry; designer receives it', async () => {
    expect(await cus.post('/api/customer/enquiries', { idpId: ctx.idpId, message: `Verification enquiry ${RUN}: can we arrange a consultation?` }), 201);
    const d = expect(await des.get('/api/designer/enquiries?pageSize=50'), 200);
    assert(d.results.some((e) => e.message.includes(RUN) && e.customer_email === custEmail), 'enquiry not in designer inbox');
  });
  await check(46, 'view designer company profile', async () => assert(expect(await anon.get(`/api/designers/${ctx.designerId}`), 200).company.company_name === `Verify Studio ${RUN}`, 'wrong company'));
  await check(47, 'browse all IDPs by the designer', async () => { const d = expect(await anon.get(`/api/designers/${ctx.designerId}/idps`), 200); assert(d.total === 1 && d.results[0].idp_id === ctx.idpId, 'designer IDP list wrong'); });
  await check(27, 'performance dashboard reflects activity', async () => { const d = expect(await des.get('/api/designer/dashboard'), 200); assert(d.total_idps === 1 && d.total_views >= 1 && d.total_favourites >= 1 && d.total_enquiries >= 1 && d.trend.length === 14, 'dashboard totals wrong'); });

  // ===== Platform Management =====
  await check(54, 'manager logs in', async () => assert(expect(await mgr.login('manager@designmatch.sg', 'Manager123!'), 200).user.role === 'manager', 'role is not manager'));
  await check(49, 'membership statistics by role', async () => { const d = expect(await mgr.get('/api/manager/stats'), 200); const sum = Object.values(d.by_role).reduce((s, r) => s + r.total, 0); assert(sum === d.total_users && d.by_role.customer.total > 0, 'role totals do not add up'); });
  await check(56, 'view all categories', async () => assert(expect(await mgr.get('/api/manager/categories'), 200).total >= meta.categories.length, 'categories missing'));
  await check(57, 'search categories', async () => { const d = expect(await mgr.get('/api/manager/categories?q=room'), 200); assert(d.total > 0 && d.results.every((c) => /room/i.test(c.name + c.description)), 'search returned a non-match'); });
  await check(50, 'create, edit and delete a category', async () => {
    const c = expect(await mgr.post('/api/manager/categories', { name: `Verify Category ${RUN}`, description: 'temporary' }), 201).category;
    assert(expect(await mgr.put(`/api/manager/categories/${c.category_id}`, { name: `Verify Category ${RUN} edited` }), 200).category.name.endsWith('edited'), 'rename failed');
    expect(await mgr.del(`/api/manager/categories/${c.category_id}`), 200);
    expect(await mgr.del(`/api/manager/categories/${c.category_id}`), 404, 'second delete: ');
  });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: process.env.APP_TIMEZONE || 'Asia/Singapore' }).format(new Date());
  await check(51, 'daily report counts today\'s activity', async () => {
    const r = expect(await mgr.post('/api/manager/reports/daily', { date: today }), 201).report;
    ctx.reportId = r.report_id;
    assert(r.data.totals.new_idps >= 1 && r.data.totals.new_users >= 3 && r.data.totals.searches >= 3, `totals too low: ${JSON.stringify(r.data.totals)}`);
  });
  await check(52, 'weekly report covers Monday-Sunday with growth', async () => {
    const r = expect(await mgr.post('/api/manager/reports/weekly', { weekStart: today }), 201).report;
    const days = (Date.parse(r.period_end) - Date.parse(r.period_start)) / 86400000 + 1;
    assert(days === 7 && new Date(`${r.period_start}T00:00:00Z`).getUTCDay() === 1 && r.data.growth, 'not a Monday-Sunday week with growth');
  });
  await check(53, 'monthly report ranks top designers and categories', async () => {
    const r = expect(await mgr.post('/api/manager/reports/monthly', { month: today.slice(0, 7) }), 201).report;
    assert(Array.isArray(r.data.top_designers) && r.data.top_designers.length > 0 && r.data.top_categories.length > 0, 'no rankings');
    assert(r.data.top_designers.every((d, i, a) => i === 0 || a[i - 1].score >= d.score), 'designers not ranked by score');
  });
  await check(58, 'custom date-range report', async () => {
    const start = new Date(Date.parse(`${today}T00:00:00Z`) - 13 * 86400000).toISOString().slice(0, 10);
    const r = expect(await mgr.post('/api/manager/reports/custom', { start, end: today }), 201).report;
    assert(r.data.period.days === 14, 'wrong period length');
    expect(await mgr.post('/api/manager/reports/custom', { start: today, end: start }), 400, 'reversed range: ');
  });
  await check(59, 'view previously generated reports', async () => {
    assert(expect(await mgr.get('/api/manager/reports?pageSize=10'), 200).results.some((r) => r.report_id === ctx.reportId), 'new report not in history');
    assert(expect(await mgr.get(`/api/manager/reports/${ctx.reportId}`), 200).data.totals, 'report data missing');
  });
  await check(60, 'export as CSV and PDF', async () => {
    const csv = await mgr.get(`/api/manager/reports/${ctx.reportId}/export?format=csv`);
    assert(csv.status === 200 && /text\/csv/.test(csv.type) && csv.data.toString().includes(`Period start,${today}`), 'CSV export wrong');
    const pdf = await mgr.get(`/api/manager/reports/${ctx.reportId}/export?format=pdf`);
    assert(pdf.status === 200 && pdf.type === 'application/pdf' && pdf.data.slice(0, 5).toString() === '%PDF-', 'PDF export wrong');
  });
  await check(55, 'manager logs out', async () => { expect(await mgr.post('/api/auth/logout'), 200); expect(await mgr.get('/api/manager/stats'), 401, 'after logout: '); });

  // ===== Designer clean-up stories =====
  await check(23, 'delete an IDP removes it everywhere', async () => {
    expect(await des.del(`/api/designer/idps/${ctx.idpId}`), 200);
    expect(await anon.get(`/api/idps/${ctx.idpId}`), 404, 'public page after delete: ');
    assert(!expect(await cus.get('/api/customer/favourites'), 200).results.some((f) => f.idp_id === ctx.idpId), 'favourite left behind');
  });
  await check(20, 'remove the certification', async () => expect(await des.del(`/api/designer/company/certifications/${ctx.certId}`), 200));
  await check(28, 'designer logs out', async () => { expect(await des.post('/api/auth/logout'), 200); expect(await des.get('/api/designer/dashboard'), 401, 'after logout: '); });

  // ---------- report ----------
  let passed = 0;
  console.log(`\nDesignMatch story verification against ${BASE}\n`);
  for (const [n, title] of Object.entries(STORIES)) {
    const r = results[n];
    const ok = r.checks > 0 && r.failures.length === 0;
    if (ok) passed += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(n).padStart(2)}  ${title}`);
    r.failures.forEach((f) => console.log(`          - ${f}`));
  }
  console.log(`\n${passed}/60 stories passed.`);
  if (process.argv.includes('--json')) console.log(JSON.stringify(Object.fromEntries(Object.entries(results).map(([k, r]) => [k, r.failures.length === 0 && r.checks > 0]))));
  process.exit(passed === 60 ? 0 : 1);
}

main().catch((err) => { console.error('Verification stopped:', err); process.exit(1); });
