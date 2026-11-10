/* Single-page app shell: session state, navigation and hash router (UI Boundary). */
(function () {
  'use strict';

  const { esc } = UI;
  const app = document.getElementById('app');

  const HOME_FOR = { admin: '#/admin', designer: '#/studio', customer: '#/discover', manager: '#/manage' };

  const App = {
    user: null,
    meta: null,
    favIds: [],
    root: app,

    async refreshUser() {
      try {
        const { user } = await API.get('/api/auth/me');
        this.user = user;
      } catch (e) {
        this.user = null;
        if (e.status === 403) UI.toast(e.message, 'error');
      }
      await this.refreshFavourites();
      this.renderHeader();
    },

    async refreshFavourites() {
      this.favIds = [];
      if (this.user && this.user.role === 'customer' && !this.user.mustChangePassword) {
        try { this.favIds = (await API.get('/api/customer/favourites/ids')).ids; } catch (_) { /* ignore */ }
      }
    },

    async getMeta(force = false) {
      if (!this.meta || force) this.meta = await API.get('/api/meta');
      return this.meta;
    },

    homeFor(user = this.user) { return user ? HOME_FOR[user.role] : '#/'; },

    /** Links for the header and the full-screen menu, by role. */
    navLinks(u = this.user) {
      if (u && u.role === 'admin') return [['#/admin', 'Overview'], ['#/admin/accounts', 'Accounts'], ['#/admin/registrations', 'Approvals'], ['#/discover', 'Browse site']];
      if (u && u.role === 'manager') return [['#/manage', 'Statistics'], ['#/manage/categories', 'Categories'], ['#/manage/reports', 'Reports'], ['#/discover', 'Browse site']];
      const links = [['#/discover', 'Projects'], ['#/designers', 'Designers']];
      if (u && u.role === 'customer') links.push(['#/favourites', 'Favourites'], ['#/enquiries', 'Enquiries']);
      if (u && u.role === 'designer') links.push(['#/studio', 'My studio']);
      return links;
    },

    renderHeader() {
      const u = this.user;
      const links = this.navLinks();
      document.getElementById('mainNav').innerHTML = links.map(([h, l]) => `<a href="${h}">${esc(l)}</a>`).join('');
      document.getElementById('headerActions').innerHTML = u
        ? `<a class="user-chip desktop-only" href="#/account" title="Account settings"><span class="avatar" aria-hidden="true">${UI.initials(u.fullName)}</span>${esc(u.fullName)}</a>
           <button class="head-link desktop-only" type="button" data-logout>Log out</button>`
        : '<a class="head-link" href="#/login">Log in</a><a class="btn ghost sm desktop-only" href="#/register">Join free</a>';

      const menuLinks = [['#/', 'Home'], ...links];
      document.getElementById('menuLinks').innerHTML = menuLinks.map(([h, l], i) => `<a href="${h}" style="animation-delay:${0.08 + i * 0.05}s">${esc(l)}</a>`).join('');
      document.getElementById('menuSide').innerHTML = u
        ? `<div><h4>Signed in</h4><p style="margin:0">${esc(u.fullName)}<br><span class="small">${esc(u.email)}</span></p></div>
           <ul><li><a href="#/account">Account settings</a></li><li><a href="${this.homeFor()}">My dashboard</a></li>
             <li><a href="#" data-logout>Log out</a></li></ul>`
        : `<div><h4>Your account</h4><ul><li><a href="#/login">Log in</a></li><li><a href="#/register">Create a free account</a></li>
             <li><a href="#/register/designer">Register your design studio</a></li></ul></div>
           <div><h4>Explore</h4><ul><li><a href="#/discover?sort=most_viewed">Most viewed projects</a></li><li><a href="#/discover?status=current">Projects in progress</a></li></ul></div>`;
      document.querySelectorAll('[data-logout]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); this.logout(); }));
      this.highlightNav();
    },

    openMenu(open) {
      const overlay = document.getElementById('menuOverlay');
      overlay.hidden = !open;
      document.body.classList.toggle('menu-open', open);
      document.getElementById('menuToggle').setAttribute('aria-expanded', String(open));
      if (open) { const first = overlay.querySelector('.menu-links a'); if (first) first.focus(); } else document.getElementById('menuToggle').focus({ preventScroll: true });
    },

    highlightNav() {
      const h = location.hash || '#/';
      document.querySelectorAll('#mainNav a, #menuLinks a').forEach((a) => {
        const href = a.getAttribute('href');
        // Dashboard roots (#/admin, #/manage) only light up on their own overview page
        const exactOnly = href === '#/' || href === '#/admin' || href === '#/manage';
        const on = exactOnly ? (h === href || h.startsWith(`${href}?`) || (href === '#/' && h === '')) : (h === href || h.startsWith(`${href}/`) || h.startsWith(`${href}?`));
        // "Overview" (#/admin) should not stay highlighted on the deeper admin pages that have their own link
        const deeper = [...document.querySelectorAll('#mainNav a')].some((o) => o !== a && o.getAttribute('href').startsWith(`${href}/`) && h.startsWith(o.getAttribute('href')));
        a.classList.toggle('active', on && !deeper);
      });
    },

    async logout() {
      try { await API.post('/api/auth/logout'); } catch (_) { /* session may already be gone */ }
      this.user = null;
      this.favIds = [];
      this.renderHeader();
      UI.toast('You have been logged out.');
      location.hash = '#/';
    },

    /** Saves/removes a favourite from any card or detail page (stories 39, 40). */
    async toggleFavourite(idpId, btn) {
      if (!this.user) { UI.toast('Log in as a customer to save favourites.'); location.hash = `#/login?next=${encodeURIComponent(location.hash)}`; return; }
      if (this.user.role !== 'customer') { UI.toast('Only customer accounts can save favourites.', 'error'); return; }
      const on = this.favIds.includes(idpId);
      try {
        if (on) {
          const r = await API.del(`/api/customer/favourites/${idpId}`);
          this.favIds = this.favIds.filter((i) => i !== idpId);
          UI.toast(r.message);
        } else {
          const r = await API.post('/api/customer/favourites', { idpId });
          this.favIds.push(idpId);
          UI.toast(r.message);
        }
        if (btn) {
          btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
          btn.classList.toggle('on', !on);
          btn.setAttribute('aria-pressed', String(!on));
          btn.setAttribute('aria-label', `${!on ? 'Remove from' : 'Save to'} favourites`);
          if (btn.dataset.label) btn.innerHTML = `${UI.HEART} ${!on ? 'Saved to favourites' : 'Save to favourites'}`;
        }
      } catch (e) { UI.toast(e.message, 'error'); }
    },

    /** Wires favourite buttons inside a container. */
    bindFavButtons(container) {
      container.querySelectorAll('[data-fav]').forEach((b) => b.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation(); this.toggleFavourite(Number(b.dataset.fav), b);
      }));
    },

    /**
     * Dashboard layout with a role sidebar. Links may carry `count` (initial badge) and
     * `countFn` (async, returns the latest number) so badges update live: after any change
     * made through the API, when the window regains focus, and every 30 seconds.
     */
    dash(title, links, active, body, { sub = '' } = {}) {
      this.stopDashCounts();
      const item = (l) => {
        if (l.group) return `<div class="group">${esc(l.group)}</div>`;
        if (l.countFn) this.dashCounters[l.key] = l.countFn;
        const badge = l.countFn || l.count !== undefined
          ? `<span class="count" data-count-for="${l.key}" ${l.count ? '' : 'hidden'}>${l.count || 0}</span>` : '';
        return `<a href="${l.href}" class="${l.key === active ? 'active' : ''}">${esc(l.label)}${badge}</a>`;
      };
      app.innerHTML = `<div class="dash"><aside class="side" aria-label="${esc(title)} navigation"><p class="side-title">${esc(title)}</p>
        ${sub ? `<p class="side-sub">${esc(sub)}</p>` : ''}<nav>${links.map(item).join('')}</nav>
        </aside><section class="dash-main" id="dashMain">${body || UI.loading()}</section></div>`;
      if (Object.keys(this.dashCounters).length) {
        this.dashTimer = setInterval(() => this.refreshDashCounts(), 30000);
      }
      return document.getElementById('dashMain');
    },

    dashCounters: {},
    stopDashCounts() {
      if (this.dashTimer) clearInterval(this.dashTimer);
      this.dashTimer = null;
      this.dashCounters = {};
    },

    /** Re-reads every live sidebar badge and animates the ones that changed. */
    async refreshDashCounts() {
      await Promise.all(Object.entries(this.dashCounters).map(async ([key, fn]) => {
        const el = document.querySelector(`[data-count-for="${key}"]`);
        if (!el) return;
        let n;
        try { n = await fn(); } catch (_) { return; }
        if (String(n) !== el.textContent) {
          el.textContent = n;
          el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
        }
        el.hidden = !n;
        window.dispatchEvent(new CustomEvent('dm:count', { detail: { key, value: n } }));
      }));
    },

    /** Fades sections in as they scroll into view (only elements marked .reveal). */
    reveal(root = app) {
      const els = root.querySelectorAll('.reveal:not(.is-in)');
      if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-in')); return; }
      if (this.io) this.io.disconnect();
      this.io = new IntersectionObserver((entries) => entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('is-in'); this.io.unobserve(en.target); }
      }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      els.forEach((e) => this.io.observe(e));
    },

    query() {
      const h = location.hash;
      const i = h.indexOf('?');
      return Object.fromEntries(new URLSearchParams(i >= 0 ? h.slice(i + 1) : ''));
    },
  };
  window.App = App;

  // ---------- Routes ----------
  const V = () => window.Views;
  const routes = [
    [/^#?\/?$/, () => V().home()],
    [/^#\/discover$/, () => V().discover()],
    [/^#\/designers$/, () => V().designers()],
    [/^#\/idp\/(\d+)$/, (m) => V().idpDetail(m[1])],
    [/^#\/designer\/(\d+)$/, (m) => V().designerPage(m[1])],
    [/^#\/login$/, () => V().login()],
    [/^#\/register$/, () => V().registerCustomer()],
    [/^#\/register\/designer$/, () => V().registerDesigner()],
    [/^#\/account$/, () => V().account(), 'any'],
    [/^#\/favourites$/, () => V().favourites(), 'customer'],
    [/^#\/enquiries$/, () => V().customerEnquiries(), 'customer'],
    [/^#\/studio$/, () => V().studioDashboard(), 'designer'],
    [/^#\/studio\/portfolio$/, () => V().studioPortfolio(), 'designer'],
    [/^#\/studio\/idp\/new$/, () => V().studioIdpForm(null), 'designer'],
    [/^#\/studio\/idp\/(\d+)$/, (m) => V().studioIdpView(m[1]), 'designer'],
    [/^#\/studio\/idp\/(\d+)\/edit$/, (m) => V().studioIdpForm(m[1]), 'designer'],
    [/^#\/studio\/company$/, () => V().studioCompany(), 'designer'],
    [/^#\/studio\/analytics$/, () => V().studioAnalytics(), 'designer'],
    [/^#\/studio\/enquiries$/, () => V().studioEnquiries(), 'designer'],
    [/^#\/studio\/preview$/, () => V().studioPreview(), 'designer'],
    [/^#\/admin$/, () => V().adminOverview(), 'admin'],
    [/^#\/admin\/accounts$/, () => V().adminAccounts(), 'admin'],
    [/^#\/admin\/activity$/, () => V().adminActivity(), 'admin'],
    [/^#\/admin\/accounts\/new$/, () => V().adminAccountForm(null), 'admin'],
    [/^#\/admin\/accounts\/(\d+)$/, (m) => V().adminAccountDetail(m[1]), 'admin'],
    [/^#\/admin\/accounts\/(\d+)\/edit$/, (m) => V().adminAccountForm(m[1]), 'admin'],
    [/^#\/admin\/registrations$/, () => V().adminRegistrations(), 'admin'],
    [/^#\/admin\/profiles$/, () => V().adminProfiles(), 'admin'],
    [/^#\/admin\/profiles\/new$/, () => V().adminProfileForm(null), 'admin'],
    [/^#\/admin\/profiles\/(\d+)$/, (m) => V().adminProfileDetail(m[1]), 'admin'],
    [/^#\/manage$/, () => V().manageOverview(), 'manager'],
    [/^#\/manage\/categories$/, () => V().manageCategories(), 'manager'],
    [/^#\/manage\/reports$/, () => V().manageReports(), 'manager'],
    [/^#\/manage\/reports\/(\d+)$/, (m) => V().manageReportView(m[1]), 'manager'],
  ];

  let routeSeq = 0;

  // Photos fade in once loaded (CSS hides them until .is-loaded); covers images added at any time
  const markLoaded = (root) => root.querySelectorAll('img:not(.is-loaded)').forEach((img) => {
    if (img.complete) { img.classList.add('is-loaded'); return; }
    const done = () => img.classList.add('is-loaded');
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
  });
  new MutationObserver((list) => { if (list.some((x) => x.addedNodes.length)) markLoaded(app); }).observe(app, { childList: true, subtree: true });

  async function route() {
    const full = location.hash || '#/';
    const path = full.split('?')[0];
    if (!document.getElementById('menuOverlay').hidden) App.openMenu(false);
    App.stopDashCounts();
    document.body.classList.toggle('has-hero', path === '#/' || path === '' || path === '#');
    updateHeader();
    App.highlightNav();
    for (const [re, handler, role] of routes) {
      const m = path.match(re);
      if (!m) continue;
      if (role) {
        if (!App.user) { location.hash = `#/login?next=${encodeURIComponent(full)}`; return; }
        if (role !== 'any' && App.user.role !== role) {
          app.innerHTML = `<div class="wrap section">${UI.empty('This page is not available to your account', 'You are signed in with a role that cannot open this page.', `<a class="btn" href="${App.homeFor()}">Go to my dashboard</a>`)}</div>`;
          return;
        }
        if (App.user.mustChangePassword && path !== '#/account') { location.hash = '#/account'; return; }
      }
      // Smooth hand-over: the old page fades out (150 ms), the new one fades in once it has rendered.
      // If loading takes longer than half a second the loading state is shown instead of a blank page.
      const token = ++routeSeq;
      if (app.childElementCount) {
        app.classList.add('page-leave');
        await new Promise((r) => setTimeout(r, 150));
        if (token !== routeSeq) return; // a newer navigation took over
      }
      window.scrollTo(0, 0);
      app.classList.remove('page-enter');
      const showLoading = setTimeout(() => app.classList.remove('page-leave'), 500);
      try { await handler(m); } catch (e) {
        app.innerHTML = `<div class="wrap section">${UI.empty('Something went wrong', e.message, '<a class="btn ghost" href="#/">Back to home</a>')}</div>`;
      }
      clearTimeout(showLoading);
      if (token !== routeSeq) return;
      app.classList.remove('page-leave');
      void app.offsetWidth; // restart the page-enter animation
      app.classList.add('page-enter');
      App.reveal();
      updateHeader();
      app.focus({ preventScroll: true });
      return;
    }
    app.innerHTML = `<div class="wrap section">${UI.empty('Page not found', 'The page you were looking for does not exist.', '<a class="btn" href="#/">Back to home</a>')}</div>`;
  }

  window.addEventListener('hashchange', route);
  window.addEventListener('dm:password-change', () => { if (App.user) { App.user.mustChangePassword = true; location.hash = '#/account'; } });
  window.addEventListener('dm:unauthorised', async () => { await App.refreshUser(); });
  document.getElementById('menuToggle').addEventListener('click', () => App.openMenu(true));
  document.querySelector('[data-menu-close]').addEventListener('click', () => App.openMenu(false));
  document.getElementById('menuOverlay').addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#/"]');
    if (a && a.getAttribute('href') === location.hash) App.openMenu(false); // same page: hashchange will not fire
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !document.getElementById('menuOverlay').hidden) App.openMenu(false); });

  // Live badges: refresh after any change made through the API and when the tab regains focus
  let countDebounce;
  const kickCounts = () => { clearTimeout(countDebounce); countDebounce = setTimeout(() => App.refreshDashCounts(), 200); };
  window.addEventListener('dm:changed', kickCounts);
  window.addEventListener('focus', kickCounts);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kickCounts(); });

  // The header is transparent over the dark home hero and turns solid once the page scrolls past it
  const header = document.getElementById('siteHeader');
  function updateHeader() {
    const hero = document.querySelector('.hero');
    const over = document.body.classList.contains('has-hero') && hero && window.scrollY < hero.offsetHeight - header.offsetHeight;
    header.classList.toggle('over', Boolean(over));
  }
  window.addEventListener('scroll', updateHeader, { passive: true });

  App.refreshUser().then(route);
})();
