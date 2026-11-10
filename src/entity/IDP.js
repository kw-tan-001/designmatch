'use strict';

const db = require('../config/db');

/**
 * Entity: IDP - Interior Design Project (tables idps + idp_styles).
 * View/shortlist/enquiry counts are always computed from the engagement
 * tables (idp_views, favourites, enquiries), never stored as counters.
 */
const SORTS = {
  newest: 'i.created_at DESC, i.idp_id DESC',
  oldest: 'i.created_at ASC, i.idp_id ASC',
  most_viewed: 'view_count DESC, i.idp_id DESC',
  most_favourited: 'favourite_count DESC, i.idp_id DESC',
  budget_low: 'i.budget_min ASC, i.idp_id DESC',
  budget_high: 'i.budget_max DESC, i.idp_id DESC',
};

const PUBLIC_VISIBILITY = `d.registration_status = 'approved' AND a.status = 'active' AND p.is_suspended = FALSE`;

const FROM = `
  FROM idps i
  JOIN interior_designers d ON d.designer_id = i.designer_id
  JOIN user_accounts a ON a.account_id = d.designer_id
  JOIN user_profiles p ON p.profile_id = a.profile_id
  LEFT JOIN companies co ON co.designer_id = i.designer_id
  LEFT JOIN idp_categories cat ON cat.category_id = i.category_id
  LEFT JOIN property_types pt ON pt.property_type_id = i.property_type_id`;

const COLUMNS = `
  i.idp_id, i.designer_id, i.category_id, i.property_type_id, i.title, i.description, i.status,
  i.budget_min, i.budget_max, i.location, i.created_at, i.updated_at,
  COALESCE(cat.name, 'Uncategorised') AS category_name,
  pt.name AS property_type_name,
  co.company_id, co.company_name, co.logo_url, a.full_name AS designer_name,
  ARRAY(SELECT ds.name FROM idp_styles s JOIN design_styles ds ON ds.style_id = s.style_id
        WHERE s.idp_id = i.idp_id ORDER BY ds.name) AS styles,
  (SELECT ph.url FROM idp_photos ph WHERE ph.idp_id = i.idp_id
    ORDER BY ph.sort_order, ph.photo_id LIMIT 1) AS cover_url,
  (SELECT COUNT(*)::int FROM idp_views v WHERE v.idp_id = i.idp_id) AS view_count,
  (SELECT COUNT(*)::int FROM favourites f WHERE f.idp_id = i.idp_id) AS favourite_count,
  (SELECT COUNT(*)::int FROM enquiries e WHERE e.idp_id = i.idp_id) AS enquiry_count`;

function escapeLike(s) { return s.replace(/[\\%_]/g, '\\$&'); }

class IDP {
  static get SORTS() { return Object.keys(SORTS); }

  /**
   * Turns a free-text keyword into search words. Every word must match somewhere
   * (title, description, location, company, category, property type or style), in
   * any order, so "living room japandi" finds Japandi living rooms. Simple plurals
   * ("kitchens", "bedrooms") match their singular form.
   */
  static keywordTerms(keyword) {
    if (!keyword) return [];
    const words = String(keyword).toLowerCase().split(/[^a-z0-9$-]+/i).filter((w) => w.length > 1);
    const stems = words.map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
    return [...new Set(stems)].slice(0, 6);
  }

