/* Platform Management console. UI boundary classes: MembershipStatisticsPage (49),
   ManageCategoriesPage (50, 56, 57), GenerateReportForm + ReportHistoryPage (51-53, 58, 59),
   ReportViewPage + ExportReportControl (60). */
(function () {
  'use strict';

  const { esc } = UI;
  const V = window.Views = window.Views || {};
  const ROLE_LABEL = { admin: 'User Admins', designer: 'Interior Designers', customer: 'Customers', manager: 'Platform Management' };
  const METRICS = [['new_users', 'New users'], ['new_idps', 'New IDPs'], ['searches', 'Searches'], ['views', 'Views'], ['favourites', 'Shortlists'], ['enquiries', 'Enquiries']];
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date());

  function shell(active) {
    return App.dash('Platform management', [
      { key: 'overview', href: '#/manage', label: 'Membership statistics' },
      { key: 'categories', href: '#/manage/categories', label: 'IDP categories' },
      { key: 'reports', href: '#/manage/reports', label: 'Reports' },
    ], active);
  }

  // ---------- MembershipStatisticsPage (story 49) ----------
  V.manageOverview = async function manageOverview() {
    const main = shell('overview');
    const s = await API.get('/api/manager/stats');
    const roles = Object.entries(s.by_role);
    main.innerHTML = `<div class="dash-head"><div><h1>Membership statistics</h1><p class="muted">Live figures from the platform database.</p></div>
      <a class="btn primary" href="#/manage/reports">Generate a report</a></div>
      <div class="stat-row">
        <div class="stat"><div class="v">${s.total_users}</div><div class="l">Registered users</div></div>
        <div class="stat"><div class="v">${s.new_users_30d}</div><div class="l">Joined in the last 30 days</div></div>
        <div class="stat"><div class="v">${s.total_idps}</div><div class="l">IDP listings</div></div>
        <div class="stat"><div class="v">${s.total_searches}</div><div class="l">Searches performed</div></div>
        <div class="stat"><div class="v">${s.total_favourites}</div><div class="l">Shortlists</div></div>
      </div>
      <div class="panel-grid">
        <div class="panel"><h3>Users by role</h3>${UI.barList(roles.map(([r, v]) => ({ label: ROLE_LABEL[r] || r, value: v.total })))}
          <div class="table-wrap" style="margin-top:18px"><table><thead><tr><th>Role</th><th class="num">Total</th><th class="num">Active</th><th class="num">Suspended</th></tr></thead><tbody>
          ${roles.map(([r, v]) => `<tr><td>${ROLE_LABEL[r] || r}</td><td class="num">${v.total}</td><td class="num">${v.active}</td><td class="num">${v.suspended}</td></tr>`).join('')}</tbody></table></div></div>
        <div>
          <div class="panel"><h3>New users per month</h3>${UI.lineChart(s.monthly_growth.map((m) => m.month), [{ name: 'New users', values: s.monthly_growth.map((m) => m.new_users), color: '#5e6b4e' }], { height: 180 })}</div>
          <div class="panel"><h3>Designer registrations</h3>${UI.barList(Object.entries(s.designer_registrations).map(([k, v]) => ({ label: k[0].toUpperCase() + k.slice(1), value: v })))}</div>
        </div>
      </div>`;
  };

  // ---------- ManageCategoriesPage (stories 50, 56, 57) ----------
  V.manageCategories = async function manageCategories() {
    const main = shell('categories');
    let q = '';
    main.innerHTML = `<div class="dash-head"><div><h1>IDP categories</h1><p class="muted">Designers file every project under one of these categories.</p></div></div>
      <div class="panel-grid">
        <div><form class="toolbar" id="catSearch" role="search"><input type="search" name="q" placeholder="Search categories" aria-label="Search categories">
          <button class="btn sm" type="submit">Search</button><button class="btn ghost sm" type="button" id="catClear">Clear</button></form><div id="catBox">${UI.loading()}</div></div>
        <form id="catForm" class="panel" novalidate style="align-self:start"><h3>Create a category</h3><div id="catErr"></div>
          <div class="field"><label for="cName">Name</label><input id="cName" name="name" required maxlength="80"></div>
          <div class="field"><label for="cDesc">Description</label><textarea id="cDesc" name="description" maxlength="500" style="min-height:80px"></textarea></div>
          <button class="btn primary" type="submit">Create category</button></form></div>`;
    async function load() {
      const box = document.getElementById('catBox');
      const r = await API.get('/api/manager/categories', { q });
      box.innerHTML = r.results.length ? `<div class="table-wrap"><table><thead><tr><th>Category</th><th class="num">IDPs</th><th>Updated</th><th></th></tr></thead><tbody>
        ${r.results.map((c) => `<tr><td><strong>${esc(c.name)}</strong><br><span class="small muted">${esc(c.description)}</span></td><td class="num">${c.idp_count}</td><td>${UI.date(c.updated_at)}</td>
          <td><div class="row-actions"><button class="btn ghost sm" data-edit="${c.category_id}">Edit</button><button class="btn danger sm" data-del="${c.category_id}">Delete</button></div></td></tr>`).join('')}
        </tbody></table></div>` : UI.empty(q ? `No categories match "${q}"` : 'No categories yet', q ? 'Try another search.' : 'Create the first category with the form.');
      box.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
        const c = r.results.find((x) => x.category_id === Number(b.dataset.edit));
        const m = UI.modal(`<h2>Edit category</h2><form id="ceForm" novalidate><div id="ceErr"></div>
          <div class="field"><label for="ceName">Name</label><input id="ceName" name="name" value="${esc(c.name)}" required></div>
          <div class="field"><label for="ceDesc">Description</label><textarea id="ceDesc" name="description">${esc(c.description)}</textarea></div>
          <div class="btn-row"><button class="btn primary" type="submit">Save changes</button><button class="btn ghost" type="button" data-close>Cancel</button></div></form>`, { label: 'Edit category' });
        const f = m.el.querySelector('#ceForm');
        f.addEventListener('submit', async (e) => {
          e.preventDefault();
          await UI.submitting(f.querySelector('button[type=submit]'), m.el.querySelector('#ceErr'), async () => {
            const res = await API.put(`/api/manager/categories/${c.category_id}`, UI.formObject(f));
            m.close(); UI.toast(res.message); App.meta = null; load();
          });
        });
      }));
      box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
        const c = r.results.find((x) => x.category_id === Number(b.dataset.del));
        const msg = c.idp_count ? `Delete "${c.name}"? Its ${c.idp_count} IDP(s) will be kept but shown as Uncategorised until designers re-file them.` : `Delete "${c.name}"?`;
        if (!(await UI.confirm(msg, { title: 'Delete category', confirmLabel: 'Delete category', danger: true }))) return;
        try { const res = await API.del(`/api/manager/categories/${c.category_id}`); UI.toast(res.message); App.meta = null; load(); } catch (e) { UI.toast(e.message, 'error'); }
      }));
    }
    const sf = document.getElementById('catSearch');
    sf.addEventListener('submit', (e) => { e.preventDefault(); q = sf.q.value.trim(); load(); });
    document.getElementById('catClear').addEventListener('click', () => { sf.q.value = ''; q = ''; load(); });
    const cf = document.getElementById('catForm');
    cf.addEventListener('submit', async (e) => {
      e.preventDefault();
      await UI.submitting(cf.querySelector('button'), document.getElementById('catErr'), async () => {
        const r = await API.post('/api/manager/categories', UI.formObject(cf));
        UI.toast(r.message); cf.reset(); App.meta = null; load();
      });
    });
    load();
  };

  // ---------- GenerateReportForm + ReportHistoryPage (stories 51, 52, 53, 58, 59) ----------
  async function exportReport(id, format) {
    try { const name = await API.download(`/api/manager/reports/${id}/export?format=${format}`); UI.toast(`Exported ${name}`); } catch (e) { UI.toast(e.message, 'error'); }
  }

  V.manageReports = async function manageReports() {
    const main = shell('reports');
    const t = today();
    const st = { type: '', page: 1 };
    main.innerHTML = `<div class="dash-head"><div><h1>Reports</h1><p class="muted">Every report is calculated from platform records and saved for later.</p></div></div>
      <div class="panel"><h3>Generate a report</h3><div id="genErr"></div>
        <div class="grid-2" style="gap:20px">
          <form class="gen" data-type="daily"><h4>Daily report</h4><p class="small muted">New IDPs, new users and searches for one day.</p>
            <div class="field"><label for="gDay">Date</label><input id="gDay" type="date" name="date" value="${t}" max="${t}" required></div><button class="btn sm primary" type="submit">Generate daily report</button></form>
          <form class="gen" data-type="weekly"><h4>Weekly report</h4><p class="small muted">Monday to Sunday, with growth against the previous week.</p>
            <div class="field"><label for="gWeek">Any day in the week</label><input id="gWeek" type="date" name="weekStart" value="${t}" max="${t}" required></div><button class="btn sm primary" type="submit">Generate weekly report</button></form>
          <form class="gen" data-type="monthly"><h4>Monthly report</h4><p class="small muted">Top-performing designers and categories for a month.</p>
            <div class="field"><label for="gMonth">Month</label><input id="gMonth" type="month" name="month" value="${t.slice(0, 7)}" max="${t.slice(0, 7)}" required></div><button class="btn sm primary" type="submit">Generate monthly report</button></form>
          <form class="gen" data-type="custom"><h4>Custom date range</h4><p class="small muted">Up to 366 days.</p>
            <div class="grid-2" style="gap:8px"><div class="field"><label for="gStart">From</label><input id="gStart" type="date" name="start" max="${t}" required></div>
              <div class="field"><label for="gEnd">To</label><input id="gEnd" type="date" name="end" value="${t}" max="${t}" required></div></div>
            <button class="btn sm primary" type="submit">Generate custom report</button></form>
        </div></div>
      <div class="dash-head" style="margin-top:12px"><h2 style="margin:0">Report history</h2>
        <select id="repType" aria-label="Report type" style="width:auto"><option value="">All types</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="custom">Custom</option></select></div>
      <div id="repBox">${UI.loading()}</div><nav class="pagination" id="repPager"></nav>`;
    main.querySelectorAll('form.gen').forEach((f) => f.addEventListener('submit', async (e) => {
      e.preventDefault();
      await UI.submitting(f.querySelector('button'), document.getElementById('genErr'), async () => {
        const r = await API.post(`/api/manager/reports/${f.dataset.type}`, UI.formObject(f));
        UI.toast(r.message);
        location.hash = `#/manage/reports/${r.report.report_id}`;
      });
    }));
    async function load() {
      const box = document.getElementById('repBox');
      box.innerHTML = UI.loading();
      const r = await API.get('/api/manager/reports', { ...st, pageSize: 12 });
      box.innerHTML = r.results.length ? `<div class="table-wrap"><table><thead><tr><th>Report</th><th>Type</th><th>Period</th><th>Generated</th><th></th></tr></thead><tbody>
        ${r.results.map((x) => `<tr><td><a href="#/manage/reports/${x.report_id}"><strong>${esc(x.title)}</strong></a></td><td><span class="tag">${x.report_type}</span></td>
          <td>${x.period_start}${x.period_end !== x.period_start ? ` to ${x.period_end}` : ''}</td><td>${UI.dateTime(x.created_at)}<br><span class="small muted">${esc(x.generated_by_name || '')}</span></td>
          <td><div class="row-actions"><a class="btn ghost sm" href="#/manage/reports/${x.report_id}">View</a><button class="btn ghost sm" data-csv="${x.report_id}">CSV</button><button class="btn ghost sm" data-pdf="${x.report_id}">PDF</button></div></td></tr>`).join('')}
        </tbody></table></div>` : UI.empty('No reports yet', 'Generate your first report above.');
      box.querySelectorAll('[data-csv]').forEach((b) => b.addEventListener('click', () => exportReport(b.dataset.csv, 'csv')));
      box.querySelectorAll('[data-pdf]').forEach((b) => b.addEventListener('click', () => exportReport(b.dataset.pdf, 'pdf')));
      UI.pagination(document.getElementById('repPager'), r, (p) => { st.page = p; load(); });
    }
    document.getElementById('repType').addEventListener('change', (e) => { st.type = e.target.value; st.page = 1; load(); });
    load();
  };

  // ---------- ReportViewPage (stories 59, 60) ----------
  V.manageReportView = async function manageReportView(id) {
    const main = shell('reports');
    const r = await API.get(`/api/manager/reports/${id}`);
    const d = r.data;
    const growthTxt = (k) => {
      if (!d.growth) return '';
      const g = d.growth[k];
      if (g === null) return 'new activity vs previous period';
      return `${g > 0 ? '+' : ''}${g}% vs previous period`;
    };
    const table = (title, cols, rows) => `<div class="panel"><h3>${esc(title)}</h3>${rows.length ? `<div class="table-wrap"><table><thead><tr>${cols.map((c, i) => `<th class="${i ? 'num' : ''}">${esc(c)}</th>`).join('')}</tr></thead><tbody>
      ${rows.map((row) => `<tr>${row.map((v, i) => `<td class="${i ? 'num' : ''}">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="muted small">No activity in this period.</p>'}</div>`;
    main.innerHTML = `<div class="dash-head"><div><p class="small"><a href="#/manage/reports">Reports</a></p><h1>${esc(r.title)}</h1>
      <p class="muted">${r.period_start} to ${r.period_end} (${d.period.days} day${d.period.days === 1 ? '' : 's'}). Generated ${UI.dateTime(r.created_at)} by ${esc(r.generated_by_name || 'Platform Management')}.</p></div>
      <div class="btn-row"><button class="btn ghost" id="exCsv">Export CSV</button><button class="btn" id="exPdf">Export PDF</button></div></div>
      <div class="stat-row">${METRICS.map(([k, l]) => `<div class="stat"><div class="v">${d.totals[k]}</div><div class="l">${l}${d.growth ? `<br><span class="small">${growthTxt(k)}</span>` : ''}</div></div>`).join('')}</div>
      ${d.daily_series && d.daily_series.length > 1 ? `<div class="panel"><h3>Daily trend</h3>${UI.lineChart(d.daily_series.map((x) => x.day.slice(5)), [
        { name: 'Views', values: d.daily_series.map((x) => x.views), color: '#5e6b4e' },
        { name: 'Searches', values: d.daily_series.map((x) => x.searches), color: '#b39b7a' },
        { name: 'New users', values: d.daily_series.map((x) => x.new_users), color: '#2a2826' }])}</div>` : ''}
      <div class="panel-grid">
        ${d.top_designers ? table('Top-performing designers', ['Designer', 'Views', 'Shortlists', 'Enquiries', 'Score'], d.top_designers.map((x) => [x.name, x.views, x.favourites, x.enquiries, x.score])) : ''}
        ${d.top_categories ? table('Top-performing categories', ['Category', 'New IDPs', 'Views', 'Shortlists', 'Score'], d.top_categories.map((x) => [x.name, x.new_idps, x.views, x.favourites, x.score])) : ''}
        ${d.new_users_by_role ? table('New users by role', ['Role', 'New users'], Object.entries(d.new_users_by_role).map(([k, v]) => [ROLE_LABEL[k] || k, v])) : ''}
        ${d.top_search_keywords ? table('Top search keywords', ['Keyword', 'Searches'], d.top_search_keywords.map((x) => [x.keyword, x.searches])) : ''}
      </div>
      <p class="small muted">${esc(d.metric_definitions ? d.metric_definitions.score : '')}</p>`;
    document.getElementById('exCsv').addEventListener('click', () => exportReport(id, 'csv'));
    document.getElementById('exPdf').addEventListener('click', () => exportReport(id, 'pdf'));
  };
})();
