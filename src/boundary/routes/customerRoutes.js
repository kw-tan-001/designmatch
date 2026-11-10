'use strict';

/**
 * Boundary: Customer endpoints that need login (stories 39-41, 48). Mounted at /api/customer.
 */
const express = require('express');
const { asyncHandler } = require('../../middleware/errorHandler');
const { requireRole, requirePermission } = require('../../middleware/auth');
const F = require('../../control/customer/FavouriteControllers');

const router = express.Router();
router.use(requireRole('customer'));

const c = {
  save: new F.SaveFavouriteController(),
  manage: new F.ManageFavouritesListController(),
  search: new F.SearchFavouritesController(),
  contact: new F.ContactDesignerController(),
};

router.get('/favourites', requirePermission('favourites.manage'), asyncHandler(async (req, res) => {
  // Story 48 when a keyword is given, story 40 otherwise
  res.json(req.query.q ? await c.search.execute(req.user, req.query) : await c.manage.execute(req.user));
}));
router.get('/favourites/ids', requirePermission('favourites.manage'), asyncHandler(async (req, res) => {
  res.json({ ids: await c.manage.ids(req.user) });
}));
router.post('/favourites', requirePermission('favourites.manage'), asyncHandler(async (req, res) => {
  res.status(201).json(await c.save.execute(req.user, req.body.idpId));
}));
router.delete('/favourites/:idpId', requirePermission('favourites.manage'), asyncHandler(async (req, res) => {
  res.json(await c.manage.remove(req.user, req.params.idpId));
}));

router.post('/enquiries', requirePermission('enquiries.send'), asyncHandler(async (req, res) => {
  res.status(201).json(await c.contact.execute(req.user, req.body));
}));
router.get('/enquiries', asyncHandler(async (req, res) => {
  res.json({ results: await c.contact.sent(req.user) });
}));

module.exports = router;
