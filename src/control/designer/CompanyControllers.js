'use strict';

/**
 * Interior Designer - professional profile and company use cases.
 *   EditDesignerProfileController ...... story 18 (professional details)
 *   CreateEditCompanyProfileController . story 19
 *   AddCertificationController ......... story 20 (+ removal)
 *   ViewCompanyProfileController ....... story 29
 *   PreviewCompanyProfileController .... story 30
 */
const AppError = require('../../utils/AppError');
const v = require('../../utils/validate');
const FileStorage = require('../../services/FileStorage');
const InteriorDesigner = require('../../entity/InteriorDesigner');
const Company = require('../../entity/Company');
const Certification = require('../../entity/Certification');
const IDP = require('../../entity/IDP');

const DEFAULTS = { InteriorDesigner, Company, Certification, IDP, FileStorage };
const URL_RE = /^https?:\/\/[^\s]+$/i;

async function loadCompany(e, designerId) {
  const company = await e.Company.findByDesigner(designerId);
  if (!company) throw AppError.notFound('Company profile not found. Please create your company profile first.');
  return company;
}

/** Composes the public company page (shared by customer view and designer preview). */
async function composeCompanyPage(e, designerId, { idpLimit = 12 } = {}) {
  const designer = await e.InteriorDesigner.findById(designerId);
  const company = await e.Company.findByDesigner(designerId);
  if (!designer || !company) throw AppError.notFound('Designer not found.');
  const certifications = await e.Certification.listByCompany(company.company_id);
  const idps = await e.IDP.search({ designerId, publicOnly: false, limit: idpLimit, sort: 'newest' });
  return {
    company,
    designer: {
      designer_id: designer.designer_id,
      full_name: designer.full_name,
      years_experience: designer.years_experience,
      specialisation: designer.specialisation,
      bio: designer.bio,
      license_number: designer.license_number,
      verified: designer.registration_status === 'approved',
    },
    certifications,
    idps: idps.rows,
    idp_total: idps.total,
  };
}

class EditDesignerProfileController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async view(actor) {
    return this.e.InteriorDesigner.findById(actor.accountId);
  }

  async execute(actor, input) {
    const fields = {};
    if (input.licenseNumber !== undefined) fields.licenseNumber = v.str(input.licenseNumber, 'Licence number', { min: 3, max: 60 });
    if (input.yearsExperience !== undefined) fields.yearsExperience = v.int(input.yearsExperience, 'Years of experience', { min: 0, max: 70 });
    if (input.specialisation !== undefined) fields.specialisation = v.str(input.specialisation, 'Specialisation', { required: false, max: 120 }) || '';
    if (input.bio !== undefined) fields.bio = v.str(input.bio, 'Professional summary', { required: false, max: 2000 }) || '';
    if (!Object.keys(fields).length) throw AppError.badRequest('No changes were provided.');
    return this.e.InteriorDesigner.updateProfessional(actor.accountId, fields);
  }
}

class ViewCompanyProfileController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(actor) {
    const company = await this.e.Company.findByDesigner(actor.accountId);
    if (!company) return { company: null, certifications: [] };
    const certifications = await this.e.Certification.listByCompany(company.company_id);
    return { company, certifications };
  }
}

class CreateEditCompanyProfileController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  /** input may include logoUrl from an uploaded logo file. */
  async execute(actor, input) {
    const fields = {
      companyName: v.str(input.companyName, 'Company name', { min: 2, max: 150 }),
      description: v.str(input.description, 'Description', { required: false, max: 3000 }) || '',
      contactEmail: input.contactEmail ? v.email(input.contactEmail, 'Contact email') : null,
      contactPhone: v.str(input.contactPhone, 'Contact phone', { required: false, max: 30 }),
      website: v.str(input.website, 'Website', { required: false, max: 255 }),
      address: v.str(input.address, 'Address', { required: false, max: 255 }),
      serviceAreas: v.strList(input.serviceAreas, 'Service areas', { max: 80, maxItems: 30 }),
    };
    if (fields.website && !URL_RE.test(fields.website)) throw AppError.badRequest('Website must start with http:// or https://');
    if (input.logoUrl) fields.logoUrl = input.logoUrl;
    if (input.removeLogo === true || input.removeLogo === 'true') fields.logoUrl = null;

    const existing = await this.e.Company.findByDesigner(actor.accountId);
    if (!existing) {
      const created = await this.e.Company.create(actor.accountId, fields);
      return { company: created, message: 'Company profile created.' };
    }
    if (fields.logoUrl !== undefined && existing.logo_url && existing.logo_url !== fields.logoUrl) {
      this.e.FileStorage.removeLocal([existing.logo_url]);
    }
    const company = await this.e.Company.update(existing.company_id, fields);
    return { company, message: 'Company profile updated.' };
  }
}

class AddCertificationController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(actor, input) {
    const company = await loadCompany(this.e, actor.accountId);
    const title = v.str(input.title, 'Certification title', { min: 2, max: 150 });
    const issuer = v.str(input.issuer, 'Issuing organisation', { min: 2, max: 150 });
    const yearObtained = v.int(input.yearObtained, 'Year obtained', {
      required: false, min: 1950, max: new Date().getFullYear(),
    });
    return this.e.Certification.create(company.company_id, { title, issuer, yearObtained });
  }

  async remove(actor, certificationId) {
    const company = await loadCompany(this.e, actor.accountId);
    const ok = await this.e.Certification.delete(company.company_id, v.id(certificationId, 'Certification id'));
    if (!ok) throw AppError.notFound('Certification not found on your company profile.');
    return { message: 'Certification removed.' };
  }
}

class PreviewCompanyProfileController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(actor) {
    const page = await composeCompanyPage(this.e, actor.accountId);
    const visible = await this.e.InteriorDesigner.isPubliclyVisible(actor.accountId);
    return { ...page, preview: true, publicly_visible: visible };
  }
}

module.exports = {
  EditDesignerProfileController,
  ViewCompanyProfileController,
  CreateEditCompanyProfileController,
  AddCertificationController,
  PreviewCompanyProfileController,
  composeCompanyPage,
};
