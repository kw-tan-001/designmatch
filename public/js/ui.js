/* Shared UI helpers (UI Boundary). */
(function () {
  'use strict';

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => `S$${Number(n || 0).toLocaleString('en-SG')}`;
  const k = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  const budget = (min, max) => `S$${k(min)} to ${k(max)}`;
  const date = (d) => (d ? new Date(d).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const dateTime = (d) => (d ? new Date(d).toLocaleString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  const initials = (s) => esc(String(s || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase());
  const PLACEHOLDER = '/img/placeholder.svg';

  // Broken images fall back to a neutral placeholder (CSP forbids inline onerror handlers)
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (t && t.tagName === 'IMG' && !t.dataset.fallback) { t.dataset.fallback = '1'; t.src = PLACEHOLDER; }
  }, true);

  function toast(message, type = 'ok') {
    const el = document.createElement('div');
    el.className = `toast ${type === 'error' ? 'error' : ''}`;
    el.textContent = message;
    document.getElementById('toasts').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, type === 'error' ? 6000 : 3800);
  }

  function modal(html, { wide = false, label = 'Dialog' } = {}) {
    const root = document.getElementById('modalRoot');
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(label)}">${html}</div>`;
    const prevFocus = document.activeElement;
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); if (prevFocus) prevFocus.focus(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onKey);
    root.appendChild(back);
    const focusable = back.querySelector('input, textarea, select, button');
    if (focusable) focusable.focus();
    return { el: back.querySelector('.modal'), close };
  }

  function confirm(message, { title = 'Are you sure?', confirmLabel = 'Confirm', danger = false } = {}) {
    return new Promise((resolve) => {
      const m = modal(`<h2>${esc(title)}</h2><p>${esc(message)}</p>
        <div class="btn-row"><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(confirmLabel)}</button>
        <button class="btn ghost" data-close>Cancel</button></div>`, { label: title });
      let done = false;
      m.el.querySelector('[data-ok]').addEventListener('click', () => { done = true; m.close(); resolve(true); });
      const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); if (!done) resolve(false); } });
      obs.observe(document.getElementById('modalRoot'), { childList: true });
    });
  }

  const skeletonCards = (n = 6) => `<div class="card-grid" aria-hidden="true">${'<div class="skel-card"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>'.repeat(n)}</div>`;
  const loading = (text = 'Loading') => `<div class="loading"><span class="spinner" aria-hidden="true"></span>${esc(text)}...</div>`;
  const empty = (title, text, action = '') => `<div class="empty"><h3>${esc(title)}</h3><p class="muted">${esc(text)}</p>${action}</div>`;
  const errorBox = (msg) => `<div class="form-error" role="alert">${esc(msg)}</div>`;

  const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.1A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.8c0 5.5-7.5 10.1-7.5 10.1z" fill="none" stroke="#2a2826" stroke-width="1.6"/></svg>';

  function idpCard(idp, { favIds = null, href = null } = {}) {
    const link = href || `#/idp/${idp.idp_id}`;
    const fav = favIds ? `<button class="fav-btn ${favIds.includes(idp.idp_id) ? 'on' : ''}" data-fav="${idp.idp_id}"
       aria-pressed="${favIds.includes(idp.idp_id)}" aria-label="${favIds.includes(idp.idp_id) ? 'Remove from' : 'Save to'} favourites">${HEART}</button>` : '';
    return `<div class="idp-card-wrap">
      <a class="idp-card" href="${link}">
        <div class="ph"><img loading="lazy" src="${esc(idp.cover_url || PLACEHOLDER)}" alt=""><span class="status-pill">${idp.status === 'past' ? 'Completed' : 'In progress'}</span></div>
        <div class="meta"><span>${esc(idp.category_name)}, ${esc(idp.location)}</span><span>${budget(idp.budget_min, idp.budget_max)}</span></div>
        <h3>${esc(idp.title)}</h3>
        <div class="meta foot"><span class="by">${esc(idp.company_name || idp.designer_name || '')}</span><span>${idp.view_count ?? 0} views, ${idp.favourite_count ?? 0} saves</span></div>
      </a>${fav}</div>`;
  }

  function pagination(el, { page, totalPages }, onPage) {
    if (!el) return;
    if (!totalPages || totalPages <= 1) { el.innerHTML = ''; return; }
    const pages = new Set([1, totalPages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= totalPages));
    const list = [...pages].sort((a, b) => a - b);
    let html = `<button ${page === 1 ? 'disabled' : ''} data-p="${page - 1}" aria-label="Previous page">&lsaquo;</button>`;
    list.forEach((p, i) => {
      if (i && p - list[i - 1] > 1) html += '<button disabled>...</button>';
      html += `<button data-p="${p}" class="${p === page ? 'current' : ''}" ${p === page ? 'aria-current="page"' : ''}>${p}</button>`;
    });
    html += `<button ${page === totalPages ? 'disabled' : ''} data-p="${page + 1}" aria-label="Next page">&rsaquo;</button>`;
    el.innerHTML = html;
    el.querySelectorAll('button[data-p]').forEach((b) => b.addEventListener('click', () => onPage(Number(b.dataset.p))));
  }

  /** Line chart from real values. series: [{ name, values, color }], labels: [...] */
  function lineChart(labels, series, { height = 200 } = {}) {
    const W = 900; const H = height; const pad = { l: 34, r: 24, t: 12, b: 26 };
    const max = Math.max(1, ...series.flatMap((s) => s.values));
    const x = (i) => pad.l + (labels.length <= 1 ? 0 : (i * (W - pad.l - pad.r)) / (labels.length - 1));
    const y = (v) => H - pad.b - (v / max) * (H - pad.t - pad.b);
    const ticks = [0, Math.round(max / 2), max];
    let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map((s) => s.name).join(' and '))} over time">`;
    ticks.forEach((t) => { svg += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}" stroke="#e9e3d9"/><text x="${pad.l - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`; });
    const step = Math.ceil(labels.length / 7);
    labels.forEach((l, i) => { if (i % step === 0 || i === labels.length - 1) svg += `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === labels.length - 1 ? 'end' : (i === 0 ? 'start' : 'middle')}">${esc(l)}</text>`; });
    series.forEach((s) => {
      const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
      svg += `<polyline fill="none" stroke="${s.color}" stroke-width="2" points="${pts}"/>`;
      s.values.forEach((v, i) => { svg += `<circle cx="${x(i)}" cy="${y(v)}" r="2.5" fill="${s.color}"><title>${esc(labels[i])}: ${v} ${esc(s.name)}</title></circle>`; });
    });
    svg += '</svg>';
    const legend = `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
    return svg + legend;
  }

  function barList(items) {
    const max = Math.max(1, ...items.map((i) => i.value));
    if (!items.length) return '<p class="muted small">No activity recorded yet.</p>';
    return `<div class="bar-list">${items.map((i) => `<div class="bar-item"><span title="${esc(i.label)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(i.label)}</span>
      <span class="track"><span class="fill" style="width:${(i.value / max) * 100}%"></span></span><span class="num" style="text-align:right">${i.value}</span></div>`).join('')}</div>`;
  }

  const ARROW = '<svg viewBox="0 0 20 12" aria-hidden="true"><path d="M0 6h18M13 1l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>';
  /** Underlined uppercase call to action ("BROWSE PROJECTS ->"). */
  const ctaLink = (href, label) => `<a class="cta-link" href="${href}">${esc(label)}${ARROW}</a>`;

  /** Standard heading block for inner pages: small label, display title, optional line and actions. */
  const pageHead = ({ label = '', title, sub = '', actions = '' }) => `<header class="page-head"><div class="wrap row">
      <div>${label ? `<span class="eyebrow">${esc(label)}</span>` : ''}<h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div>
      ${actions ? `<div class="btn-row">${actions}</div>` : ''}</div></header>`;

  const formObject = (form) => Object.fromEntries(new FormData(form).entries());

  /** Disables a submit button while the async action runs and reports errors in `errEl`. */
  async function submitting(btn, errEl, fn) {
    if (errEl) errEl.innerHTML = '';
    const label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
    try { return await fn(); } catch (e) {
      if (errEl) errEl.innerHTML = errorBox(e.message); else toast(e.message, 'error');
      return undefined;
    } finally { if (btn && document.body.contains(btn)) { btn.disabled = false; btn.textContent = label; } }
  }

  const statusTag = (s) => {
    const map = { active: 'olive', approved: 'olive', current: 'olive', new: 'warn', pending: 'warn', suspended: 'danger', rejected: 'danger', past: '', read: '' };
    return `<span class="tag ${map[s] ?? ''}">${esc(s)}</span>`;
  };

  window.UI = {
    skeletonCards, esc, money, budget, date, dateTime, initials, toast, modal, confirm, loading, empty, errorBox, idpCard, pagination,
    lineChart, barList, formObject, submitting, statusTag, HEART, PLACEHOLDER, ARROW, ctaLink, pageHead,
  };
})();