  /** Builds the WHERE clause for search criteria; `omit` skips one filter (used for option counts). */
  static buildWhere(criteria, add, omit = null) {
    const where = [];
    if (criteria.publicOnly !== false) where.push(PUBLIC_VISIBILITY);
    if (criteria.ownerId) where.push(`i.designer_id = ${add(criteria.ownerId)}`);
    if (criteria.designerId) where.push(`i.designer_id = ${add(criteria.designerId)}`);
    if (omit !== 'keyword') {
      IDP.keywordTerms(criteria.keyword).forEach((term) => {
        const k = add(`%${escapeLike(term)}%`);
        where.push(`(i.title ILIKE ${k} OR i.description ILIKE ${k} OR i.location ILIKE ${k}
                     OR COALESCE(co.company_name,'') ILIKE ${k} OR COALESCE(cat.name,'') ILIKE ${k}
                     OR COALESCE(pt.name,'') ILIKE ${k}
                     OR EXISTS (SELECT 1 FROM idp_styles ks JOIN design_styles kd ON kd.style_id = ks.style_id
                                WHERE ks.idp_id = i.idp_id AND kd.name ILIKE ${k}))`);
      });
    }
    if (criteria.categoryId && omit !== 'categoryId') where.push(`i.category_id = ${add(criteria.categoryId)}`);
    if (criteria.uncategorised) where.push('i.category_id IS NULL');
    if (criteria.propertyTypeId && omit !== 'propertyTypeId') where.push(`i.property_type_id = ${add(criteria.propertyTypeId)}`);
    if (criteria.status && omit !== 'status') where.push(`i.status = ${add(criteria.status)}`);
    if (criteria.location && omit !== 'location') where.push(`i.location ILIKE ${add(`%${escapeLike(criteria.location)}%`)}`);
    // Budget filter: the project's whole quoted range must sit inside the requested range,
    // so "up to S$80,000" only returns projects that cost at most S$80,000 and "from S$120,000"
    // only projects that start at S$120,000 or more. (Matching on overlap let almost every
    // project through once the numbers got large.)
    if (omit !== 'budget') {
      if (criteria.budgetMin != null) where.push(`i.budget_min >= ${add(criteria.budgetMin)}`);
      if (criteria.budgetMax != null) where.push(`i.budget_max <= ${add(criteria.budgetMax)}`);
    }
    if (criteria.styleIds && criteria.styleIds.length && omit !== 'styleIds') {
      where.push(`EXISTS (SELECT 1 FROM idp_styles s WHERE s.idp_id = i.idp_id AND s.style_id = ANY(${add(criteria.styleIds)}::int[]))`);
    }
    return where.length ? `WHERE ${where.join(' AND ')}` : '';
  }

  /**
   * Search IDPs on the database.
   * criteria: keyword, categoryId, budgetMin, budgetMax, location, styleIds[],
   *           propertyTypeId, designerId, status, ownerId, publicOnly, sort, limit, offset
   */
  static async search(criteria = {}, client = db) {
    const params = [];
    const add = (value) => { params.push(value); return `$${params.length}`; };
    const whereSql = IDP.buildWhere(criteria, add);
    const total = await client.query(`SELECT COUNT(*)::int AS n ${FROM} ${whereSql}`, params);
    const orderBy = SORTS[criteria.sort] || SORTS.newest;
    const limit = add(criteria.limit || 12);
    const offset = add(criteria.offset || 0);
    const { rows } = await client.query(
      `SELECT ${COLUMNS} ${FROM} ${whereSql} ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`, params,
    );
    return { rows, total: total.rows[0].n };
  }

  /** Number of IDPs matching the criteria, optionally ignoring one filter. */
  static async count(criteria = {}, omit = null, client = db) {
    const params = [];
    const add = (value) => { params.push(value); return `$${params.length}`; };
    const { rows } = await client.query(`SELECT COUNT(*)::int AS n ${FROM} ${IDP.buildWhere(criteria, add, omit)}`, params);
    return rows[0].n;
  }

