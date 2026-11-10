'use strict';

/**
 * Control-layer unit tests. Entity classes are replaced with in-memory fakes
 * through constructor injection, so these tests exercise business rules only
 * (no database). Test IDs map to stories in docs/story-coverage.md.
 */
const AppError = require('../../src/utils/AppError');
const Auth = require('../../src/control/auth/AuthControllers');
const Acc = require('../../src/control/admin/AccountControllers');
const Reg = require('../../src/control/admin/RegistrationControllers');
const Prof = require('../../src/control/admin/ProfileControllers');
const IdpC = require('../../src/control/designer/IDPControllers');
const CoC = require('../../src/control/designer/CompanyControllers');
const An = require('../../src/control/designer/AnalyticsControllers');
const Disc = require('../../src/control/customer/DiscoveryControllers');
const Fav = require('../../src/control/customer/FavouriteControllers');
const Cat = require('../../src/control/manager/CategoryControllers');
const Rep = require('../../src/control/manager/ReportControllers');
const Ov = require('../../src/control/admin/OverviewControllers');
const IDPEntity = require('../../src/entity/IDP');

const fakePasswords = {
  hash: jest.fn(async (p) => `hashed:${p}`),
  verify: jest.fn(async (p, h) => h === `hashed:${p}`),
  generateTemporary: jest.fn(() => 'Temp1234abcd'),
};
const fakeDb = { withTransaction: (fn) => fn({}) };

function account(over = {}) {
  return {
    account_id: 7, email: 'a@x.com', full_name: 'Amy', role: 'customer', profile_name: 'Customer', permissions: ['favourites.manage'],
    status: 'active', profile_suspended: false, registration_status: null, password_hash: 'hashed:Secret123', profile_id: 3, ...over,
  };
}
const actor = (over = {}) => ({ accountId: 1, role: 'admin', profileName: 'User Admin', permissions: [], ...over });

const expectAppError = async (promise, status, msg) => {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  await expect(promise).rejects.toMatchObject({ status });
  if (msg) await expect(promise).rejects.toThrow(msg);
};

// --------------------------------------------------------------------------
describe('UT-AUTH LoginController (stories 5, 18, 36, 54)', () => {
  const make = (acc) => new Auth.LoginController({
    UserAccount: { findByEmailWithHash: jest.fn(async () => acc), recordLogin: jest.fn(async () => {}) },
    PasswordService: fakePasswords,
  });

  test('UT-AUTH-01 valid credentials return the session user without the hash', async () => {
    const user = await make(account()).execute({ email: 'a@x.com', password: 'Secret123' });
    expect(user).toMatchObject({ accountId: 7, role: 'customer' });
    expect(user.password_hash).toBeUndefined();
  });
  test('UT-AUTH-02 wrong password and unknown email give the same 401', async () => {
    await expectAppError(make(account()).execute({ email: 'a@x.com', password: 'nope' }), 401, 'Invalid email or password.');
    await expectAppError(make(null).execute({ email: 'b@x.com', password: 'Secret123' }), 401, 'Invalid email or password.');
  });
  test('UT-AUTH-03 missing fields are rejected', async () => {
    await expectAppError(make(account()).execute({ email: '' }), 400);
  });
  test('UT-AUTH-04 suspended account is blocked (story 2)', async () => {
    await expectAppError(make(account({ status: 'suspended' })).execute({ email: 'a', password: 'Secret123' }), 403, /suspended/);
  });
  test('UT-AUTH-05 suspended profile blocks its accounts (story 15)', async () => {
    await expectAppError(make(account({ profile_suspended: true })).execute({ email: 'a', password: 'Secret123' }), 403, /profile/);
  });
  test('UT-AUTH-06 pending and rejected designers cannot log in (stories 3, 11)', async () => {
    await expectAppError(make(account({ role: 'designer', registration_status: 'pending' })).execute({ email: 'a', password: 'Secret123' }), 403, /pending/);
    await expectAppError(make(account({ role: 'designer', registration_status: 'rejected', rejection_reason: 'Bad licence' })).execute({ email: 'a', password: 'Secret123' }), 403, /Bad licence/);
  });
});

