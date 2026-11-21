'use strict';
/* Sign in, sign up, two-step verification, password reset and the account sheet.
   Loaded before app.js; it uses app.js globals (S, t, api, esc, toast, openSheet…) only when called.
   The access token lives in memory only. The refresh token is an HttpOnly cookie the page cannot read. */
const A = { access: null, user: null, timer: null, pending: null };
const AU = { mode: 'in', err: '', busy: false, id: '', name: '', pw: '', code: '', mfaToken: '', sent: false, sessions: null, setup: null, rec: null, msg: '', cur: '', nw: '', tok: '' };

function aerr(e) {
  if (e.code === 'rate') return t('errRate', { n: Math.max(1, Math.ceil((e.retry || 60) / 60)) });
  if (e.code === 'busy') return t('errBusy');
  if (e.code === 'exists') return t('errExists');
  if (e.code === 'expired') return t('errExpired');
  if (e.code === 'bad' || e.status === 401) return AU.mode === 'mfa' || AU.setup ? t('errCode') : t('errBad');
  return e.message;
}

// ── tokens
function authSet(j) {
  A.access = j.access; A.user = j.user; try { localStorage.setItem('if_authed', '1'); } catch { }
  clearTimeout(A.timer); A.timer = setTimeout(() => authRefresh(), Math.max(20, (j.expires || 900) - 60) * 1000);
}
function authClear() { A.access = null; A.user = null; clearTimeout(A.timer); try { localStorage.removeItem('if_authed'); } catch { } }
function authRefresh() {
  if (A.pending) return A.pending;
  A.pending = fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin', headers: { 'x-requested-with': 'instadrop', 'content-type': 'application/json' }, body: '{}' })
    .then(async r => { if (!r.ok) { if (r.status === 401 || r.status === 400) authClear(); return false; } authSet(await r.json()); return true; })
    .catch(() => false).finally(() => { A.pending = null; if (typeof renderHeader === 'function') renderHeader(); });
  return A.pending;
}
async function afterSignIn() {
  const u = A.user; if (!u) return;
  if (u.name && !S.info.name) S.info.name = u.name; if (u.phone && !S.info.phone) S.info.phone = '+' + String(u.phone).replace(/^\+/, '');
  LS.set('if_info', S.info);
  try { // orders from every device, with their private tracking tokens
    const os = await api('/me/orders'); for (const o of os) { if (o.ctoken) S.tok[o.id] = o.ctoken; if (!S.orders.includes(o.id)) S.orders.push(o.id); }
    LS.set('if_tok', S.tok); LS.set('if_orders', S.orders); if (S.view === 'orders') render();
  } catch { }
  renderHeader();
}
async function authInit() {
  const q = new URLSearchParams(location.search), rt = q.get('reset');
  if (rt) { history.replaceState(null, '', '/'); AU.tok = rt; AU.mode = 'reset'; AU.err = ''; }
  let was = false; try { was = !!localStorage.getItem('if_authed'); } catch { }
  if (was) { await authRefresh(); if (A.user) afterSignIn(); }
  return !!rt;
}

// ── sheet rendering
const fld = (id, label, type, val, extra) => `<label for="au-${id}">${esc(label)}</label><input id="au-${id}" type="${type}" value="${esc(val)}" ${extra || ''}>`;
const pwField = (id, label, val, auto) => `<label for="au-${id}">${esc(label)}</label><div class="pwrow"><input id="au-${id}" type="password" value="${esc(val)}" autocomplete="${auto}"><button type="button" class="lnk" data-act="au-eye" data-for="au-${id}">${esc(t('pwShow'))}</button></div>`;
const errBox = () => AU.err ? `<p class="aerr" role="alert">${esc(AU.err)}</p>` : '';
const okBox = () => AU.msg ? `<p class="aok" role="status">${esc(AU.msg)}</p>` : '';
function ago(ts) { const s = Math.max(0, (Date.now() - ts) / 1000); if (s < 90) return t('justNow'); try { const f = new Intl.RelativeTimeFormat(LANGS[S.lang].tag, { numeric: 'auto' }); return s < 5400 ? f.format(-Math.round(s / 60), 'minute') : s < 129600 ? f.format(-Math.round(s / 3600), 'hour') : f.format(-Math.round(s / 86400), 'day'); } catch { return new Date(ts).toLocaleDateString(); } }

