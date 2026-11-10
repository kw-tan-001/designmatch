'use strict';

/**
 * Boundary: User Admin endpoints (stories 1-4, 7-16). Mounted at /api/admin.
 */
const express = require('express');
const { asyncHandler } = require('../../middleware/errorHandler');
const { requireRole, requirePermission } = require('../../middleware/auth');
const A = require('../../control/admin/AccountControllers');
const R = require('../../control/admin/RegistrationControllers');
const P = require('../../control/admin/ProfileControllers');
const O = require('../../control/admin/OverviewControllers');
const { logAdminAction } = require('../../middleware/audit');

const router = express.Router();
router.use(requireRole('admin'));

const c = {
  viewAccounts: new A.ViewUserAccountsController(),
  searchAccounts: new A.SearchUserAccountsController(),
  viewAccount: new A.ViewUserAccountController(),
  createAccount: new A.CreateUserAccountController(),
  updateAccount: new A.UpdateUserAccountController(),
  suspendAccount: new A.SuspendUserAccountController(),
  resetPassword: new A.ResetUserPasswordController(),
  registrations: new R.ViewDesignerRegistrationsController(),
  approve: new R.ApproveInteriorDesignerRegistrationController(),
  reject: new R.RejectInteriorDesignerRegistrationController(),
  searchProfiles: new P.SearchUserProfilesController(),
  viewProfile: new P.ViewUserProfileController(),
  createProfile: new P.CreateUserProfileController(),
  updateProfile: new P.UpdateUserProfileController(),
  suspendProfile: new P.SuspendUserProfileController(),
  overview: new O.ViewAdminOverviewController(),
  activity: new O.ViewAdminActivityController(),
  exportAccounts: new O.ExportUserAccountsController(),
  bulkStatus: new O.BulkUpdateAccountStatusController(),
};

const who = (a) => (a ? `${a.full_name} (${a.email})` : 'account');

// --- Console overview and activity log ---------------------------------
router.get('/overview', requirePermission('accounts.view'), asyncHandler(async (req, res) => {
  res.json(await c.overview.execute());
}));
router.get('/activity', requirePermission('accounts.view'), asyncHandler(async (req, res) => {
  res.json(await c.activity.execute(req.query));
}));

// --- Accounts ---------------------------------------------------------
// Story 1 (list all) when no filters are given; story 10 (search) otherwise
router.get('/accounts', requirePermission('accounts.view'), asyncHandler(async (req, res) => {
  const { q, status, role } = req.query;
  const controller = q || status || role ? c.searchAccounts : c.viewAccounts;
  res.json(await controller.execute(req.query));
}));
router.get('/accounts/export.csv', requirePermission('accounts.view'), asyncHandler(async (req, res) => {
  const out = await c.exportAccounts.execute(req.query);
  res.set('Cache-Control', 'no-store');
  res.set('X-Export-Count', String(out.count));
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${out.filename}"`);
  res.send(out.csv);
}));
router.post('/accounts/bulk-status', requirePermission('accounts.manage'), asyncHandler(async (req, res) => {
  const result = await c.bulkStatus.execute(req.user, req.body);
  for (const a of result.updated) {
    await logAdminAction(req.user, {
      action: a.status === 'suspended' ? 'account.suspend' : 'account.reactivate', targetType: 'account',
      targetId: a.account_id, summary: `${a.status === 'suspended' ? 'Suspended' : 'Reactivated'} ${who(a)} (bulk action)`,
    });
  }
  res.json(result);
}));
router.get('/accounts/:id', requirePermission('accounts.view'), asyncHandler(async (req, res) => {
  res.json(await c.viewAccount.execute(req.params.id));
}));
router.post('/accounts', requirePermission('accounts.manage'), asyncHandler(async (req, res) => {
  const result = await c.createAccount.execute(req.user, req.body);
  await logAdminAction(req.user, {
    action: 'account.create', targetType: 'account', targetId: result.account.account_id,
    summary: `Created ${who(result.account)} with the ${result.account.profile_name} profile`,
  });
  res.status(201).json({ ...result, message: 'User account created.' });
}));
router.put('/accounts/:id', requirePermission('accounts.manage'), asyncHandler(async (req, res) => {
  const account = await c.updateAccount.execute(req.user, req.params.id, req.body);
  await logAdminAction(req.user, {
    action: 'account.update', targetType: 'account', targetId: account.account_id, summary: `Updated ${who(account)}`,
  });
  res.json({ account, message: 'User account updated.' });
}));
router.patch('/accounts/:id/status', requirePermission('accounts.manage'), asyncHandler(async (req, res) => {
  const result = await c.suspendAccount.execute(req.user, req.params.id, req.body.status);
  const a = result.account;
  await logAdminAction(req.user, {
    action: a.status === 'suspended' ? 'account.suspend' : 'account.reactivate', targetType: 'account',
    targetId: a.account_id, summary: `${a.status === 'suspended' ? 'Suspended' : 'Reactivated'} ${who(a)}`,
  });
  res.json(result);
}));
router.post('/accounts/:id/reset-password', requirePermission('accounts.manage'), asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const result = await c.resetPassword.execute(req.params.id);
  await logAdminAction(req.user, {
    action: 'account.reset_password', targetType: 'account', targetId: Number(req.params.id),
    summary: result.message.split('.')[0],
  });
  res.json(result);
}));