describe('UT-AUTH registration and self-service (stories 17, 35, 36)', () => {
  test('UT-AUTH-07 customer registration hashes the password and rejects duplicates', async () => {
    const create = jest.fn(async (d) => account({ email: d.email }));
    const c = new Auth.RegisterCustomerController({
      UserAccount: { emailExists: jest.fn(async () => false), create },
      UserProfile: { findDefaultForRole: jest.fn(async () => ({ profile_id: 3 })) },
      PasswordService: fakePasswords,
    });
    await c.execute({ email: 'New@X.com', password: 'Abcdefg1', fullName: 'New Person' });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ email: 'new@x.com', passwordHash: 'hashed:Abcdefg1', profileId: 3 }));
    const dup = new Auth.RegisterCustomerController({ UserAccount: { emailExists: async () => true }, UserProfile: {}, PasswordService: fakePasswords });
    await expectAppError(dup.execute({ email: 'a@x.com', password: 'Abcdefg1', fullName: 'Dup Person' }), 409);
  });

  test('UT-AUTH-08 designer registration creates account, designer and company in one transaction, pending', async () => {
    const calls = [];
    const c = new Auth.RegisterInteriorDesignerController({
      db: { withTransaction: async (fn) => { calls.push('begin'); const r = await fn('client'); calls.push('commit'); return r; } },
      UserAccount: { emailExists: async () => false, create: async (d, client) => { calls.push(`account:${client}`); return account({ account_id: 9 }); } },
      UserProfile: { findDefaultForRole: async () => ({ profile_id: 2 }) },
      InteriorDesigner: {
        create: async (d, client) => { calls.push(`designer:${client}`); },
        findById: async () => ({ designer_id: 9, registration_status: 'pending' }),
      },
      Company: { create: async (id, d, client) => { calls.push(`company:${client}`); } },
      PasswordService: fakePasswords,
    });
    const r = await c.execute({ email: 'd@x.com', password: 'Abcdefg1', fullName: 'Dee', phone: '+65 8000 0000', companyName: 'Dee Co', licenseNumber: 'L123', yearsExperience: 3 });
    expect(r.registrationStatus).toBe('pending');
    expect(calls).toEqual(['begin', 'account:client', 'designer:client', 'company:client', 'commit']);
  });

  test('UT-AUTH-09 designer registration requires professional details', async () => {
    const c = new Auth.RegisterInteriorDesignerController({ UserAccount: { emailExists: async () => false } });
    await expectAppError(c.execute({ email: 'd@x.com', password: 'Abcdefg1', fullName: 'Dee', phone: '1' }), 400, /Company name/);
  });

  test('UT-AUTH-10 change password requires the current password', async () => {
    const setPassword = jest.fn();
    const c = new Auth.ChangePasswordController({ UserAccount: { getPasswordHash: async () => 'hashed:Old12345', setPassword }, PasswordService: fakePasswords });
    await expectAppError(c.execute(actor(), { currentPassword: 'wrong', newPassword: 'New12345' }), 400, /incorrect/);
    await c.execute(actor(), { currentPassword: 'Old12345', newPassword: 'New12345' });
    expect(setPassword).toHaveBeenCalledWith(1, 'hashed:New12345', false);
  });

  test('UT-AUTH-11 editing personal profile checks email uniqueness', async () => {
    const c = new Auth.EditPersonalProfileController({ UserAccount: { emailExists: async () => true, update: jest.fn() } });
    await expectAppError(c.execute(actor(), { email: 'taken@x.com' }), 409);
    await expectAppError(c.execute(actor(), {}), 400, /No changes/);
  });

  test('UT-AUTH-12 logout ends the session', async () => {
    const endSession = jest.fn(async () => {});
    const r = await new Auth.LogoutController().execute({ endSession });
    expect(endSession).toHaveBeenCalled();
    expect(r.message).toMatch(/logged out/);
  });
});

// --------------------------------------------------------------------------
describe('UT-ADM accounts (stories 1, 2, 4, 7, 8, 9, 10)', () => {
  test('UT-ADM-01 list and search pass filters and paginate', async () => {
    const search = jest.fn(async () => ({ rows: [account()], total: 41 }));
    const r = await new Acc.SearchUserAccountsController({ UserAccount: { search } }).execute({ q: 'amy', role: 'customer', page: '2', pageSize: '20' });
    expect(search).toHaveBeenCalledWith({ q: 'amy', status: null, role: 'customer', limit: 20, offset: 20 });
    expect(r.totalPages).toBe(3);
    await expectAppError(new Acc.SearchUserAccountsController({ UserAccount: { search } }).execute({ role: 'wizard' }), 400);
    const all = await new Acc.ViewUserAccountsController({ UserAccount: { search } }).execute({});
    expect(all.total).toBe(41);
  });

  test('UT-ADM-02 admin cannot suspend themselves; repeated status is a conflict', async () => {
    const c = new Acc.SuspendUserAccountController({ UserAccount: { findById: async () => account({ status: 'suspended' }), setStatus: jest.fn(async () => account()) } });
    await expectAppError(c.execute(actor({ accountId: 7 }), 7, 'suspended'), 400, /own account/);
    await expectAppError(c.execute(actor(), 7, 'suspended'), 409);
    const r = await c.execute(actor(), 7, 'active');
    expect(r.message).toMatch(/reactivated/);
  });

  test('UT-ADM-03 password reset issues a one-time temporary password', async () => {
    const setPassword = jest.fn();
    const r = await new Acc.ResetUserPasswordController({ UserAccount: { findById: async () => account(), setPassword }, PasswordService: fakePasswords }).execute(7);
    expect(r.temporaryPassword).toBe('Temp1234abcd');
    expect(setPassword).toHaveBeenCalledWith(7, 'hashed:Temp1234abcd', true);
  });

  test('UT-ADM-04 create account: designer accounts are pre-approved with a company', async () => {
    const approve = jest.fn();
    const companyCreate = jest.fn();
    const c = new Acc.CreateUserAccountController({
      db: fakeDb,
      UserAccount: { emailExists: async () => false, create: async () => account({ account_id: 20 }), findById: async () => account({ account_id: 20, role: 'designer' }) },
      UserProfile: { findById: async () => ({ profile_id: 2, role: 'designer', is_suspended: false }) },
      InteriorDesigner: { create: jest.fn(), approve },
      Company: { create: companyCreate },
      PasswordService: fakePasswords,
    });
    const r = await c.execute(actor(), { email: 'n@x.com', fullName: 'Nia', profileId: 2 });
    expect(r.temporaryPassword).toBe('Temp1234abcd');
    expect(approve).toHaveBeenCalledWith(20, 1, {});
    expect(companyCreate).toHaveBeenCalled();
  });

  test('UT-ADM-05 create account rejects suspended or missing profiles', async () => {
    const mk = (p) => new Acc.CreateUserAccountController({ UserProfile: { findById: async () => p }, UserAccount: { emailExists: async () => false } });
    await expectAppError(mk(null).execute(actor(), { email: 'n@x.com', fullName: 'Nia', profileId: 9 }), 400, /does not exist/);
    await expectAppError(mk({ is_suspended: true }).execute(actor(), { email: 'n@x.com', fullName: 'Nia', profileId: 9 }), 400, /suspended/);
  });

  test('UT-ADM-06 update account only allows same-role profile moves', async () => {
    const c = new Acc.UpdateUserAccountController({
      UserAccount: { findById: async () => account(), emailExists: async () => false, update: jest.fn(async () => account()) },
      UserProfile: { findById: async () => ({ profile_id: 2, role: 'designer', permissions: [] }) },
    });
    await expectAppError(c.execute(actor(), 7, { profileId: 2 }), 400, /customer profile/);
    await expect(c.execute(actor(), 7, { fullName: 'Amy Lee' })).resolves.toBeDefined();
  });

  test('UT-ADM-07 viewing a missing account is 404', async () => {
    await expectAppError(new Acc.ViewUserAccountController({ UserAccount: { findById: async () => null } }).execute(99), 404);
  });
});