function authSheet() {
  const el = $('#pick'), head = (title) => `<div class="row"><h2>${esc(title)}</h2><button class="lnk" data-act="close">${esc(t('close'))}</button></div>`;
  const dial = (typeof country === 'function' && country(S.cc) || {}).dial;
  const busy = AU.busy ? 'disabled' : '';
  if (S.sheet === 'auth') {
    if (AU.mode === 'mfa') { el.innerHTML = head(t('mfaTitle')) + `<form id="au-form" class="form" autocomplete="off"><p class="meta">${esc(t('mfaPrompt'))}</p>${fld('code', t('mfaCode'), 'text', AU.code, 'inputmode="numeric" autocomplete="one-time-code" autofocus')}${errBox()}<button class="btn" ${busy}>${esc(t('verify'))}</button></form>`; return true; }
    if (AU.mode === 'forgot') { el.innerHTML = head(t('forgot')) + `<form id="au-form" class="form">${AU.sent ? `<p class="aok" role="status">${esc(t('sentIfExists'))}</p>` : fld('id', t('idLabel'), 'text', AU.id, 'autocomplete="username" inputmode="email"') + errBox() + `<button class="btn" ${busy}>${esc(t('sendLink'))}</button>`}<button type="button" class="lnk" data-act="au-mode" data-m="in">← ${esc(t('signIn'))}</button></form>`; return true; }
    const up = AU.mode === 'up';
    el.innerHTML = head(up ? t('signUp') : t('signIn')) + `<p class="meta">${esc(t('authWhy'))}</p>${okBox()}<form id="au-form" class="form">
      ${up ? fld('name', t('name'), 'text', AU.name, 'autocomplete="name" maxlength="60"') : ''}
      ${fld('id', t('idLabel'), 'text', AU.id, 'autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="' + esc(t('idPh')) + '"')}
      ${pwField('pw', t('pwLabel'), AU.pw, up ? 'new-password' : 'current-password')}${up ? `<p class="meta">${esc(t('pwHint'))}</p>` : ''}${errBox()}
      <button class="btn" ${busy}>${esc(up ? t('signUp') : t('signIn'))}</button>
      ${up ? '' : `<button type="button" class="lnk" data-act="au-mode" data-m="forgot">${esc(t('forgot'))}</button>`}
      <p class="meta">${esc(up ? t('haveAcct') : t('noAcct'))} <button type="button" class="lnk" data-act="au-mode" data-m="${up ? 'in' : 'up'}">${esc(up ? t('signIn') : t('signUp'))}</button></p>
      <button type="button" class="lnk" data-act="close">${esc(t('guest'))}</button></form>`;
    return true;
  }
  if (S.sheet === 'reset') {
    el.innerHTML = head(t('resetTitle')) + `<form id="au-form" class="form">${pwField('pw', t('pwNew'), AU.pw, 'new-password')}<p class="meta">${esc(t('pwHint'))}</p>${errBox()}<button class="btn" ${busy}>${esc(t('resetSave'))}</button></form>`; return true;
  }
  if (S.sheet === 'account' && A.user) {
    const u = A.user;
    let h = head(t('account')) + `<p class="meta">${esc(t('welcome', { name: u.name }))}<br>${esc(u.email || '+' + u.phone)}</p>${okBox()}${errBox()}`;
    if (AU.rec) h += `<div class="order"><b>${esc(t('recTitle'))}</b><p class="meta">${esc(t('recInfo'))}</p><pre class="rec">${esc(AU.rec.join('\n'))}</pre><button class="btn" data-act="au-copy">${esc(t('copy'))}</button> <button class="lnk" data-act="au-rec-done">${esc(t('close'))}</button></div>`;
    h += `<h3 class="cat" style="font-size:18px">${esc(t('mfaTitle'))}</h3><p class="meta">${esc(t('mfaInfo'))} <b>${esc(u.mfa ? t('mfaOn') : t('mfaOff'))}</b></p>`;
    if (AU.setup) h += `<form id="au-form" class="form"><p class="meta">${esc(t('mfaSetup'))}</p><p class="meta">${esc(t('mfaKey'))}: <code class="key">${esc(AU.setup.secret.replace(/(.{4})/g, '$1 ').trim())}</code></p><a class="lnk" href="${esc(AU.setup.uri)}">${esc(t('mfaOpen'))}</a>${fld('code', t('mfaCode'), 'text', AU.code, 'inputmode="numeric" autocomplete="one-time-code"')}<button class="btn">${esc(t('mfaConfirm'))}</button></form>`;
    else if (AU.off) h += `<form id="au-form" class="form">${fld('code', t('mfaCode'), 'text', AU.code, 'inputmode="numeric" autocomplete="one-time-code"')}${pwField('pw', t('pwLabel'), AU.pw, 'current-password')}<button class="btn">${esc(t('mfaTurnOff'))}</button></form>`;
    else h += `<button class="btn" data-act="${u.mfa ? 'au-mfa-off' : 'au-mfa-on'}">${esc(u.mfa ? t('mfaTurnOff') : t('mfaTurnOn'))}</button>`;
    h += `<h3 class="cat" style="font-size:18px">${esc(t('changePw'))}</h3><form id="au-pwform" class="form">${pwField('cur', t('pwCurrent'), AU.cur, 'current-password')}${pwField('nw', t('pwNew'), AU.nw, 'new-password')}<button class="btn">${esc(t('changePw'))}</button></form>`;
    h += `<h3 class="cat" style="font-size:18px">${esc(t('devices'))}</h3>` + (AU.sessions ? AU.sessions.map(s => `<div class="order"><div class="row"><b>${esc(s.device || '?')}</b>${s.current ? `<span class="tag">${esc(t('thisDevice'))}</span>` : `<button class="lnk" data-act="au-revoke" data-sid="${esc(s.sid)}">${esc(t('signOutDev'))}</button>`}</div><div class="meta">${esc(s.ip)} · ${esc(t('lastActive', { when: ago(s.last) }))}</div></div>`).join('') : `<p class="meta">${esc(t('loading'))}</p>`);
    h += `<div style="display:grid;gap:8px;margin-top:16px"><button class="btn" data-act="au-out">${esc(t('signOut'))}</button><button class="lnk" data-act="au-out-all">${esc(t('signOutAll'))}</button></div>`;
    el.innerHTML = h; return true;
  }
  return false;
}
function openAuth(mode) { Object.assign(AU, { mode: mode || 'in', err: '', msg: '', sent: false, busy: false, code: '', pw: '' }); openSheet('auth'); }
function openAccount() { Object.assign(AU, { err: '', msg: '', setup: null, rec: null, off: false, code: '', pw: '', cur: '', nw: '', sessions: null }); openSheet('account'); api('/auth/sessions').then(j => { AU.sessions = j.sessions; if (S.sheet === 'account') sheetUI(); }).catch(() => { AU.sessions = []; if (S.sheet === 'account') sheetUI(); }); }

