// Story #37: SearchIDPsController - Sean Low
'use strict';

/**
 * Customer / public discovery use cases (browsing does not require login).
 *   SearchIDPsController ................... stories 37 (category, budget, location),
 *                                             43 (keyword), 44 (style, property type), 45 (sort)
 *   ViewIDPDetailsController ............... story 38 (records a view - feeds story 25)
 *   ViewDesignerCompanyProfileController ... story 46
 *   BrowseDesignerIDPsController ........... story 47
 *   ViewSearchOptionsController ............ filter options for the search form
 *   ViewFeaturedDesignersController ........ landing-page designer showcase
 */
const AppError = require('../../utils/AppError');
const v = require('../../utils/validate');
const IDP = require('../../entity/IDP');
const IDPView = require('../../entity/IDPView');
const IDPCategory = require('../../entity/IDPCategory');
const DesignStyle = require('../../entity/DesignStyle');
const PropertyType = require('../../entity/PropertyType');
const SearchLog = require('../../entity/SearchLog');
const Favourite = require('../../entity/Favourite');
const InteriorDesigner = require('../../entity/InteriorDesigner');
const Company = require('../../entity/Company');
const Certification = require('../../entity/Certification');
const { composeCompanyPage } = require('../designer/CompanyControllers');

const DEFAULTS = {
  IDP, IDPView, IDPCategory, DesignStyle, PropertyType, SearchLog, Favourite, InteriorDesigner, Company, Certification,
};

function pageResult(rows, total, page, pageSize) {
  return { results: rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

class SearchIDPsController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  /** Builds validated search criteria from query-string input. */
  static parseCriteria(query = {}) {
    const budgetMin = v.int(query.budgetMin, 'Minimum budget', { required: false, min: 0, max: 100000000 });
    const budgetMax = v.int(query.budgetMax, 'Maximum budget', { required: false, min: 0, max: 100000000 });
    if (budgetMin != null && budgetMax != null && budgetMax < budgetMin) {
      throw AppError.badRequest('Maximum budget must be greater than or equal to the minimum budget.');
    }
    const sort = query.sort || 'newest';
    if (!IDP.SORTS.includes(sort)) throw AppError.badRequest(`Sort must be one of: ${IDP.SORTS.join(', ')}.`);
    return {
      keyword: v.str(query.keyword ?? query.q, 'Keyword', { required: false, max: 100 }),
      categoryId: v.int(query.categoryId, 'Category', { required: false, min: 1 }),
      location: v.str(query.location, 'Location', { required: false, max: 80 }),
      budgetMin,
      budgetMax,
      styleIds: v.idList(query.styleIds ?? query.styleId, 'Design style'),
      propertyTypeId: v.int(query.propertyTypeId, 'Property type', { required: false, min: 1 }),
      designerId: v.int(query.designerId, 'Designer', { required: false, min: 1 }),
      status: query.status ? v.oneOf(query.status, ['current', 'past'], 'Status') : null,
      sort,
    };
  }

  async execute(query = {}, viewer = null) {
    const criteria = SearchIDPsController.parseCriteria(query);
    const { page, pageSize, offset } = v.pagination(query, { defaultSize: 12, maxSize: 48 });
    const { rows, total } = await this.e.IDP.search({ ...criteria, publicOnly: true, limit: pageSize, offset });

    // Log the search for platform reporting (first page only, so paging is not double-counted)
    const { keyword, sort, ...filters } = criteria;
    const activeFilters = Object.fromEntries(
      Object.entries(filters).filter(([, val]) => val != null && !(Array.isArray(val) && !val.length)),
    );
    const isRealSearch = Boolean(keyword) || Object.keys(activeFilters).length > 0;
    if (page === 1 && query.log !== 'false' && isRealSearch) {
      activeFilters.sort = sort;
      await this.e.SearchLog.record({
        accountId: viewer ? viewer.accountId : null, keyword, filters: activeFilters, resultCount: total,
      });
    }
    const result = { ...pageResult(rows, total, page, pageSize), criteria };
    if (query.facets === '1' || query.facets === 'true') {
      result.facets = await this.e.IDP.facets({ ...criteria, publicOnly: true });
      // When nothing matches, show how many results each active filter is hiding
      if (total === 0) result.suggestions = await this.suggestions(criteria);
    }
    return result;
  }

  /** For each active filter, how many projects would match without it. */
  async suggestions(criteria) {
    const active = [];
    if (criteria.keyword) active.push('keyword');
    ['categoryId', 'propertyTypeId', 'location', 'status', 'styleIds'].forEach((k) => {
      const val = criteria[k];
      if (val != null && !(Array.isArray(val) && !val.length)) active.push(k);
    });
    if (criteria.budgetMin != null || criteria.budgetMax != null) active.push('budget');
    const out = [];
    for (const key of active) {
      const n = await this.e.IDP.count({ ...criteria, publicOnly: true }, key);
      if (n > 0) out.push({ remove: key, total: n });
    }
    out.sort((a, b) => b.total - a.total);
    // Several filters conflict (no single removal helps): offer the keyword on its own
    if (!out.length && criteria.keyword && active.length > 1) {
      const n = await this.e.IDP.count({ keyword: criteria.keyword, publicOnly: true });
      if (n > 0) out.push({ keep: 'keyword', total: n });
    }
    return out;
  }
}

class ViewIDPDetailsController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(idpId, viewer = null) {
    const id = v.id(idpId, 'IDP id');
    const isOwner = viewer && viewer.role === 'designer' && (await this.e.IDP.findOwnerId(id)) === viewer.accountId;
    const idp = await this.e.IDP.findById(id, { publicOnly: !isOwner });
    if (!idp) throw AppError.notFound('This project is not available.');
    if (!isOwner) {
      await this.e.IDPView.record(id, viewer ? viewer.accountId : null);
      idp.view_count += 1;
    }
    const more = await this.e.IDP.search({ designerId: idp.designer_id, publicOnly: true, limit: 4 });
    const isFavourite = viewer && viewer.role === 'customer'
      ? (await this.e.Favourite.idsByCustomer(viewer.accountId)).includes(id)
      : false;
    return {
      ...idp,
      is_owner: !!isOwner,
      is_favourite: isFavourite,
      more_from_designer: more.rows.filter((r) => r.idp_id !== id).slice(0, 3),
    };
  }
}