describe('UT-REG designer registrations (stories 3, 11)', () => {
  const designer = (status) => ({ designer_id: 5, full_name: 'Dee', registration_status: status });
  test('UT-REG-01 approve a pending registration; approving twice is a conflict', async () => {
    const approve = jest.fn(async () => designer('approved'));
    await new Reg.ApproveInteriorDesignerRegistrationController({ InteriorDesigner: { findById: async () => designer('pending'), approve } }).execute(actor(), 5);
    expect(approve).toHaveBeenCalledWith(5, 1);
    await expectAppError(new Reg.ApproveInteriorDesignerRegistrationController({ InteriorDesigner: { findById: async () => designer('approved') } }).execute(actor(), 5), 409);
  });
  test('UT-REG-02 reject requires a reason of at least 10 characters and a pending status', async () => {
    const reject = jest.fn(async () => designer('rejected'));
    const c = new Reg.RejectInteriorDesignerRegistrationController({ InteriorDesigner: { findById: async () => designer('pending'), reject } });
    await expectAppError(c.execute(actor(), 5, 'too short'), 400);
    await c.execute(actor(), 5, 'Licence could not be verified');
    expect(reject).toHaveBeenCalledWith(5, 1, 'Licence could not be verified');
    const done = new Reg.RejectInteriorDesignerRegistrationController({ InteriorDesigner: { findById: async () => designer('approved') } });
    await expectAppError(done.execute(actor(), 5, 'Licence could not be verified'), 409);
  });
  test('UT-REG-03 approval queue defaults to pending', async () => {
    const listByStatus = jest.fn(async () => ({ rows: [], total: 0 }));
    await new Reg.ViewDesignerRegistrationsController({ InteriorDesigner: { listByStatus } }).execute({});
    expect(listByStatus).toHaveBeenCalledWith('pending', { limit: 20, offset: 0 });
  });
});

describe('UT-PRF user profiles (stories 12-16)', () => {
  const profile = (over = {}) => ({ profile_id: 4, name: 'Customer', role: 'customer', permissions: ['favourites.manage'], is_suspended: false, account_count: 3, description: '', ...over });
  test('UT-PRF-01 create profile only with permissions valid for the role', async () => {
    const create = jest.fn(async (d) => profile(d));
    const c = new Prof.CreateUserProfileController({ UserProfile: { findByName: async () => null, create } });
    await expectAppError(c.execute({ name: 'Bad', role: 'customer', permissions: ['reports.generate'] }), 400, /not valid/);
    const r = await c.execute({ name: 'VIP Customer', role: 'customer', permissions: ['favourites.manage'] });
    expect(r.permission_details[0].label).toMatch(/favourite/i);
    const dflt = await c.execute({ name: 'Default Manager', role: 'manager' });
    expect(dflt.permissions).toEqual(['stats.view', 'categories.manage', 'reports.generate']);
  });
  test('UT-PRF-02 duplicate profile names are rejected', async () => {
    await expectAppError(new Prof.CreateUserProfileController({ UserProfile: { findByName: async () => profile() } }).execute({ name: 'Customer', role: 'customer' }), 409);
  });
  test('UT-PRF-03 role of an existing profile cannot change; admin cannot strip own profile permission', async () => {
    const c = new Prof.UpdateUserProfileController({ UserProfile: { findById: async () => profile({ name: 'User Admin', role: 'admin', permissions: ['profiles.manage'] }), findByName: async () => null, update: async () => profile() } });
    await expectAppError(c.execute(actor(), 4, { role: 'manager' }), 400, /cannot be changed/);
    await expectAppError(c.execute(actor(), 4, { permissions: ['accounts.view'] }), 400, /own profile/);
  });
  test('UT-PRF-04 suspend keeps accounts and cannot target own profile', async () => {
    const setSuspended = jest.fn(async () => profile({ is_suspended: true }));
    const c = new Prof.SuspendUserProfileController({ UserProfile: { findById: async () => profile(), setSuspended } });
    const r = await c.execute(actor(), 4, true);
    expect(r.message).toMatch(/3 account\(s\) are kept/);
    await expectAppError(c.execute(actor({ profileName: 'Customer' }), 4, true), 400, /own user profile/);
    await expectAppError(c.execute(actor(), 4, 'yes'), 400);
  });
  test('UT-PRF-05 view and search profiles', async () => {
    const v = await new Prof.ViewUserProfileController({ UserProfile: { findById: async () => profile() } }).execute(4);
    expect(v.available_permissions.map((p) => p.code)).toEqual(['favourites.manage', 'enquiries.send']);
    const s = await new Prof.SearchUserProfilesController({ UserProfile: { search: async () => ({ rows: [profile()], total: 1 }) } }).execute({ q: 'cust' });
    expect(s.total).toBe(1);
    expect(Object.keys(new Prof.ViewUserProfileController().catalogue())).toEqual(['admin', 'designer', 'customer', 'manager']);
  });
});

