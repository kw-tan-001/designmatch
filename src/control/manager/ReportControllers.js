'use strict';

/**
 * Platform Management - statistics and reports.
 *   ViewMembershipStatisticsController .. story 49
 *   GenerateDailyReportController ....... story 51
 *   GenerateWeeklyReportController ...... story 52
 *   GenerateMonthlyReportController ..... story 53
 *   GenerateCustomReportController ...... story 58
 *   ViewReportsController ............... story 59
 *   ExportReportController .............. story 60
 *
 * Every figure comes from aggregate queries in PlatformStatistics, and every
 * generated report is persisted in the reports table so it can be re-opened.
 */
const AppError = require('../../utils/AppError');
const v = require('../../utils/validate');
const dates = require('../../utils/dates');
const config = require('../../config/env');
const PlatformStatistics = require('../../entity/PlatformStatistics');
const Report = require('../../entity/Report');
const ReportExporter = require('../../services/ReportExporter');

const DEFAULTS = { PlatformStatistics, Report, ReportExporter, today: () => dates.today(config.timezone) };
const METRICS = ['new_users', 'new_idps', 'searches', 'views', 'favourites', 'enquiries'];
const MAX_CUSTOM_DAYS = 366;

/** Percentage change per metric; null means "no previous activity". */
function growth(current, previous) {
  return Object.fromEntries(METRICS.map((m) => {
    const cur = current[m] || 0;
    const prev = previous[m] || 0;
    if (!prev) return [m, cur ? null : 0];
    return [m, Math.round(((cur - prev) / prev) * 1000) / 10];
  }));
}

function assertNotFuture(start, today) {
  if (start > today) throw AppError.badRequest('A report period cannot start in the future.');
}

class BaseReportController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async save(actor, reportType, title, start, end, data) {
    const report = await this.e.Report.create({
      reportType, title, periodStart: start, periodEnd: end, generatedBy: actor.accountId,
      data: { ...data, period: { start, end, days: dates.daysBetween(start, end) }, metric_definitions: METRIC_NOTES },
    });
    return { report, message: `${title} generated.` };
  }
}

const METRIC_NOTES = {
  new_users: 'Accounts created in the period (all roles)',
  new_idps: 'IDP listings created in the period',
  searches: 'Public IDP searches performed',
  views: 'IDP detail page views',
  favourites: 'IDPs saved to customer favourites',
  enquiries: 'Customer enquiries sent to designers',
  score: 'Engagement score = views + 3 x favourites + 5 x enquiries',
};

class GenerateDailyReportController extends BaseReportController {
  async execute(actor, input = {}) {
    const date = input.date || this.e.today();
    if (!dates.isValidDate(date)) throw AppError.badRequest('Date must be a valid date (YYYY-MM-DD).');
    assertNotFuture(date, this.e.today());
    const S = this.e.PlatformStatistics;
    const prev = dates.addDays(date, -1);
    const [totals, previous, byRole, keywords, designers] = await Promise.all([
      S.periodTotals(date, date), S.periodTotals(prev, prev), S.newUsersByRole(date, date),
      S.topSearchKeywords(date, date, 10), S.topDesigners(date, date, 5),
    ]);
    return this.save(actor, 'daily', `Daily report - ${date}`, date, date, {
      totals, previous_period: { start: prev, end: prev, totals: previous }, growth: growth(totals, previous),
      new_users_by_role: byRole, top_search_keywords: keywords, top_designers: designers,
    });
  }
}

class GenerateWeeklyReportController extends BaseReportController {
  async execute(actor, input = {}) {
    const anchor = input.weekStart || input.date || this.e.today();
    if (!dates.isValidDate(anchor)) throw AppError.badRequest('Week start must be a valid date (YYYY-MM-DD).');
    const start = dates.startOfWeek(anchor);
    const end = dates.addDays(start, 6);
    assertNotFuture(start, this.e.today());
    const prevStart = dates.addDays(start, -7);
    const prevEnd = dates.addDays(start, -1);
    const S = this.e.PlatformStatistics;
    const [totals, previous, series, byRole, designers, categories] = await Promise.all([
      S.periodTotals(start, end), S.periodTotals(prevStart, prevEnd), S.dailySeries(start, end),
      S.newUsersByRole(start, end), S.topDesigners(start, end, 5), S.topCategories(start, end, 5),
    ]);
    return this.save(actor, 'weekly', `Weekly report - week of ${start}`, start, end, {
      totals, previous_period: { start: prevStart, end: prevEnd, totals: previous }, growth: growth(totals, previous),
      daily_series: series, new_users_by_role: byRole, top_designers: designers, top_categories: categories,
    });
  }
}