// --- Designer registrations -------------------------------------------
router.get('/registrations', requirePermission('registrations.review'), asyncHandler(async (req, res) => {
  res.json(await c.registrations.execute(req.query));
}));
router.post('/registrations/:id/approve', requirePermission('registrations.review'), asyncHandler(async (req, res) => {
  const result = await c.approve.execute(req.user, req.params.id);
  const d = result.designer;
  await logAdminAction(req.user, {
    action: 'registration.approve', targetType: 'registration', targetId: d.designer_id,
    summary: `Approved ${d.full_name}${d.company_name ? ` of ${d.company_name}` : ''}`,
  });
  res.json(result);
}));
router.post('/registrations/:id/reject', requirePermission('registrations.review'), asyncHandler(async (req, res) => {
  const result = await c.reject.execute(req.user, req.params.id, req.body.reason);
  const d = result.designer;
  await logAdminAction(req.user, {
    action: 'registration.reject', targetType: 'registration', targetId: d.designer_id,
    summary: `Rejected ${d.full_name}${d.company_name ? ` of ${d.company_name}` : ''}: ${d.rejection_reason}`,
  });
  res.json(result);
}));

// --- User profiles ----------------------------------------------------
router.get('/permissions', requirePermission('profiles.manage'), (req, res) => {
  res.json(c.viewProfile.catalogue());
});
router.get('/profiles', asyncHandler(async (req, res) => {
  // Read-only list is also used by the account forms, so any admin may view it
  res.json(await c.searchProfiles.execute(req.query));
}));
router.get('/profiles/:id', asyncHandler(async (req, res) => {
  res.json(await c.viewProfile.execute(req.params.id));
}));
router.post('/profiles', requirePermission('profiles.manage'), asyncHandler(async (req, res) => {
  const profile = await c.createProfile.execute(req.body);
  await logAdminAction(req.user, {
    action: 'profile.create', targetType: 'profile', targetId: profile.profile_id,
    summary: `Created the "${profile.name}" profile (${profile.role}, ${profile.permissions.length} permissions)`,
  });
  res.status(201).json({ profile, message: `Profile "${profile.name}" created.` });
}));
router.put('/profiles/:id', requirePermission('profiles.manage'), asyncHandler(async (req, res) => {
  const profile = await c.updateProfile.execute(req.user, req.params.id, req.body);
  await logAdminAction(req.user, {
    action: 'profile.update', targetType: 'profile', targetId: profile.profile_id,
    summary: `Updated the "${profile.name}" profile (${profile.permissions.length} permissions)`,
  });
  res.json({ profile, message: 'Profile updated.' });
}));
router.patch('/profiles/:id/status', requirePermission('profiles.manage'), asyncHandler(async (req, res) => {
  const result = await c.suspendProfile.execute(req.user, req.params.id, req.body.suspended);
  const p = result.profile;
  if (p) {
    await logAdminAction(req.user, {
      action: p.is_suspended ? 'profile.suspend' : 'profile.reactivate', targetType: 'profile', targetId: p.profile_id,
      summary: `${p.is_suspended ? 'Suspended' : 'Reactivated'} the "${p.name}" profile`,
    });
  }
  res.json(result);
}));

module.exports = router;