class ViewDesignerCompanyProfileController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(designerId) {
    const id = v.id(designerId, 'Designer id');
    if (!(await this.e.InteriorDesigner.isPubliclyVisible(id))) throw AppError.notFound('Designer not found.');
    return composeCompanyPage(this.e, id, { idpLimit: 6 });
  }
}

class BrowseDesignerIDPsController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(designerId, query = {}) {
    const id = v.id(designerId, 'Designer id');
    if (!(await this.e.InteriorDesigner.isPubliclyVisible(id))) throw AppError.notFound('Designer not found.');
    const { page, pageSize, offset } = v.pagination(query, { defaultSize: 12, maxSize: 48 });
    const sort = IDP.SORTS.includes(query.sort) ? query.sort : 'newest';
    const status = query.status ? v.oneOf(query.status, ['current', 'past'], 'Status') : null;
    const { rows, total } = await this.e.IDP.search({
      designerId: id, publicOnly: true, sort, status, limit: pageSize, offset,
    });
    const company = await this.e.Company.findByDesigner(id);
    return { ...pageResult(rows, total, page, pageSize), company };
  }
}

class ViewSearchOptionsController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute() {
    const [categories, styles, propertyTypes, locations] = await Promise.all([
      this.e.IDPCategory.findAll(), this.e.DesignStyle.findAll(), this.e.PropertyType.findAll(), this.e.IDP.distinctLocations(),
    ]);
    return {
      categories, styles, property_types: propertyTypes, locations,
      sorts: [
        { value: 'newest', label: 'Newest' }, { value: 'most_viewed', label: 'Most viewed' },
        { value: 'most_favourited', label: 'Most shortlisted' }, { value: 'budget_low', label: 'Budget: low to high' },
        { value: 'budget_high', label: 'Budget: high to low' }, { value: 'oldest', label: 'Oldest' },
      ],
    };
  }
}

class ViewFeaturedDesignersController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(query = {}) {
    const limit = v.int(query.limit, 'Limit', { required: false, min: 1, max: 100 }) || 8;
    return this.e.InteriorDesigner.listPublic({ limit });
  }
}

module.exports = {
  SearchIDPsController,
  ViewIDPDetailsController,
  ViewDesignerCompanyProfileController,
  BrowseDesignerIDPsController,
  ViewSearchOptionsController,
  ViewFeaturedDesignersController,
};