  /**
   * Option counts for the search filters. Each dimension is counted with every
   * other active filter applied but its own filter ignored, so the numbers show
   * what choosing that option would return.
   */
  static async facets(criteria = {}, client = db) {
    const run = async (omit, select, group, extraJoin = '') => {
      const params = [];
      const add = (value) => { params.push(value); return `$${params.length}`; };
      const { rows } = await client.query(
        `SELECT ${select} AS value, COUNT(DISTINCT i.idp_id)::int AS n ${FROM} ${extraJoin}
         ${IDP.buildWhere(criteria, add, omit)} GROUP BY ${group}`, params,
      );
      return Object.fromEntries(rows.filter((r) => r.value !== null).map((r) => [r.value, r.n]));
    };
    const [categories, propertyTypes, styles, status, locations] = await Promise.all([
      run('categoryId', 'i.category_id', 'i.category_id'),
      run('propertyTypeId', 'i.property_type_id', 'i.property_type_id'),
      run('styleIds', 'fs.style_id', 'fs.style_id', 'JOIN idp_styles fs ON fs.idp_id = i.idp_id'),
      run('status', 'i.status', 'i.status'),
      run('location', 'i.location', 'i.location'),
    ]);
    return { categories, property_types: propertyTypes, styles, status, locations };
  }

  /** Full IDP record with photos, style objects and designer details. */
  static async findById(idpId, { publicOnly = false } = {}, client = db) {
    const { rows } = await client.query(
      `SELECT ${COLUMNS},
              d.registration_status, d.years_experience, co.contact_email, co.contact_phone,
              ARRAY(SELECT s.style_id FROM idp_styles s WHERE s.idp_id = i.idp_id ORDER BY s.style_id) AS style_ids
       ${FROM} WHERE i.idp_id = $1 ${publicOnly ? `AND ${PUBLIC_VISIBILITY}` : ''}`,
      [idpId],
    );
    if (!rows[0]) return null;
    const photos = await client.query(
      'SELECT photo_id, url, caption, sort_order FROM idp_photos WHERE idp_id = $1 ORDER BY sort_order, photo_id',
      [idpId],
    );
    return { ...rows[0], photos: photos.rows };
  }

  static async findOwnerId(idpId, client = db) {
    const { rows } = await client.query('SELECT designer_id FROM idps WHERE idp_id = $1', [idpId]);
    return rows[0] ? rows[0].designer_id : null;
  }

  static async create(designerId, data, client = db) {
    const { rows } = await client.query(
      `INSERT INTO idps (designer_id, category_id, property_type_id, title, description, status, budget_min, budget_max, location)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING idp_id`,
      [designerId, data.categoryId || null, data.propertyTypeId || null, data.title, data.description,
        data.status || 'current', data.budgetMin, data.budgetMax, data.location],
    );
    const idpId = rows[0].idp_id;
    if (data.styleIds) await IDP.setStyles(idpId, data.styleIds, client);
    return idpId;
  }

  static async update(idpId, data, client = db) {
    const map = {
      categoryId: 'category_id', propertyTypeId: 'property_type_id', title: 'title', description: 'description',
      status: 'status', budgetMin: 'budget_min', budgetMax: 'budget_max', location: 'location',
    };
    const sets = [];
    const params = [idpId];
    Object.entries(map).forEach(([key, col]) => {
      if (data[key] !== undefined) { params.push(data[key]); sets.push(`${col} = $${params.length}`); }
    });
    if (sets.length) {
      await client.query(`UPDATE idps SET ${sets.join(', ')}, updated_at = NOW() WHERE idp_id = $1`, params);
    }
    if (data.styleIds !== undefined) await IDP.setStyles(idpId, data.styleIds, client);
  }

  static async setStyles(idpId, styleIds, client = db) {
    await client.query('DELETE FROM idp_styles WHERE idp_id = $1', [idpId]);
    if (styleIds.length) {
      await client.query(
        'INSERT INTO idp_styles (idp_id, style_id) SELECT $1, UNNEST($2::int[]) ON CONFLICT DO NOTHING',
        [idpId, styleIds],
      );
    }
  }

  static async delete(idpId, client = db) {
    const { rowCount } = await client.query('DELETE FROM idps WHERE idp_id = $1', [idpId]);
    return rowCount > 0;
  }