// --------------------------------------------------------------------------
describe('UT-IDP designer portfolio (stories 21-24, 31-33)', () => {
  const designer = actor({ accountId: 10, role: 'designer' });
  const base = (ownerId = 10) => ({
    db: fakeDb,
    IDP: { findOwnerId: async (id) => (id === 404 ? null : ownerId), create: jest.fn(async () => 55), update: jest.fn(), delete: jest.fn(), findById: async () => ({ idp_id: 55, budget_min: 1000, budget_max: 2000, photos: [{ photo_id: 1 }] }), search: jest.fn(async () => ({ rows: [], total: 0 })) },
    IDPPhoto: { addMany: jest.fn(), deleteMany: jest.fn(async () => []), urlsForIdp: async () => ['/uploads/a.jpg'] },
    IDPCategory: { findById: async (id) => (id === 1 ? { category_id: 1 } : null) },
    DesignStyle: { allExist: async (ids) => ids.every((i) => i < 20) },
    PropertyType: { exists: async (id) => id < 6 },
    FileStorage: { removeLocal: jest.fn() },
  });
  const valid = { title: 'Japandi Kitchen', description: 'A calm kitchen with oak cabinetry.', location: 'Bedok', categoryId: 1, budgetMin: 10000, budgetMax: 20000, photoUrls: ['https://example.com/a.jpg'] };

  test('UT-IDP-01 create listing with photos, category, budget and tags', async () => {
    const deps = base();
    const r = await new IdpC.CreateIDPListingController(deps).execute(designer, { ...valid, styleIds: [1, 2], propertyTypeId: 1 });
    expect(deps.IDP.create).toHaveBeenCalledWith(10, expect.objectContaining({ title: 'Japandi Kitchen', styleIds: [1, 2], propertyTypeId: 1, status: 'current' }), {});
    expect(deps.IDPPhoto.addMany).toHaveBeenCalledWith(55, [{ url: 'https://example.com/a.jpg' }], {});
    expect(r.message).toMatch(/created/);
  });
  test('UT-IDP-02 create validation: budget order, photo required, category exists, style limit', async () => {
    const c = new IdpC.CreateIDPListingController(base());
    await expectAppError(c.execute(designer, { ...valid, budgetMin: 5000, budgetMax: 100 }), 400, /Maximum budget/);
    await expectAppError(c.execute(designer, { ...valid, photoUrls: [] }), 400, /at least one photo/);
    await expectAppError(c.execute(designer, { ...valid, categoryId: 9 }), 400, /category/);
    await expectAppError(c.execute(designer, { ...valid, styleIds: [1, 2, 3, 4, 5, 6] }), 400, /at most 5/);
    await expectAppError(c.execute(designer, { ...valid, photoUrls: ['javascript:alert(1)'] }), 400, /Invalid photo URL/);
  });
  test('UT-IDP-03 another designer cannot edit, delete, view, tag or re-status the IDP', async () => {
    const deps = base(99);
    await expectAppError(new IdpC.UpdateIDPListingController(deps).execute(designer, 55, { title: 'Stolen title' }), 403);
    await expectAppError(new IdpC.DeleteIDPListingController(deps).execute(designer, 55), 403);
    await expectAppError(new IdpC.ViewOwnIDPController(deps).execute(designer, 55), 403);
    await expectAppError(new IdpC.TagIDPController(deps).execute(designer, 55, { styleIds: [1] }), 403);
    await expectAppError(new IdpC.MarkIDPStatusController(deps).execute(designer, 55, 'past'), 403);
    await expectAppError(new IdpC.MarkIDPStatusController(base()).execute(designer, 404, 'past'), 404);
  });
  test('UT-IDP-04 mark current/past and categorise', async () => {
    const deps = base();
    await new IdpC.MarkIDPStatusController(deps).execute(designer, 55, 'past');
    expect(deps.IDP.update).toHaveBeenCalledWith(55, { status: 'past' });
    await expectAppError(new IdpC.MarkIDPStatusController(deps).execute(designer, 55, 'archived'), 400);
    await new IdpC.CategoriseIDPController(deps).execute(designer, 55, 1);
    expect(deps.IDP.update).toHaveBeenCalledWith(55, { categoryId: 1 });
  });
  test('UT-IDP-05 update keeps at least one photo and deletes removed files', async () => {
    const deps = base();
    await expectAppError(new IdpC.UpdateIDPListingController(deps).execute(designer, 55, { removePhotoIds: [1] }), 400, /at least one photo/);
    deps.IDPPhoto.deleteMany = jest.fn(async () => ['/uploads/old.jpg']);
    await new IdpC.UpdateIDPListingController(deps).execute(designer, 55, { removePhotoIds: [1], photoUrls: ['https://example.com/new.jpg'], budgetMax: 3000 });
    expect(deps.IDP.update).toHaveBeenCalledWith(55, { budgetMin: 1000, budgetMax: 3000 }, {});
    expect(deps.FileStorage.removeLocal).toHaveBeenCalledWith(['/uploads/old.jpg']);
  });
  test('UT-IDP-06 delete removes the IDP and its uploaded files', async () => {
    const deps = base();
    await new IdpC.DeleteIDPListingController(deps).execute(designer, 55);
    expect(deps.IDP.delete).toHaveBeenCalledWith(55);
    expect(deps.FileStorage.removeLocal).toHaveBeenCalledWith(['/uploads/a.jpg']);
  });
  test('UT-IDP-07 tags validate styles and property type', async () => {
    const deps = base();
    await expectAppError(new IdpC.TagIDPController(deps).execute(designer, 55, { styleIds: [50] }), 400, /design styles/);
    await expectAppError(new IdpC.TagIDPController(deps).execute(designer, 55, { propertyTypeId: 9 }), 400, /property type/);
    await new IdpC.TagIDPController(deps).execute(designer, 55, { styleIds: [3], propertyTypeId: 2 });
    expect(deps.IDP.update).toHaveBeenCalledWith(55, { styleIds: [3], propertyTypeId: 2 });
  });
  test('UT-IDP-08 own search is scoped to the designer', async () => {
    const deps = base();
    await new IdpC.SearchOwnIDPsController(deps).execute(designer, { q: 'kitchen', status: 'past', categoryId: 'none' });
    expect(deps.IDP.search).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 10, publicOnly: false, keyword: 'kitchen', status: 'past', uncategorised: true }));
  });
});

