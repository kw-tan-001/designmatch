/* Public pages: landing, discovery, project details, designer pages, login/registration, account.
   UI boundary classes: HomePage, SearchIDPsPage, IDPDetailsPage, DesignerProfilePage,
   LoginForm, RegisterCustomerForm, RegisterDesignerForm, EditPersonalProfileForm. */
(function () {
  'use strict';

  const { esc } = UI;
  const V = window.Views = window.Views || {};
  const root = () => App.root;

  // ---------------- HomePage ----------------
  const STEPS = [
    ['study-sage', 'Discover', 'Filter real projects by room, budget, property type, style and neighbourhood. Every project shows its actual budget range.'],
    ['kitchen-pantry', 'Shortlist', 'Save the rooms you keep coming back to. Your favourites stay in your account between visits.'],
    ['bathroom-sage', 'Compare studios', 'Open each studio\'s profile to see its experience, certifications, service areas and the rest of its portfolio.'],
    ['dining-sage', 'Make contact', 'Send an enquiry from the project page. The designer sees which project you asked about and replies directly.'],
  ];

  V.home = async function home() {
    root().innerHTML = `<section class="hero"><div class="hero-bg"></div></section>`;
    const [meta, latest, designers] = await Promise.all([
      App.getMeta(true),
      API.get('/api/idps', { pageSize: 8, sort: 'newest', log: 'false' }),
      API.get('/api/designers', { limit: 100 }),
    ]);
    const studioCount = designers.length;
    designers.splice(4);
    const rooms = meta.categories.filter((c) => c.public_count > 0).sort((x, y) => y.public_count - x.public_count).slice(0, 8);
    const isCustomer = App.user && App.user.role === 'customer';
    const [feature, ...rest] = latest.results;
    const side = rest.slice(0, 2);
    const more = rest.slice(2, 6);
    const jItem = (i, cls = '') => `<a class="j-item ${cls}" href="#/idp/${i.idp_id}">
        <div class="pic"><img src="${esc(i.cover_url || UI.PLACEHOLDER)}" alt="" loading="lazy"></div>
        <h3>${esc(i.title)}</h3>
        <div class="j-meta"><span>${esc(i.category_name)}</span><span>${esc(i.location)}</span><span>${UI.budget(i.budget_min, i.budget_max)}</span></div></a>`;

    root().innerHTML = `
      <section class="hero">
        <div class="hero-bg"><img src="/img/rooms/hero-mural.jpg" alt=""></div>
        <div class="wrap hero-inner">
          <div>
            <h1><span class="l rise">Browse.</span><span class="l l2 rise d1">Shortlist.</span><span class="l l3 rise d2">Meet.</span></h1>
            <div class="hero-text rise d3">
              <p>DesignMatch gathers ${latest.total} real renovation projects from verified Singapore interior design studios. Find a room you love, then meet the designer who made it.</p>
              ${UI.ctaLink('#/discover', 'Browse projects')}
              ${App.user ? '' : '<p class="sub">Interior designer? <a class="text-link" href="#/register/designer">Register your studio</a></p>'}
            </div>
          </div>
          <div class="hero-facts rise d4">
            <div><strong>${latest.total}</strong><span>Projects</span></div>
            <div><strong>${meta.categories.length}</strong><span>Room types</span></div>
            <div><strong>${meta.locations.length}</strong><span>Neighbourhoods</span></div>
          </div>
        </div>
        <a class="scroll-cue" href="#about" data-scroll="about">Scroll to explore</a>
      </section>

      <section class="search-strip"><div class="wrap">
        <form class="quick-search" id="heroSearch" role="search" aria-label="Search projects">
          <div class="field kw"><label for="hsKeyword">What are you planning?</label><input id="hsKeyword" name="keyword" type="search" placeholder="Japandi kitchen, storage, condo"></div>
          <div class="field"><label for="hsCat">Room</label><select id="hsCat" name="categoryId"><option value="">Any room</option>${meta.categories.map((c) => `<option value="${c.category_id}">${esc(c.name)}</option>`).join('')}</select></div>
          <div class="field"><label for="hsType">Property</label><select id="hsType" name="propertyTypeId"><option value="">Any property</option>${meta.property_types.map((t) => `<option value="${t.property_type_id}">${esc(t.name)}</option>`).join('')}</select></div>
          <div class="field"><label for="hsBudget">Budget up to</label><select id="hsBudget" name="budgetMax"><option value="">Any budget</option>
            ${[30000, 50000, 80000, 120000, 200000].map((v) => `<option value="${v}">${UI.money(v)}</option>`).join('')}</select></div>
          <button class="btn" type="submit">Search</button>
        </form>
      </div></section>

      <section class="section sec-white" id="about"><div class="wrap about">
        <div class="about-copy reveal">
          <span class="eyebrow">About us</span>
          <h2>See the work<br>before you hire</h2>
          <p>Choosing an interior designer usually starts with a few photos and a lot of guesswork. On DesignMatch every project comes from a studio our team has checked, with its real budget range, property type and neighbourhood, so you can judge the work on its own terms.</p>
          <button type="button" class="cta-link" data-scroll="approach">How it works${UI.ARROW}</button>
          <div class="figures">
            <div><strong>${latest.total}</strong><span>Projects</span></div>
            <div><strong>${studioCount}</strong><span>Verified studios</span></div>
            <div><strong>${meta.styles.length}</strong><span>Design styles</span></div>
          </div>
        </div>
        <div class="about-pics reveal">
          <div class="tall"><img src="/img/rooms/living-green.jpg" alt="Cream and forest-green living room with a lit circular wall feature" loading="lazy"></div>
          <div class="small"><img src="/img/rooms/foyer-elephant.jpg" alt="Backlit oval wall panel with carved elephants above a marble console" loading="lazy"></div>
        </div>
      </div></section>

      <section class="section sec-dark approach on-dark" id="approach"><div class="wrap">
        <div class="section-head center reveal"><span class="eyebrow">Process</span><h2>Our approach</h2><p class="sub">From first idea to first meeting, in four steps</p></div>
        <div class="step-track" id="stepTrack">${STEPS.map(([img, title, text], i) => `<article class="step-card reveal">
          <span class="count">${String(i + 1).padStart(2, '0')}/${String(STEPS.length).padStart(2, '0')}</span>
          <div class="pic"><img src="/img/rooms/${img}.jpg" alt="" loading="lazy"></div>
          <h3>${esc(title)}</h3><p>${esc(text)}</p></article>`).join('')}</div>
        <div class="track-controls"><span id="trackPos">Scroll to explore</span>
          <div class="arrows"><button class="round" type="button" id="trackPrev" aria-label="Previous step"><svg viewBox="0 0 20 12" aria-hidden="true"><path d="M20 6H2M7 1L2 6l5 5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg></button>
            <button class="round" type="button" id="trackNext" aria-label="Next step">${UI.ARROW}</button></div></div>
      </div></section>

      <section class="section"><div class="wrap">
        <div class="section-head reveal"><div><span class="eyebrow">Browse by room</span><h2>Start with a room</h2></div>${UI.ctaLink('#/discover', 'All projects')}</div>
        <div class="rooms">${rooms.map((c) => `<a class="room reveal" href="#/discover?categoryId=${c.category_id}">
          <img src="${esc(c.cover_url || UI.PLACEHOLDER)}" alt="" loading="lazy">
          <span class="room-label"><strong>${esc(c.name)}</strong><span>${c.public_count} projects</span></span></a>`).join('')}</div>
      </div></section>

      ${feature ? `<section class="section sec-white"><div class="wrap">
        <div class="section-head center reveal"><span class="eyebrow">Just added</span><h2>Notes from<br>the studios</h2></div>
        <div class="journal reveal">
          ${jItem(feature, 'feature')}
          <div class="j-side">${side.map((i) => jItem(i)).join('')}
            <div class="j-note"><p>New projects appear here as soon as a verified studio publishes them. Open any project to see every photo, the budget and the designer behind it.</p>
              ${UI.ctaLink('#/discover?sort=newest', 'See all projects')}</div></div>
        </div>
        ${more.length ? `<div class="card-grid reveal" id="latestGrid" style="margin-top:72px">${more.map((i) => UI.idpCard(i, { favIds: isCustomer ? App.favIds : null })).join('')}</div>` : ''}
      </div></section>` : ''}

      <section class="section"><div class="wrap">
        <div class="section-head reveal"><div><span class="eyebrow">Studios</span><h2>Designers people<br>are viewing</h2><p class="muted">Ranked by how often their projects are opened.</p></div>${UI.ctaLink('#/designers', 'All designers')}</div>
        <div class="designer-grid reveal">${designers.map(designerCard).join('') || UI.empty('No designers yet', 'Approved designers will appear here.')}</div>
      </div></section>

      ${App.user ? '' : `<section class="cta-band on-dark">
        <div class="copy reveal"><span class="eyebrow">For interior designers</span><h2>Show the work<br>you're proud of</h2>
          <p>Create a company profile, publish projects with photos and budgets, and see how many people view and shortlist each one.</p>
          ${UI.ctaLink('#/register/designer', 'Register your studio')}</div>
        <div class="pic"><img src="/img/rooms/living-sunlit.jpg" alt="Sunlit sofa against a painted green mural with tropical plants" loading="lazy"></div>
      </section>`}`;

    const grid = document.getElementById('latestGrid');
    if (grid) App.bindFavButtons(grid);
    document.getElementById('heroSearch').addEventListener('submit', (e) => {
      e.preventDefault();
      const params = new URLSearchParams(Object.entries(UI.formObject(e.target)).filter(([, v]) => v));
      location.hash = `#/discover?${params}`;
    });
    // In-page scrolling (the hash is used by the router, so anchors cannot be used directly)
    root().querySelectorAll('[data-scroll]').forEach((b) => b.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById(b.dataset.scroll).scrollIntoView({ behavior: 'smooth' });
    }));
    // Process carousel: arrows, keyboard-free swipe, and a "02/04" position read-out
    const track = document.getElementById('stepTrack');
    const prev = document.getElementById('trackPrev');
    const next = document.getElementById('trackNext');
    const pos = document.getElementById('trackPos');
    const stepWidth = () => track.firstElementChild.getBoundingClientRect().width + 20;
    const sync = () => {
      const max = track.scrollWidth - track.clientWidth;
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= max - 2;
      const shown = Math.min(STEPS.length, Math.round(track.scrollLeft / stepWidth()) + Math.max(1, Math.round(track.clientWidth / stepWidth())));
      pos.textContent = max <= 2 ? 'All four steps' : `Showing ${shown} of ${STEPS.length}`;
    };
    prev.addEventListener('click', () => track.scrollBy({ left: -stepWidth(), behavior: 'smooth' }));
    next.addEventListener('click', () => track.scrollBy({ left: stepWidth(), behavior: 'smooth' }));
    track.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync, { passive: true });
    sync();
  };

  function designerCard(d) {
    return `<a class="designer-card" href="#/designer/${d.designer_id}">
      <div class="cover"><img loading="lazy" src="${esc(d.cover_url || UI.PLACEHOLDER)}" alt=""></div>
      <div><h3>${esc(d.company_name)}</h3>
        <p class="muted small" style="margin:0 0 10px">${d.idp_count} projects, ${d.years_experience} years' experience${d.specialisation ? `, ${esc(d.specialisation.toLowerCase())}` : ''}</p>
        <div class="tags">${(d.service_areas || []).map((a) => `<span class="tag">${esc(a)}</span>`).join('')}</div></div></a>`;
  }

  V.designers = async function designers() {
    root().innerHTML = `${UI.pageHead({ label: 'Studios', title: 'Interior designers', sub: 'Every studio listed here has been checked and approved by our team.' })}
      <div class="wrap page-body"><div id="dGrid">${UI.skeletonCards(8)}</div></div>`;
    const list = await API.get('/api/designers', { limit: 100 });
    document.getElementById('dGrid').innerHTML = list.length ? `<div class="designer-grid">${list.map(designerCard).join('')}</div>` : UI.empty('No designers yet', 'Check back soon.');
  };

  // ---------------- SearchIDPsPage (stories 37, 43, 44, 45) ----------------
  // Budget presets: a project matches when its whole quoted range fits inside the chosen range
  const BUDGETS = [['', '30000', 'Up to S$30k'], ['', '60000', 'Up to S$60k'], ['', '100000', 'Up to S$100k'], ['100000', '', 'S$100k and up']];
  const FILTER_NAMES = { keyword: 'keyword', categoryId: 'room', propertyTypeId: 'property type', location: 'location', status: 'project status', styleIds: 'design style', budget: 'budget' };

  V.discover = async function discover() {
    const meta = await App.getMeta();
    const q = App.query();
    const state = {
      keyword: q.keyword || '', categoryId: q.categoryId || '', location: q.location || '', budgetMin: q.budgetMin || '', budgetMax: q.budgetMax || '',
      styleIds: q.styleIds ? q.styleIds.split(',') : [], propertyTypeId: q.propertyTypeId || '', status: q.status || '', sort: q.sort || 'newest', page: Number(q.page) || 1,
    };
    const opt = (value, label, selected) => `<option value="${esc(value)}" data-label="${esc(label)}" ${selected ? 'selected' : ''}>${esc(label)}</option>`;
    root().innerHTML = `${UI.pageHead({ label: 'Discover', title: 'Interior design projects', sub: 'Every filter shows how many projects it would return, so you never hit a dead end.' })}
      <div class="wrap page-body"><div class="discover">
      <aside class="filters" id="filters" aria-label="Search filters">
        <form id="filterForm">
          <div class="head"><h4>Refine</h4><button type="button" class="btn link small" id="clearFilters">Clear all</button></div>
          <div class="field"><label for="fKeyword">Keyword</label>
            <div class="kw-row"><input id="fKeyword" name="keyword" type="search" value="${esc(state.keyword)}" placeholder="e.g. japandi kitchen" autocomplete="off"><button class="btn sm" type="submit">Go</button></div>
            <span class="hint">Matches titles, descriptions, rooms, styles, areas and studios, in any order.</span></div>
          <div class="field"><label for="fCat">Room</label><select id="fCat" name="categoryId">${opt('', 'All rooms', !state.categoryId)}
            ${meta.categories.map((c) => opt(c.category_id, c.name, String(c.category_id) === state.categoryId)).join('')}</select></div>
          <div class="field"><span class="label">Budget (S$)</span><div class="grid-2" style="gap:8px">
            <input name="budgetMin" type="number" min="0" step="5000" placeholder="Min" aria-label="Minimum budget" value="${esc(state.budgetMin)}">
            <input name="budgetMax" type="number" min="0" step="5000" placeholder="Max" aria-label="Maximum budget" value="${esc(state.budgetMax)}"></div>
            <span class="hint">Shows projects whose whole quoted budget fits in this range.</span>
            <div class="presets" id="budgetPresets">${BUDGETS.map(([a, b, l]) => `<button type="button" class="preset" data-min="${a}" data-max="${b}">${l}</button>`).join('')}</div></div>
          <div class="field"><label for="fLoc">Location</label><select id="fLoc" name="location">${opt('', 'Anywhere', !state.location)}
            ${meta.locations.map((l) => opt(l, l, l === state.location)).join('')}</select></div>
          <div class="field"><label for="fType">Property type</label><select id="fType" name="propertyTypeId">${opt('', 'Any property', !state.propertyTypeId)}
            ${meta.property_types.map((p) => opt(p.property_type_id, p.name, String(p.property_type_id) === state.propertyTypeId)).join('')}</select></div>
          <h4>Design style</h4>
          <div class="checks" id="styleChecks">${meta.styles.map((s) => `<label class="check" data-style="${s.style_id}"><input type="checkbox" name="styleIds" value="${s.style_id}" ${state.styleIds.includes(String(s.style_id)) ? 'checked' : ''}>${esc(s.name)} <span class="n"></span></label>`).join('')}</div>
          <h4>Project status</h4>
          <div class="checks" id="statusChecks">${[['', 'Any'], ['current', 'In progress'], ['past', 'Completed']].map(([v, l]) => `<label class="check" data-status="${v}"><input type="radio" name="status" value="${v}" ${state.status === v ? 'checked' : ''}>${l} <span class="n"></span></label>`).join('')}</div>
        </form>
      </aside>
      <section aria-live="polite">
        <div class="results-bar">
          <div class="btn-row"><button class="btn ghost sm filter-toggle" id="filterToggle" aria-controls="filters" type="button">Filters</button><span id="resultCount" class="count"></span></div>
          <label>Sort by <select id="sortSel" aria-label="Sort results">${meta.sorts.map((s) => `<option value="${s.value}" ${s.value === state.sort ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></label>
        </div>
        <div class="chips" id="chips"></div>
        <div id="results">${UI.skeletonCards(6)}</div>
        <nav class="pagination" id="pager" aria-label="Pagination"></nav>
      </section></div></div>`;

    const form = document.getElementById('filterForm');
    const nameOf = {
      categoryId: (v) => (meta.categories.find((c) => String(c.category_id) === String(v)) || {}).name,
      propertyTypeId: (v) => (meta.property_types.find((c) => String(c.property_type_id) === String(v)) || {}).name,
      styleIds: (v) => (meta.styles.find((c) => String(c.style_id) === String(v)) || {}).name,
      status: (v) => ({ current: 'In progress', past: 'Completed' }[v]),
    };
    const readForm = () => {
      const fd = new FormData(form);
      Object.assign(state, {
        keyword: (fd.get('keyword') || '').trim(), categoryId: fd.get('categoryId') || '', location: fd.get('location') || '',
        budgetMin: fd.get('budgetMin') || '', budgetMax: fd.get('budgetMax') || '', propertyTypeId: fd.get('propertyTypeId') || '',
        styleIds: fd.getAll('styleIds'), status: fd.get('status') || '', page: 1,
      });
    };
    const writeForm = () => {
      form.keyword.value = state.keyword; form.categoryId.value = state.categoryId; form.location.value = state.location;
      form.budgetMin.value = state.budgetMin; form.budgetMax.value = state.budgetMax; form.propertyTypeId.value = state.propertyTypeId;
      form.querySelectorAll('input[name=styleIds]').forEach((c) => { c.checked = state.styleIds.includes(c.value); });
      form.querySelectorAll('input[name=status]').forEach((r) => { r.checked = r.value === state.status; });
    };
    const money = (v) => UI.money(Number(v));
    const budgetLabel = () => {
      if (state.budgetMin && state.budgetMax) return `${money(state.budgetMin)} to ${money(state.budgetMax)}`;
      if (state.budgetMin) return `From ${money(state.budgetMin)}`;
      return `Up to ${money(state.budgetMax)}`;
    };

    /** Active-filter chips: each one removes just that filter. */
    function drawChips() {
      const chips = [];
      if (state.keyword) chips.push(['keyword', null, `"${state.keyword}"`]);
      if (state.categoryId) chips.push(['categoryId', null, nameOf.categoryId(state.categoryId)]);
      if (state.propertyTypeId) chips.push(['propertyTypeId', null, nameOf.propertyTypeId(state.propertyTypeId)]);
      if (state.location) chips.push(['location', null, state.location]);
      if (state.budgetMin || state.budgetMax) chips.push(['budget', null, budgetLabel()]);
      state.styleIds.forEach((id) => chips.push(['styleIds', id, nameOf.styleIds(id)]));
      if (state.status) chips.push(['status', null, nameOf.status(state.status)]);
      const el = document.getElementById('chips');
      el.innerHTML = chips.length ? chips.map(([k, v, l]) => `<button type="button" class="chip" data-k="${k}" data-v="${esc(v || '')}" aria-label="Remove filter ${esc(l)}">${esc(l)}<span class="x" aria-hidden="true">&times;</span></button>`).join('')
        + (chips.length > 1 ? '<button type="button" class="clear" id="chipClear">Clear all</button>' : '') : '';
      el.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => removeFilter(b.dataset.k, b.dataset.v)));
      const cc = document.getElementById('chipClear');
      if (cc) cc.addEventListener('click', clearAll);
      document.querySelectorAll('#budgetPresets .preset').forEach((p) => p.classList.toggle('on', p.dataset.min === state.budgetMin && p.dataset.max === state.budgetMax));
    }

    function removeFilter(key, value) {
      if (key === 'budget') { state.budgetMin = ''; state.budgetMax = ''; } else if (key === 'styleIds' && value) state.styleIds = state.styleIds.filter((x) => x !== value);
      else if (key === 'styleIds') state.styleIds = [];
      else state[key] = '';
      state.page = 1;
      writeForm(); run();
    }

    /** Shows how many projects each option would return and dims options that would return none. */
    function drawFacets(f) {
      if (!f) return;
      const label = (o, n) => { o.textContent = `${o.dataset.label}${o.value ? ` (${n || 0})` : ''}`; o.disabled = Boolean(o.value) && !n && !o.selected; };
      form.categoryId.querySelectorAll('option').forEach((o) => label(o, f.categories[o.value]));
      form.propertyTypeId.querySelectorAll('option').forEach((o) => label(o, f.property_types[o.value]));
      form.location.querySelectorAll('option').forEach((o) => label(o, f.locations[o.value]));
      document.querySelectorAll('#styleChecks .check').forEach((c) => {
        const n = f.styles[c.dataset.style] || 0;
        c.querySelector('.n').textContent = n; c.classList.toggle('zero', !n && !c.querySelector('input').checked);
      });
      const all = (f.status.current || 0) + (f.status.past || 0);
      document.querySelectorAll('#statusChecks .check').forEach((c) => {
        const n = c.dataset.status ? (f.status[c.dataset.status] || 0) : all;
        c.querySelector('.n').textContent = n; c.classList.toggle('zero', !n && !c.querySelector('input').checked);
      });
    }

    let seq = 0;
    async function run() {
      const params = { ...state, styleIds: state.styleIds };
      const qs = new URLSearchParams(Object.entries(params).filter(([k, v]) => v && v.length !== 0 && !(k === 'page' && v === 1) && !(k === 'sort' && v === 'newest')).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v]));
      history.replaceState(null, '', `#/discover${qs.toString() ? `?${qs}` : ''}`);
      drawChips();
      const mine = ++seq;
      const resEl = document.getElementById('results');
      resEl.innerHTML = UI.skeletonCards(6);
      try {
        const data = await API.get('/api/idps', { ...params, pageSize: 12, facets: 1 });
        if (mine !== seq) return;
        drawFacets(data.facets);
        document.getElementById('resultCount').innerHTML = `${data.total}<span>project${data.total === 1 ? '' : 's'}</span>`;
        if (data.results.length) {
          resEl.innerHTML = `<div class="card-grid">${data.results.map((i) => UI.idpCard(i, { favIds: App.favIds })).join('')}</div>`;
        } else {
          const tips = (data.suggestions || []).map((s) => (s.keep
            ? `<button type="button" data-keep="keyword">Search "${esc(state.keyword)}" without the other filters<span>${s.total} project${s.total === 1 ? '' : 's'}</span></button>`
            : `<button type="button" data-remove="${s.remove}">Remove the ${esc(FILTER_NAMES[s.remove])} filter<span>${s.total} project${s.total === 1 ? '' : 's'}</span></button>`)).join('');
          resEl.innerHTML = UI.empty('No projects match all of these filters', tips ? 'These changes would bring projects back:' : 'Try a broader keyword or clear the filters.',
            tips ? `<div class="suggest">${tips}</div>` : '<button class="btn ghost" type="button" id="emptyClear">Clear all filters</button>');
          resEl.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => removeFilter(b.dataset.remove)));
          resEl.querySelectorAll('[data-keep]').forEach((b) => b.addEventListener('click', () => {
            const kw = state.keyword;
            Object.assign(state, { categoryId: '', location: '', budgetMin: '', budgetMax: '', styleIds: [], propertyTypeId: '', status: '', page: 1, keyword: kw });
            writeForm(); run();
          }));
        }
        App.bindFavButtons(resEl);
        const ec = document.getElementById('emptyClear');
        if (ec) ec.addEventListener('click', clearAll);
        UI.pagination(document.getElementById('pager'), data, (p) => { state.page = p; run(); window.scrollTo({ top: 0 }); });
      } catch (e) {
        if (mine !== seq) return;
        resEl.innerHTML = UI.errorBox(e.message);
        document.getElementById('pager').innerHTML = '';
      }
    }
    function clearAll() {
      Object.assign(state, { keyword: '', categoryId: '', location: '', budgetMin: '', budgetMax: '', styleIds: [], propertyTypeId: '', status: '', page: 1 });
      writeForm(); run();
    }
    let typing;
    form.addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(typing); readForm(); run(); });
    form.addEventListener('change', (e) => { if (e.target.name !== 'keyword') { readForm(); run(); } });
    // Keyword searches as you type (after a short pause) so results follow the words
    form.keyword.addEventListener('input', () => { clearTimeout(typing); typing = setTimeout(() => { readForm(); run(); }, 450); });
    document.querySelectorAll('#budgetPresets .preset').forEach((p) => p.addEventListener('click', () => {
      const on = p.classList.contains('on');
      state.budgetMin = on ? '' : p.dataset.min; state.budgetMax = on ? '' : p.dataset.max; state.page = 1;
      writeForm(); run();
    }));
    document.getElementById('clearFilters').addEventListener('click', clearAll);
    document.getElementById('sortSel').addEventListener('change', (e) => { state.sort = e.target.value; state.page = 1; run(); });
    document.getElementById('filterToggle').addEventListener('click', () => document.getElementById('filters').classList.toggle('open'));
    run();
  };

  // ---------------- IDPDetailsPage (story 38, 39, 41) ----------------
  V.idpDetail = async function idpDetail(id) {
    root().innerHTML = UI.loading();
    let idp;
    try { idp = await API.get(`/api/idps/${id}`); } catch (e) {
      root().innerHTML = `<div class="wrap section">${UI.empty('Project not available', e.message, '<a class="btn" href="#/discover">Browse projects</a>')}</div>`;
      return;
    }
    const photos = idp.photos.length ? idp.photos : [{ url: UI.PLACEHOLDER, caption: '' }];
    const shown = photos.length >= 5 ? 5 : Math.min(3, photos.length); // big photo plus a 2x2 grid when there are enough
    const isCustomer = App.user && App.user.role === 'customer';
    const fav = App.favIds.includes(idp.idp_id);
    let action;
    if (idp.is_owner) {
      action = `<p class="notice">This project is in your portfolio. Customers see this page without this note.</p><a class="btn" href="#/studio/idp/${idp.idp_id}/edit">Edit project</a>`;
    } else if (isCustomer) {
      action = `<button class="btn ghost fav-inline ${fav ? 'on' : ''}" data-fav="${idp.idp_id}" data-label="1" aria-pressed="${fav}">${UI.HEART} ${fav ? 'Saved to favourites' : 'Save to favourites'}</button>
        <form id="enquiryForm" style="margin-top:20px" novalidate>
          <h4>Contact ${esc(idp.company_name || 'the designer')}</h4>
          <div id="enqErr"></div>
          <div class="field"><label for="enqMsg">Message</label><textarea id="enqMsg" name="message" required minlength="10" maxlength="2000">Hi, I'm interested in a project like "${esc(idp.title)}". Could we arrange a consultation?</textarea></div>
          <div class="field"><label for="enqPhone">Phone (optional)</label><input id="enqPhone" name="contactPhone" type="tel" value="${esc(App.user.phone || '')}" placeholder="+65 9123 4567"></div>
          <button class="btn primary" type="submit">Send enquiry</button>
        </form>`;
    } else if (App.user) {
      action = '<p class="muted small">Saving projects and contacting designers is available to customer accounts.</p>';
    } else {
      action = `<p class="muted small">Log in or create a free account to save this project and contact the designer.</p>
        <div class="btn-row"><a class="btn primary" href="#/login?next=${encodeURIComponent(`#/idp/${idp.idp_id}`)}">Log in</a><a class="btn ghost" href="#/register">Join free</a></div>`;
    }
    const many = photos.length > 1;
    root().innerHTML = `<article class="wrap detail">
      <div class="crumbs"><a href="#/discover">Projects</a> / <a href="#/discover?categoryId=${idp.category_id || ''}">${esc(idp.category_name)}</a></div>
      <div class="detail-top">
        <section class="viewer" aria-label="Project photos">
          <figure class="viewer-main">
            <button class="viewer-open" type="button" id="viewerOpen" aria-label="Open photo full screen"><img id="viewerImg" src="${esc(photos[0].url)}" alt="${esc(photos[0].caption || idp.title)}"></button>
            ${many ? `<button class="viewer-nav prev" type="button" data-step="-1" aria-label="Previous photo"><svg viewBox="0 0 20 12" aria-hidden="true"><path d="M20 6H2M7 1L2 6l5 5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></button>
              <button class="viewer-nav next" type="button" data-step="1" aria-label="Next photo">${UI.ARROW}</button>` : ''}
            <figcaption><span id="viewerCap">${esc(photos[0].caption || '')}</span>${many ? `<span class="viewer-count" id="viewerCount">1 / ${photos.length}</span>` : ''}</figcaption>
          </figure>
          ${many ? `<div class="thumbs" role="tablist" aria-label="Choose a photo">${photos.map((p, i) => `<button type="button" role="tab" class="thumb-btn ${i === 0 ? 'on' : ''}" data-thumb="${i}" aria-selected="${i === 0}" aria-label="Photo ${i + 1}: ${esc(p.caption || '')}"><img src="${esc(p.url)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
        </section>
        <div class="detail-info">
          <h1>${esc(idp.title)}</h1>
          <div class="tags"><span class="tag ${idp.status === 'past' ? '' : 'olive'}">${idp.status === 'past' ? 'Completed project' : 'Project in progress'}</span>${(idp.styles || []).map((s) => `<span class="tag">${esc(s)}</span>`).join('')}</div>
          <dl class="facts">
            <div><dt>Budget</dt><dd>${UI.money(idp.budget_min)} to ${UI.money(idp.budget_max)}</dd></div>
            <div><dt>Location</dt><dd>${esc(idp.location)}</dd></div>
            <div><dt>Property</dt><dd>${esc(idp.property_type_name || 'Not specified')}</dd></div>
            <div><dt>Category</dt><dd>${esc(idp.category_name)}</dd></div>
            <div><dt>Interest</dt><dd>${idp.view_count} views, ${idp.favourite_count} saves</dd></div>
            <div><dt>Photos</dt><dd>${photos.length}</dd></div>
          </dl>
          <div class="detail-text">${esc(idp.description)}</div>
          <aside class="aside-card">
            <div class="designer-line">
              <div class="logo">${idp.logo_url ? `<img src="${esc(idp.logo_url)}" alt="">` : UI.initials(idp.company_name)}</div>
              <div><strong>${esc(idp.company_name || idp.designer_name)}</strong><br>
                ${idp.registration_status === 'approved' ? '<span class="verified">&#10003; Verified designer</span>' : ''}</div>
            </div>
            <p class="small muted">${idp.years_experience} years' experience. Listed ${UI.date(idp.created_at)}.</p>
            <p><a class="btn ghost sm" href="#/designer/${idp.designer_id}">View company profile</a></p>
            <hr>
            ${action}
          </aside>
        </div>
      </div>
      ${idp.more_from_designer.length ? `<section class="section" style="padding-bottom:0"><div class="section-head"><div><span class="eyebrow">Same studio</span><h2>More from ${esc(idp.company_name)}</h2></div>${UI.ctaLink(`#/designer/${idp.designer_id}`, 'All projects')}</div>
        <div class="card-grid" id="moreGrid">${idp.more_from_designer.map((i) => UI.idpCard(i, { favIds: isCustomer ? App.favIds : null })).join('')}</div></section>` : ''}
    </article>`;
    // Photo viewer: arrows, thumbnails and keyboard arrows swap the main photo with a cross-fade
    let current = 0;
    const img = document.getElementById('viewerImg');
    const show = (i) => {
      current = (i + photos.length) % photos.length;
      img.classList.add('swap');
      setTimeout(() => {
        img.src = photos[current].url;
        img.alt = photos[current].caption || idp.title;
        const done = () => img.classList.remove('swap');
        if (img.complete) done(); else img.onload = done;
      }, 160);
      document.getElementById('viewerCap').textContent = photos[current].caption || '';
      const count = document.getElementById('viewerCount');
      if (count) count.textContent = `${current + 1} / ${photos.length}`;
      root().querySelectorAll('[data-thumb]').forEach((t) => { const on = Number(t.dataset.thumb) === current; t.classList.toggle('on', on); t.setAttribute('aria-selected', String(on)); });
    };
    root().querySelectorAll('[data-thumb]').forEach((t) => t.addEventListener('click', () => show(Number(t.dataset.thumb))));
    root().querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => show(current + Number(b.dataset.step))));
    document.getElementById('viewerOpen').addEventListener('click', () => openGallery(photos, current, idp.title));
    const viewer = root().querySelector('.viewer');
    viewer.tabIndex = -1;
    viewer.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') show(current + 1); if (e.key === 'ArrowLeft') show(current - 1); });
    App.bindFavButtons(root());
    const form = document.getElementById('enquiryForm');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type=submit]');
        await UI.submitting(btn, document.getElementById('enqErr'), async () => {
          const r = await API.post('/api/customer/enquiries', { idpId: idp.idp_id, ...UI.formObject(form) });
          form.innerHTML = `<div class="notice ok">${esc(r.message)} You can track it under <a href="#/enquiries">My enquiries</a>.</div>`;
          UI.toast('Enquiry sent.');
        });
      });
    }
  };

  function openGallery(photos, start, title) {
    let i = start;
    const m = UI.modal('<div id="gal"></div>', { wide: true, label: `${title} photos` });
    const draw = () => {
      m.el.querySelector('#gal').innerHTML = `<img src="${esc(photos[i].url)}" alt="${esc(photos[i].caption || title)}">
        <div class="btn-row" style="justify-content:space-between;margin-top:10px;color:#f6f3ee">
          <button class="btn ghost sm" style="color:#f6f3ee" data-prev ${i === 0 ? 'disabled' : ''}>Previous</button>
          <span class="small">${i + 1} / ${photos.length}${photos[i].caption ? ` - ${esc(photos[i].caption)}` : ''}</span>
          <span class="btn-row"><button class="btn ghost sm" style="color:#f6f3ee" data-next ${i === photos.length - 1 ? 'disabled' : ''}>Next</button>
          <button class="btn ghost sm" style="color:#f6f3ee" data-close>Close</button></span></div>`;
      m.el.querySelector('[data-prev]').addEventListener('click', () => { i -= 1; draw(); });
      m.el.querySelector('[data-next]').addEventListener('click', () => { i += 1; draw(); });
    };
    draw();
  }

  // ---------------- DesignerProfilePage (stories 46, 47, 30) ----------------
  V.renderCompanyPage = function renderCompanyPage(data, { preview = false } = {}) {
    const c = data.company;
    const d = data.designer;
    const designerId = d.designer_id;
    const html = `
      ${preview ? `<div class="preview-banner" style="margin-top:0"><div class="wrap btn-row" style="justify-content:space-between">
        <span>Preview: this is how customers see your company profile.${data.publicly_visible ? '' : ' Your profile is not publicly visible right now.'}</span>
        <a class="btn sm" href="#/studio/company">Back to editing</a></div></div>` : ''}
      <div class="wrap">
        <header class="studio-hero">
          <div class="logo lg">${c.logo_url ? `<img src="${esc(c.logo_url)}" alt="${esc(c.company_name)} logo">` : UI.initials(c.company_name)}</div>
          <div><h1>${esc(c.company_name)}</h1>
            <p class="muted" style="margin:0">${d.verified ? '<span class="verified">&#10003; Verified designer</span> ' : ''}Led by ${esc(d.full_name)}, ${d.years_experience} years' experience${d.specialisation ? `. Specialises in ${esc(d.specialisation.toLowerCase())}` : ''}.</p></div>
          <div class="btn-row">${c.website ? `<a class="btn ghost" href="${esc(c.website)}" target="_blank" rel="noopener noreferrer">Website</a>` : ''}
            ${c.contact_email ? `<a class="btn" href="mailto:${esc(c.contact_email)}">Email studio</a>` : ''}</div>
        </header>
        <div class="profile-grid">
          <div>
            <span class="eyebrow">The studio</span><h2>About</h2>
            <div style="white-space:pre-line;margin-bottom:24px">${esc(c.description || 'This designer has not added a description yet.')}</div>
            ${d.bio ? `<p class="muted">${esc(d.bio)}</p>` : ''}
            <div class="section-head" style="margin-top:48px;margin-bottom:28px"><h2 style="margin:0">Projects <span class="muted" style="font-size:1rem;font-family:var(--sans)">${data.idp_total}</span></h2>
              <label class="small">Sort <select id="dpSort"><option value="newest">Newest</option><option value="most_viewed">Most viewed</option><option value="budget_low">Budget: low to high</option></select></label></div>
            <div id="dpProjects">${data.idps.length ? `<div class="card-grid">${data.idps.map((i) => UI.idpCard(i, { favIds: App.user && App.user.role === 'customer' ? App.favIds : null })).join('')}</div>` : UI.empty('No projects yet', 'This studio has not published any projects.')}</div>
            <nav class="pagination" id="dpPager" aria-label="Project pages"></nav>
          </div>
          <aside>
            <div class="panel"><h3>Contact</h3>
              <dl class="kv" style="grid-template-columns:90px 1fr">
                ${c.contact_email ? `<dt>Email</dt><dd>${esc(c.contact_email)}</dd>` : ''}
                ${c.contact_phone ? `<dt>Phone</dt><dd>${esc(c.contact_phone)}</dd>` : ''}
                ${c.address ? `<dt>Office</dt><dd>${esc(c.address)}</dd>` : ''}
              </dl></div>
            <div class="panel"><h3>Service areas</h3><div class="tags">${(c.service_areas || []).map((a) => `<span class="tag">${esc(a)}</span>`).join('') || '<span class="muted small">Not specified</span>'}</div></div>
            <div class="panel"><h3>Certifications</h3>${data.certifications.length ? `<ul class="list-plain">${data.certifications.map((x) => `<li><strong>${esc(x.title)}</strong><br><span class="small muted">${esc(x.issuer)}${x.year_obtained ? `, ${x.year_obtained}` : ''}</span></li>`).join('')}</ul>` : '<p class="muted small">No certifications listed.</p>'}</div>
          </aside>
        </div>
      </div>`;
    root().innerHTML = html;
    App.bindFavButtons(root());
    if (preview) {
      UI.pagination(document.getElementById('dpPager'), { page: 1, totalPages: 1 }, () => {});
      document.getElementById('dpSort').closest('label').remove();
      return;
    }
    // Story 47: browse all IDPs by this designer, paged
    let page = 1;
    let sort = 'newest';
    const load = async () => {
      const box = document.getElementById('dpProjects');
      box.innerHTML = UI.loading();
      const r = await API.get(`/api/designers/${designerId}/idps`, { page, sort, pageSize: 6 });
      box.innerHTML = r.results.length ? `<div class="card-grid">${r.results.map((i) => UI.idpCard(i, { favIds: App.user && App.user.role === 'customer' ? App.favIds : null })).join('')}</div>` : UI.empty('No projects yet', 'This studio has not published any projects.');
      App.bindFavButtons(box);
      UI.pagination(document.getElementById('dpPager'), r, (p) => { page = p; load(); });
    };
    document.getElementById('dpSort').addEventListener('change', (e) => { sort = e.target.value; page = 1; load(); });
    UI.pagination(document.getElementById('dpPager'), { page: 1, totalPages: Math.ceil(data.idp_total / 6) }, (p) => { page = p; load(); });
  };

  V.designerPage = async function designerPage(id) {
    root().innerHTML = UI.loading();
    try {
      V.renderCompanyPage(await API.get(`/api/designers/${id}`));
    } catch (e) {
      root().innerHTML = `<div class="wrap section">${UI.empty('Designer not found', e.message, '<a class="btn" href="#/designers">All designers</a>')}</div>`;
    }
  };

  // ---------------- LoginForm (stories 5, 18, 36, 54) ----------------
  function authLayout(inner, { photo = 'hero-mural', quote = 'Find the room.<br>Then the designer.', caption = 'DesignMatch, Singapore' } = {}) {
    root().innerHTML = `<div class="auth"><div class="auth-photo"><img src="/img/rooms/${photo}.jpg" alt="">
      <div class="quote"><p>${quote}</p><span>${esc(caption)}</span></div></div><div class="auth-form"><div>${inner}</div></div></div>`;
  }

  V.login = function login() {
    if (App.user) { location.hash = App.homeFor(); return; }
    const next = App.query().next;
    authLayout(`<span class="eyebrow">Welcome back</span><h1>Log in</h1><p class="muted">Customers, designers, administrators and platform managers all sign in here.</p>
      <form id="loginForm" novalidate><div id="loginErr"></div>
        <div class="field"><label for="lEmail">Email</label><input id="lEmail" name="email" type="email" autocomplete="username" required></div>
        <div class="field"><label for="lPw">Password</label><input id="lPw" name="password" type="password" autocomplete="current-password" required></div>
        <button class="btn primary" type="submit" style="width:100%">Log in</button></form>
      <p class="small" style="margin-top:18px">New here? <a href="#/register">Create a free customer account</a> or <a href="#/register/designer">register as a designer</a>.</p>
      <div class="demo-box"><strong>Demo accounts</strong> <span class="muted">(development data, fills the form)</span><br>
        ${[['Customer', 'customer@designmatch.sg', 'Customer123!'], ['Designer', 'designer@designmatch.sg', 'Designer123!'], ['User admin', 'admin@designmatch.sg', 'Admin123!'], ['Platform manager', 'manager@designmatch.sg', 'Manager123!']]
          .map(([l, e, p]) => `<button type="button" class="btn ghost sm" data-demo="${e}|${p}">${l}</button>`).join('')}</div>`);
    const form = document.getElementById('loginForm');
    document.querySelectorAll('[data-demo]').forEach((b) => b.addEventListener('click', () => {
      const [e, p] = b.dataset.demo.split('|');
      form.email.value = e; form.password.value = p; form.email.focus();
    }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.email.value || !form.password.value) { document.getElementById('loginErr').innerHTML = UI.errorBox('Enter your email and password.'); return; }
      await UI.submitting(form.querySelector('button[type=submit]'), document.getElementById('loginErr'), async () => {
        const r = await API.post('/api/auth/login', UI.formObject(form));
        App.user = r.user;
        await App.refreshFavourites();
        App.renderHeader();
        UI.toast(r.message);
        location.hash = r.user.mustChangePassword ? '#/account' : (next && next.startsWith('#/') ? next : App.homeFor());
      });
    });
  };

  // ---------------- RegisterCustomerForm (story 35) ----------------
  V.registerCustomer = function registerCustomer() {
    if (App.user) { location.hash = App.homeFor(); return; }
    authLayout(`<span class="eyebrow">For homeowners</span><h1>Create an account</h1><p class="muted">Save projects you like and contact designers directly.</p>
      <form id="regForm" novalidate><div id="regErr"></div>
        <div class="field"><label for="rName">Full name</label><input id="rName" name="fullName" autocomplete="name" required></div>
        <div class="field"><label for="rEmail">Email</label><input id="rEmail" name="email" type="email" autocomplete="email" required></div>
        <div class="field"><label for="rPw">Password</label><input id="rPw" name="password" type="password" autocomplete="new-password" required><span class="hint">At least 8 characters with a letter and a number.</span></div>
        <div class="grid-2"><div class="field"><label for="rPhone">Phone (optional)</label><input id="rPhone" name="phone" type="tel"></div>
          <div class="field"><label for="rLoc">Area (optional)</label><input id="rLoc" name="location" placeholder="e.g. Tampines"></div></div>
        <button class="btn primary" type="submit" style="width:100%">Create account</button></form>
      <p class="small" style="margin-top:18px">Already registered? <a href="#/login">Log in</a>. Interior designer? <a href="#/register/designer">Register your studio</a>.</p>`,
    { photo: 'bedroom-gold', quote: 'Save the rooms<br>you love.', caption: 'Free for homeowners' });
    const form = document.getElementById('regForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await UI.submitting(form.querySelector('button[type=submit]'), document.getElementById('regErr'), async () => {
        const r = await API.post('/api/auth/register/customer', UI.formObject(form));
        App.user = r.user;
        App.renderHeader();
        UI.toast(r.message);
        location.hash = '#/discover';
      });
    });
  };

  // ---------------- RegisterDesignerForm (story 17) ----------------
  V.registerDesigner = function registerDesigner() {
    if (App.user) { location.hash = App.homeFor(); return; }
    authLayout(`<span class="eyebrow">For interior designers</span><h1>Register your studio</h1><p class="muted">A User Admin reviews every application before your studio appears on DesignMatch.</p>
      <form id="dregForm" novalidate><div id="dregErr"></div>
        <div class="grid-2"><div class="field"><label for="dName">Your full name</label><input id="dName" name="fullName" required></div>
          <div class="field"><label for="dPhone">Phone</label><input id="dPhone" name="phone" type="tel" required></div></div>
        <div class="field"><label for="dEmail">Work email</label><input id="dEmail" name="email" type="email" required></div>
        <div class="field"><label for="dPw">Password</label><input id="dPw" name="password" type="password" autocomplete="new-password" required><span class="hint">At least 8 characters with a letter and a number.</span></div>
        <div class="field"><label for="dCo">Company name</label><input id="dCo" name="companyName" required></div>
        <div class="grid-2"><div class="field"><label for="dLic">Licence / registration no.</label><input id="dLic" name="licenseNumber" required></div>
          <div class="field"><label for="dYrs">Years of experience</label><input id="dYrs" name="yearsExperience" type="number" min="0" max="70" required></div></div>
        <div class="field"><label for="dSpec">Specialisation (optional)</label><input id="dSpec" name="specialisation" placeholder="e.g. HDB renovations"></div>
        <div class="field"><label for="dBio">Professional summary (optional)</label><textarea id="dBio" name="bio" maxlength="2000"></textarea></div>
        <button class="btn primary" type="submit" style="width:100%">Submit application</button></form>`,
    { photo: 'foyer-elephant', quote: 'Show the work<br>you are proud of.', caption: 'Reviewed by our team before going live' });
    const form = document.getElementById('dregForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await UI.submitting(form.querySelector('button[type=submit]'), document.getElementById('dregErr'), async () => {
        const r = await API.post('/api/auth/register/designer', UI.formObject(form));
        form.parentElement.innerHTML = `<span class="eyebrow">Application received</span><h1>Thank you</h1><div class="notice ok">${esc(r.message)}</div>
          <h4 style="margin-top:28px">What happens next</h4>
          <ol class="small" style="padding-left:18px;color:var(--ink-2)"><li>A User Admin reviews your licence number and details.</li>
            <li>Once approved, you can log in with the email and password you just chose.</li>
            <li>Set up your company profile, then publish your first project.</li></ol>
          <div class="btn-row" style="margin-top:20px"><a class="btn" href="#/login">Go to log in</a><a class="btn ghost" href="#/">Back to home</a></div>`;
      });
    });
  };

  // ---------------- EditPersonalProfileForm (stories 18, 36) ----------------
  V.account = function account() {
    const u = App.user;
    root().innerHTML = `${UI.pageHead({ label: 'Your account', title: 'Account settings', sub: `Signed in as ${esc(u.email)} with the ${esc(u.profileName)} profile.` })}
      <div class="wrap page-body" style="max-width:900px">
      ${u.mustChangePassword ? '<div class="notice">Your password was reset by a User Admin. Choose a new password to continue.</div>' : ''}
      <div class="form-card" style="margin-bottom:24px"><h3>Personal details</h3>
        <form id="accForm" novalidate><div id="accErr"></div>
          <div class="grid-2"><div class="field"><label for="aName">Full name</label><input id="aName" name="fullName" value="${esc(u.fullName)}" required></div>
            <div class="field"><label for="aEmail">Email</label><input id="aEmail" name="email" type="email" value="${esc(u.email)}" required></div>
            <div class="field"><label for="aPhone">Phone</label><input id="aPhone" name="phone" type="tel" value="${esc(u.phone || '')}"></div>
            <div class="field"><label for="aLoc">Area</label><input id="aLoc" name="location" value="${esc(u.location || '')}"></div></div>
          <button class="btn primary" type="submit" ${u.mustChangePassword ? 'disabled' : ''}>Save details</button></form></div>
      <div class="form-card"><h3>Change password</h3>
        <form id="pwForm" novalidate><div id="pwErr"></div>
          <div class="field"><label for="pCur">Current password</label><input id="pCur" name="currentPassword" type="password" autocomplete="current-password" required></div>
          <div class="grid-2"><div class="field"><label for="pNew">New password</label><input id="pNew" name="newPassword" type="password" autocomplete="new-password" required></div>
            <div class="field"><label for="pNew2">Confirm new password</label><input id="pNew2" name="confirm" type="password" autocomplete="new-password" required></div></div>
          <button class="btn primary" type="submit">Change password</button></form></div>
      ${u.role === 'designer' && !u.mustChangePassword ? '<p style="margin-top:20px"><a href="#/studio/company">Edit professional details and company profile</a></p>' : ''}
    </div>`;
    const form = document.getElementById('accForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await UI.submitting(form.querySelector('button'), document.getElementById('accErr'), async () => {
        const r = await API.put('/api/auth/me', UI.formObject(form));
        App.user = r.user; App.renderHeader(); UI.toast(r.message);
      });
    });
    const pw = document.getElementById('pwForm');
    pw.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = UI.formObject(pw);
      if (data.newPassword !== data.confirm) { document.getElementById('pwErr').innerHTML = UI.errorBox('The new passwords do not match.'); return; }
      await UI.submitting(pw.querySelector('button'), document.getElementById('pwErr'), async () => {
        const r = await API.put('/api/auth/me/password', data);
        UI.toast(r.message);
        pw.reset();
        if (App.user.mustChangePassword) { await App.refreshUser(); location.hash = App.homeFor(); }
      });
    });
  };
})();
