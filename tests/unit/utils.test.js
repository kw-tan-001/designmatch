'use strict';

const dates = require('../../src/utils/dates');
const v = require('../../src/utils/validate');
const AppError = require('../../src/utils/AppError');
const PasswordService = require('../../src/services/PasswordService');
const ReportExporter = require('../../src/services/ReportExporter');
const { growth } = require('../../src/control/manager/ReportControllers');

describe('UT-UTIL dates', () => {
  test('UT-UTIL-01 validates calendar dates including leap years', () => {
    expect(dates.isValidDate('2026-02-28')).toBe(true);
    expect(dates.isValidDate('2026-02-29')).toBe(false);
    expect(dates.isValidDate('2028-02-29')).toBe(true);
    expect(dates.isValidDate('2026-13-01')).toBe(false);
    expect(dates.isValidDate('07/11/2026')).toBe(false);
    expect(dates.isValidDate(undefined)).toBe(false);
  });

  test('UT-UTIL-02 week starts on Monday (weekly report boundary)', () => {
    expect(dates.startOfWeek('2026-11-07')).toBe('2026-11-02'); // Saturday
    expect(dates.startOfWeek('2026-11-02')).toBe('2026-11-02'); // Monday
    expect(dates.startOfWeek('2026-11-08')).toBe('2026-11-02'); // Sunday
  });

  test('UT-UTIL-03 month ranges handle month lengths (monthly report boundary)', () => {
    expect(dates.monthRange('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(dates.monthRange('2028-02')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    expect(dates.monthRange('2026-12')).toEqual({ start: '2026-12-01', end: '2026-12-31' });
    expect(dates.isValidMonth('2026-13')).toBe(false);
  });

  test('UT-UTIL-04 day arithmetic crosses month and year boundaries', () => {
    expect(dates.addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(dates.addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(dates.daysBetween('2026-11-01', '2026-11-30')).toBe(30);
    expect(dates.listDays('2026-11-01', '2026-11-03')).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
    expect(dates.today('Asia/Singapore')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('UT-UTIL validation', () => {
  test('UT-UTIL-05 email is normalised and invalid emails rejected', () => {
    expect(v.email('  Jane@Example.COM ')).toBe('jane@example.com');
    expect(() => v.email('not-an-email')).toThrow(AppError);
    expect(() => v.email('')).toThrow('Email is required.');
  });

  test('UT-UTIL-06 password policy: 8-72 chars with letter and digit', () => {
    expect(v.password('abcdefg1')).toBe('abcdefg1');
    expect(() => v.password('short1')).toThrow(/at least 8/);
    expect(() => v.password('allletters')).toThrow(/letter and one number/);
    expect(() => v.password('12345678')).toThrow(/letter and one number/);
    expect(() => v.password(`a1${'x'.repeat(80)}`)).toThrow(/at most 72/);
  });

  test('UT-UTIL-07 integers, ids and lists', () => {
    expect(v.int('5', 'n', { min: 0, max: 10 })).toBe(5);
    expect(() => v.int('5.5', 'n')).toThrow(/whole number/);
    expect(() => v.int('11', 'n', { max: 10 })).toThrow(/between/);
    expect(v.int('', 'n', { required: false })).toBeNull();
    expect(() => v.id('0')).toThrow(AppError);
    expect(v.idList('3,1,3')).toEqual([3, 1]);
    expect(v.idList(['2', 4])).toEqual([2, 4]);
    expect(v.strList('East, West ,East', 'Areas')).toEqual(['East', 'West']);
    expect(() => v.oneOf('x', ['a', 'b'], 'Thing')).toThrow('Thing must be one of: a, b.');
  });

  test('UT-UTIL-08 string length limits and pagination bounds', () => {
    expect(v.str('  hi  ', 'Name')).toBe('hi');
    expect(() => v.str('a', 'Name', { min: 2 })).toThrow(/at least 2/);
    expect(v.str('', 'Name', { required: false })).toBeNull();
    expect(v.pagination({ page: '0', pageSize: '1000' }, { maxSize: 50 })).toEqual({ page: 1, pageSize: 50, offset: 0 });
    expect(v.pagination({ page: '3', pageSize: '10' })).toEqual({ page: 3, pageSize: 10, offset: 20 });
  });

  test('UT-UTIL-09 AppError factories carry HTTP status codes', () => {
    expect(AppError.badRequest('x').status).toBe(400);
    expect(AppError.unauthorized().status).toBe(401);
    expect(AppError.forbidden().status).toBe(403);
    expect(AppError.notFound().status).toBe(404);
    expect(AppError.conflict('x').status).toBe(409);
  });
});

describe('UT-SEC passwords', () => {
  test('UT-SEC-01 hashes are never the plaintext and verify correctly', async () => {
    const hash = await PasswordService.hash('Secret123');
    expect(hash).not.toBe('Secret123');
    await expect(PasswordService.verify('Secret123', hash)).resolves.toBe(true);
    await expect(PasswordService.verify('Wrong123', hash)).resolves.toBe(false);
    await expect(PasswordService.verify('', hash)).resolves.toBe(false);
  });

  test('UT-SEC-02 temporary passwords satisfy the password policy', () => {
    for (let i = 0; i < 20; i += 1) {
      const p = PasswordService.generateTemporary();
      expect(p).toHaveLength(12);
      expect(() => v.password(p)).not.toThrow();
    }
  });
});

describe('UT-RPT report formatting', () => {
  const report = {
    report_id: 1, report_type: 'weekly', title: 'Weekly report - week of 2026-11-02', period_start: '2026-11-02', period_end: '2026-11-08',
    created_at: '2026-11-08T10:00:00Z', generated_by_name: 'Max',
    data: {
      totals: { new_users: 4, new_idps: 2, searches: 10, views: 50, favourites: 6, enquiries: 1 },
      previous_period: { totals: { new_users: 2, new_idps: 0, searches: 10, views: 25, favourites: 0, enquiries: 2 } },
      growth: { new_users: 100, new_idps: null, searches: 0, views: 100, favourites: null, enquiries: -50 },
      daily_series: [{ day: '2026-11-02', new_users: 1, new_idps: 0, searches: 2, views: 5, favourites: 1, enquiries: 0 }],
      top_designers: [{ name: '=Evil, Studio', views: 10, favourites: 2, enquiries: 1, score: 21 }],
    },
  };

  test('UT-RPT-01 growth percentages, including no previous activity', () => {
    const g = growth({ new_users: 4, views: 0, searches: 5 }, { new_users: 2, views: 0, searches: 0 });
    expect(g.new_users).toBe(100);
    expect(g.views).toBe(0);
    expect(g.searches).toBeNull();
  });

  test('UT-RPT-02 CSV export contains the period, metrics and escapes formula injection', () => {
    const out = ReportExporter.toCSV(report);
    expect(out.filename).toBe('designmatch-weekly-report-2026-11-02_to_2026-11-08.csv');
    expect(out.contentType).toMatch(/text\/csv/);
    expect(out.body).toContain('Period start,2026-11-02');
    expect(out.body).toContain('IDP views,50,25,100');
    expect(out.body).toContain('New IDPs,2,0,new');
    expect(out.body).toContain('"\'=Evil, Studio"');
  });

  test('UT-RPT-03 csvCell quotes commas and quotes', () => {
    expect(ReportExporter.csvCell('a,b')).toBe('"a,b"');
    expect(ReportExporter.csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(ReportExporter.csvCell(null)).toBe('');
    expect(ReportExporter.csvCell('@cmd')).toBe("'@cmd");
  });

  test('UT-RPT-04 PDF export produces a PDF document', async () => {
    const out = await ReportExporter.toPDF(report);
    expect(out.contentType).toBe('application/pdf');
    expect(out.body.slice(0, 5).toString()).toBe('%PDF-');
  });
});
