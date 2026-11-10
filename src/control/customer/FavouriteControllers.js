'use strict';

/**
 * Customer - favourites (shortlist) and enquiries.
 *   SaveFavouriteController ........ story 39
 *   ManageFavouritesListController . story 40 (view + remove; stored in DB so it persists after logout)
 *   SearchFavouritesController ..... story 48
 *   ContactDesignerController ...... story 41 (+ view own sent enquiries)
 */
const AppError = require('../../utils/AppError');
const v = require('../../utils/validate');
const IDP = require('../../entity/IDP');
const Favourite = require('../../entity/Favourite');
const Enquiry = require('../../entity/Enquiry');

const DEFAULTS = { IDP, Favourite, Enquiry };

class SaveFavouriteController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(actor, idpId) {
    const id = v.id(idpId, 'IDP id');
    const idp = await this.e.IDP.findById(id, { publicOnly: true });
    if (!idp) throw AppError.notFound('This project is not available.');
    const favourite = await this.e.Favourite.add(actor.accountId, id);
    if (!favourite) throw AppError.conflict('This project is already in your favourites.');
    return { favourite, message: `"${idp.title}" saved to your favourites.` };
  }
}

class ManageFavouritesListController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(actor) {
    const results = await this.e.Favourite.listByCustomer(actor.accountId);
    return { results, total: results.length };
  }

  async ids(actor) {
    return this.e.Favourite.idsByCustomer(actor.accountId);
  }

  async remove(actor, idpId) {
    const ok = await this.e.Favourite.remove(actor.accountId, v.id(idpId, 'IDP id'));
    if (!ok) throw AppError.notFound('This project is not in your favourites.');
    return { message: 'Removed from your favourites.' };
  }
}

class SearchFavouritesController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(actor, query = {}) {
    const q = v.str(query.q, 'Search', { required: false, max: 100 });
    const results = await this.e.Favourite.listByCustomer(actor.accountId, { q });
    return { results, total: results.length, q };
  }
}

class ContactDesignerController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(actor, input) {
    const idpId = v.id(input.idpId, 'IDP id');
    const message = v.str(input.message, 'Message', { min: 10, max: 2000 });
    const contactPhone = v.str(input.contactPhone, 'Contact phone', { required: false, max: 30 });
    if (contactPhone && !/^[+\d][\d\s-]{5,}$/.test(contactPhone)) throw AppError.badRequest('Contact phone is not valid.');
    const idp = await this.e.IDP.findById(idpId, { publicOnly: true });
    if (!idp) throw AppError.notFound('This project is not available.');
    const enquiry = await this.e.Enquiry.create({
      idpId, customerId: actor.accountId, designerId: idp.designer_id, message, contactPhone,
    });
    return { enquiry, message: `Your enquiry has been sent to ${idp.company_name || 'the designer'}.` };
  }

  async sent(actor) {
    return this.e.Enquiry.listByCustomer(actor.accountId);
  }
}

module.exports = {
  SaveFavouriteController,
  ManageFavouritesListController,
  SearchFavouritesController,
  ContactDesignerController,
};
