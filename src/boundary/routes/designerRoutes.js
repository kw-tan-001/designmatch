'use strict';

/**
 * Boundary: Interior Designer endpoints (stories 18-34). Mounted at /api/designer.
 * Multipart forms (photos, logo) are parsed here; controllers receive plain data.
 */
const express = require('express');
const { asyncHandler } = require('../../middleware/errorHandler');
const { requireRole, requirePermission } = require('../../middleware/auth');
const { upload, cleanupOnError, uploadedPhotos } = require('../../middleware/upload');
const Co = require('../../control/designer/CompanyControllers');
const I = require('../../control/designer/IDPControllers');
const An = require('../../control/designer/AnalyticsControllers');

const router = express.Router();
router.use(requireRole('designer'));

const c = {
  profile: new Co.EditDesignerProfileController(),
  viewCompany: new Co.ViewCompanyProfileController(),
  editCompany: new Co.CreateEditCompanyProfileController(),
  certification: new Co.AddCertificationController(),
  preview: new Co.PreviewCompanyProfileController(),
  create: new I.CreateIDPListingController(),
  update: new I.UpdateIDPListingController(),
  remove: new I.DeleteIDPListingController(),
  status: new I.MarkIDPStatusController(),
  categorise: new I.CategoriseIDPController(),
  tag: new I.TagIDPController(),
  viewOwn: new I.ViewOwnIDPController(),
  searchOwn: new I.SearchOwnIDPsController(),
  views: new An.ViewIDPViewCountsController(),
  shortlists: new An.ViewIDPShortlistCountsController(),
  dashboard: new An.ViewPerformanceDashboardController(),
  enquiries: new An.ViewEnquiriesController(),
};

/** Multipart forms send arrays as repeated fields or JSON strings; normalise them. */
function parseList(value) {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try { return JSON.parse(value); } catch (_) { return value; }
  }
  return value;
}

function idpInput(req) {
  const b = req.body;
  return {
    title: b.title,
    description: b.description,
    location: b.location,
    status: b.status,
    categoryId: b.categoryId,
    budgetMin: b.budgetMin,
    budgetMax: b.budgetMax,
    propertyTypeId: b.propertyTypeId === '' ? null : b.propertyTypeId,
    styleIds: parseList(b.styleIds),
    photoUrls: parseList(b.photoUrls),
    removePhotoIds: parseList(b.removePhotoIds),
    photos: uploadedPhotos(req, parseList(b.captions) || []),
  };
}

// --- Professional profile & company -------------------------------------
router.get('/profile', asyncHandler(async (req, res) => res.json(await c.profile.view(req.user))));
router.put('/profile', asyncHandler(async (req, res) => {
  const designer = await c.profile.execute(req.user, req.body);
  res.json({ designer, message: 'Professional details updated.' });
}));

router.get('/company', requirePermission('company.manage'), asyncHandler(async (req, res) => {
  res.json(await c.viewCompany.execute(req.user));
}));
router.put('/company', requirePermission('company.manage'), upload.single('logo'), asyncHandler(async (req, res) => {
  const input = { ...req.body, serviceAreas: parseList(req.body.serviceAreas) };
  if (req.file) input.logoUrl = `/uploads/${req.file.filename}`;
  res.json(await c.editCompany.execute(req.user, input));
}), cleanupOnError);
router.get('/company/preview', asyncHandler(async (req, res) => res.json(await c.preview.execute(req.user))));
router.post('/company/certifications', requirePermission('company.manage'), asyncHandler(async (req, res) => {
  const certification = await c.certification.execute(req.user, req.body);
  res.status(201).json({ certification, message: 'Certification added to your company profile.' });
}));
router.delete('/company/certifications/:id', requirePermission('company.manage'), asyncHandler(async (req, res) => {
  res.json(await c.certification.remove(req.user, req.params.id));
}));

// --- Analytics & enquiries ------------------------------------------------
router.get('/dashboard', requirePermission('analytics.view'), asyncHandler(async (req, res) => res.json(await c.dashboard.execute(req.user))));
router.get('/analytics/views', requirePermission('analytics.view'), asyncHandler(async (req, res) => res.json(await c.views.execute(req.user))));
router.get('/analytics/shortlists', requirePermission('analytics.view'), asyncHandler(async (req, res) => res.json(await c.shortlists.execute(req.user))));
router.get('/enquiries', requirePermission('enquiries.view'), asyncHandler(async (req, res) => res.json(await c.enquiries.execute(req.user, req.query))));
router.patch('/enquiries/:id/read', requirePermission('enquiries.view'), asyncHandler(async (req, res) => {
  res.json(await c.enquiries.markRead(req.user, req.params.id));
}));

// --- Portfolio (IDPs) --------------------------------------------------
router.use('/idps', requirePermission('idp.manage'));
router.get('/idps', asyncHandler(async (req, res) => res.json(await c.searchOwn.execute(req.user, req.query))));
router.get('/idps/:id', asyncHandler(async (req, res) => res.json(await c.viewOwn.execute(req.user, req.params.id))));
router.post('/idps', upload.array('photos', 10), asyncHandler(async (req, res) => {
  res.status(201).json(await c.create.execute(req.user, idpInput(req)));
}), cleanupOnError);
router.put('/idps/:id', upload.array('photos', 10), asyncHandler(async (req, res) => {
  res.json(await c.update.execute(req.user, req.params.id, idpInput(req)));
}), cleanupOnError);
router.delete('/idps/:id', asyncHandler(async (req, res) => res.json(await c.remove.execute(req.user, req.params.id))));
router.patch('/idps/:id/status', asyncHandler(async (req, res) => {
  res.json(await c.status.execute(req.user, req.params.id, req.body.status));
}));
router.patch('/idps/:id/category', asyncHandler(async (req, res) => {
  res.json(await c.categorise.execute(req.user, req.params.id, req.body.categoryId));
}));
router.put('/idps/:id/tags', asyncHandler(async (req, res) => {
  res.json(await c.tag.execute(req.user, req.params.id, req.body));
}));

module.exports = router;