describe('UT-CO company and analytics (stories 19, 20, 25-27, 29, 30, 34)', () => {
  const designer = actor({ accountId: 10, role: 'designer' });
  test('UT-CO-01 company profile validates website and creates when missing', async () => {
    const create = jest.fn(async () => ({ company_id: 1 }));
    const c = new CoC.CreateEditCompanyProfileController({ Company: { findByDesigner: async () => null, create } });
    await expectAppError(c.execute(designer, { companyName: 'Studio', website: 'ftp://x' }), 400, /Website/);
    const r = await c.execute(designer, { companyName: 'Studio', serviceAreas: 'East,West' });
    expect(create).toHaveBeenCalledWith(10, expect.objectContaining({ companyName: 'Studio', serviceAreas: ['East', 'West'] }));
    expect(r.message).toMatch(/created/);
  });
  test('UT-CO-02 certifications are added to the own company and removal checks ownership', async () => {
    const deps = { Company: { findByDesigner: async () => ({ company_id: 3 }) }, Certification: { create: jest.fn(async () => ({})), delete: async () => false } };
    await new CoC.AddCertificationController(deps).execute(designer, { title: 'CaseTrust', issuer: 'CASE', yearObtained: 2020 });
    expect(deps.Certification.create).toHaveBeenCalledWith(3, { title: 'CaseTrust', issuer: 'CASE', yearObtained: 2020 });
    await expectAppError(new CoC.AddCertificationController(deps).remove(designer, 8), 404);
    await expectAppError(new CoC.AddCertificationController(deps).execute(designer, { title: 'X1', issuer: 'Y1', yearObtained: 1800 }), 400);
  });
  test('UT-CO-03 analytics totals are summed from per-IDP counts', async () => {
    const IDP = {
      viewCountsForDesigner: async () => [{ view_count: 5 }, { view_count: 7 }],
      shortlistCountsForDesigner: async () => [{ favourite_count: 2 }, { favourite_count: 1 }],
      performanceSummary: async () => ({ total_views: 40, total_favourites: 6 }),
      search: async () => ({ rows: [{ idp_id: 1 }] }),
    };
    expect((await new An.ViewIDPViewCountsController({ IDP }).execute(designer)).total_views).toBe(12);
    expect((await new An.ViewIDPShortlistCountsController({ IDP }).execute(designer)).total_favourites).toBe(3);
    const dash = await new An.ViewPerformanceDashboardController({ IDP }).execute(designer);
    expect(dash.shortlist_rate).toBe(15);
    expect(dash.top_idps).toHaveLength(1);
  });
  test('UT-CO-04 enquiries are listed per designer and marked read only by their owner', async () => {
    const Enquiry = { listByDesigner: jest.fn(async () => ({ rows: [], total: 0 })), markRead: async () => false };
    await new An.ViewEnquiriesController({ Enquiry }).execute(designer, { status: 'new' });
    expect(Enquiry.listByDesigner).toHaveBeenCalledWith(10, { status: 'new', limit: 20, offset: 0 });
    await expectAppError(new An.ViewEnquiriesController({ Enquiry }).markRead(designer, 3), 404);
  });
  test('UT-CO-05 preview shows the page even when not publicly visible', async () => {
    const deps = {
      InteriorDesigner: { findById: async () => ({ designer_id: 10, registration_status: 'approved' }), isPubliclyVisible: async () => false },
      Company: { findByDesigner: async () => ({ company_id: 1 }) },
      Certification: { listByCompany: async () => [] },
      IDP: { search: async () => ({ rows: [], total: 0 }) },
    };
    const r = await new CoC.PreviewCompanyProfileController(deps).execute(designer);
    expect(r).toMatchObject({ preview: true, publicly_visible: false });
  });
});

