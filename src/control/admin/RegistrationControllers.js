'use strict';

/**
 * User Admin - interior designer registration review.
 *   ViewDesignerRegistrationsController ............. story 3 (approval queue)
 *   ApproveInteriorDesignerRegistrationController ... story 3
 *   RejectInteriorDesignerRegistrationController .... story 11
 */
const AppError = require('../../utils/AppError');
const v = require('../../utils/validate');
const InteriorDesigner = require('../../entity/InteriorDesigner');

const DEFAULTS = { InteriorDesigner };
const STATUSES = ['pending', 'approved', 'rejected'];

class ViewDesignerRegistrationsController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(query = {}) {
    const status = query.status === 'all' ? null : v.oneOf(query.status || 'pending', STATUSES, 'Status');
    const { page, pageSize, offset } = v.pagination(query, { defaultSize: 20, maxSize: 100 });
    const result = await this.e.InteriorDesigner.listByStatus(status, { limit: pageSize, offset });
    return {
      results: result.rows, total: result.total, page, pageSize,
      totalPages: Math.max(1, Math.ceil(result.total / pageSize)),
    };
  }
}

class ApproveInteriorDesignerRegistrationController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(actor, designerId) {
    const id = v.id(designerId, 'Designer id');
    const designer = await this.e.InteriorDesigner.findById(id);
    if (!designer) throw AppError.notFound('Designer registration not found.');
    if (designer.registration_status === 'approved') throw AppError.conflict('This registration is already approved.');
    const updated = await this.e.InteriorDesigner.approve(id, actor.accountId);
    return { designer: updated, message: `${updated.full_name} has been approved and can now log in.` };
  }
}

class RejectInteriorDesignerRegistrationController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(actor, designerId, reason) {
    const id = v.id(designerId, 'Designer id');
    const text = v.str(reason, 'Rejection reason', { min: 10, max: 500 });
    const designer = await this.e.InteriorDesigner.findById(id);
    if (!designer) throw AppError.notFound('Designer registration not found.');
    if (designer.registration_status !== 'pending') {
      throw AppError.conflict(`Only pending registrations can be rejected (current status: ${designer.registration_status}).`);
    }
    const updated = await this.e.InteriorDesigner.reject(id, actor.accountId, text);
    return { designer: updated, message: `${updated.full_name}'s registration has been rejected.` };
  }
}

module.exports = {
  ViewDesignerRegistrationsController,
  ApproveInteriorDesignerRegistrationController,
  RejectInteriorDesignerRegistrationController,
};
