'use strict';

/**
 * Boundary: public discovery endpoints - no login needed (stories 37, 38, 43-47).
 * Mounted at /api.
 */
const express = require('express');
const { asyncHandler } = require('../../middleware/errorHandler');
const D = require('../../control/customer/DiscoveryControllers');

const router = express.Router();
const c = {
  search: new D.SearchIDPsController(),
  details: new D.ViewIDPDetailsController(),
  company: new D.ViewDesignerCompanyProfileController(),
  designerIdps: new D.BrowseDesignerIDPsController(),
  options: new D.ViewSearchOptionsController(),
  featured: new D.ViewFeaturedDesignersController(),
};

router.get('/meta', asyncHandler(async (req, res) => res.json(await c.options.execute())));
router.get('/idps', asyncHandler(async (req, res) => res.json(await c.search.execute(req.query, req.user))));
router.get('/idps/:id', asyncHandler(async (req, res) => res.json(await c.details.execute(req.params.id, req.user))));
router.get('/designers', asyncHandler(async (req, res) => res.json(await c.featured.execute(req.query))));
router.get('/designers/:id', asyncHandler(async (req, res) => res.json(await c.company.execute(req.params.id))));
router.get('/designers/:id/idps', asyncHandler(async (req, res) => {
  res.json(await c.designerIdps.execute(req.params.id, req.query));
}));

module.exports = router;
