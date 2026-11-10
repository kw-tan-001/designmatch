/* UI Boundary -> API Boundary adapter. The browser never talks to the database;
   every action goes through these HTTP calls to the Express routes. */
(function () {
  'use strict';

  async function request(method, path, { body, params, form } = {}) {
    let url = path;
    if (params) {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v === undefined || v === null || v === '') return;
        if (Array.isArray(v)) { if (v.length) qs.set(k, v.join(',')); } else qs.set(k, v);
      });
      const s = qs.toString();
      if (s) url += (url.includes('?') ? '&' : '?') + s;
    }
    const opts = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (form) opts.body = form;
    else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    let res;
    try {
      res = await fetch(url, opts);
    } catch (e) {
      const err = new Error('Could not reach the server. Check your connection and try again.');
      err.status = 0;
      throw err;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status}).`);
      err.status = res.status;
      err.data = data;
      if (data.code === 'PASSWORD_CHANGE_REQUIRED') window.dispatchEvent(new CustomEvent('dm:password-change'));
      if (res.status === 401 && method !== 'GET') window.dispatchEvent(new CustomEvent('dm:unauthorised'));
      throw err;
    }
    // Lets open pages refresh live figures (e.g. the approvals badge) after any change
    if (method !== 'GET') window.dispatchEvent(new CustomEvent('dm:changed', { detail: { method, path } }));
    return data;
  }

  window.API = {
    get: (path, params) => request('GET', path, { params }),
    post: (path, body) => request('POST', path, { body }),
    put: (path, body) => request('PUT', path, { body }),
    patch: (path, body) => request('PATCH', path, { body }),
    del: (path) => request('DELETE', path),
    send: (method, path, form) => request(method, path, { form }),
    /** Downloads a file response (report export) and saves it in the browser. */
    async download(path) {
      const res = await fetch(path, { credentials: 'same-origin' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Export failed.');
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const name = (cd.match(/filename="([^"]+)"/) || [])[1] || 'report';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      return name;
    },
  };
})();
