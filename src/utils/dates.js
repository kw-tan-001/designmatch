'use strict';

/**
 * Pure calendar helpers working on 'YYYY-MM-DD' strings so that report
 * periods are never shifted by the server's local timezone.
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function isValidDate(str) {
  if (typeof str !== 'string' || !DATE_RE.test(str)) return false;
  const d = new Date(`${str}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str;
}

function isValidMonth(str) {
  return typeof str === 'string' && MONTH_RE.test(str);
}

function toUTC(str) { return new Date(`${str}T00:00:00Z`); }
function fmt(d) { return d.toISOString().slice(0, 10); }

function addDays(str, n) {
  const d = toUTC(str);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

/** Inclusive number of days between two dates. */
function daysBetween(start, end) {
  return Math.round((toUTC(end) - toUTC(start)) / 86400000) + 1;
}

/** Monday of the ISO week containing `str`. */
function startOfWeek(str) {
  const d = toUTC(str);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return fmt(d);
}

function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const start = `${month}-01`;
  const end = fmt(new Date(Date.UTC(y, m, 0)));
  return { start, end };
}

/** Today's date in the given IANA timezone, as YYYY-MM-DD. */
function today(timezone = 'Asia/Singapore') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function listDays(start, end) {
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

module.exports = {
  isValidDate, isValidMonth, addDays, daysBetween, startOfWeek, monthRange, today, listDays,
};
