/* Customer pages. UI boundary classes: ManageFavouritesForm (stories 40, 48), SentEnquiriesPage. */
(function () {
  'use strict';

  const { esc } = UI;
  const V = window.Views = window.Views || {};

  V.favourites = async function favourites() {
    App.root.innerHTML = `${UI.pageHead({ label: 'Saved', title: 'Your favourites', sub: 'Projects you have saved. They stay here between visits.', actions: '<a class="btn ghost" href="#/discover">Find more projects</a>' })}
      <div class="wrap page-body">
      <form class="toolbar" id="favSearch" role="search"><input type="search" name="q" placeholder="Search your favourites" aria-label="Search your favourites">
        <button class="btn sm" type="submit">Search</button><button class="btn ghost sm" type="button" id="favClear">Clear</button></form>
      <div id="favList">${UI.loading()}</div></div>`;
    const list = document.getElementById('favList');
    let q = '';
    async function load() {
      list.innerHTML = UI.loading();
      try {
        const data = await API.get('/api/customer/favourites', { q });
        if (!data.results.length) {
          list.innerHTML = q
            ? UI.empty(`No favourites match "${q}"`, 'Try a different word, or clear the search to see all saved projects.')
            : UI.empty('You have not saved any projects yet', 'Tap the heart on any project to keep it here for later.', '<a class="btn primary" href="#/discover">Browse projects</a>');
          return;
        }
        list.innerHTML = `<p class="muted small">${data.total} saved project${data.total === 1 ? '' : 's'}${q ? ` matching "${esc(q)}"` : ''}</p>
          <div class="table-wrap"><table><thead><tr><th></th><th>Project</th><th>Designer</th><th>Budget</th><th>Saved</th><th></th></tr></thead><tbody>
          ${data.results.map((f) => `<tr><td><img class="thumb" src="${esc(f.cover_url || UI.PLACEHOLDER)}" alt=""></td>
            <td><a href="#/idp/${f.idp_id}"><strong>${esc(f.title)}</strong></a><br><span class="small muted">${esc(f.category_name)} in ${esc(f.location)}</span></td>
            <td><a href="#/designer/${f.designer_id}">${esc(f.company_name || '')}</a></td>
            <td>${UI.budget(f.budget_min, f.budget_max)}</td><td>${UI.date(f.saved_at)}</td>
            <td><div class="row-actions"><button class="btn danger sm" data-remove="${f.idp_id}" data-title="${esc(f.title)}">Remove</button></div></td></tr>`).join('')}
          </tbody></table></div>`;
        list.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
          if (!(await UI.confirm(`Remove "${b.dataset.title}" from your favourites?`, { title: 'Remove favourite', confirmLabel: 'Remove', danger: true }))) return;
          try {
            const r = await API.del(`/api/customer/favourites/${b.dataset.remove}`);
            App.favIds = App.favIds.filter((i) => i !== Number(b.dataset.remove));
            UI.toast(r.message);
            load();
          } catch (e) { UI.toast(e.message, 'error'); }
        }));
      } catch (e) { list.innerHTML = UI.errorBox(e.message); }
    }
    const form = document.getElementById('favSearch');
    form.addEventListener('submit', (e) => { e.preventDefault(); q = form.q.value.trim(); load(); });
    document.getElementById('favClear').addEventListener('click', () => { form.q.value = ''; q = ''; load(); });
    load();
  };

  V.customerEnquiries = async function customerEnquiries() {
    App.root.innerHTML = `${UI.pageHead({ label: 'Messages', title: 'My enquiries', sub: 'Messages you have sent to designers from project pages.' })}
      <div class="wrap page-body"><div id="enqList">${UI.loading()}</div></div>`;
    const el = document.getElementById('enqList');
    try {
      const { results } = await API.get('/api/customer/enquiries');
      el.innerHTML = results.length ? `<div class="table-wrap"><table><thead><tr><th>Project</th><th>Designer</th><th>Message</th><th>Sent</th><th>Status</th></tr></thead><tbody>
        ${results.map((r) => `<tr><td><a href="#/idp/${r.idp_id}">${esc(r.idp_title)}</a></td><td>${esc(r.company_name || '')}</td>
          <td style="max-width:420px">${esc(r.message)}</td><td>${UI.date(r.created_at)}</td><td>${r.status === 'read' ? '<span class="tag olive">Read by designer</span>' : '<span class="tag warn">Delivered</span>'}</td></tr>`).join('')}
        </tbody></table></div>` : UI.empty('No enquiries yet', 'Open any project and use the contact form to reach its designer.', '<a class="btn primary" href="#/discover">Browse projects</a>');
    } catch (e) { el.innerHTML = UI.errorBox(e.message); }
  };
})();