// --------------------------------------------------------------------------
describe('UT-CUS discovery, favourites and enquiries (stories 37-48)', () => {
  const customer = actor({ accountId: 30, role: 'customer' });
  test('UT-CUS-01 search parses every filter and logs the search', async () => {
    const search = jest.fn(async () => ({ rows: [], total: 3 }));
    const record = jest.fn();
    await new Disc.SearchIDPsController({ IDP: { search }, SearchLog: { record } }).execute(
      { keyword: 'kitchen', categoryId: '1', budgetMin: '1000', budgetMax: '5000', location: 'Bedok', styleIds: '2,3', propertyTypeId: '1', sort: 'most_viewed' }, customer,
    );
    expect(search).toHaveBeenCalledWith(expect.objectContaining({
      keyword: 'kitchen', categoryId: 1, budgetMin: 1000, budgetMax: 5000, location: 'Bedok', styleIds: [2, 3], propertyTypeId: 1, sort: 'most_viewed', publicOnly: true,
    }));
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ accountId: 30, keyword: 'kitchen', resultCount: 3 }));
  });
  test('UT-CUS-02 invalid sort and inverted budget are rejected; page 2 is not logged', async () => {
    const record = jest.fn();
    const c = new Disc.SearchIDPsController({ IDP: { search: async () => ({ rows: [], total: 0 }) }, SearchLog: { record } });
    await expectAppError(c.execute({ sort: 'random' }), 400);
    await expectAppError(c.execute({ budgetMin: 10, budgetMax: 5 }), 400);
    await c.execute({ page: 2 });
    expect(record).not.toHaveBeenCalled();
  });
  test('UT-CUS-03 viewing details records a view, except for the owner', async () => {
    const recordView = jest.fn();
    const deps = (owner) => ({
      IDP: { findOwnerId: async () => owner, findById: async () => ({ idp_id: 5, designer_id: owner, view_count: 3 }), search: async () => ({ rows: [{ idp_id: 5 }, { idp_id: 6 }] }) },
      IDPView: { record: recordView }, Favourite: { idsByCustomer: async () => [5] },
    });
    const r = await new Disc.ViewIDPDetailsController(deps(10)).execute(5, customer);
    expect(recordView).toHaveBeenCalledWith(5, 30);
    expect(r).toMatchObject({ view_count: 4, is_favourite: true });
    expect(r.more_from_designer).toEqual([{ idp_id: 6 }]);
    recordView.mockClear();
    await new Disc.ViewIDPDetailsController(deps(10)).execute(5, actor({ accountId: 10, role: 'designer' }));
    expect(recordView).not.toHaveBeenCalled();
    await expectAppError(new Disc.ViewIDPDetailsController({ IDP: { findOwnerId: async () => null, findById: async () => null } }).execute(5), 404);
  });
  test('UT-CUS-04 designer pages are hidden unless publicly visible', async () => {
    await expectAppError(new Disc.ViewDesignerCompanyProfileController({ InteriorDesigner: { isPubliclyVisible: async () => false } }).execute(4), 404);
    await expectAppError(new Disc.BrowseDesignerIDPsController({ InteriorDesigner: { isPubliclyVisible: async () => false } }).execute(4), 404);
  });
  test('UT-CUS-05 saving a favourite twice is a conflict', async () => {
    const deps = { IDP: { findById: async () => ({ idp_id: 5, title: 'Kitchen' }) }, Favourite: { add: async () => null } };
    await expectAppError(new Fav.SaveFavouriteController(deps).execute(customer, 5), 409, /already/);
    const ok = { IDP: deps.IDP, Favourite: { add: async () => ({ favourite_id: 1 }) } };
    expect((await new Fav.SaveFavouriteController(ok).execute(customer, 5)).message).toMatch(/saved/);
    await expectAppError(new Fav.SaveFavouriteController({ IDP: { findById: async () => null } }).execute(customer, 5), 404);
  });
  test('UT-CUS-06 manage and search favourites', async () => {
    const listByCustomer = jest.fn(async () => [{ idp_id: 5 }]);
    const Favourite = { listByCustomer, remove: async () => false, idsByCustomer: async () => [5] };
    expect((await new Fav.ManageFavouritesListController({ Favourite }).execute(customer)).total).toBe(1);
    await new Fav.SearchFavouritesController({ Favourite }).execute(customer, { q: 'oak' });
    expect(listByCustomer).toHaveBeenLastCalledWith(30, { q: 'oak' });
    await expectAppError(new Fav.ManageFavouritesListController({ Favourite }).remove(customer, 5), 404);
    expect(await new Fav.ManageFavouritesListController({ Favourite }).ids(customer)).toEqual([5]);
  });
  test('UT-CUS-07 enquiry goes to the IDP owner and validates the message', async () => {
    const create = jest.fn(async (d) => d);
    const deps = { IDP: { findById: async () => ({ idp_id: 5, designer_id: 10, company_name: 'Dana Studio' }) }, Enquiry: { create, listByCustomer: async () => [] } };
    await expectAppError(new Fav.ContactDesignerController(deps).execute(customer, { idpId: 5, message: 'hi' }), 400);
    await expectAppError(new Fav.ContactDesignerController(deps).execute(customer, { idpId: 5, message: 'Hello there, please call me.', contactPhone: 'abc' }), 400);
    const r = await new Fav.ContactDesignerController(deps).execute(customer, { idpId: 5, message: 'Hello there, please call me.' });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ idpId: 5, customerId: 30, designerId: 10 }));
    expect(r.message).toMatch(/Dana Studio/);
  });
});