// ── actions
const rerender = () => { if (S.sheet) sheetUI(); };
async function run(fn) { AU.busy = true; AU.err = ''; AU.msg = ''; rerender(); try { await fn(); } catch (e) { AU.err = aerr(e); } AU.busy = false; rerender(); const f = $('#au-form input'); if (AU.err && f && !f.value) f.focus(); }
async function signedIn(j) { authSet(j); AU.pw = ''; AU.code = ''; closeAll(); toast(t('welcome', { name: j.user.name })); renderHeader(); afterSignIn(); }

async function authSubmit(form) {
  const dial = (typeof country === 'function' && country(S.cc) || {}).dial;
  if (S.sheet === 'auth' && AU.mode === 'in') return run(async () => { const j = await api('/auth/login', { m: 'POST', noauth: 1, b: { identifier: AU.id.trim(), password: AU.pw, dial } }); if (j.mfa) { AU.mfaToken = j.mfaToken; AU.mode = 'mfa'; AU.pw = ''; return; } await signedIn(j); });
  if (S.sheet === 'auth' && AU.mode === 'up') return run(async () => signedIn(await api('/auth/signup', { m: 'POST', noauth: 1, b: { name: AU.name, identifier: AU.id.trim(), password: AU.pw, dial } })));
  if (S.sheet === 'auth' && AU.mode === 'mfa') return run(async () => signedIn(await api('/auth/mfa/verify', { m: 'POST', noauth: 1, b: { mfaToken: AU.mfaToken, code: AU.code.trim() } })));
  if (S.sheet === 'auth' && AU.mode === 'forgot') return run(async () => { await api('/auth/forgot', { m: 'POST', noauth: 1, b: { identifier: AU.id.trim(), dial } }); AU.sent = true; });
  if (S.sheet === 'reset') return run(async () => { await api('/auth/reset', { m: 'POST', noauth: 1, b: { token: AU.tok, password: AU.pw } }); AU.pw = ''; AU.mode = 'in'; AU.msg = t('resetDone'); S.sheet = 'auth'; });
  if (S.sheet === 'account' && AU.setup) return run(async () => { const j = await api('/auth/mfa/enable', { m: 'POST', b: { code: AU.code.trim() } }); AU.rec = j.recovery; AU.setup = null; AU.code = ''; A.user = { ...A.user, mfa: true }; });
  if (S.sheet === 'account' && AU.off) return run(async () => { await api('/auth/mfa/disable', { m: 'POST', b: { code: AU.code.trim(), password: AU.pw } }); AU.off = false; AU.code = ''; AU.pw = ''; A.user = { ...A.user, mfa: false }; });
}
async function pwChange() { return run(async () => { await api('/auth/password', { m: 'POST', b: { password: AU.cur, newPassword: AU.nw } }); AU.cur = AU.nw = ''; AU.msg = t('pwSaved'); AU.sessions = null; api('/auth/sessions').then(j => { AU.sessions = j.sessions; rerender(); }).catch(() => { }); }); }
async function signOut(all) { try { await api(all ? '/auth/logout-all' : '/auth/logout', { m: 'POST', b: {} }); } catch { } authClear(); closeAll(); renderHeader(); toast(t('signedOut')); }