  /** Per-IDP view counts for one designer, with views in the last 30 days (story 25). */
  static async viewCountsForDesigner(designerId, client = db) {
    const { rows } = await client.query(
      `SELECT i.idp_id, i.title, i.status,
              COUNT(v.view_id)::int AS view_count,
              COUNT(v.view_id) FILTER (WHERE v.viewed_at >= NOW() - INTERVAL '30 days')::int AS views_last_30_days,
              MAX(v.viewed_at) AS last_viewed_at
       FROM idps i LEFT JOIN idp_views v ON v.idp_id = i.idp_id
       WHERE i.designer_id = $1
       GROUP BY i.idp_id ORDER BY view_count DESC, i.idp_id DESC`,
      [designerId],
    );
    return rows;
  }

  /** Per-IDP shortlist (favourite) counts for one designer (story 26). */
  static async shortlistCountsForDesigner(designerId, client = db) {
    const { rows } = await client.query(
      `SELECT i.idp_id, i.title, i.status,
              COUNT(f.favourite_id)::int AS favourite_count,
              COUNT(f.favourite_id) FILTER (WHERE f.created_at >= NOW() - INTERVAL '30 days')::int AS favourites_last_30_days,
              MAX(f.created_at) AS last_favourited_at
       FROM idps i LEFT JOIN favourites f ON f.idp_id = i.idp_id
       WHERE i.designer_id = $1
       GROUP BY i.idp_id ORDER BY favourite_count DESC, i.idp_id DESC`,
      [designerId],
    );
    return rows;
  }

  /** Aggregate performance across all of a designer's IDPs (story 27). */
  static async performanceSummary(designerId, client = db) {
    const totals = await client.query(
      `SELECT COUNT(*)::int AS total_idps,
              COUNT(*) FILTER (WHERE status = 'current')::int AS current_idps,
              COUNT(*) FILTER (WHERE status = 'past')::int AS past_idps,
              (SELECT COUNT(*)::int FROM idp_views v JOIN idps x ON x.idp_id = v.idp_id WHERE x.designer_id = $1) AS total_views,
              (SELECT COUNT(*)::int FROM favourites f JOIN idps x ON x.idp_id = f.idp_id WHERE x.designer_id = $1) AS total_favourites,
              (SELECT COUNT(*)::int FROM enquiries e WHERE e.designer_id = $1) AS total_enquiries,
              (SELECT COUNT(*)::int FROM enquiries e WHERE e.designer_id = $1 AND e.status = 'new') AS new_enquiries
       FROM idps WHERE designer_id = $1`,
      [designerId],
    );
    const trend = await client.query(
      `SELECT to_char(g.day, 'YYYY-MM-DD') AS day,
              (SELECT COUNT(*)::int FROM idp_views v JOIN idps x ON x.idp_id = v.idp_id
                WHERE x.designer_id = $1 AND v.viewed_at::date = g.day) AS views,
              (SELECT COUNT(*)::int FROM favourites f JOIN idps x ON x.idp_id = f.idp_id
                WHERE x.designer_id = $1 AND f.created_at::date = g.day) AS favourites
       FROM generate_series(CURRENT_DATE - 13, CURRENT_DATE, INTERVAL '1 day') AS g(day)
       ORDER BY g.day`,
      [designerId],
    );
    const byCategory = await client.query(
      `SELECT COALESCE(c.name, 'Uncategorised') AS category, COUNT(*)::int AS idp_count
       FROM idps i LEFT JOIN idp_categories c ON c.category_id = i.category_id
       WHERE i.designer_id = $1 GROUP BY c.name ORDER BY idp_count DESC`,
      [designerId],
    );
    return { ...totals.rows[0], trend: trend.rows, by_category: byCategory.rows };
  }

  /** Distinct locations used by published IDPs, for the location filter. */
  static async distinctLocations(client = db) {
    const { rows } = await client.query(
      `SELECT DISTINCT i.location ${FROM} WHERE ${PUBLIC_VISIBILITY} ORDER BY i.location`,
    );
    return rows.map((r) => r.location);
  }
}

module.exports = IDP;