// --------------------------------------------------------------------------
describe('UT-MGT categories and reports (stories 49-53, 56-60)', () => {
  const manager = actor({ accountId: 2, role: 'manager' });
  test('UT-MGT-01 category CRUD rules', async () => {
    const IDPCategory = { nameExists: async (n) => n.toLowerCase() === 'kitchen', create: async (d) => ({ category_id: 9, ...d }), findById: async (id) => (id === 9 ? { category_id: 9, name: 'Balcony', idp_count: 2 } : null), update: async () => ({}), delete: jest.fn(async () => true), findAll: async () => [{}, {}] };
    await expectAppError(new Cat.CreateIDPCategoryController({ IDPCategory }).execute({ name: 'KITCHEN' }), 409);
    expect((await new Cat.CreateIDPCategoryController({ IDPCategory }).execute({ name: 'Balcony' })).message).toMatch(/created/);
    await expectAppError(new Cat.UpdateIDPCategoryController({ IDPCategory }).execute(1, { name: 'X Room' }), 404);
    await expectAppError(new Cat.UpdateIDPCategoryController({ IDPCategory }).execute(9, { name: 'kitchen' }), 409);
    const del = await new Cat.DeleteIDPCategoryController({ IDPCategory }).execute(9);
    expect(del.message).toMatch(/2 IDP\(s\) are now uncategorised/);
    expect((await new Cat.ViewIDPCategoriesController({ IDPCategory }).execute()).total).toBe(2);
    expect((await new Cat.SearchIDPCategoriesController({ IDPCategory }).execute({ q: 'room' })).q).toBe('room');
  });

  const stats = () => ({
    periodTotals: jest.fn(async () => ({ new_users: 1, new_idps: 1, searches: 1, views: 1, favourites: 1, enquiries: 1 })),
    newUsersByRole: async () => ({}), dailySeries: jest.fn(async () => []), topDesigners: jest.fn(async () => []),
    topCategories: async () => [], topSearchKeywords: async () => [], membership: async () => ({ total_users: 5 }),
  });
  const saved = () => ({ create: jest.fn(async (d) => ({ report_id: 1, ...d })) });

  test('UT-MGT-02 daily report covers exactly one day and is saved', async () => {
    const S = stats(); const Report = saved();
    await new Rep.GenerateDailyReportController({ PlatformStatistics: S, Report, today: () => '2026-11-07' }).execute(manager, { date: '2026-11-05' });
    expect(S.periodTotals).toHaveBeenCalledWith('2026-11-05', '2026-11-05');
    expect(Report.create).toHaveBeenCalledWith(expect.objectContaining({ reportType: 'daily', periodStart: '2026-11-05', periodEnd: '2026-11-05', generatedBy: 2 }));
  });
  test('UT-MGT-03 weekly report runs Monday-Sunday and compares with the previous week', async () => {
    const S = stats(); const Report = saved();
    await new Rep.GenerateWeeklyReportController({ PlatformStatistics: S, Report, today: () => '2026-11-07' }).execute(manager, { weekStart: '2026-11-05' });
    expect(S.periodTotals).toHaveBeenCalledWith('2026-11-02', '2026-11-08');
    expect(S.periodTotals).toHaveBeenCalledWith('2026-10-26', '2026-11-01');
    expect(Report.create.mock.calls[0][0].data.growth).toBeDefined();
  });
  test('UT-MGT-04 monthly report covers the calendar month and ranks top designers', async () => {
    const S = stats(); const Report = saved();
    await new Rep.GenerateMonthlyReportController({ PlatformStatistics: S, Report, today: () => '2026-11-07' }).execute(manager, { month: '2026-02' });
    expect(S.topDesigners).toHaveBeenCalledWith('2026-02-01', '2026-02-28', 10);
    expect(S.periodTotals).toHaveBeenCalledWith('2026-01-01', '2026-01-31');
  });
  test('UT-MGT-05 report periods are validated', async () => {
    const deps = { PlatformStatistics: stats(), Report: saved(), today: () => '2026-11-07' };
    await expectAppError(new Rep.GenerateDailyReportController(deps).execute(manager, { date: '2026-11-08' }), 400, /future/);
    await expectAppError(new Rep.GenerateDailyReportController(deps).execute(manager, { date: 'yesterday' }), 400);
    await expectAppError(new Rep.GenerateMonthlyReportController(deps).execute(manager, { month: '2026-12' }), 400, /future/);
    await expectAppError(new Rep.GenerateCustomReportController(deps).execute(manager, { start: '2026-11-05', end: '2026-11-01' }), 400, /on or after/);
    await expectAppError(new Rep.GenerateCustomReportController(deps).execute(manager, { start: '2024-01-01', end: '2026-11-01' }), 400, /366/);
    await expectAppError(new Rep.GenerateCustomReportController(deps).execute(manager, { start: '2026-11-01', end: '2026-11-09' }), 400, /future/);
    await expect(new Rep.GenerateCustomReportController(deps).execute(manager, { start: '2026-10-01', end: '2026-10-31' })).resolves.toBeDefined();
  });
  test('UT-MGT-06 history, view and export', async () => {
    const Report = { findAll: jest.fn(async () => ({ rows: [], total: 0 })), findById: async (id) => (id === 1 ? { report_id: 1 } : null) };
    await new Rep.ViewReportsController({ Report }).execute({ type: 'weekly' });
    expect(Report.findAll).toHaveBeenCalledWith({ type: 'weekly', limit: 20, offset: 0 });
    await expectAppError(new Rep.ViewReportsController({ Report }).view(2), 404);
    const ReportExporter = { toCSV: jest.fn(() => ({ body: 'x' })), toPDF: jest.fn(async () => ({ body: 'y' })) };
    await new Rep.ExportReportController({ Report, ReportExporter }).execute(1, 'csv');
    expect(ReportExporter.toCSV).toHaveBeenCalled();
    await expectAppError(new Rep.ExportReportController({ Report, ReportExporter }).execute(1, 'xlsx'), 400);
    expect((await new Rep.ViewMembershipStatisticsController({ PlatformStatistics: stats() }).execute()).total_users).toBe(5);
  });
});