document.addEventListener('submit', e => { if (e.target.id === 'au-form') { e.preventDefault(); authSubmit(); } else if (e.target.id === 'au-pwform') { e.preventDefault(); pwChange(); } });
document.addEventListener('input', e => { const x = e.target, k = x.id && x.id.startsWith('au-') ? x.id.slice(3) : null; if (k && k in AU) AU[k] = x.value; });
document.addEventListener('click', e => {
  const b = e.target.closest('button, a'); if (!b || !b.dataset.act) return; const a = b.dataset.act;
  if (a === 'account') return A.user ? openAccount() : openAuth('in');
  if (!a.startsWith('au-')) return;
  if (a === 'au-mode') { AU.mode = b.dataset.m; AU.err = ''; AU.msg = ''; AU.sent = false; return sheetUI(); }
  if (a === 'au-eye') { const i = $('#' + b.dataset.for); i.type = i.type === 'password' ? 'text' : 'password'; b.textContent = t(i.type === 'password' ? 'pwShow' : 'pwHide'); return; }
  if (a === 'au-mfa-on') return run(async () => { AU.setup = await api('/auth/mfa/setup', { m: 'POST', b: {} }); AU.code = ''; });
  if (a === 'au-mfa-off') { AU.off = true; AU.code = ''; AU.pw = ''; return sheetUI(); }
  if (a === 'au-rec-done') { AU.rec = null; return sheetUI(); }
  if (a === 'au-copy') { try { navigator.clipboard.writeText(AU.rec.join('\n')).then(() => toast(t('copied'))); } catch { } return; }
  if (a === 'au-revoke') return run(async () => { await api('/auth/sessions/' + b.dataset.sid, { m: 'DELETE' }); AU.sessions = (AU.sessions || []).filter(s => s.sid !== b.dataset.sid); });
  if (a === 'au-out') return signOut(false);
  if (a === 'au-out-all') return signOut(true);
});
