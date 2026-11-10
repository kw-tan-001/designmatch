'use strict';

const AppError = require('./AppError');

/**
 * Small input-format validators used by Boundary (routes) and Control classes.
 * They throw AppError(400) with a readable message on failure.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function str(value, field, { required = true, min = 0, max = 255 } = {}) {
  const v = typeof value === 'string' ? value.trim() : (value == null ? '' : String(value).trim());
  if (!v) {
    if (required) throw AppError.badRequest(`${field} is required.`);
    return null;
  }
  if (v.length < min) throw AppError.badRequest(`${field} must be at least ${min} characters.`);
  if (v.length > max) throw AppError.badRequest(`${field} must be at most ${max} characters.`);
  return v;
}

function email(value, field = 'Email') {
  const v = str(value, field, { max: 255 });
  if (!EMAIL_RE.test(v)) throw AppError.badRequest(`${field} is not a valid email address.`);
  return v.toLowerCase();
}

function password(value, field = 'Password') {
  const v = typeof value === 'string' ? value : '';
  if (v.length < 8) throw AppError.badRequest(`${field} must be at least 8 characters.`);
  if (v.length > 72) throw AppError.badRequest(`${field} must be at most 72 characters.`);
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) {
    throw AppError.badRequest(`${field} must contain at least one letter and one number.`);
  }
  return v;
}

function int(value, field, { required = true, min = -Infinity, max = Infinity } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw AppError.badRequest(`${field} is required.`);
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n)) throw AppError.badRequest(`${field} must be a whole number.`);
  if (n < min || n > max) throw AppError.badRequest(`${field} must be between ${min} and ${max}.`);
  return n;
}

function id(value, field = 'id') {
  return int(value, field, { min: 1, max: 2147483647 });
}

function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw AppError.badRequest(`${field} must be one of: ${allowed.join(', ')}.`);
  }
  return value;
}

/** Accepts an array, a comma-separated string or a single value. */
function idList(value, field) {
  if (value === undefined || value === null || value === '') return [];
  const arr = Array.isArray(value) ? value : String(value).split(',');
  return [...new Set(arr.filter((x) => String(x).trim() !== '').map((x) => id(x, field)))];
}

function strList(value, field, { max = 80, maxItems = 30 } = {}) {
  if (value === undefined || value === null || value === '') return [];
  const arr = Array.isArray(value) ? value : String(value).split(',');
  const out = [...new Set(arr.map((x) => String(x).trim()).filter(Boolean))];
  if (out.length > maxItems) throw AppError.badRequest(`${field} can contain at most ${maxItems} items.`);
  out.forEach((x) => { if (x.length > max) throw AppError.badRequest(`${field} items must be at most ${max} characters.`); });
  return out;
}

function pagination(query = {}, { defaultSize = 12, maxSize = 50 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, parseInt(query.pageSize, 10) || defaultSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

module.exports = { str, email, password, int, id, oneOf, idList, strList, pagination };
