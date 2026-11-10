'use strict';

/**
 * Platform Management - IDP category use cases.
 *   CreateIDPCategoryController / UpdateIDPCategoryController / DeleteIDPCategoryController .. story 50
 *   ViewIDPCategoriesController .. story 56
 *   SearchIDPCategoriesController  story 57
 */
const AppError = require('../../utils/AppError');
const v = require('../../utils/validate');
const IDPCategory = require('../../entity/IDPCategory');

const DEFAULTS = { IDPCategory };

class ViewIDPCategoriesController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute() {
    const results = await this.e.IDPCategory.findAll();
    return { results, total: results.length };
  }
}

class SearchIDPCategoriesController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(query = {}) {
    const q = v.str(query.q, 'Search', { required: false, max: 80 });
    const results = await this.e.IDPCategory.findAll({ q });
    return { results, total: results.length, q };
  }
}

class CreateIDPCategoryController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(input) {
    const name = v.str(input.name, 'Category name', { min: 2, max: 80 });
    const description = v.str(input.description, 'Description', { required: false, max: 500 }) || '';
    if (await this.e.IDPCategory.nameExists(name)) throw AppError.conflict('A category with this name already exists.');
    const category = await this.e.IDPCategory.create({ name, description });
    return { category, message: `Category "${category.name}" created.` };
  }
}

class UpdateIDPCategoryController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(categoryId, input) {
    const id = v.id(categoryId, 'Category id');
    if (!(await this.e.IDPCategory.findById(id))) throw AppError.notFound('Category not found.');
    const fields = {};
    if (input.name !== undefined) {
      fields.name = v.str(input.name, 'Category name', { min: 2, max: 80 });
      if (await this.e.IDPCategory.nameExists(fields.name, id)) throw AppError.conflict('A category with this name already exists.');
    }
    if (input.description !== undefined) fields.description = v.str(input.description, 'Description', { required: false, max: 500 }) || '';
    if (!Object.keys(fields).length) throw AppError.badRequest('No changes were provided.');
    const category = await this.e.IDPCategory.update(id, fields);
    return { category, message: 'Category updated.' };
  }
}

class DeleteIDPCategoryController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  /** IDPs in a deleted category are kept and become "Uncategorised" (FK ON DELETE SET NULL). */
  async execute(categoryId) {
    const id = v.id(categoryId, 'Category id');
    const category = await this.e.IDPCategory.findById(id);
    if (!category) throw AppError.notFound('Category not found.');
    await this.e.IDPCategory.delete(id);
    return {
      message: category.idp_count
        ? `Category "${category.name}" deleted. ${category.idp_count} IDP(s) are now uncategorised.`
        : `Category "${category.name}" deleted.`,
      affected_idps: category.idp_count,
    };
  }
}

module.exports = {
  ViewIDPCategoriesController,
  SearchIDPCategoriesController,
  CreateIDPCategoryController,
  UpdateIDPCategoryController,
  DeleteIDPCategoryController,
};