class GenerateMonthlyReportController extends BaseReportController {
  async execute(actor, input = {}) {
    const month = input.month || this.e.today().slice(0, 7);
    if (!dates.isValidMonth(month)) throw AppError.badRequest('Month must be in the format YYYY-MM.');
    const { start, end } = dates.monthRange(month);
    assertNotFuture(start, this.e.today());
    const prevMonthDate = dates.addDays(start, -1).slice(0, 7);
    const prev = dates.monthRange(prevMonthDate);
    const S = this.e.PlatformStatistics;
    const [totals, previous, series, byRole, designers, categories, keywords] = await Promise.all([
      S.periodTotals(start, end), S.periodTotals(prev.start, prev.end), S.dailySeries(start, end),
      S.newUsersByRole(start, end), S.topDesigners(start, end, 10), S.topCategories(start, end, 10),
      S.topSearchKeywords(start, end, 10),
    ]);
    return this.save(actor, 'monthly', `Monthly report - ${month}`, start, end, {
      totals, previous_period: { ...prev, totals: previous }, growth: growth(totals, previous),
      daily_series: series, new_users_by_role: byRole, top_designers: designers, top_categories: categories,
      top_search_keywords: keywords,
    });
  }
}

class GenerateCustomReportController extends BaseReportController {
  async execute(actor, input = {}) {
    const { start, end } = input;
    if (!dates.isValidDate(start) || !dates.isValidDate(end)) {
      throw AppError.badRequest('Start and end must be valid dates (YYYY-MM-DD).');
    }
    if (end < start) throw AppError.badRequest('End date must be on or after the start date.');
    const today = this.e.today();
    assertNotFuture(start, today);
    if (end > today) throw AppError.badRequest('End date cannot be in the future.');
    if (dates.daysBetween(start, end) > MAX_CUSTOM_DAYS) {
      throw AppError.badRequest(`A custom report can cover at most ${MAX_CUSTOM_DAYS} days.`);
    }
    const S = this.e.PlatformStatistics;
    const [totals, series, byRole, designers, categories, keywords] = await Promise.all([
      S.periodTotals(start, end), S.dailySeries(start, end), S.newUsersByRole(start, end),
      S.topDesigners(start, end, 10), S.topCategories(start, end, 10), S.topSearchKeywords(start, end, 10),
    ]);
    return this.save(actor, 'custom', `Custom report - ${start} to ${end}`, start, end, {
      totals, daily_series: series, new_users_by_role: byRole,
      top_designers: designers, top_categories: categories, top_search_keywords: keywords,
    });
  }
}

class ViewMembershipStatisticsController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute() {
    return this.e.PlatformStatistics.membership();
  }
}

class ViewReportsController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  async execute(query = {}) {
    const type = query.type ? v.oneOf(query.type, ['daily', 'weekly', 'monthly', 'custom'], 'Report type') : null;
    const { page, pageSize, offset } = v.pagination(query, { defaultSize: 20, maxSize: 100 });
    const { rows, total } = await this.e.Report.findAll({ type, limit: pageSize, offset });
    return { results: rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async view(reportId) {
    const report = await this.e.Report.findById(v.id(reportId, 'Report id'));
    if (!report) throw AppError.notFound('Report not found.');
    return report;
  }
}

class ExportReportController {
  constructor(deps = {}) { this.e = { ...DEFAULTS, ...deps }; }

  /** Returns { body, filename, contentType } for the Boundary to send as a download. */
  async execute(reportId, format) {
    v.oneOf(format, ['csv', 'pdf'], 'Export format');
    const report = await this.e.Report.findById(v.id(reportId, 'Report id'));
    if (!report) throw AppError.notFound('Report not found.');
    return format === 'csv' ? this.e.ReportExporter.toCSV(report) : this.e.ReportExporter.toPDF(report);
  }
}

module.exports = {
  ViewMembershipStatisticsController,
  GenerateDailyReportController,
  GenerateWeeklyReportController,
  GenerateMonthlyReportController,
  GenerateCustomReportController,
  ViewReportsController,
  ExportReportController,
  growth,
};