// --------------------------------------------------------------------------
describe('UT-CON admin console tools', () => {
  const AuditLog = { ACTIONS: { 'account.suspend': 'Account suspended', 'registration.approve': 'Designer approved' } };

  test('UT-CON-01 overview combines totals, trend, queue and recent activity', async () => {
    const c = new Ov.ViewAdminOverviewController({
      AccountStatistics: {
        totals: async () => ({ total_accounts: 9 }), byRole: async () => [{ role: 'customer', accounts: 4 }],
        signupTrend: jest.fn(async () => [{ day: '2026-11-09', customers: 1, designers: 0 }]), recentSignups: async () => [account()],
      },
      InteriorDesigner: { listByStatus: jest.fn(async () => ({ rows: [{ designer_id: 5 }], total: 1 })) },
      AuditLog: { ...AuditLog, search: async () => ({ rows: [{ action: 'account.suspend' }], total: 1 }) },
    });
    const r = await c.execute();
    expect(r.totals.total_accounts).toBe(9);
    expect(r.pending_registrations).toEqual([{ designer_id: 5 }]);
    expect(r.recent_activity).toHaveLength(1);
    expect(c.e.InteriorDesigner.listByStatus.mock.calls[0][0]).toBe('pending');
  });

  test('UT-CON-02 activity log validates the type filter and labels each entry', async () => {
    const search = jest.fn(async () => ({ rows: [{ action: 'account.suspend' }, { action: 'other.thing' }], total: 2 }));
    const c = new Ov.ViewAdminActivityController({ AuditLog: { ...AuditLog, search } });
    const r = await c.execute({ action: 'account.', q: 'amy', page: '1' });
    expect(search.mock.calls[0][0]).toMatchObject({ q: 'amy', action: 'account.', limit: 25, offset: 0 });
    expect(r.results.map((x) => x.action_label)).toEqual(['Account suspended', 'other.thing']);
    await expectAppError(c.execute({ action: 'drop table' }), 400);
  });

  test('UT-CON-03 recording rejects unknown actions and stores the actor', async () => {
    const record = jest.fn(async () => {});
    const c = new Ov.RecordAdminActionController({ AuditLog: { ...AuditLog, record } });
    await c.execute(actor(), { action: 'account.suspend', targetType: 'account', targetId: 7, summary: 'Suspended Amy' });
    expect(record.mock.calls[0][0]).toEqual({ actorId: 1, action: 'account.suspend', targetType: 'account', targetId: 7, summary: 'Suspended Amy' });
    await expectAppError(c.execute(actor(), { action: 'account.delete', targetType: 'account', summary: 'x' }), 400);
  });

  test('UT-CON-04 CSV export escapes formulas and reports truncation', async () => {
    const c = new Ov.ExportUserAccountsController({
      UserAccount: { search: jest.fn(async () => ({ rows: [account({ full_name: '=SUM(A1)', created_at: '2026-11-01T00:00:00Z', last_login_at: null })], total: 6000 })) },
    });
    const r = await c.execute({ role: 'customer' });
    const [header, row] = r.csv.trim().split('\n');
    expect(header.split(',')).toHaveLength(11);
    expect(row).toContain("'=SUM(A1)");
    expect(row).toContain('2026-11-01T00:00:00.000Z');
    expect(r).toMatchObject({ count: 1, truncated: true });
    expect(r.filename).toMatch(/^designmatch-accounts-\d{4}-\d{2}-\d{2}\.csv$/);
    await expectAppError(c.execute({ role: 'wizard' }), 400);
  });

  test('UT-CON-05 bulk status applies the single-account rules to each id', async () => {
    const single = { execute: jest.fn(async (a, id) => { if (id === 1) throw AppError.badRequest('You cannot change the status of your own account.'); return { account: account({ account_id: id }) }; }) };
    const c = new Ov.BulkUpdateAccountStatusController({ single });
    const r = await c.execute(actor(), { accountIds: [7, '8', 1, 7], status: 'suspended' });
    expect(single.execute.mock.calls.map((x) => x[1])).toEqual([7, 8, 1]);
    expect(r.updated.map((a) => a.account_id)).toEqual([7, 8]);
    expect(r.skipped).toEqual([{ account_id: 1, reason: 'You cannot change the status of your own account.' }]);
    expect(r.message).toBe('2 accounts suspended, 1 skipped.');
    await expectAppError(c.execute(actor(), { accountIds: [], status: 'active' }), 400);
    await expectAppError(c.execute(actor(), { accountIds: Array.from({ length: 101 }, (_, i) => i + 2), status: 'active' }), 400);
    const boom = new Ov.BulkUpdateAccountStatusController({ single: { execute: async () => { throw new Error('db down'); } } });
    await expect(boom.execute(actor(), { accountIds: [7], status: 'active' })).rejects.toThrow('db down');
  });
});

describe('UT-SRCH keyword words and zero-result suggestions', () => {
  test('UT-SRCH-01 keywords split into words; simple plurals match the singular', () => {
    expect(IDPEntity.keywordTerms('Living Rooms, japandi')).toEqual(['living', 'room', 'japandi']);
    expect(IDPEntity.keywordTerms('glass kitchens a')).toEqual(['glass', 'kitchen']);
    expect(IDPEntity.keywordTerms('')).toEqual([]);
    expect(IDPEntity.keywordTerms('a b c d e f g h i j k l m n o p q').length).toBe(0);
    expect(IDPEntity.keywordTerms('one two three four five six seven eight')).toHaveLength(6);
  });

  test('UT-SRCH-02 suggestions list the filters whose removal brings results back', async () => {
    const count = jest.fn(async (c, omit) => ({ categoryId: 4, budget: 0, keyword: 2 }[omit] ?? 0));
    const c = new Disc.SearchIDPsController({
      IDP: { search: async () => ({ rows: [], total: 0 }), facets: async () => ({ categories: {} }), count }, SearchLog: { record: async () => {} },
    });
    const r = await c.execute({ keyword: 'oak', categoryId: '3', budgetMax: '1000', facets: '1' });
    expect(r.facets).toEqual({ categories: {} });
    expect(r.suggestions).toEqual([{ remove: 'categoryId', total: 4 }, { remove: 'keyword', total: 2 }]);
    expect(count.mock.calls.map((x) => x[1])).toEqual(['keyword', 'categoryId', 'budget']);
  });
});
