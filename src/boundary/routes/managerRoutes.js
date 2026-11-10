'use strict';

/**
 * Boundary: Platform Management endpoints (stories 49-53, 56-60). Mounted at /api/manager.
 */
const express = require('express');
const { asyncHandler } = require('../../middleware/errorHandler');
const { requireRole, requirePermission } = require('../../middleware/auth');
const Cat = require('../../control/manager/CategoryControllers');
const Rep = require('../../control/manager/ReportControllers');

const router = express.Router();
router.use(requireRole('manager'));

const c = {
  viewCategories: new Cat.ViewIDPCategoriesController(),
  searchCategories: new Cat.SearchIDPCategoriesController(),
  createCategory: new Cat.CreateIDPCategoryController(),
  updateCategory: new Cat.UpdateIDPCategoryController(),
  deleteCategory: new Cat.DeleteIDPCategoryController(),
  stats: new Rep.ViewMembershipStatisticsController(),
  daily: new Rep.GenerateDailyReportController(),
  weekly: new Rep.GenerateWeeklyReportController(),
  monthly: new Rep.GenerateMonthlyReportController(),
  custom: new Rep.GenerateCustomReportController(),
  reports: new Rep.ViewReportsController(),
  exporter: new Rep.ExportReportController(),
};

router.get('/stats', requirePermission('stats.view'), asyncHandler(async (req, res) => res.json(await c.stats.execute())));

// --- Categories ---------------------------------------------------------
router.get('/categories', requirePermission('categories.manage'), asyncHandler(async (req, res) => {
  res.json(req.query.q ? await c.searchCategories.execute(req.query) : await c.viewCategories.execute());
}));
router.post('/categories', requirePermission('categories.manage'), asyncHandler(async (req, res) => {
  res.status(201).json(await c.createCategory.execute(req.body));
}));
router.put('/categories/:id', requirePermission('categories.manage'), asyncHandler(async (req, res) => {
  res.json(await c.updateCategory.execute(req.params.id, req.body));
}));
router.delete('/categories/:id', requirePermission('categories.manage'), asyncHandler(async (req, res) => {
  res.json(await c.deleteCategory.execute(req.params.id));
}));

// --- Reports --------------------------------------------------------------
router.use('/reports', requirePermission('reports.generate'));
router.post('/reports/daily', asyncHandler(async (req, res) => res.status(201).json(await c.daily.execute(req.user, req.body))));
router.post('/reports/weekly', asyncHandler(async (req, res) => res.status(201).json(await c.weekly.execute(req.user, req.body))));
router.post('/reports/monthly', asyncHandler(async (req, res) => res.status(201).json(await c.monthly.execute(req.user, req.body))));
router.post('/reports/custom', asyncHandler(async (req, res) => res.status(201).json(await c.custom.execute(req.user, req.body))));
router.get('/reports', asyncHandler(async (req, res) => res.json(await c.reports.execute(req.query))));
router.get('/reports/:id', asyncHandler(async (req, res) => res.json(await c.reports.view(req.params.id))));
router.get('/reports/:id/export', asyncHandler(async (req, res) => {
  const file = await c.exporter.execute(req.params.id, req.query.format);
  res.set('Content-Type', file.contentType);
  res.set('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.send(file.body);
}));

module.exports = router;
