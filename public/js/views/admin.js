/* User Admin console. UI boundary classes: AdminOverviewPage, AccountListPage (1, 2, 10) with bulk
   actions and CSV export, AccountDetailsPage (4, 8), CreateAccountForm / EditAccountForm (7, 9),
   RegistrationApprovalPage (3, 11), ProfileListPage (15, 16), CreateProfileForm (12),
   ProfileDetailsPage (13, 14, 15), ActivityLogPage. */
(function () {
  'use strict';

  const { esc } = UI;
  const V = window.Views = window.Views || {};
  const ROLE_LABEL = { admin: 'User Admin', designer: 'Interior Designer', customer: 'Customer', manager: 'Platform Management' };

  const pendingCount = async () => (await API.get('/api/admin/registrations', { status: 'pending', pageSize: 1 })).total;

  /** Sidebar for every admin page. The approvals badge is live: it refreshes after each
      approve/reject (and any other change), when the tab regains focus, and every 30 seconds. */
  async function shell(active) {
    let pending = 0;
    try { pending = await pendingCount(); } catch (_) { /* permission may be missing */ }
    return App.dash('User admin', [
      { key: 'overview', href: '#/admin', label: 'Overview' },
      { group: 'People' },
      { key: 'accounts', href: '#/admin/accounts', label: 'User accounts' },
      { key: 'new', href: '#/admin/accounts/new', label: 'Create account' },
      { key: 'regs', href: '#/admin/registrations', label: 'Designer approvals', count: pending, countFn: pendingCount },
      { group: 'Access' },
      { key: 'profiles', href: '#/admin/profiles', label: 'User profiles' },
      { key: 'activity', href: '#/admin/activity', label: 'Activity log' },
    ], active, '', { sub: App.user.fullName });
  }

  function showTempPassword(email, password, intro) {
    UI.modal(`<h2>Temporary password</h2><p>${esc(intro)}</p><p><span class="secret">${esc(password)}</span></p>
      <p class="small muted">Share it with ${esc(email)} through a secure channel. It is shown only once and the user must change it when they next log in. Existing passwords are stored only as secure hashes and can never be viewed.</p>
      <div class="btn-row"><button class="btn primary" data-close>Done</button></div>`, { label: 'Temporary password' });
  }

  async function toggleAccount(account, after) {
    const suspending = account.status === 'active';
    const ok = await UI.confirm(suspending
      ? `Suspend ${account.full_name}? They will be signed out and cannot log in until reactivated. Their data is kept.`
      : `Reactivate ${account.full_name}? They will be able to log in again.`,
    { title: suspending ? 'Suspend account' : 'Reactivate account', confirmLabel: suspending ? 'Suspend' : 'Reactivate', danger: suspending });
    if (!ok) return;
    try {
      const r = await API.patch(`/api/admin/accounts/${account.account_id}/status`, { status: suspending ? 'suspended' : 'active' });
      UI.toast(r.message); after();
    } catch (e) { UI.toast(e.message, 'error'); }
  }

  // ---------- AccountListPage (stories 1, 2, 10) + bulk actions and CSV export ----------
  V.adminAccounts = async function adminAccounts() {
    const main = await shell('accounts');
    const q = App.query();
    const st = { q: q.q || '', role: q.role || '', status: q.status || '', page: 1 };
    const selected = new Set();
    let rows = [];
    main.innerHTML = `<div class="dash-head"><div><span class="eyebrow">People</span><h1>User accounts</h1><p class="muted" id="accCount"></p></div>
      <div class="btn-row"><button class="btn ghost" id="accExport" type="button">Export CSV</button><a class="btn primary" href="#/admin/accounts/new">Create account</a></div></div>
      <form class="toolbar" id="accSearch" role="search">
        <input type="search" name="q" value="${esc(st.q)}" placeholder="Search by name, email or phone" aria-label="Search accounts">
        <select name="role" aria-label="Role"><option value="">All roles</option>${Object.entries(ROLE_LABEL).map(([k, l]) => `<option value="${k}" ${st.role === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select name="status" aria-label="Status"><option value="">Any status</option><option value="active" ${st.status === 'active' ? 'selected' : ''}>Active</option><option value="suspended" ${st.status === 'suspended' ? 'selected' : ''}>Suspended</option></select>
        <button class="btn sm" type="submit">Search</button><button class="btn ghost sm" type="button" id="accClear">Clear</button></form>
      <div id="bulkBar"></div>
      <div id="accTable">${UI.loading()}</div><nav class="pagination" id="accPager"></nav>`;
    const form = document.getElementById('accSearch');

    function drawBulk() {
      const bar = document.getElementById('bulkBar');
      if (!selected.size) { bar.innerHTML = ''; return; }
      bar.innerHTML = `<div class="bulk-bar"><strong>${selected.size} selected</strong>
        <button class="btn ghost sm" type="button" data-bulk="suspended">Suspend selected</button>
        <button class="btn ghost sm" type="button" data-bulk="active">Reactivate selected</button>
        <button class="btn ghost sm" type="button" id="bulkNone">Clear selection</button></div>`;
      bar.querySelectorAll('[data-bulk]').forEach((b) => b.addEventListener('click', () => bulk(b.dataset.bulk)));
      document.getElementById('bulkNone').addEventListener('click', () => { selected.clear(); syncChecks(); });
    }
    function syncChecks() {
      document.querySelectorAll('#accTable input[data-pick]').forEach((c) => { c.checked = selected.has(Number(c.dataset.pick)); c.closest('tr').classList.toggle('selected', c.checked); });
      const all = document.getElementById('pickAll');
      const pickable = rows.filter((a) => a.account_id !== App.user.accountId);
      if (all) { all.checked = pickable.length > 0 && pickable.every((a) => selected.has(a.account_id)); all.indeterminate = !all.checked && pickable.some((a) => selected.has(a.account_id)); }
      drawBulk();
    }
    async function bulk(status) {
      const n = selected.size;
      const ok = await UI.confirm(status === 'suspended'
        ? `Suspend ${n} account${n === 1 ? '' : 's'}? They will be signed out and cannot log in until reactivated. Accounts already suspended are skipped.`
        : `Reactivate ${n} account${n === 1 ? '' : 's'}? Accounts that are already active are skipped.`,
      { title: status === 'suspended' ? 'Suspend accounts' : 'Reactivate accounts', confirmLabel: status === 'suspended' ? 'Suspend' : 'Reactivate', danger: status === 'suspended' });
      if (!ok) return;
      try {
        const r = await API.post('/api/admin/accounts/bulk-status', { accountIds: [...selected], status });
        UI.toast(r.message);
        selected.clear();
        load();
      } catch (e) { UI.toast(e.message, 'error'); }
    }

    async function load() {
      const box = document.getElementById('accTable');
      box.innerHTML = UI.loading();
      try {
        const r = await API.get('/api/admin/accounts', { ...st, pageSize: 15 });
        rows = r.results;
        document.getElementById('accCount').textContent = `${r.total} account${r.total === 1 ? '' : 's'}${st.q || st.role || st.status ? ' match your search' : ' registered'}`;
        box.innerHTML = r.results.length ? `<div class="table-wrap"><table><thead><tr><th class="pick"><input type="checkbox" id="pickAll" aria-label="Select all accounts on this page"></th>
          <th>Name</th><th>Profile</th><th>Status</th><th>Registered</th><th>Last login</th><th></th></tr></thead><tbody>
          ${r.results.map((a) => `<tr><td class="pick">${a.account_id === App.user.accountId ? '' : `<input type="checkbox" data-pick="${a.account_id}" aria-label="Select ${esc(a.full_name)}">`}</td>
            <td><a href="#/admin/accounts/${a.account_id}"><strong>${esc(a.full_name)}</strong></a><br><span class="small muted">${esc(a.email)}</span></td>
            <td>${esc(a.profile_name)}${a.registration_status && a.registration_status !== 'approved' ? ` ${UI.statusTag(a.registration_status)}` : ''}</td>
            <td>${UI.statusTag(a.status)}${a.profile_suspended ? ' <span class="tag danger">profile suspended</span>' : ''}</td>
            <td>${UI.date(a.created_at)}</td><td>${a.last_login_at ? UI.date(a.last_login_at) : '<span class="muted">Never</span>'}</td>
            <td><div class="row-actions"><a class="btn ghost sm" href="#/admin/accounts/${a.account_id}">View</a>
              ${a.account_id === App.user.accountId ? '' : `<button class="btn ${a.status === 'active' ? 'danger' : ''} sm" data-toggle="${a.account_id}">${a.status === 'active' ? 'Suspend' : 'Reactivate'}</button>`}</div></td></tr>`).join('')}
          </tbody></table></div>` : UI.empty('No accounts found', 'Try a different name or remove a filter.');
        box.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => toggleAccount(r.results.find((a) => a.account_id === Number(b.dataset.toggle)), load)));
        box.querySelectorAll('[data-pick]').forEach((c) => c.addEventListener('change', () => { const id = Number(c.dataset.pick); if (c.checked) selected.add(id); else selected.delete(id); syncChecks(); }));
        const all = document.getElementById('pickAll');
        if (all) all.addEventListener('change', () => { rows.filter((a) => a.account_id !== App.user.accountId).forEach((a) => { if (all.checked) selected.add(a.account_id); else selected.delete(a.account_id); }); syncChecks(); });
        syncChecks();
        UI.pagination(document.getElementById('accPager'), r, (p) => { st.page = p; load(); });
      } catch (e) { box.innerHTML = UI.errorBox(e.message); }
    }
    const refilter = () => { Object.assign(st, UI.formObject(form), { page: 1 }); selected.clear(); load(); };
    form.addEventListener('submit', (e) => { e.preventDefault(); refilter(); });
    form.querySelectorAll('select').forEach((s) => s.addEventListener('change', refilter));
    document.getElementById('accClear').addEventListener('click', () => { form.reset(); form.q.value = ''; Object.assign(st, { q: '', role: '', status: '', page: 1 }); selected.clear(); load(); });
    document.getElementById('accExport').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const qs = new URLSearchParams(Object.entries({ q: st.q, role: st.role, status: st.status }).filter(([, v]) => v));
        const name = await API.download(`/api/admin/accounts/export.csv${qs.toString() ? `?${qs}` : ''}`);
        UI.toast(`Downloaded ${name}`);
      } catch (err) { UI.toast(err.message, 'error'); } finally { btn.disabled = false; }
    });
    load();
  };

  // ---------- AccountDetailsPage (stories 4, 8) ----------
  V.adminAccountDetail = async function adminAccountDetail(id) {
    const main = await shell('accounts');
    const a = await API.get(`/api/admin/accounts/${id}`);
    const d = a.designer;
    const self = a.account_id === App.user.accountId;
    main.innerHTML = `<div class="dash-head"><div><p class="small"><a href="#/admin/accounts">User accounts</a></p><h1>${esc(a.full_name)}</h1><p class="muted">${esc(a.email)}</p></div>
      <div class="btn-row"><a class="btn ghost" href="#/admin/accounts/${a.account_id}/edit">Edit account</a>
        <button class="btn ghost" id="resetPw">Reset password</button>
        ${self ? '' : `<button class="btn ${a.status === 'active' ? 'danger' : 'primary'}" id="toggleAcc">${a.status === 'active' ? 'Suspend account' : 'Reactivate account'}</button>`}</div></div>
      <div class="panel-grid">
        <div class="panel"><h3>Account</h3><dl class="kv">
          <dt>Status</dt><dd>${UI.statusTag(a.status)}${a.profile_suspended ? ' <span class="tag danger">profile suspended</span>' : ''}</dd>
          <dt>User profile</dt><dd><a href="#/admin/profiles/${a.profile_id}">${esc(a.profile_name)}</a> (${esc(ROLE_LABEL[a.role])})</dd>
          <dt>Phone</dt><dd>${esc(a.phone || 'Not provided')}</dd><dt>Area</dt><dd>${esc(a.location || 'Not provided')}</dd>
          <dt>Registered</dt><dd>${UI.dateTime(a.created_at)}</dd><dt>Last login</dt><dd>${a.last_login_at ? UI.dateTime(a.last_login_at) : 'Never'}</dd>
          <dt>Password</dt><dd>${a.must_change_password ? 'Temporary password issued; change required at next login' : 'Set by user (stored as a secure hash)'}</dd></dl></div>
        ${d ? `<div class="panel"><h3>Designer registration</h3><dl class="kv">
          <dt>Status</dt><dd>${UI.statusTag(d.registration_status)}</dd>
          ${d.rejection_reason ? `<dt>Rejection reason</dt><dd>${esc(d.rejection_reason)}</dd>` : ''}
          <dt>Company</dt><dd>${esc(d.company_name || '')}</dd><dt>Licence</dt><dd>${esc(d.license_number || 'Not provided')}</dd>
          <dt>Experience</dt><dd>${d.years_experience} years</dd>${d.reviewed_by_name ? `<dt>Reviewed by</dt><dd>${esc(d.reviewed_by_name)}, ${UI.date(d.reviewed_at)}</dd>` : ''}</dl>
          ${d.registration_status === 'approved' ? `<p style="margin-top:14px"><a class="btn ghost sm" href="#/designer/${d.designer_id}">View public profile</a></p>` : '<p style="margin-top:14px"><a class="btn ghost sm" href="#/admin/registrations">Review in approvals</a></p>'}</div>` : ''}
      </div>`;
    document.getElementById('resetPw').addEventListener('click', async () => {
      if (!(await UI.confirm(`Issue a new temporary password for ${a.email}? Their current password will stop working.`, { title: 'Reset password', confirmLabel: 'Reset password' }))) return;
      try { const r = await API.post(`/api/admin/accounts/${a.account_id}/reset-password`); showTempPassword(a.email, r.temporaryPassword, r.message); } catch (e) { UI.toast(e.message, 'error'); }
    });
    const tg = document.getElementById('toggleAcc');
    if (tg) tg.addEventListener('click', () => toggleAccount(a, () => V.adminAccountDetail(id)));
  };

  // ---------- Create / Edit account (stories 7, 9) ----------
  V.adminAccountForm = async function adminAccountForm(id) {
    const main = await shell(id ? 'accounts' : 'new');
    const [{ results: profiles }, a] = await Promise.all([API.get('/api/admin/profiles'), id ? API.get(`/api/admin/accounts/${id}`) : null]);
    const options = profiles.filter((p) => (a ? p.role === a.role : !p.is_suspended));
    main.innerHTML = `<div class="dash-head"><div><span class="eyebrow">People</span><h1>${a ? `Edit ${esc(a.full_name)}` : 'Create account'}</h1>
      <p class="muted">${a ? 'Changes take effect immediately.' : 'Leave the password blank to issue a one-time temporary password.'}</p></div></div>
      <form id="accForm" class="form-card" style="max-width:720px" novalidate><div id="accErr"></div>
        <div class="grid-2"><div class="field"><label for="fName">Full name</label><input id="fName" name="fullName" value="${esc(a ? a.full_name : '')}" required></div>
          <div class="field"><label for="fEmail">Email</label><input id="fEmail" name="email" type="email" value="${esc(a ? a.email : '')}" required></div>
          <div class="field"><label for="fPhone">Phone</label><input id="fPhone" name="phone" type="tel" value="${esc(a ? a.phone || '' : '')}"></div>
          <div class="field"><label for="fLoc">Area</label><input id="fLoc" name="location" value="${esc(a ? a.location || '' : '')}"></div></div>
        <div class="field"><label for="fProfile">User profile</label><select id="fProfile" name="profileId" required>
          ${a ? '' : '<option value="">Choose a profile</option>'}${options.map((p) => `<option value="${p.profile_id}" ${a && a.profile_id === p.profile_id ? 'selected' : ''}>${esc(p.name)} (${ROLE_LABEL[p.role]})${p.is_suspended ? ' - suspended' : ''}</option>`).join('')}</select>
          ${a ? `<span class="hint">Accounts can move between ${esc(ROLE_LABEL[a.role])} profiles only.</span>` : '<span class="hint">Designer accounts created here are approved automatically.</span>'}</div>
        ${a ? '' : '<div class="field"><label for="fPw">Initial password (optional)</label><input id="fPw" name="password" type="password" autocomplete="new-password"><span class="hint">At least 8 characters with a letter and a number.</span></div>'}
        <div class="btn-row"><button class="btn primary" type="submit">${a ? 'Save changes' : 'Create account'}</button><a class="btn ghost" href="${a ? `#/admin/accounts/${a.account_id}` : '#/admin/accounts'}">Cancel</a></div></form>`;
    const form = document.getElementById('accForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = UI.formObject(form);
      data.profileId = Number(data.profileId) || undefined;
      if (!data.password) delete data.password;
      await UI.submitting(form.querySelector('button[type=submit]'), document.getElementById('accErr'), async () => {
        if (a) {
          const r = await API.put(`/api/admin/accounts/${a.account_id}`, data);
          UI.toast(r.message); location.hash = `#/admin/accounts/${a.account_id}`;
        } else {
          const r = await API.post('/api/admin/accounts', data);
          UI.toast(r.message);
          location.hash = `#/admin/accounts/${r.account.account_id}`;
          if (r.temporaryPassword) setTimeout(() => showTempPassword(r.account.email, r.temporaryPassword, 'The account was created with this one-time password.'), 300);
        }
      });
    });
  };

  // ---------- RegistrationApprovalPage (stories 3, 11) ----------
  V.adminRegistrations = async function adminRegistrations() {
    const main = await shell('regs');
    const st = { status: 'pending', page: 1 };
    main.innerHTML = `<div class="dash-head"><div><span class="eyebrow">People</span><h1>Designer approvals</h1><p class="muted">Designers can only log in and appear publicly after approval. This list updates on its own when new applications arrive.</p></div>
      <select id="regFilter" aria-label="Registration status" style="width:auto"><option value="pending">Pending review</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="all">All registrations</option></select></div>
      <div id="regBox">${UI.loading()}</div><nav class="pagination" id="regPager"></nav>`;
    async function load() {
      const box = document.getElementById('regBox');
      box.innerHTML = UI.loading();
      const r = await API.get('/api/admin/registrations', { ...st, pageSize: 10 });
      if (st.status === 'pending') lastPending = r.total;
      box.innerHTML = r.results.length ? r.results.map((d) => `<div class="panel">
        <div class="btn-row" style="justify-content:space-between;align-items:start"><div><h3 style="margin-bottom:4px">${esc(d.company_name || d.full_name)}</h3>
          <p class="muted small" style="margin:0">${esc(d.full_name)}, ${esc(d.email)}${d.phone ? `, ${esc(d.phone)}` : ''}. Applied ${UI.date(d.registered_at)}.</p></div>${UI.statusTag(d.registration_status)}</div>
        <dl class="kv" style="margin-top:14px"><dt>Licence number</dt><dd>${esc(d.license_number || 'Not provided')}</dd><dt>Experience</dt><dd>${d.years_experience} years</dd>
          <dt>Specialisation</dt><dd>${esc(d.specialisation || 'Not provided')}</dd>${d.bio ? `<dt>Summary</dt><dd>${esc(d.bio)}</dd>` : ''}
          ${d.rejection_reason ? `<dt>Rejection reason</dt><dd>${esc(d.rejection_reason)}</dd>` : ''}${d.reviewed_by_name ? `<dt>Reviewed</dt><dd>${esc(d.reviewed_by_name)}, ${UI.date(d.reviewed_at)}</dd>` : ''}</dl>
        ${d.registration_status !== 'approved' ? `<div class="btn-row" style="margin-top:16px"><button class="btn primary sm" data-approve="${d.designer_id}">Approve</button>
          ${d.registration_status === 'pending' ? `<button class="btn danger sm" data-reject="${d.designer_id}" data-name="${esc(d.full_name)}">Reject with reason</button>` : ''}</div>` : ''}</div>`).join('')
        : UI.empty('Nothing to review', st.status === 'pending' ? 'There are no pending designer registrations.' : 'No registrations match this filter.');
      box.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', async () => {
        if (!(await UI.confirm('Approve this designer? They will be able to log in and their projects will become public.', { title: 'Approve registration', confirmLabel: 'Approve' }))) return;
        try {
          const res = await API.post(`/api/admin/registrations/${b.dataset.approve}/approve`);
          UI.toast(res.message);
          const card = b.closest('.panel');
          card.style.transition = 'opacity .35s, transform .35s'; card.style.opacity = '0'; card.style.transform = 'translateX(16px)';
          setTimeout(load, 320);
        } catch (e) { UI.toast(e.message, 'error'); }
      }));
      box.querySelectorAll('[data-reject]').forEach((b) => b.addEventListener('click', () => {
        const m = UI.modal(`<h2>Reject registration</h2><p>Tell ${esc(b.dataset.name)} why the application was rejected. They will see this reason when they try to log in.</p>
          <form id="rejForm"><div id="rejErr"></div><div class="field"><label for="rejReason">Reason</label><textarea id="rejReason" name="reason" required minlength="10" maxlength="500"></textarea><span class="hint">10 to 500 characters.</span></div>
          <div class="btn-row"><button class="btn danger" type="submit">Reject registration</button><button class="btn ghost" type="button" data-close>Cancel</button></div></form>`, { label: 'Reject registration' });
        const f = m.el.querySelector('#rejForm');
        f.addEventListener('submit', async (e) => {
          e.preventDefault();
          await UI.submitting(f.querySelector('button[type=submit]'), m.el.querySelector('#rejErr'), async () => {
            const res = await API.post(`/api/admin/registrations/${b.dataset.reject}/reject`, { reason: f.reason.value });
            m.close(); UI.toast(res.message); load();
          });
        });
      }));
      UI.pagination(document.getElementById('regPager'), r, (p) => { st.page = p; load(); });
    }
    document.getElementById('regFilter').addEventListener('change', (e) => { st.status = e.target.value; st.page = 1; load(); });
    // When the live badge sees a different pending total (e.g. a new application), reload the queue
    let lastPending = null;
    const onCount = (e) => {
      if (!document.getElementById('regBox')) { window.removeEventListener('dm:count', onCount); return; }
      if (e.detail.key !== 'regs') return;
      if (lastPending !== null && e.detail.value !== lastPending && st.status === 'pending') load();
      lastPending = e.detail.value;
    };
    window.addEventListener('dm:count', onCount);
    load();
  };

  // ---------- ProfileListPage (stories 15, 16) ----------
  async function toggleProfile(p, after) {
    const suspending = !p.is_suspended;
    const ok = await UI.confirm(suspending
      ? `Suspend the "${p.name}" profile? Its ${p.account_count} account(s) are kept but none of them can log in while it is suspended.`
      : `Reactivate the "${p.name}" profile?`, { title: suspending ? 'Suspend profile' : 'Reactivate profile', confirmLabel: suspending ? 'Suspend profile' : 'Reactivate', danger: suspending });
    if (!ok) return;
    try { const r = await API.patch(`/api/admin/profiles/${p.profile_id}/status`, { suspended: suspending }); UI.toast(r.message); after(); } catch (e) { UI.toast(e.message, 'error'); }
  }

  V.adminProfiles = async function adminProfiles() {
    const main = await shell('profiles');
    const st = { q: '', role: '' };
    main.innerHTML = `<div class="dash-head"><div><span class="eyebrow">Access</span><h1>User profiles</h1><p class="muted">A profile sets the role and permissions of every account assigned to it.</p></div><a class="btn primary" href="#/admin/profiles/new">Create profile</a></div>
      <form class="toolbar" id="prSearch" role="search"><input type="search" name="q" placeholder="Search profiles" aria-label="Search profiles">
        <select name="role" aria-label="Role"><option value="">All roles</option>${Object.entries(ROLE_LABEL).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
        <button class="btn sm" type="submit">Search</button></form><div id="prBox">${UI.loading()}</div>`;
    const form = document.getElementById('prSearch');
    async function load() {
      const box = document.getElementById('prBox');
      const r = await API.get('/api/admin/profiles', st);
      box.innerHTML = r.results.length ? `<div class="table-wrap"><table><thead><tr><th>Profile</th><th>Role</th><th class="num">Permissions</th><th class="num">Accounts</th><th>Status</th><th></th></tr></thead><tbody>
        ${r.results.map((p) => `<tr><td><a href="#/admin/profiles/${p.profile_id}"><strong>${esc(p.name)}</strong></a><br><span class="small muted">${esc(p.description)}</span></td>
          <td>${ROLE_LABEL[p.role]}</td><td class="num">${p.permissions.length}</td><td class="num">${p.account_count}</td><td>${p.is_suspended ? UI.statusTag('suspended') : UI.statusTag('active')}</td>
          <td><div class="row-actions"><a class="btn ghost sm" href="#/admin/profiles/${p.profile_id}">View</a>${p.name === App.user.profileName ? '' : `<button class="btn ${p.is_suspended ? '' : 'danger'} sm" data-p="${p.profile_id}">${p.is_suspended ? 'Reactivate' : 'Suspend'}</button>`}</div></td></tr>`).join('')}
        </tbody></table></div>` : UI.empty('No profiles found', 'Try another search.');
      box.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => toggleProfile(r.results.find((p) => p.profile_id === Number(b.dataset.p)), load)));
    }
    form.addEventListener('submit', (e) => { e.preventDefault(); Object.assign(st, UI.formObject(form)); load(); });
    form.role.addEventListener('change', () => { Object.assign(st, UI.formObject(form)); load(); });
    load();
  };

  // ---------- CreateProfileForm (story 12) ----------
  V.adminProfileForm = async function adminProfileForm() {
    const main = await shell('profiles');
    const catalogue = await API.get('/api/admin/permissions');
    main.innerHTML = `<div class="dash-head"><div><span class="eyebrow">Access</span><h1>Create profile</h1><p class="muted">Choose the role first; only permissions valid for that role can be granted.</p></div></div>
      <form id="pfForm" class="form-card" style="max-width:720px" novalidate><div id="pfErr"></div>
        <div class="grid-2"><div class="field"><label for="pName">Profile name</label><input id="pName" name="name" required placeholder="e.g. Senior Designer"></div>
          <div class="field"><label for="pRole">Role</label><select id="pRole" name="role">${Object.entries(ROLE_LABEL).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div></div>
        <div class="field"><label for="pDesc">Description</label><textarea id="pDesc" name="description" maxlength="500" style="min-height:80px"></textarea></div>
        <div class="field"><span class="label">Permissions</span><div id="permBox"></div></div>
        <div class="btn-row"><button class="btn primary" type="submit">Create profile</button><a class="btn ghost" href="#/admin/profiles">Cancel</a></div></form>`;
    const form = document.getElementById('pfForm');
    const drawPerms = () => {
      document.getElementById('permBox').innerHTML = `<div class="checks" style="flex-direction:column;align-items:flex-start">${catalogue[form.role.value].map((p) => `<label class="check"><input type="checkbox" name="permissions" value="${p.code}" checked>${esc(p.label)} <span class="muted small">${p.code}</span></label>`).join('')}</div>`;
    };
    form.role.addEventListener('change', drawPerms);
    drawPerms();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      await UI.submitting(form.querySelector('button[type=submit]'), document.getElementById('pfErr'), async () => {
        const perms = fd.getAll('permissions');
        if (!perms.length) throw new Error('Select at least one permission.');
        const r = await API.post('/api/admin/profiles', { name: fd.get('name'), role: fd.get('role'), description: fd.get('description'), permissions: perms });
        UI.toast(r.message); location.hash = `#/admin/profiles/${r.profile.profile_id}`;
      });
    });
  };

  // ---------- ProfileDetailsPage (stories 13, 14, 15) ----------
  V.adminProfileDetail = async function adminProfileDetail(id) {
    const main = await shell('profiles');
    const p = await API.get(`/api/admin/profiles/${id}`);
    const own = p.name === App.user.profileName;
    main.innerHTML = `<div class="dash-head"><div><p class="small"><a href="#/admin/profiles">User profiles</a></p><h1>${esc(p.name)}</h1>
      <p class="muted">${ROLE_LABEL[p.role]} role, ${p.account_count} account(s). ${p.is_suspended ? '<span class="tag danger">suspended</span>' : ''}</p></div>
      ${own ? '' : `<button class="btn ${p.is_suspended ? 'primary' : 'danger'}" id="tgProfile">${p.is_suspended ? 'Reactivate profile' : 'Suspend profile'}</button>`}</div>
      <div class="panel-grid">
        <div class="panel"><h3>Current permissions</h3><ul class="list-plain">${p.permission_details.map((x) => `<li>${esc(x.label)}<br><span class="small muted">${x.code}</span></li>`).join('')}</ul></div>
        <form id="peForm" class="panel" novalidate><h3>Update profile</h3><div id="peErr"></div>
          <div class="field"><label for="peName">Profile name</label><input id="peName" name="name" value="${esc(p.name)}" required></div>
          <div class="field"><label for="peDesc">Description</label><textarea id="peDesc" name="description" style="min-height:80px">${esc(p.description)}</textarea></div>
          <div class="field"><span class="label">Permissions</span><div class="checks" style="flex-direction:column;align-items:flex-start">
            ${p.available_permissions.map((x) => `<label class="check"><input type="checkbox" name="permissions" value="${x.code}" ${p.permissions.includes(x.code) ? 'checked' : ''}>${esc(x.label)}</label>`).join('')}</div></div>
          <button class="btn primary" type="submit">Save profile</button></form>
      </div>`;
    const tg = document.getElementById('tgProfile');
    if (tg) tg.addEventListener('click', () => toggleProfile(p, () => V.adminProfileDetail(id)));
    const form = document.getElementById('peForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      await UI.submitting(form.querySelector('button[type=submit]'), document.getElementById('peErr'), async () => {
        const r = await API.put(`/api/admin/profiles/${id}`, { name: fd.get('name'), description: fd.get('description'), permissions: fd.getAll('permissions') });
        UI.toast(r.message); V.adminProfileDetail(id);
      });
    });
  };

  // ---------- AdminOverviewPage ----------
  const ACTION_TAG = { create: 'olive', approve: 'olive', reactivate: 'olive', update: '', reset_password: 'warn', suspend: 'danger', reject: 'danger' };
  const actionTag = (action, label) => `<span class="tag ${ACTION_TAG[action.split('.')[1]] ?? ''}">${esc(label)}</span>`;
  const ago = (d) => {
    const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
    return UI.date(d);
  };
  const feed = (items) => (items.length ? `<ul class="feed">${items.map((x) => `<li><span>${actionTag(x.action, x.action_label || x.action)} ${esc(x.summary)}</span>
      <span class="when" title="${esc(UI.dateTime(x.created_at))}">${ago(x.created_at)}</span><span class="who">by ${esc(x.actor_name || 'a removed account')}</span></li>`).join('')}</ul>`
    : '<p class="muted small">No admin changes have been recorded yet. Approvals, suspensions and profile edits will appear here.</p>');

  V.adminOverview = async function adminOverview() {
    const main = await shell('overview');
    const [o, activity] = await Promise.all([API.get('/api/admin/overview'), API.get('/api/admin/activity', { pageSize: 6 })]);
    const t = o.totals;
    const trend = o.signup_trend;
    main.innerHTML = `<div class="dash-head"><div><span class="eyebrow">User admin</span><h1>Overview</h1><p class="muted">Accounts, approvals and recent changes across DesignMatch.</p></div>
      <div class="btn-row"><a class="btn ghost" href="#/admin/accounts">Manage accounts</a><a class="btn primary" href="#/admin/accounts/new">Create account</a></div></div>
      <div class="stat-row">
        <a class="stat" href="#/admin/accounts"><div class="v">${t.total_accounts}</div><div class="l">Accounts</div></a>
        <a class="stat" href="#/admin/accounts?status=suspended"><div class="v">${t.suspended_accounts}</div><div class="l">Suspended</div></a>
        <a class="stat ${t.pending_registrations ? 'alert' : ''}" href="#/admin/registrations"><div class="v" id="ovPending">${t.pending_registrations}</div><div class="l">Awaiting approval</div></a>
        <div class="stat"><div class="v">${t.new_last_7_days}</div><div class="l">Joined in 7 days</div></div>
        <div class="stat"><div class="v">${t.logins_last_7_days}</div><div class="l">Active in 7 days</div></div>
      </div>
      <div class="panel-grid">
        <div>
          <div class="panel"><div class="panel-head"><h3>Designer approvals</h3><a href="#/admin/registrations">Open queue</a></div><div id="ovQueue"></div></div>
          <div class="panel"><div class="panel-head"><h3>New accounts, last 30 days</h3></div>
            ${UI.lineChart(trend.map((d) => d.day.slice(5)), [{ name: 'Customers', values: trend.map((d) => d.customers), color: '#56633f' }, { name: 'Designers', values: trend.map((d) => d.designers), color: '#8a5a3b' }], { height: 190 })}</div>
          <div class="panel"><div class="panel-head"><h3>Recent changes</h3><a href="#/admin/activity">Full activity log</a></div>${feed(activity.results)}</div>
        </div>
        <div>
          <div class="panel"><h3>Accounts by role</h3>${UI.barList(o.by_role.map((r) => ({ label: ROLE_LABEL[r.role] || r.role, value: r.accounts })))}
            <p class="small muted" style="margin:16px 0 0">${t.temporary_passwords} account${t.temporary_passwords === 1 ? '' : 's'} must change a temporary password. ${t.suspended_profiles} user profile${t.suspended_profiles === 1 ? ' is' : 's are'} suspended.</p></div>
          <div class="panel"><div class="panel-head"><h3>Newest accounts</h3><a href="#/admin/accounts">All accounts</a></div>
            <ul class="feed">${o.recent_signups.map((a) => `<li><a href="#/admin/accounts/${a.account_id}"><strong>${esc(a.full_name)}</strong></a><span class="when">${ago(a.created_at)}</span>
              <span class="who">${esc(ROLE_LABEL[a.role] || a.role)}${a.registration_status && a.registration_status !== 'approved' ? `, ${esc(a.registration_status)}` : ''}${a.status === 'suspended' ? ', suspended' : ''}</span></li>`).join('')}</ul></div>
        </div>
      </div>`;

    // Approval queue with one-click approve; the sidebar badge and the tile update straight away
    async function drawQueue() {
      const box = document.getElementById('ovQueue');
      if (!box) return;
      const r = await API.get('/api/admin/registrations', { status: 'pending', pageSize: 4 });
      document.getElementById('ovPending').textContent = r.total;
      document.getElementById('ovPending').closest('.stat').classList.toggle('alert', r.total > 0);
      box.innerHTML = r.results.length ? r.results.map((d) => `<div class="queue-item"><div><strong>${esc(d.company_name || d.full_name)}</strong>
          <span class="muted">${esc(d.full_name)}, licence ${esc(d.license_number || 'not given')}, ${d.years_experience} years. Applied ${ago(d.registered_at)}.</span></div>
          <div class="btn-row"><button class="btn primary sm" data-approve="${d.designer_id}" data-name="${esc(d.full_name)}">Approve</button><a class="btn ghost sm" href="#/admin/registrations">Review</a></div></div>`).join('')
        + (r.total > r.results.length ? `<p class="small muted" style="margin:12px 0 0">${r.total - r.results.length} more waiting in the queue.</p>` : '')
        : '<p class="muted small" style="margin:0">No applications are waiting. New designer registrations will appear here.</p>';
      box.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', async () => {
        if (!(await UI.confirm(`Approve ${b.dataset.name}? They will be able to log in and their projects will become public.`, { title: 'Approve registration', confirmLabel: 'Approve' }))) return;
        try { const res = await API.post(`/api/admin/registrations/${b.dataset.approve}/approve`); UI.toast(res.message); drawQueue(); } catch (e) { UI.toast(e.message, 'error'); }
      }));
    }
    const onCount = (e) => {
      if (!document.getElementById('ovQueue')) { window.removeEventListener('dm:count', onCount); return; }
      if (e.detail.key === 'regs' && String(e.detail.value) !== document.getElementById('ovPending').textContent) drawQueue();
    };
    window.addEventListener('dm:count', onCount);
    drawQueue();
  };

  // ---------- ActivityLogPage ----------
  V.adminActivity = async function adminActivity() {
    const main = await shell('activity');
    const st = { q: '', action: '', page: 1 };
    main.innerHTML = `<div class="dash-head"><div><span class="eyebrow">Access</span><h1>Activity log</h1><p class="muted">Every change made by a User Admin, newest first. Entries cannot be edited or deleted.</p></div></div>
      <form class="toolbar" id="actSearch" role="search">
        <input type="search" name="q" placeholder="Search names or details" aria-label="Search activity">
        <select name="action" aria-label="Type of change"><option value="">All changes</option>
          <option value="account.">Accounts</option><option value="registration.">Designer approvals</option><option value="profile.">User profiles</option>
          <option disabled>-----</option>
          <option value="account.create">Accounts created</option><option value="account.suspend">Accounts suspended</option><option value="account.reactivate">Accounts reactivated</option>
          <option value="account.reset_password">Passwords reset</option><option value="registration.approve">Designers approved</option><option value="registration.reject">Designers rejected</option></select>
        <button class="btn sm" type="submit">Search</button></form>
      <div id="actBox">${UI.loading()}</div><nav class="pagination" id="actPager"></nav>`;
    const form = document.getElementById('actSearch');
    async function load() {
      const box = document.getElementById('actBox');
      box.innerHTML = UI.loading();
      try {
        const r = await API.get('/api/admin/activity', { ...st, pageSize: 20 });
        box.innerHTML = r.results.length ? `<div class="table-wrap"><table><thead><tr><th>When</th><th>Change</th><th>Details</th><th>Admin</th><th></th></tr></thead><tbody>
          ${r.results.map((x) => `<tr><td style="white-space:nowrap">${UI.dateTime(x.created_at)}</td><td>${actionTag(x.action, x.action_label)}</td><td>${esc(x.summary)}</td>
            <td>${esc(x.actor_name || 'Removed account')}</td>
            <td><div class="row-actions">${x.target_type === 'account' && x.target_id ? `<a class="btn ghost sm" href="#/admin/accounts/${x.target_id}">Account</a>` : ''}
              ${x.target_type === 'registration' && x.target_id ? `<a class="btn ghost sm" href="#/admin/accounts/${x.target_id}">Designer</a>` : ''}
              ${x.target_type === 'profile' && x.target_id ? `<a class="btn ghost sm" href="#/admin/profiles/${x.target_id}">Profile</a>` : ''}</div></td></tr>`).join('')}
          </tbody></table></div>` : UI.empty('No activity found', st.q || st.action ? 'Nothing matches this search.' : 'Changes made in the admin console will be listed here.');
        UI.pagination(document.getElementById('actPager'), r, (p) => { st.page = p; load(); });
      } catch (e) { box.innerHTML = UI.errorBox(e.message); }
    }
    form.addEventListener('submit', (e) => { e.preventDefault(); Object.assign(st, UI.formObject(form), { page: 1 }); load(); });
    form.querySelector('select[name=action]').addEventListener('change', () => { Object.assign(st, UI.formObject(form), { page: 1 }); load(); });
    load();
  };
})();
