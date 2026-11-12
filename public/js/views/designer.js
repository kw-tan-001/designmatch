/* Interior Designer studio. UI boundary classes: DesignerDashboardPage (27), PortfolioPage (22-26, 32),
   CreateIDPListingForm / EditIDPListingForm (21, 23, 24, 33), OwnIDPPage (31), CompanyProfileForm (18-20, 29),
   IDPAnalyticsPage (25, 26), EnquiriesPage (34), CompanyPreviewPage (30). */
(function () {
  'use strict';

  const { esc } = UI;
  const V = window.Views = window.Views || {};
  const REGIONS = ['Central', 'East', 'North', 'North-East', 'West'];
  const OLIVE = '#5e6b4e';
  const STONE = '#b39b7a';

  async function shell(active, title) {
    let newCount = 0;
    try { newCount = (await API.get('/api/designer/enquiries', { status: 'new', pageSize: 1 })).total; } catch (_) { /* ignore */ }
    return App.dash(title || 'My studio', [
      { key: 'dash', href: '#/studio', label: 'Performance' },
      { key: 'portfolio', href: '#/studio/portfolio', label: 'Portfolio' },
      { key: 'new', href: '#/studio/idp/new', label: 'Add a project' },
      { key: 'analytics', href: '#/studio/analytics', label: 'Views and shortlists' },
      { key: 'enquiries', href: '#/studio/enquiries', label: 'Enquiries', count: newCount },
      { key: 'company', href: '#/studio/company', label: 'Company profile' },
      { key: 'preview', href: '#/studio/preview', label: 'Preview as customer' },
    ], active);
  }

  // ---------- DesignerDashboardPage (story 27) ----------
  V.studioDashboard = async function studioDashboard() {
    const main = await shell('dash');
    const d = await API.get('/api/designer/dashboard');
    const labels = d.trend.map((t) => t.day.slice(5));
    main.innerHTML = `<div class="dash-head"><div><h1>Performance</h1><p class="muted">Engagement across all ${d.total_idps} projects in your portfolio.</p></div>
      <a class="btn primary" href="#/studio/idp/new">Add a project</a></div>
      <div class="stat-row">
        <div class="stat"><div class="v">${d.total_idps}</div><div class="l">${d.current_idps} in progress, ${d.past_idps} completed</div></div>
        <div class="stat"><div class="v">${d.total_views}</div><div class="l">Project views</div></div>
        <div class="stat"><div class="v">${d.total_favourites}</div><div class="l">Times shortlisted</div></div>
        <div class="stat"><div class="v">${d.shortlist_rate}%</div><div class="l">Shortlists per view</div></div>
        <div class="stat"><div class="v">${d.total_enquiries}</div><div class="l">${d.new_enquiries} unread enquiries</div></div>
      </div>
      <div class="panel-grid">
        <div class="panel"><h3>Last 14 days</h3>${UI.lineChart(labels, [
          { name: 'Views', values: d.trend.map((t) => t.views), color: OLIVE },
          { name: 'Shortlists', values: d.trend.map((t) => t.favourites), color: STONE }])}</div>
        <div class="panel"><h3>Projects by category</h3>${UI.barList(d.by_category.map((c) => ({ label: c.category, value: c.idp_count })))}</div>
      </div>
      <div class="panel"><h3>Most viewed projects</h3>
        ${d.top_idps.length ? `<div class="table-wrap"><table><thead><tr><th>Project</th><th class="num">Views</th><th class="num">Shortlists</th><th class="num">Enquiries</th></tr></thead><tbody>
        ${d.top_idps.map((i) => `<tr><td><a href="#/studio/idp/${i.idp_id}">${esc(i.title)}</a></td><td class="num">${i.view_count}</td><td class="num">${i.favourite_count}</td><td class="num">${i.enquiry_count}</td></tr>`).join('')}
        </tbody></table></div>` : UI.empty('No projects yet', 'Add your first project to start tracking interest.', '<a class="btn primary" href="#/studio/idp/new">Add a project</a>')}</div>`;
  };

  // ---------- PortfolioPage (stories 22, 23, 24, 25, 26, 32) ----------
  V.studioPortfolio = async function studioPortfolio() {
    const main = await shell('portfolio');
    const meta = await App.getMeta();
    const st = { q: '', status: '', categoryId: '', sort: 'newest', page: 1 };
    main.innerHTML = `<div class="dash-head"><div><h1>Portfolio</h1><p class="muted">Search, organise and update your projects.</p></div><a class="btn primary" href="#/studio/idp/new">Add a project</a></div>
      <form class="toolbar" id="pfForm" role="search">
        <input type="search" name="q" placeholder="Search your projects" aria-label="Search your projects">
        <select name="status" aria-label="Status"><option value="">All statuses</option><option value="current">In progress</option><option value="past">Completed</option></select>
        <select name="categoryId" aria-label="Category"><option value="">All categories</option>${meta.categories.map((c) => `<option value="${c.category_id}">${esc(c.name)}</option>`).join('')}<option value="none">Uncategorised</option></select>
        <select name="sort" aria-label="Sort"><option value="newest">Newest</option><option value="most_viewed">Most viewed</option><option value="most_favourited">Most shortlisted</option><option value="oldest">Oldest</option></select>
        <button class="btn sm" type="submit">Search</button></form>
      <div id="pfList">${UI.loading()}</div><nav class="pagination" id="pfPager" aria-label="Pagination"></nav>`;
    const form = document.getElementById('pfForm');
    const list = document.getElementById('pfList');
    async function load() {
      list.innerHTML = UI.loading();
      const r = await API.get('/api/designer/idps', { ...st, pageSize: 10 });
      if (!r.results.length) {
        list.innerHTML = st.q || st.status || st.categoryId ? UI.empty('No projects match', 'Try a different search or clear the filters.')
          : UI.empty('Your portfolio is empty', 'Add photos and details of a project to show customers your work.', '<a class="btn primary" href="#/studio/idp/new">Add a project</a>');
        document.getElementById('pfPager').innerHTML = '';
        return;
      }
      list.innerHTML = `<p class="muted small">${r.total} project${r.total === 1 ? '' : 's'}</p><div class="table-wrap"><table>
        <thead><tr><th></th><th>Project</th><th>Category</th><th>Status</th><th class="num">Views</th><th class="num">Shortlists</th><th class="num">Enquiries</th><th></th></tr></thead><tbody>
        ${r.results.map((i) => `<tr data-id="${i.idp_id}">
          <td><img class="thumb" src="${esc(i.cover_url || UI.PLACEHOLDER)}" alt=""></td>
          <td><a href="#/studio/idp/${i.idp_id}"><strong>${esc(i.title)}</strong></a><br><span class="small muted">${esc(i.location)}, ${UI.budget(i.budget_min, i.budget_max)}</span></td>
          <td><select data-cat aria-label="Category for ${esc(i.title)}">${i.category_id ? '' : '<option value="">Uncategorised</option>'}${meta.categories.map((c) => `<option value="${c.category_id}" ${c.category_id === i.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></td>
          <td><select data-status aria-label="Status for ${esc(i.title)}"><option value="current" ${i.status === 'current' ? 'selected' : ''}>In progress</option><option value="past" ${i.status === 'past' ? 'selected' : ''}>Completed</option></select></td>
          <td class="num">${i.view_count}</td><td class="num">${i.favourite_count}</td><td class="num">${i.enquiry_count}</td>
          <td><div class="row-actions"><a class="btn ghost sm" href="#/studio/idp/${i.idp_id}/edit">Edit</a><button class="btn danger sm" data-del="${esc(i.title)}">Delete</button></div></td></tr>`).join('')}
        </tbody></table></div>`;
      list.querySelectorAll('tr[data-id]').forEach((tr) => {
        const id = tr.dataset.id;
        tr.querySelector('[data-cat]').addEventListener('change', async (e) => {
          try { const res = await API.patch(`/api/designer/idps/${id}/category`, { categoryId: Number(e.target.value) }); UI.toast(res.message); } catch (err) { UI.toast(err.message, 'error'); }
        });
        tr.querySelector('[data-status]').addEventListener('change', async (e) => {
          try { const res = await API.patch(`/api/designer/idps/${id}/status`, { status: e.target.value }); UI.toast(res.message); } catch (err) { UI.toast(err.message, 'error'); }
        });
        tr.querySelector('[data-del]').addEventListener('click', async (e) => {
          if (!(await UI.confirm(`Delete "${e.target.dataset.del}"? Its photos, views, shortlists and enquiries will also be removed. This cannot be undone.`, { title: 'Delete project', confirmLabel: 'Delete project', danger: true }))) return;
          try { const res = await API.del(`/api/designer/idps/${id}`); UI.toast(res.message); load(); } catch (err) { UI.toast(err.message, 'error'); }
        });
      });
      UI.pagination(document.getElementById('pfPager'), r, (p) => { st.page = p; load(); });
    }
    form.addEventListener('submit', (e) => { e.preventDefault(); Object.assign(st, UI.formObject(form), { page: 1 }); load(); });
    form.querySelectorAll('select').forEach((s) => s.addEventListener('change', () => { Object.assign(st, UI.formObject(form), { page: 1 }); load(); }));
    load();
  };

  // ---------- Create / Edit IDP listing (stories 21, 23, 24, 33) ----------
  V.studioIdpForm = async function studioIdpForm(id) {
    const main = await shell(id ? 'portfolio' : 'new');
    const meta = await App.getMeta();
    const idp = id ? await API.get(`/api/designer/idps/${id}`) : null;
    const val = (k, d = '') => esc(idp ? (idp[k] ?? d) : d);
    main.innerHTML = `<div class="dash-head"><div><h1>${idp ? 'Edit project' : 'Add a project'}</h1>
      <p class="muted">${idp ? `Last updated ${UI.dateTime(idp.updated_at)}.` : 'Projects appear on the public site as soon as you publish them.'}</p></div>
      ${idp ? `<a class="btn ghost" href="#/idp/${idp.idp_id}">View public page</a>` : ''}</div>
      <form id="idpForm" class="form-card" novalidate enctype="multipart/form-data"><div id="idpErr"></div>
        <div class="field"><label for="iTitle">Project title</label><input id="iTitle" name="title" value="${val('title')}" required maxlength="150" placeholder="e.g. Japandi Kitchen Refresh in Tampines"></div>
        <div class="field"><label for="iDesc">Description</label><textarea id="iDesc" name="description" required maxlength="5000" placeholder="The brief, the design approach and the materials used">${val('description')}</textarea><span class="hint">At least 20 characters.</span></div>
        <div class="grid-3">
          <div class="field"><label for="iCat">Category</label><select id="iCat" name="categoryId" required><option value="">Choose a category</option>${meta.categories.map((c) => `<option value="${c.category_id}" ${idp && idp.category_id === c.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
          <div class="field"><label for="iStatus">Status</label><select id="iStatus" name="status"><option value="current">In progress (current)</option><option value="past" ${idp && idp.status === 'past' ? 'selected' : ''}>Completed (past)</option></select></div>
          <div class="field"><label for="iLoc">Location</label><input id="iLoc" name="location" list="locList" value="${val('location')}" required><datalist id="locList">${meta.locations.map((l) => `<option value="${esc(l)}">`).join('')}</datalist></div>
          <div class="field"><label for="iMin">Budget from (S$)</label><input id="iMin" name="budgetMin" type="number" min="0" step="1000" value="${val('budget_min')}" required></div>
          <div class="field"><label for="iMax">Budget to (S$)</label><input id="iMax" name="budgetMax" type="number" min="0" step="1000" value="${val('budget_max')}" required></div>
          <div class="field"><label for="iType">Property type</label><select id="iType" name="propertyTypeId"><option value="">Not specified</option>${meta.property_types.map((p) => `<option value="${p.property_type_id}" ${idp && idp.property_type_id === p.property_type_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
        </div>
        <div class="field"><span class="label">Design styles (up to 5)</span><div class="checks">${meta.styles.map((s) => `<label class="check"><input type="checkbox" name="styleIds" value="${s.style_id}" ${idp && idp.style_ids.includes(s.style_id) ? 'checked' : ''}>${esc(s.name)}</label>`).join('')}</div></div>
        ${idp ? `<div class="field"><span class="label">Current photos</span><span class="hint">Tick a photo to remove it when you save.</span><div class="photo-edit">${idp.photos.map((p) => `<label><img src="${esc(p.url)}" alt="${esc(p.caption)}"><input type="checkbox" name="removePhotoIds" value="${p.photo_id}" aria-label="Remove photo"><span class="rm">Remove</span></label>`).join('')}</div></div>` : ''}
        <div class="field"><label for="iPhotos">${idp ? 'Add photos' : 'Photos'}</label><input id="iPhotos" name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple>
          <span class="hint">JPEG, PNG or WebP, up to 5 MB each, 10 photos per project.${idp ? '' : ' At least one photo is required.'}</span><div class="photo-edit" id="newPreview" style="margin-top:8px"></div></div>
        <div class="field"><label for="iUrls">Or image links (optional)</label><input id="iUrls" name="photoUrlsText" type="url" placeholder="https://example.com/photo.jpg"><span class="hint">Separate several links with spaces.</span></div>
        <div class="btn-row"><button class="btn primary" type="submit">${idp ? 'Save changes' : 'Publish project'}</button><a class="btn ghost" href="${idp ? `#/studio/idp/${idp.idp_id}` : '#/studio/portfolio'}">Cancel</a></div>
      </form>`;
    const form = document.getElementById('idpForm');
    const fileInput = document.getElementById('iPhotos');
    fileInput.addEventListener('change', () => {
      const prev = document.getElementById('newPreview');
      prev.innerHTML = '';
      [...fileInput.files].forEach((f) => {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(f); img.alt = f.name;
        prev.appendChild(img);
      });
    });
    // auto-description from design styles
    const _descEl = document.getElementById('iDesc');
    const _DESC = {
      'Modern': 'This project brings a clean, contemporary aesthetic to the space. We focused on straight lines, neutral tones and functional furniture to create a living environment that feels open and uncluttered.',
      'Minimalist': 'Simplicity is the guiding principle here. Every element earns its place — stripped-back finishes, a restrained palette and carefully chosen materials work together to create a calm, purposeful space.',
      'Scandinavian': 'Warmth meets function in this Scandinavian-inspired design. Light wood tones, cosy textiles and an abundance of natural light set the tone, while smart storage keeps the space tidy and welcoming.',
      'Japandi': 'This design blends Japanese minimalism with Scandinavian warmth. Wabi-sabi principles guide the material choices — natural textures, muted earthy tones and handcrafted details that reward a closer look.',
      'Industrial': 'Exposed structural elements, raw concrete and aged metal give this space an honest, urban character. Soft furnishings and warm lighting are introduced to balance the harder finishes.',
      'Contemporary': 'The design responds to current trends while remaining timeless. A mix of textures, a confident use of colour accents and bespoke joinery give the space a polished, up-to-date feel.',
      'Mid-Century Modern': 'Iconic mid-century forms meet modern living requirements. Tapered legs, organic curves and a warm wood-and-leather palette pay homage to the period without feeling like a museum piece.',
      'Luxury': 'No detail was left unconsidered. Premium materials — marble, lacquered cabinetry and statement lighting — are layered to create a space that feels indulgent yet refined.',
      'Rustic': 'Natural imperfection is celebrated throughout. Reclaimed timber, stone surfaces and a warm, earthy palette bring an authentic, lived-in character that feels both grounded and inviting.',
      'Peranakan': 'Vibrant Peranakan heritage is woven into every corner. Hand-painted tiles, jewel-toned upholstery and intricate carved details tell a story of culture and craftsmanship passed down through generations.',
    };
    const _MULTI = {
      'Japandi+Minimalist': 'Restraint is the common thread between Japandi and Minimalist sensibilities. The result is a serene space where every surface and object is chosen with intention — quiet, deliberate and deeply considered.',
      'Minimalist+Modern': 'Clean geometry and an uncluttered plan define this project. Modern proportions and minimalist discipline combine to produce a space that is both visually crisp and highly liveable.',
      'Minimalist+Scandinavian': 'Scandinavian warmth tempers the austerity of the minimalist approach. The outcome is a space that feels edited but never cold — practical, light-filled and genuinely comfortable.',
      'Contemporary+Luxury': 'Contemporary confidence meets luxury execution. The design is current and bold in its composition, elevated by premium finishes and bespoke elements that make an immediate impression.',
      'Industrial+Modern': 'Industrial honesty and modern precision make for a compelling combination. Structural rawness is disciplined by clean lines and a carefully controlled material palette.',
    };
    if (!id) {
      document.querySelectorAll('input[name=styleIds]').forEach((cb) => cb.addEventListener('change', () => {
        if (_descEl.value.trim().length > 10 && _descEl.dataset.auto !== '1') return;
        const sel = [...document.querySelectorAll('input[name=styleIds]:checked')].map((c) => c.closest('label').textContent.trim());
        if (!sel.length) { _descEl.value = ''; _descEl.dataset.auto = ''; return; }
        const parts = sel.map((s) => _DESC[s]).filter(Boolean);
        const txt = parts.join(' ');
        if (txt) { _descEl.value = txt; _descEl.dataset.auto = '1'; }
      }));
      _descEl.addEventListener('input', () => { if (!_descEl.value.trim()) _descEl.dataset.auto = ''; });
    }
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('idpErr');
      const checked = form.querySelectorAll('input[name=styleIds]:checked').length;
      if (checked > 5) { errEl.innerHTML = UI.errorBox('Choose at most 5 design styles.'); return; }
      if (Number(form.budgetMax.value) < Number(form.budgetMin.value)) { errEl.innerHTML = UI.errorBox('Budget "to" must be at least the budget "from".'); return; }
      const fd = new FormData(form);
      const urls = (fd.get('photoUrlsText') || '').split(/\s+/).filter(Boolean);
      fd.delete('photoUrlsText');
      urls.forEach((u) => fd.append('photoUrls', u));
      if (!fd.getAll('styleIds').length) fd.append('styleIds', '[]');
      if (!idp && !fileInput.files.length && !urls.length) { errEl.innerHTML = UI.errorBox('Please add at least one photo of the project.'); return; }
      await UI.submitting(form.querySelector('button[type=submit]'), errEl, async () => {
        const r = idp ? await API.send('PUT', `/api/designer/idps/${idp.idp_id}`, fd) : await API.send('POST', '/api/designer/idps', fd);
        UI.toast(r.message);
        location.hash = `#/studio/idp/${r.idp.idp_id}`;
      });
    });
  };

  // ---------- OwnIDPPage (stories 31, 33) ----------
  V.studioIdpView = async function studioIdpView(id) {
    const main = await shell('portfolio');
    const meta = await App.getMeta();
    const idp = await API.get(`/api/designer/idps/${id}`);
    main.innerHTML = `<div class="dash-head"><div><p class="small"><a href="#/studio/portfolio">Portfolio</a></p><h1>${esc(idp.title)}</h1>
      <p class="muted">${esc(idp.category_name)} in ${esc(idp.location)}. Listed ${UI.date(idp.created_at)}.</p></div>
      <div class="btn-row"><a class="btn ghost" href="#/idp/${idp.idp_id}">View public page</a><a class="btn" href="#/studio/idp/${idp.idp_id}/edit">Edit</a></div></div>
      <div class="stat-row">
        <div class="stat"><div class="v">${idp.view_count}</div><div class="l">Views</div></div>
        <div class="stat"><div class="v">${idp.favourite_count}</div><div class="l">Shortlists</div></div>
        <div class="stat"><div class="v">${idp.enquiry_count}</div><div class="l">Enquiries</div></div>
        <div class="stat"><div class="v" style="font-size:1.4rem;padding-top:10px">${idp.status === 'past' ? 'Completed' : 'In progress'}</div><div class="l">Status</div></div>
      </div>
      <div class="panel-grid">
        <div class="panel"><div class="photo-edit" style="margin-bottom:16px">${idp.photos.map((p) => `<img src="${esc(p.url)}" alt="${esc(p.caption)}">`).join('')}</div>
          <dl class="kv"><dt>Budget</dt><dd>${UI.money(idp.budget_min)} to ${UI.money(idp.budget_max)}</dd><dt>Property type</dt><dd>${esc(idp.property_type_name || 'Not specified')}</dd>
          <dt>Design styles</dt><dd>${esc((idp.styles || []).join(', ') || 'None')}</dd></dl>
          <p style="white-space:pre-line;margin-top:16px">${esc(idp.description)}</p></div>
        <div class="panel"><h3>Tags</h3><p class="muted small">Help customers find this project with style and property filters.</p>
          <form id="tagForm"><div id="tagErr"></div>
            <div class="field"><label for="tType">Property type</label><select id="tType" name="propertyTypeId"><option value="">Not specified</option>${meta.property_types.map((p) => `<option value="${p.property_type_id}" ${idp.property_type_id === p.property_type_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
            <div class="field"><span class="label">Design styles</span><div class="checks">${meta.styles.map((s) => `<label class="check"><input type="checkbox" name="styleIds" value="${s.style_id}" ${idp.style_ids.includes(s.style_id) ? 'checked' : ''}>${esc(s.name)}</label>`).join('')}</div></div>
            <button class="btn primary" type="submit">Save tags</button></form></div>
      </div>`;
    const form = document.getElementById('tagForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      await UI.submitting(form.querySelector('button'), document.getElementById('tagErr'), async () => {
        const r = await API.put(`/api/designer/idps/${id}/tags`, { styleIds: fd.getAll('styleIds').map(Number), propertyTypeId: fd.get('propertyTypeId') ? Number(fd.get('propertyTypeId')) : null });
        UI.toast(r.message);
        V.studioIdpView(id);
      });
    });
  };

  // ---------- CompanyProfileForm (stories 18, 19, 20, 29) ----------
  V.studioCompany = async function studioCompany() {
    const main = await shell('company');
    const [{ company, certifications }, pro] = await Promise.all([API.get('/api/designer/company'), API.get('/api/designer/profile')]);
    const c = company || { service_areas: [] };
    const extraAreas = (c.service_areas || []).filter((a) => !REGIONS.includes(a));
    main.innerHTML = `<div class="dash-head"><div><h1>Company profile</h1><p class="muted">What customers see on your studio page.</p></div><a class="btn ghost" href="#/studio/preview">Preview as customer</a></div>
      <div class="panel-grid">
        <form id="coForm" class="form-card" novalidate enctype="multipart/form-data"><div id="coErr"></div><h3>Studio details</h3>
          <div class="designer-line"><div class="logo lg">${c.logo_url ? `<img src="${esc(c.logo_url)}" alt="Current logo">` : UI.initials(c.company_name)}</div>
            <div class="field" style="margin:0;flex:1"><label for="coLogo">Logo</label><input id="coLogo" name="logo" type="file" accept="image/jpeg,image/png,image/webp">
            ${c.logo_url ? '<label class="small"><input type="checkbox" name="removeLogo" value="true"> Remove current logo</label>' : ''}</div></div>
          <div class="field"><label for="coName">Company name</label><input id="coName" name="companyName" value="${esc(c.company_name || '')}" required></div>
          <div class="field"><label for="coDesc">Description</label><textarea id="coDesc" name="description" maxlength="3000">${esc(c.description || '')}</textarea></div>
          <div class="grid-2"><div class="field"><label for="coEmail">Contact email</label><input id="coEmail" name="contactEmail" type="email" value="${esc(c.contact_email || '')}"></div>
            <div class="field"><label for="coPhone">Contact phone</label><input id="coPhone" name="contactPhone" type="tel" value="${esc(c.contact_phone || '')}"></div>
            <div class="field"><label for="coWeb">Website</label><input id="coWeb" name="website" type="url" value="${esc(c.website || '')}" placeholder="https://"></div>
            <div class="field"><label for="coAddr">Office address</label><input id="coAddr" name="address" value="${esc(c.address || '')}"></div></div>
          <div class="field"><span class="label">Service areas</span><div class="checks">${REGIONS.map((r) => `<label class="check"><input type="checkbox" name="serviceAreas" value="${r}" ${(c.service_areas || []).includes(r) ? 'checked' : ''}>${r}</label>`).join('')}</div></div>
          <div class="field"><label for="coMore">Other areas (comma separated)</label><input id="coMore" name="moreAreas" value="${esc(extraAreas.join(', '))}" placeholder="e.g. Sentosa, Johor Bahru"></div>
          <button class="btn primary" type="submit">Save company profile</button></form>
        <div>
          <div class="panel"><h3>Certifications and qualifications</h3>
            <ul class="list-plain" id="certList">${certifications.map((x) => `<li class="btn-row" style="justify-content:space-between"><span><strong>${esc(x.title)}</strong><br><span class="small muted">${esc(x.issuer)}${x.year_obtained ? `, ${x.year_obtained}` : ''}</span></span>
              <button class="btn danger sm" data-cert="${x.certification_id}">Remove</button></li>`).join('') || '<li class="muted small">No certifications added yet.</li>'}</ul>
            <form id="certForm" style="margin-top:14px" novalidate><div id="certErr"></div>
              <div class="field"><label for="ctTitle">Title</label><input id="ctTitle" name="title" required placeholder="e.g. CaseTrust Accreditation"></div>
              <div class="grid-2"><div class="field"><label for="ctIss">Issued by</label><input id="ctIss" name="issuer" required></div>
                <div class="field"><label for="ctYr">Year</label><input id="ctYr" name="yearObtained" type="number" min="1950" max="${new Date().getFullYear()}"></div></div>
              <button class="btn sm" type="submit">Add certification</button></form></div>
          <div class="panel"><h3>Professional details</h3>
            <form id="proForm" novalidate><div id="proErr"></div>
              <div class="grid-2"><div class="field"><label for="prLic">Licence number</label><input id="prLic" name="licenseNumber" value="${esc(pro.license_number || '')}"></div>
                <div class="field"><label for="prYrs">Years of experience</label><input id="prYrs" name="yearsExperience" type="number" min="0" max="70" value="${esc(pro.years_experience)}"></div></div>
              <div class="field"><label for="prSpec">Specialisation</label><input id="prSpec" name="specialisation" value="${esc(pro.specialisation || '')}"></div>
              <div class="field"><label for="prBio">Professional summary</label><textarea id="prBio" name="bio">${esc(pro.bio || '')}</textarea></div>
              <button class="btn sm" type="submit">Save professional details</button></form></div>
        </div></div>`;
    const coForm = document.getElementById('coForm');
    coForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(coForm);
      const more = (fd.get('moreAreas') || '').split(',').map((s) => s.trim()).filter(Boolean);
      fd.delete('moreAreas');
      fd.delete('serviceAreas');
      const areas = [...new FormData(coForm).getAll('serviceAreas'), ...more];
      fd.append('serviceAreas', JSON.stringify(areas));
      if (!coForm.logo.files.length) fd.delete('logo');
      await UI.submitting(coForm.querySelector('button[type=submit]'), document.getElementById('coErr'), async () => {
        const r = await API.send('PUT', '/api/designer/company', fd);
        UI.toast(r.message);
        V.studioCompany();
      });
    });
    const certForm = document.getElementById('certForm');
    certForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await UI.submitting(certForm.querySelector('button'), document.getElementById('certErr'), async () => {
        const r = await API.post('/api/designer/company/certifications', UI.formObject(certForm));
        UI.toast(r.message); V.studioCompany();
      });
    });
    main.querySelectorAll('[data-cert]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await UI.confirm('Remove this certification from your company profile?', { title: 'Remove certification', confirmLabel: 'Remove', danger: true }))) return;
      try { const r = await API.del(`/api/designer/company/certifications/${b.dataset.cert}`); UI.toast(r.message); V.studioCompany(); } catch (err) { UI.toast(err.message, 'error'); }
    }));
    const proForm = document.getElementById('proForm');
    proForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await UI.submitting(proForm.querySelector('button'), document.getElementById('proErr'), async () => {
        const r = await API.put('/api/designer/profile', UI.formObject(proForm));
        UI.toast(r.message);
      });
    });
  };

  // ---------- IDPAnalyticsPage (stories 25, 26) ----------
  V.studioAnalytics = async function studioAnalytics() {
    const main = await shell('analytics');
    const [views, shorts] = await Promise.all([API.get('/api/designer/analytics/views'), API.get('/api/designer/analytics/shortlists')]);
    main.innerHTML = `<div class="dash-head"><div><h1>Views and shortlists</h1><p class="muted">Counted from every project page view and every time a customer saved a project.</p></div></div>
      <div class="stat-row"><div class="stat"><div class="v">${views.total_views}</div><div class="l">Total views</div></div>
        <div class="stat"><div class="v">${shorts.total_favourites}</div><div class="l">Total shortlists</div></div></div>
      <div class="panel-grid">
        <div class="panel"><h3>Views per project</h3>${UI.barList(views.results.slice(0, 8).map((r) => ({ label: r.title, value: r.view_count })))}</div>
        <div class="panel"><h3>Shortlists per project</h3>${UI.barList(shorts.results.slice(0, 8).map((r) => ({ label: r.title, value: r.favourite_count })))}</div>
      </div>
      <div class="panel"><h3>All projects</h3><div class="table-wrap"><table><thead><tr><th>Project</th><th class="num">Views</th><th class="num">Views (30 days)</th><th>Last viewed</th><th class="num">Shortlists</th><th class="num">Shortlists (30 days)</th></tr></thead><tbody>
        ${views.results.map((r) => { const s = shorts.results.find((x) => x.idp_id === r.idp_id) || {}; return `<tr><td><a href="#/studio/idp/${r.idp_id}">${esc(r.title)}</a></td>
          <td class="num">${r.view_count}</td><td class="num">${r.views_last_30_days}</td><td>${r.last_viewed_at ? UI.date(r.last_viewed_at) : 'Never'}</td>
          <td class="num">${s.favourite_count || 0}</td><td class="num">${s.favourites_last_30_days || 0}</td></tr>`; }).join('') || '<tr><td colspan="6" class="muted">No projects yet.</td></tr>'}
      </tbody></table></div></div>`;
  };

  // ---------- EnquiriesPage (story 34) ----------
  V.studioEnquiries = async function studioEnquiries() {
    const main = await shell('enquiries');
    const st = { status: '', page: 1 };
    main.innerHTML = `<div class="dash-head"><div><h1>Enquiries</h1><p class="muted">Messages customers sent from your project pages.</p></div>
      <select id="enqFilter" aria-label="Filter enquiries" style="width:auto"><option value="">All enquiries</option><option value="new">Unread</option><option value="read">Read</option></select></div>
      <div id="enqBox">${UI.loading()}</div><nav class="pagination" id="enqPager"></nav>`;
    async function load() {
      const box = document.getElementById('enqBox');
      box.innerHTML = UI.loading();
      const r = await API.get('/api/designer/enquiries', { ...st, pageSize: 15 });
      box.innerHTML = r.results.length ? r.results.map((q) => `<div class="panel" style="margin-bottom:14px">
        <div class="btn-row" style="justify-content:space-between"><div><strong>${esc(q.customer_name)}</strong> <span class="muted small">about <a href="#/studio/idp/${q.idp_id}">${esc(q.idp_title)}</a>, ${UI.dateTime(q.created_at)}</span></div>
          ${q.status === 'new' ? `<button class="btn sm" data-read="${q.enquiry_id}">Mark as read</button>` : UI.statusTag('read')}</div>
        <p style="margin:10px 0">${esc(q.message)}</p>
        <p class="small muted" style="margin:0">Reply to <a href="mailto:${esc(q.customer_email)}">${esc(q.customer_email)}</a>${q.contact_phone ? ` or call ${esc(q.contact_phone)}` : ''}</p></div>`).join('')
        : UI.empty('No enquiries here', st.status ? 'Nothing matches this filter.' : 'When customers contact you from a project page, their messages appear here.');
      box.querySelectorAll('[data-read]').forEach((b) => b.addEventListener('click', async () => {
        try { const res = await API.patch(`/api/designer/enquiries/${b.dataset.read}/read`); UI.toast(res.message); load(); } catch (e) { UI.toast(e.message, 'error'); }
      }));
      UI.pagination(document.getElementById('enqPager'), r, (p) => { st.page = p; load(); });
    }
    document.getElementById('enqFilter').addEventListener('change', (e) => { st.status = e.target.value; st.page = 1; load(); });
    load();
  };

  // ---------- CompanyPreviewPage (story 30) ----------
  V.studioPreview = async function studioPreview() {
    App.root.innerHTML = UI.loading();
    V.renderCompanyPage(await API.get('/api/designer/company/preview'), { preview: true });
  };
})();