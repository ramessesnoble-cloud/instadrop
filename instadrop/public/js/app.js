'use strict';
/* Instadrop app: customer ordering, kitchen/store dashboard, rider app and admin.
   Sections: utils · state · language · location · regions · header & sheets · home · menu & cart · checkout · tracking · orders · staff · events · boot */

// ───────────────────────── utils
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = { get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v === null || v === undefined ? d : v; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } } };
const hs = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const rad = d => d * Math.PI / 180;
const km = (a, b, c, d) => { const x = rad(c - a), y = rad(d - b), h = Math.sin(x / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(y / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
const wait = ms => new Promise(r => setTimeout(r, ms));
async function api(p, o = {}) {
  const h = { 'content-type': 'application/json', 'x-requested-with': 'instadrop', ...(o.h || {}) };
  const om = p.match(/^\/orders\/([\w-]+)/); if (om && S.tok[om[1]] && !h['x-token']) h['x-token'] = S.tok[om[1]];
  if (A.access && !o.noauth) h.authorization = 'Bearer ' + A.access;
  const r = await fetch('/api' + p, { method: o.m || 'GET', credentials: 'same-origin', headers: h, body: o.b ? JSON.stringify(o.b) : undefined });
  let j = {}; try { j = await r.json(); } catch { }
  if (r.status === 401 && !o._r && !o.noauth && A.user && p !== '/auth/refresh' && await authRefresh()) return api(p, { ...o, _r: 1 });
  if (!r.ok) { const e = new Error(j.code === 'range' ? t('errRange', { max: j.max, km: j.km }) : (j.error || 'Something went wrong')); e.code = j.code; e.status = r.status; e.retry = j.retry || +r.headers.get('retry-after') || 0; throw e; }
  return j;
}
const toast = m => { const e = $('#toast'); e.textContent = m; e.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('on'), 2800); };

// ───────────────────────── state
const S = {
  mode: 'customer', view: 'home', tab: 'all', q: '', cz: '', fl: {}, sort: 'rec', vmode: 'list', city: '',
  countries: [], cc: LS.get('if_cc', null), region: LS.get('if_region', null), vendors: [], v: null, vinfo: LS.get('if_vi', null),
  lang: LS.get('if_lang', 'en'), langSet: LS.get('if_langset', false), langNo: LS.get('if_langno', {}), int: LS.get('if_int', []),
  geo: null, geoWatch: null, geoMsg: '', sheet: null,
  cart: LS.get('if_cart', { vid: null, q: {} }), cartItems: LS.get('if_ci', {}), orders: LS.get('if_orders', []), tok: LS.get('if_tok', {}), track: null,
  info: LS.get('if_info', { name: '', phone: '', address: '', pay: 'Mobile money', promo: '', note: '', momo: '' }),
  fav: LS.get('if_fav', []), diet: [], m: null, gl: [], lp: null, grp: LS.get('if_grp', null), shareLoc: false,
  vauth: LS.get('if_v', { id: '', pin: '' }), rauth: LS.get('if_r', { name: '', pin: '' }), aauth: LS.get('if_a', { pin: '' }), adminVid: null, rAll: false,
  poll: null, ev: null
};
let CUR = 'USD', MAP = null, MK = {}, LINES = {}, GPS = null, VMARK = null;
const SVC = .05, FREE = 30;
const saveCart = () => LS.set('if_cart', S.cart);

const X = { closed: 'Closed', closedMsg: 'This place is closed right now. You can still schedule an order for later.', soldOut: 'Sold out', tax: 'Tax ({r}%)', taxIncl: 'Includes tax {r}% ({amt})', follow: 'Follow rider', fitAll: 'Show everything',
  secAgo: '{n}s ago', minAgo: '{n} min ago', updated: 'Updated {ago}', signalLost: 'No signal, last seen {ago}' };
// ───────────────────────── language
const t = (k, p) => {
  if (X[k] && !((DICT[S.lang] || {})[k])) { const e = X[k]; return p ? e.replace(/\{(\w+)\}/g, (m, x) => p[x] !== undefined ? p[x] : m) : e; }
  let s = (DICT[S.lang] || {})[k]; if (s === undefined) s = DICT.en[k]; if (s === undefined) return k;
  return p ? s.replace(/\{(\w+)\}/g, (m, x) => p[x] !== undefined ? p[x] : m) : s;
};
const money = (n, c) => { try { const d = new Intl.NumberFormat('en', { style: 'currency', currency: c }).resolvedOptions().maximumFractionDigits; return new Intl.NumberFormat(LANGS[S.lang].tag, { style: 'currency', currency: c }).format(n / 10 ** d); } catch { return c + ' ' + n; } };
const fmt = (n, c) => money(n, c || CUR);
const loaded = {};
function loadFont(l) { const f = LANGS[l] && LANGS[l].font; if (!f || loaded[l]) return; loaded[l] = 1; const k = document.createElement('link'); k.rel = 'stylesheet'; k.href = 'https://fonts.googleapis.com/css2?family=' + f + '&display=swap'; document.head.appendChild(k); }
function setLang(l, explicit) {
  if (!DICT[l]) l = 'en'; S.lang = l; LS.set('if_lang', l);
  if (explicit !== undefined) { S.langSet = explicit; LS.set('if_langset', explicit); }
  const el = document.documentElement; el.lang = LANGS[l].tag.split('-')[0]; el.dir = LANGS[l].dir; loadFont(l);
  document.title = 'Instadrop';
}
// The language that belongs to a region: the region's own (Quebec: French), otherwise the country's national language.
// If the browser is set to another language that this country also speaks, that wins (a Spanish-language phone in Texas gets Spanish).
function regionLangs() { const r = regionObj(S.region), c = country(S.cc); return [...new Set([r && r.lang, ...(c.langs || ['en'])].filter(l => l && DICT[l]))]; }
function regionLang() {
  const ls = regionLangs(), r = regionObj(S.region);
  const pref = (navigator.languages || [navigator.language || 'en']).map(x => x.split('-')[0]).find(x => ls.includes(x));
  return (r && r.lang && DICT[r.lang]) ? r.lang : (pref || ls[0] || 'en');
}
const followRegion = () => { if (!S.langSet) setLang(regionLang()); };

// ───────────────────────── regions
const country = code => S.countries.find(c => c.code === code) || {};
const regionObj = key => { for (const c of S.countries) { const r = (c.regions || []).find(x => x.key === key); if (r) return r; } return null; };
const regionName = () => { const r = regionObj(S.region); return r ? r.n : (country(S.cc).n || ''); };
const TZ = { 'Africa/Kampala': 'UG', 'Africa/Nairobi': 'KE', 'Africa/Dar_es_Salaam': 'TZ', 'Africa/Kigali': 'RW', 'Africa/Accra': 'GH', 'Africa/Lagos': 'NG', 'Africa/Johannesburg': 'ZA', 'Europe/London': 'GB', 'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA', 'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Perth': 'AU', 'Europe/Berlin': 'DE', 'Europe/Paris': 'FR', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Dubai': 'AE', 'America/Sao_Paulo': 'BR', 'America/Mexico_City': 'MX', 'Asia/Tokyo': 'JP', 'America/Chicago': 'US', 'America/New_York': 'US', 'America/Los_Angeles': 'US', 'America/Denver': 'US', 'America/Phoenix': 'US' };
function guessCountry() {
  let z = ''; try { z = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { }
  const l = ((navigator.language || '').split('-')[1] || '').toUpperCase();
  return [TZ[z], l].find(c => c && S.countries.some(x => x.code === c)) || 'UG';
}
async function loadVendors() {
  try { S.vendors = await api('/vendors?cc=' + S.cc + '&region=' + encodeURIComponent(S.region)); } catch (e) { toast(e.message); S.vendors = []; }
}
async function setRegion(key, opts = {}) {
  const r = regionObj(key); if (!r) return;
  S.region = key; S.cc = r.cc; S.city = opts.city || ''; S.cz = ''; S.q = ''; LS.set('if_region', key); LS.set('if_cc', r.cc);
  followRegion(); await loadVendors(); if (!opts.keepSheet) closeAll(); if (opts.render !== false) go('home');
}

// ───────────────────────── live location
// One watcher keeps S.geo fresh. It powers distances, nearest-first sorting, the "you" pin on maps and region detection.
const geoOK = () => 'geolocation' in navigator;
const dist = v => S.geo ? km(S.geo.lat, S.geo.lng, v.lat, v.lng) : null;
const distLabel = k => k < 1 ? (Math.round(k * 100) * 10) + ' m' : t('kmAway', { km: k < 10 ? k.toFixed(1) : Math.round(k) });
function startGeo(onFirst) {
  if (!geoOK()) { S.geoMsg = t('locNoSupport'); toast(S.geoMsg); return; }
  LS.set('if_geo', true); S.geoMsg = t('locating'); if (S.sheet === 'region') sheetUI();
  if (S.geoWatch !== null) { if (S.geo && onFirst) onFirst(S.geo); return; }
  let first = true;
  S.geoWatch = navigator.geolocation.watchPosition(p => {
    const prev = S.geo; S.geo = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() }; S.geoMsg = '';
    if (first) { first = false; if (onFirst) onFirst(S.geo); }
    const moved = !prev || km(prev.lat, prev.lng, S.geo.lat, S.geo.lng) > 0.1;
    if (moved && S.mode === 'customer') { if (S.view === 'home' && !document.activeElement.matches('input,select')) refreshHome(); else if (S.view === 'track') updateTrack(); else if (S.view === 'menu') updFab(); }
    renderHeader();
  }, err => { S.geoWatch = null; LS.set('if_geo', false); S.geoMsg = t('locDenied'); toast(S.geoMsg); if (S.sheet === 'region') sheetUI(); renderHeader(); }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 25000 });
}
function stopGeo() { if (S.geoWatch !== null) navigator.geolocation.clearWatch(S.geoWatch); S.geoWatch = null; S.geo = null; LS.set('if_geo', false); renderHeader(); if (S.view === 'home') refreshHome(); }
// Find the region and city nearest to the GPS position and switch to it.
async function useMyLocation() {
  startGeo(async g => {
    let hit = null; try { hit = await api('/geo?lat=' + g.lat + '&lng=' + g.lng); } catch { }
    if (!hit || !hit.region) { S.geoMsg = t('locOutside'); if (S.sheet === 'region') sheetUI(); return; }
    S.sort = 'near'; await setRegion(hit.region, { city: '', keepSheet: true, render: false });
    S.geoMsg = t('locFound', { city: hit.city, region: regionName() }); toast(S.geoMsg); closeAll(); go('home');
  });
}
async function reverse(lat, lng) {
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=' + S.lang + '&lat=' + lat + '&lon=' + lng), j = await r.json(), a = j.address || {};
    const line = [[a.house_number, a.road].filter(Boolean).join(' '), a.suburb || a.neighbourhood || a.quarter, a.city || a.town || a.village || a.county].filter(Boolean).join(', ');
    return line || (j.display_name || '').split(',').slice(0, 3).join(',');
  } catch { return ''; }
}
async function fillAddress() {
  startGeo(async g => { const a = await reverse(g.lat, g.lng); if (a) { S.info.address = a; LS.set('if_info', S.info); toast(t('locSaved')); } if (S.view === 'home' && S.mode === 'customer') refreshHome(); if ($('#sheet').classList.contains('on')) cartUI(false); });
  if (S.geo) { const a = await reverse(S.geo.lat, S.geo.lng); if (a) { S.info.address = a; LS.set('if_info', S.info); if (S.view === 'home') refreshHome(); if ($('#sheet').classList.contains('on')) cartUI(false); } }
}

// ───────────────────────── interests
const INTERESTS = [['veg', 'iVeg'], ['spicy', 'iSpicy'], ['wine', 'iWine'], ['healthy', 'iHealthy'], ['home', 'iHome'], ['budget', 'iBudget'], ['quick', 'iQuick'], ['halal', 'iHalal']];
function interestScore(v, medFee) {
  let s = 0; const tg = v.tags || [];
  for (const i of S.int) {
    if (i === 'veg' && (tg.includes('veg') || tg.includes('vegan'))) s++;
    if (i === 'spicy' && tg.includes('spicy')) s++;
    if (i === 'wine' && v.type === 'drinks') s += 2;
    if (i === 'healthy' && (v.type === 'grocery' || tg.includes('gf') || tg.includes('vegan'))) s++;
    if (i === 'home' && v.type === 'household') s += 2;
    if (i === 'budget' && v.fee <= medFee) s++;
    if (i === 'quick' && v.eta <= 30) s++;
    if (i === 'halal' && tg.includes('halal')) s++;
  } return s;
}

// ───────────────────────── header & sheets
const LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2c5 6.4 9 11 9 16.2A9 9 0 0 1 7 18.2C7 13 11 8.4 16 2Z" fill="var(--brand)"/><path d="M12.2 19.5a4 4 0 0 0 4 4" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>';
function renderHeader() {
  const staff = S.mode !== 'customer', rn = regionObj(S.region);
  const place = S.city ? S.city + ', ' + regionName() : (rn ? regionName() + ' · ' + (country(S.cc).code || '') : '…');
  $('#hdr').innerHTML = `<button class="brand" data-mode="customer" aria-label="Instadrop">${LOGO}<span>insta<i>drop</i></span></button><span class="spacer"></span>
  ${staff ? `<button class="lnk" data-mode="customer">← ${esc(t('toApp'))}</button>` : ''}
  <button class="locchip" data-act="region" aria-label="${esc(t('deliverTo'))}: ${esc(place)}"><i class="dot ${S.geo ? 'live' : ''}"></i><span>${esc(place)}</span></button>
  <button class="iconbtn" data-act="account" aria-label="${esc(A.user ? t('account') : t('signIn'))}">${A.user ? ic('user')+' <span class="nm">' + esc(A.user.name.split(' ')[0]) + '</span>' : ic('user')+' <span>' + esc(t('signIn')) + '</span>'}</button>
  <button class="iconbtn" data-act="prefs" aria-label="${esc(t('language'))}">${ic('globe')} <span>${esc(S.lang.toUpperCase())}</span></button>
  <button class="iconbtn" id="theme" aria-label="${esc(t('theme'))}">${ic(themeNow() === 'dark' ? 'sun' : 'moon')}</button>
  <button class="cartbtn" id="cartbtn" ${staff ? 'hidden' : ''}>${ic('bag')} <span class="lbl">${esc(t('cart'))}</span><b id="count">${cnt()}</b></button>`;
}
function closeAll() { S.m = null; S.sheet = null; ['#modal', '#sheet', '#pick'].forEach(s => $(s).classList.remove('on')); $('#scrim').classList.remove('on'); }
function openSheet(kind) { S.sheet = kind; sheetUI(); $('#pick').classList.add('on'); $('#scrim').classList.add('on'); }
function sheetUI() {
  const el = $('#pick'); if (!el.classList.contains('on') && !S.sheet) return;
  if (authSheet()) return;
  if (S.sheet === 'region') {
    const c = country(S.cc), rs = (c.regions || []);
    el.innerHTML = `<div class="row"><h2>${esc(t('whereTitle'))}</h2><button class="lnk" data-act="close">${esc(t('close'))}</button></div><p class="meta">${esc(t('whereSub'))}</p>
    <button class="btn" style="margin-top:14px" data-act="gps">📍 ${esc(t('useLive'))}</button>${S.geoMsg ? `<p class="meta" role="status" style="margin-top:8px">${esc(S.geoMsg)}</p>` : ''}
    <div class="form"><label for="pk-cc">${esc(t('country'))}</label><select id="pk-cc">${S.countries.map(x => `<option value="${x.code}" ${x.code === S.cc ? 'selected' : ''}>${x.flag} ${esc(x.n)}</option>`).join('')}</select>
    <label for="pk-q">${esc(t('regionLbl'))}</label><input id="pk-q" type="search" placeholder="${esc(t('searchRegion'))}" autocomplete="off"></div><div class="rg-list" id="rg-items">${regionItems(rs, '')}</div>`;
  } else if (S.sheet === 'prefs') {
    const here = regionLangs();
    el.innerHTML = `<div class="row"><h2>${esc(t('prefs'))}</h2><button class="lnk" data-act="close">${esc(t('close'))}</button></div><p class="meta">${esc(t('prefsSub'))}</p>
    <h3 class="cat" style="font-size:18px">${esc(t('language'))}</h3>
    ${here.length ? `<p class="meta">${esc(t('langSub', { region: regionName() }))}</p>` + here.map(l => langBtn(l)).join('') : ''}
    <p class="meta" style="margin-top:14px">${esc(t('langAll'))}</p>${Object.keys(LANGS).filter(l => !here.includes(l)).map(l => langBtn(l)).join('')}
    <button class="lnk" data-act="lang-auto" ${S.langSet ? '' : 'hidden'}>↻ ${esc(t('langAuto'))}</button>
    <h3 class="cat" style="font-size:18px">${esc(t('interests'))}</h3><p class="meta">${esc(t('interestsSub'))}</p>
    <div class="interests">${INTERESTS.map(([k, lab]) => `<button class="pill" data-int="${k}" aria-pressed="${S.int.includes(k)}">${esc(t(lab))}</button>`).join('')}</div>
    <button class="btn" style="margin-top:20px" data-act="close">${esc(t('close'))}</button>`;
  }
}
const langBtn = l => `<button class="langbtn" data-lang="${l}" aria-pressed="${S.lang === l}"><span>${esc(LANGS[l].n)}</span><small>${S.lang === l ? '✓' : ''}</small></button>`;
const regionItems = (rs, q) => rs.filter(r => (r.n + ' ' + r.cities.map(c => c.n).join(' ')).toLowerCase().includes(q.toLowerCase())).map(r =>
  `<button class="rg" data-region="${r.key}" aria-pressed="${r.key === S.region}"><span>${esc(r.n)}<small>${esc(r.cities.map(c => c.n).join(' · '))}</small></span><span class="n">${esc(t('places', { n: r.count }))}</span></button>`).join('') || `<p class="meta">${esc(t('noMatch'))}</p>`;

// ───────────────────────── home
const PAS = [0, 1, 2, 3, 4, 5], ph = u => u ? `<img class="ph" src="${esc(u)}" alt="" loading="lazy" onerror="this.remove()">` : '';
const TABS = [['all', 'tabAll'], ['food', 'tabFood'], ['grocery', 'tabGrocery'], ['drinks', 'tabDrinks'], ['household', 'tabHome']];
const HEAD = { all: 'hAll', food: 'hFood', grocery: 'hGrocery', drinks: 'hDrinks', household: 'hHome' };
function listData() {
  const q = S.q.toLowerCase().trim(), base = S.vendors.filter(v => (S.tab === 'all' || v.type === S.tab) && (!S.city || v.city === S.city));
  const fees = base.map(v => v.fee).sort((a, b) => a - b), med = fees.length ? fees[Math.floor(fees.length / 2)] : 0;
  const cz = [...new Map(base.map(v => [v.cat, v.emoji])).entries()];
  const sc = new Map(base.map(v => [v.id, interestScore(v, med)]));
  let list = base.filter(v => (!q || (v.name + ' ' + v.cat + ' ' + v.city + ' ' + (v.kw || '')).toLowerCase().includes(q)) && (!S.cz || v.cat === S.cz) && (!S.fl.fast || v.eta <= 30) && (!S.fl.top || v.rating >= 4.5)
    && (!S.fl.cheap || v.fee <= med) && (!S.fl.fav || S.fav.includes(v.id)) && (!S.fl.near || (dist(v) !== null && dist(v) <= 5)));
  const by = { near: (a, b) => (dist(a) ?? 1e9) - (dist(b) ?? 1e9), fast: (a, b) => a.eta - b.eta, top: (a, b) => b.rating - a.rating, fee: (a, b) => a.fee - b.fee,
    rec: (a, b) => (sc.get(b.id) * 10 + b.rating - (dist(b) ?? 0) * .15) - (sc.get(a.id) * 10 + a.rating - (dist(a) ?? 0) * .15) };
  list = list.slice().sort(by[S.sort] || by.rec);
  return { base, cz, list, sc };
}
function cardHTML(v) {
  const d = dist(v), far = d !== null && d > v.radius, pk = S.info.mode === 'pickup';
  return `<button class="card" data-v="${v.id}"><div class="sw s${hs(v.id) % 6}">${pic(v.emoji)}${ph(v.img)}<span class="heart ${S.fav.includes(v.id) ? 'on' : ''}" data-heart="${v.id}" role="button" aria-label="♥ ${esc(v.name)}">${S.fav.includes(v.id) ? icf('heart') : ic('heart')}</span>${d !== null ? `<span class="dist ${far ? 'far' : ''}">${distLabel(d)}</span>` : ''}<span class="eta ${v.open === false ? 'closed' : ''}">${v.open === false ? esc(t('closed')) : pk ? esc(t('pickupTag')) : esc(t('minShort', { n: v.eta }))}</span></div>
  <div class="b"><h3>${esc(v.name)}</h3><div class="meta"><span class="star">${v.rating.toFixed(1)} ★</span> (${v.reviews}+) · ${esc(v.cat)} · ${esc(v.city)}</div><div class="meta">${far ? '⚠ ' + esc(t('outRange')) : pk ? esc(t('noFee')) : esc(t('feeDelivery', { fee: fmt(v.fee, v.cur) }))}</div></div></button>`;
}
function gridHTML() {
  const { list, sc } = listData();
  if (!S.vendors.length) return `<div class="empty"><big>${ic('map')}</big>${esc(t('notServing', { region: regionName() }))}</div>`;
  if (S.vmode === 'map') return '<div id="vmap" class="vmap" role="region" aria-label="' + esc(t('viewMap')) + '"></div>' + (list.length ? '' : `<p class="meta">${esc(t('noMatch'))}</p>`);
  const fy = S.int.length && S.tab === 'all' && !S.q && !S.cz && !S.city && !Object.values(S.fl).some(Boolean) ? list.filter(v => sc.get(v.id) > 0).slice(0, 8) : [];
  return (fy.length ? `<div class="sec"><h2>${ic('sparkles')} ${esc(t('forYou'))}</h2></div><div class="scroll">${fy.map(cardHTML).join('')}</div>` : '')
    + `<div class="sec"><h2>${esc(t(HEAD[S.tab], { region: S.city ? S.city + ', ' + regionName() : regionName() }))}</h2><span class="meta">${esc(t('places', { n: list.length }))}</span></div>`
    + `<div class="grid">${list.map(cardHTML).join('') || `<p class="meta">${esc(t('noMatch'))}</p>`}</div>`;
}
function homeHTML() {
  const i = S.info, pk = i.mode === 'pickup', rn = regionObj(S.region), { cz } = listData();
  const pill = (k, lab) => `<button class="pill" data-fl="${k}" aria-pressed="${!!S.fl[k]}">${esc(t(lab))}</button>`;
  const lo = S.langSet && !regionLangs().includes(S.lang) && !S.langNo[S.region] ? regionLang() : null;
  return `<section class="hero"><h1>${esc(t('heroTitle', { r: '\u0001' })).replace('\u0001', `<em>${esc(regionName())}</em>`)}</h1>
   <div class="locline">${S.geo ? `<span class="dot live"></span> ${esc(t('liveOn'))}` : `<button class="pill" data-act="gps">${ic('pin')} ${esc(t('useLive'))}</button>`}<span>${esc(t('showingIn', { region: regionName() }))} · ${esc(t('places', { n: S.vendors.length }))}</span></div></section>
  ${lo ? `<div class="banner" role="status"><span class="grow">${esc(t('langSuggest', { lang: LANGS[lo].n }))}</span><button class="btn sm" data-lang="${lo}" data-auto="1">${esc(t('langSwitch'))}</button><button class="lnk" data-act="dismiss-lang">${esc(t('langNo'))}</button></div>` : ''}
  <div class="addr"><div class="seg" role="group" aria-label="${esc(t('delivery'))}"><button data-fm="delivery" aria-pressed="${!pk}">${esc(t('delivery'))}</button><button data-fm="pickup" aria-pressed="${pk}">${esc(t('pickup'))}</button></div>
   ${pk ? '' : `<input id="addr" data-f="address" value="${esc(i.address)}" placeholder="${esc(t('addressPh'))}" aria-label="${esc(t('address'))}" autocomplete="street-address"><button class="iconbtn" data-act="gps-addr" aria-label="${esc(t('useLocMap'))}">${ic('pin')}</button>`}</div>
  ${rn && rn.cities.length > 1 ? `<div class="scroll" role="group" aria-label="${esc(t('regionLbl'))}"><button class="pill" data-city="" aria-pressed="${!S.city}">${esc(t('allCities', { region: regionName() }))}</button>${rn.cities.map(c => `<button class="pill" data-city="${esc(c.n)}" aria-pressed="${S.city === c.n}">${esc(c.n)}</button>`).join('')}</div>` : ''}
  <div class="tabs" role="group">${TABS.map(([k, lab]) => `<button class="tab" data-tab="${k}" aria-pressed="${S.tab === k}">${esc(t(lab))}</button>`).join('')}<button class="tab" data-view="orders" style="margin-inline-start:auto">${esc(t('orders'))}${S.orders.length ? ' (' + S.orders.length + ')' : ''}</button></div>
  <input id="search" type="search" placeholder="${esc(t('search'))}" value="${esc(S.q)}" aria-label="${esc(t('search'))}">
  <div class="promo"><div><b>${esc(t('promoTitle'))}</b><br>${esc(t('promoSub'))}</div><span class="gifti">${ic('gift')}</span></div>
  ${S.grp ? `<button class="pill" data-v="${S.grp.vid}">${esc(t('grpBack', { code: S.grp.code }))}</button>` : `<div class="addr"><input id="gcode" placeholder="${esc(t('grpCode'))}" maxlength="4" style="max-width:230px;text-transform:uppercase" aria-label="${esc(t('grpCode'))}"><button class="pill" data-join="1">${esc(t('grpJoin'))}</button></div>`}
  <div class="cz"><button class="cc" data-cz="" aria-pressed="${!S.cz}"><span>${ic('bag')}</span>${esc(t('allCats'))}</button>${cz.map(([c, e]) => `<button class="cc" data-cz="${esc(c)}" aria-pressed="${S.cz === c}"><span>${ic(iconFor(e))}</span>${esc(c)}</button>`).join('')}</div>
  <div class="toolbar"><div class="scroll" style="flex:1">${pill('fast', 'fFast')}${pill('top', 'fTop')}${pill('cheap', 'fCheap')}${pill('fav', 'fFav')}${pill('near', 'fNear')}</div>
   <select id="sort" aria-label="${esc(t('sortRec'))}">${[['rec', 'sortRec'], ['near', 'sortNear'], ['fast', 'sortFast'], ['top', 'sortTop'], ['fee', 'sortFee']].map(([k, lab]) => `<option value="${k}" ${S.sort === k ? 'selected' : ''}>${esc(t(lab))}</option>`).join('')}</select>
   ${window.L ? `<div class="seg"><button data-vm="list" aria-pressed="${S.vmode === 'list'}">${esc(t('viewList'))}</button><button data-vm="map" aria-pressed="${S.vmode === 'map'}">${esc(t('viewMap'))}</button></div>` : ''}</div>
  <div id="vgrid">${gridHTML()}</div>
  <footer class="foot"><span>${esc(t('staffTitle'))}:</span><button data-mode="vendor">Kitchen / Store</button><button data-mode="rider">Rider</button><button data-mode="admin">Admin</button></footer>`;
}
function refreshGrid() { const g = $('#vgrid'); if (g) { g.innerHTML = gridHTML(); if (S.vmode === 'map') initVMap(); } }
function refreshHome() { if (S.mode === 'customer' && S.view === 'home') { const y = window.scrollY; render(); window.scrollTo(0, y); } }
function initVMap() {
  const el = $('#vmap'); if (!el || !window.L) return; if (VMARK) { VMARK.remove(); VMARK = null; }
  const { list } = listData(), rn = regionObj(S.region), c = rn ? rn.cities.find(x => x.n === S.city) || rn.cities[0] : { lat: 0, lng: 0 };
  VMARK = L.map(el).setView([c.lat, c.lng], 11); L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(VMARK);
  const pts = list.map(v => { L.marker([v.lat, v.lng], { icon: pinIcon(iconFor(v.emoji), '') }).addTo(VMARK).bindTooltip(v.name + ' · ' + v.cat).on('click', () => openVendor(v.id)); return [v.lat, v.lng]; });
  if (S.geo) { L.marker([S.geo.lat, S.geo.lng], { icon: pinIcon('pin', 'me') }).addTo(VMARK).bindTooltip(t('mapYou')); pts.push([S.geo.lat, S.geo.lng]); }
  if (pts.length > 1) VMARK.fitBounds(pts, { padding: [30, 30], maxZoom: 14 }); else if (pts.length) VMARK.setView(pts[0], 13);
}
const pinIcon = (name, cls) => L.divIcon({ className: 'pinwrap', html: `<div class="pin ${cls}">${cls === 'rider' ? '<i class="hd"></i>' : ''}${ic(name)}</div>`, iconSize: [38, 38], iconAnchor: [19, 19] });

// ───────────────────────── menu, options, cart
const DIET = [['veg', 'dietVeg'], ['vegan', 'dietVegan'], ['gf', 'dietGf'], ['halal', 'dietHalal']], TAGI = { veg: '🌱', vegan: '🌿', gf: 'GF', halal: '☪', spicy: '🌶', nuts: '🥜' };
const dietOk = i => S.diet.every(x => (i.tags || []).includes(x));
const getV = id => S.vendors.find(x => x.id === id) || (S.v && S.v.id === id ? S.v : null) || (S.vinfo && S.vinfo.id === id ? S.vinfo : null);
const cvid = () => S.cart.vid || (S.grp && S.grp.vid);
const lines = () => S.cart.vid ? Object.entries(S.cart.q).filter(([, q]) => q > 0).map(([id, q]) => { const it = S.cartItems[id]; return it ? { id, q, n: it.n, p: it.p, iid: it.iid || id, sel: it.sel || [], alc: it.alc } : null; }).filter(Boolean) : [];
const allLines = () => [...lines(), ...(S.grp && S.grp.host ? S.gl.map(l => ({ id: 'g' + l.who + l.id, q: l.q, n: l.n, p: l.p, who: l.who, alc: l.alc, ro: 1 })) : [])];
const cnt = () => lines().reduce((a, l) => a + l.q, 0);
const sub = () => allLines().reduce((a, l) => a + l.p * l.q, 0);
const needAge = () => allLines().some(l => l.alc);
const payMethods = () => { const v = getV(cvid()); return v && country(v.country).pay || ['Cash']; };
const payLabel = p => t({ 'Mobile money': 'payMomo', Card: 'payCard', Cash: 'payCash' }[p] || p);
const statusLabel = (type, s) => t({ placed: 'sPlaced', accepted: 'sAccepted', preparing: type === 'food' ? 'sCooking' : 'sPacking', ready: 'sReady', onway: 'sOnway', delivered: 'sDelivered', rejected: 'sRejected' }[s]);
const FLOWL = ['placed', 'accepted', 'preparing', 'ready', 'onway', 'delivered'];
function menuHTML() {
  const v = S.v, cats = [...new Set(v.items.filter(dietOk).map(i => i.c))], d = dist(v), pk = S.info.mode === 'pickup';
  CUR = v.cur;
  return `<button class="back" data-view="home">← ${esc(t('back'))}</button>${grpBanner(v)}${v.open === false ? `<div class="banner" role="status">${ic('warn')} <span class="grow">${esc(t('closedMsg'))}${v.hours ? ' (' + esc(v.hours) + ')' : ''}</span></div>` : ''}<div class="vbanner s${hs(v.id) % 6}">${pic(v.emoji)}${ph(v.img)}</div><h1>${esc(v.name)}</h1>
  <p class="meta"><span class="star">${v.rating.toFixed(1)} ★</span> (${v.reviews}+) · ${esc(v.cat)} · ${esc(v.city)} · ${esc(t('minShort', { n: v.eta }))} · ${pk ? esc(t('pickupTag')) : esc(t('feeDelivery', { fee: fmt(v.fee) }))}${d !== null ? ' · ' + distLabel(d) : ''}</p>
  <p class="meta">${esc(t('deliversWithin', { n: v.radius }))}${d !== null && d > v.radius ? ' · ⚠ ' + esc(t('outRange')) : ''}</p>
  ${v.type === 'food' || v.type === 'grocery' ? `<div class="scroll">${DIET.map(([k, lab]) => `<button class="pill" data-diet="${k}" aria-pressed="${S.diet.includes(k)}">${esc(t(lab))}</button>`).join('')}</div>` : ''}
  ${cats.map(c => `<h2 class="cat">${esc(c)}</h2>` + v.items.filter(i => i.c === c && dietOk(i)).map(i => {
    const q = S.cart.vid === v.id ? Object.entries(S.cart.q).filter(([k]) => k === i.id || k.startsWith(i.id + '|')).reduce((a, [, n]) => a + n, 0) : 0;
    return `<div class="item ${i.out ? 'out' : ''}"><div class="thumb">${pic(v.emoji, 1)}${ph(i.img)}</div><div><h3>${esc(i.n)} ${(i.tags || []).map(x => TAGI[x] || '').join(' ')}${i.alc ? ' <span class="tag">18+</span>' : ''}</h3><p class="meta">${esc(i.d)}</p><span class="price">${fmt(i.p)}</span></div>
    ${i.out ? `<span class="tag">${esc(t('soldOut'))}</span>` : i.opts && i.opts.length ? `<button class="add" data-open="${i.id}">${q ? esc(t('inCartAdd', { n: q })) : esc(t('add'))}</button>` : q ? `<span class="qty"><button data-d="-1" data-i="${i.id}" aria-label="${esc(t('removeOne'))}">−</button>${q}<button data-d="1" data-i="${i.id}" aria-label="${esc(t('addOne'))}">+</button></span>` : `<button class="add" data-d="1" data-i="${i.id}">${esc(t('add'))}</button>`}</div>`;
  }).join('')).join('')}`;
}
function grpBanner(v) {
  return S.grp && S.grp.vid === v.id ? `<div class="order">${ic('users')} ${esc(t('grpTitle'))} <b>${S.grp.code}</b> · ${S.grp.host ? esc(t('grpHost')) : esc(t('grpGuest', { who: S.grp.who }))} <button class="lnk" data-grp="leave">${esc(t('grpLeave'))}</button></div>` : (S.grp ? '' : `<button class="lnk" data-grp="start">${esc(t('grpStart'))}</button>`);
}
function snapshotVendor() { if (S.v) { S.vinfo = S.v; LS.set('if_vi', { id: S.v.id, name: S.v.name, fee: S.v.fee, eta: S.v.eta, cur: S.v.cur, country: S.v.country, type: S.v.type, region: S.v.region, radius: S.v.radius, lat: S.v.lat, lng: S.v.lng, city: S.v.city, emoji: S.v.emoji }); } }
function ensureCartVendor() {
  if (S.cart.vid !== S.v.id) { if (cnt() && !confirm(t('otherCart'))) return false; S.cart = { vid: S.v.id, q: {} }; S.cartItems = {}; }
  snapshotVendor(); return true;
}
function change(id, d) {
  const it = S.v.items.find(i => i.id === id); if (!ensureCartVendor()) return;
  S.cartItems[id] = { n: it.n, p: it.p, alc: it.alc }; S.cart.q[id] = Math.max(0, (S.cart.q[id] || 0) + d);
  if (!cnt()) S.cart = { vid: null, q: {} }; saveCart(); LS.set('if_ci', S.cartItems); syncGroup(); render(); cartUI(false);
}
function addLine(key, it, sel, q, ex) {
  if (!ensureCartVendor()) return false;
  S.cartItems[key] = { alc: it.alc, n: it.n + (sel.length ? ' (' + sel.map(x => x.split(':')[1]).join(', ') + ')' : ''), p: it.p + ex, iid: it.id, sel };
  S.cart.q[key] = (S.cart.q[key] || 0) + q; saveCart(); LS.set('if_ci', S.cartItems); syncGroup(); return true;
}
const extras = m => (m.i.opts || []).reduce((a, g) => a + g.choices.filter(c => (m.sel[g.name] || []).includes(c.n)).reduce((b, c) => b + c.p, 0), 0);
function modalUI() {
  const m = S.m, el = $('#modal'); if (!m) return; CUR = S.v.cur;
  el.innerHTML = `<div class="row"><h2>${esc(m.i.n)}</h2><button class="lnk" data-mclose="1">${esc(t('close'))}</button></div><p class="meta">${esc(m.i.d)}</p>${(m.i.opts || []).map((g, gi) => `<h3 class="cat" style="font-size:17px">${esc(g.name)} <span class="meta">${g.req ? esc(t('reqd')) : esc(t('opt'))} · ${g.multi ? esc(t('chooseAny')) : esc(t('chooseOne'))}</span></h3>${g.choices.map((c, ci) => `<button class="chip optc" data-opt="${gi}.${ci}" aria-pressed="${(m.sel[g.name] || []).includes(c.n)}"><span>${esc(c.n)}</span><span>${c.p ? '+' + fmt(c.p) : esc(t('free'))}</span></button>`).join('')}`).join('')}
  <div class="row" style="margin-top:14px"><span class="qty"><button data-mq="-1" aria-label="−">−</button>${m.q}<button data-mq="1" aria-label="+">+</button></span></div><button class="go" data-madd="1">${esc(t('addToCart', { total: fmt((m.i.p + extras(m)) * m.q) }))}</button>`;
  el.classList.add('on'); $('#scrim').classList.add('on');
}
function syncGroup() { if (!S.grp) return; api('/groups/' + S.grp.code + '/lines', { m: 'PUT', b: { who: S.grp.who, items: lines().map(l => ({ id: l.iid, q: l.q, sel: l.sel, note: S.cart.notes?.[l.id] || '' })) } }).catch(() => { }); }
async function pollGroup() { if (!S.grp) return; try { const g = await api('/groups/' + S.grp.code); S.gl = g.lines.filter(l => l.who !== S.grp.who); updFab(); if (S.mode === 'customer' && $('#sheet').classList.contains('on') && !document.activeElement?.matches('input,select')) cartUI(false); } catch (e) { if (/not found/i.test(e.message)) { toast(t('grpEnded')); S.grp = null; LS.set('if_grp', null); S.gl = []; render(); } } }
setInterval(pollGroup, 4000);
// Delivery coordinates are only sent when the live GPS position is inside this place's delivery radius.
const gpsFor = v => S.geo && v && km(S.geo.lat, S.geo.lng, v.lat, v.lng) <= (v.radius || 15) ? S.geo : null;
const calc = () => {
  const v = getV(cvid()), u = (v && country(v.country).u) || 1000, s = sub(), pk = S.info.mode === 'pickup', f = v && !pk && !(S.lp && S.lp.tier === 'Gold') ? v.fee : 0, svc = s >= FREE * u ? 0 : Math.round(s * SVC), st = Math.max(1, Math.round(u / 2));
  const tip = pk ? 0 : Math.min(s, Math.round(s * (S.info.tipPct ?? 10) / 100 / st) * st), code = (S.info.promo || '').toUpperCase().trim(), disc = Math.round(s * (code === 'DROP10' ? .1 : 0)), rd = S.info.redeem && S.lp && S.lp.pts >= 100 && s >= 5 * u ? 5 * u : 0;
  if (v) CUR = v.cur; const cc = (v && country(v.country)) || {}, base = Math.max(0, s - disc + f + svc), tx = cc.tax ? (cc.taxIncl ? Math.round(base - base / (1 + cc.tax)) : Math.round(base * cc.tax)) : 0;
  return { v, s, u, pk, f, svc, tip, disc, rd, tax: tx, taxIncl: !!cc.taxIncl, taxRate: Math.round((cc.tax || 0) * 1000) / 10, total: s + f + svc + tip - disc - rd + (cc.taxIncl ? 0 : tx) };
};
function updFab() { const fc = $('#fcart'), n = allLines().reduce((a, l) => a + l.q, 0); fc.hidden = !(S.mode === 'customer' && n); if (n) fc.innerHTML = ic('bag') + ' ' + esc(t('cart')) + ' · ' + n + ' · ' + esc(fmt(calc().total)); const c = $('#count'); if (c) c.textContent = cnt(); }
function cartUI(open) {
  const L = allLines(), c = calc(), i = S.info, v = c.v, tp = i.tipPct ?? 10; if (v && !payMethods().includes(i.pay)) i.pay = payMethods()[0];
  const g = v && gpsFor(v), outside = v && S.geo && !g && !c.pk;
  $('#sheet').innerHTML = `<div class="row"><h2>${esc(t('cartTitle'))}</h2><button class="lnk" id="close">${esc(t('close'))}</button></div>` + (L.length && v ?
    `<div class="seg" role="group" style="margin:6px 0 10px"><button data-fm="delivery" aria-pressed="${!c.pk}">${esc(t('delivery'))}</button><button data-fm="pickup" aria-pressed="${c.pk}">${esc(t('pickup'))}</button></div>
    <div class="meta" style="margin-bottom:6px"><b>${esc(v.name)}</b> · ${esc(v.city || '')} · ${c.pk ? esc(t('readyIn', { n: Math.max(10, v.eta - 10) })) : esc(t('arrives', { n: v.eta }))}</div>
    ${L.map(l => `<div><div class="row"><span>${l.q} × ${esc(l.n)}${l.ro ? ' · ' + esc(l.who) : ''}</span><span>${fmt(l.p * l.q)}</span></div>${l.ro ? '' : `<div class="row" style="padding:0 0 6px"><input class="ln" style="flex:1" data-ln="${l.id}" value="${esc(S.cart.notes?.[l.id] || '')}" placeholder="${esc(t('noteItem'))}" aria-label="${esc(t('noteItem'))}"><span class="qty"><button data-cd="${l.id}" data-d2="-1" aria-label="${esc(t('removeOne'))}">−</button><button data-cd="${l.id}" data-d2="1" aria-label="${esc(t('addOne'))}">+</button></span></div>`}</div>`).join('')}
    <div class="row meta"><span>${esc(t('subtotal'))}</span><span>${fmt(c.s)}</span></div>${c.pk ? '' : `<div class="row meta"><span>${esc(t('deliveryFee'))}</span><span>${fmt(c.f)}</span></div>`}<div class="row meta"><span>${esc(t('serviceFee'))}</span><span>${c.svc ? fmt(c.svc) : esc(t('free'))}</span></div>${c.s && c.s < FREE * c.u ? `<p class="meta" style="margin:0 0 4px">${esc(t('addMoreFree', { amt: fmt(FREE * c.u - c.s) }))}</p>` : ''}${c.pk ? '' : `<div class="row meta"><span>${esc(t('riderTip'))}</span><span>${fmt(c.tip)}</span></div>`}${c.disc ? `<div class="row meta"><span>${esc(t('promo'))}</span><span>−${fmt(c.disc)}</span></div>` : ''}${c.tax ? `<div class="row meta"><span>${esc(c.taxIncl ? t('taxIncl', { r: c.taxRate, amt: fmt(c.tax) }) : t('tax', { r: c.taxRate }))}</span><span>${c.taxIncl ? '' : fmt(c.tax)}</span></div>` : ''}${c.rd ? `<div class="row meta"><span>${esc(t('points'))}</span><span>−${fmt(c.rd)}</span></div>` : ''}<div class="row tot"><span>${esc(t('total'))}</span><span>${fmt(c.total)}</span></div>
    ${c.pk ? '' : `<div class="form"><label>${esc(t('tipRider'))}</label><div class="pay">${[0, 10, 15, 20].map(p => `<button class="chip" data-tp="${p}" aria-pressed="${tp === p}">${p ? p + '%' : esc(t('none'))}</button>`).join('')}</div></div>`}
    <div class="form"><label for="f-name">${esc(t('name'))}</label><input id="f-name" data-f="name" value="${esc(i.name)}" autocomplete="name"><label for="f-phone">${esc(t('phone'))}</label><input id="f-phone" data-f="phone" value="${esc(i.phone)}" inputmode="tel" placeholder="${esc(t('phonePh'))}" autocomplete="tel">
    ${c.pk ? '' : `<label for="f-address">${esc(t('address'))}</label><input id="f-address" data-f="address" value="${esc(i.address)}" placeholder="${esc(t('addressFull'))}"><button class="lnk" data-act="gps-addr" type="button" style="text-align:start">${ic('pin')} ${esc(S.geo ? t('locSaved') : t('useLocMap'))}</button>${outside ? `<p class="meta" role="status">⚠ ${esc(t('rangeWarn'))}</p>` : ''}<label for="f-note">${esc(t('noteRider'))}</label><input id="f-note" data-f="note" value="${esc(i.note)}">`}
    ${S.lp ? `<div class="order" style="margin-top:10px">${esc(t('ptsLine', { n: S.lp.pts, tier: S.lp.tier }))}${S.lp.tier === 'Gold' ? ' · ' + esc(t('goldFree')) : ''}${S.lp.pts >= 100 && c.s >= 5 * c.u ? ` <button class="chip" style="margin-top:8px" data-redeem="1" aria-pressed="${!!i.redeem}">${esc(t('usePts', { amt: fmt(5 * c.u) }))}</button>` : ''}</div>` : ''}
    <label for="f-later">${esc(t('when'))}</label><select id="f-later" data-f="later">${[[0, 'asap'], [60, 'in1h'], [120, 'in2h'], [240, 'in4h'], [1440, 'tomorrow']].map(([m, k]) => `<option value="${m}" ${+i.later === m ? 'selected' : ''}>${esc(t(k))}</option>`).join('')}</select>
    ${v.type === 'grocery' ? `<label for="f-sub">${esc(t('oos'))}</label><select id="f-sub" data-f="subPref">${[['refund', 'oosRefund'], ['substitute', 'oosSub'], ['call', 'oosCall']].map(([k, lab]) => `<option value="${k}" ${(i.subPref || 'refund') === k ? 'selected' : ''}>${esc(t(lab))}</option>`).join('')}</select>` : ''}
    <label for="f-promo">${esc(t('promoCode'))}</label><input id="f-promo" data-f="promo" value="${esc(i.promo)}" placeholder="DROP10"><label>${esc(t('payment'))}</label><div class="pay">${payMethods().map(p => `<button class="chip" data-pay="${p}" aria-pressed="${i.pay === p}">${esc(payLabel(p))}</button>`).join('')}</div></div>
    ${i.pay === 'Mobile money' ? `<div class="form"><label for="f-momo">${esc(t('momoNum'))}</label><input id="f-momo" data-f="momo" value="${esc(i.momo || '')}" inputmode="tel" placeholder="${esc(t('momoPh'))}"></div>` : i.pay === 'Card' ? `<p class="meta">${esc(t('cardNote'))}</p>` : ''}
    ${needAge() ? `<label class="order" style="display:flex;gap:10px;align-items:center;margin-top:10px"><input type="checkbox" data-f="ageOk" ${i.ageOk ? 'checked' : ''}> ${esc(t('ageOk', { age: country(v.country).age }))}</label>` : ''}
    ${S.grp && !S.grp.host ? `<p class="meta">${esc(t('grpShared'))}</p>` : `${v.open === false && !+i.later ? `<p class="aerr">${esc(t('closedMsg'))}</p>` : ''}<button class="go" id="place" ${v.open === false && !+i.later ? 'disabled' : ''}>${esc(t('place', { total: fmt(c.total) }))}</button>`}` : `<p class="meta">${esc(t('cartEmpty'))}</p>`);
  if (open) { $('#sheet').classList.add('on'); $('#scrim').classList.add('on'); }
}
async function loadLp() { if (!/^[+\d][\d\s-]{7,}$/.test(S.info.phone || '')) return; try { S.lp = await api('/loyalty/' + encodeURIComponent(S.info.phone) + '?c=' + ((getV(cvid()) || {}).country || S.cc)); cartUI(false); updFab(); } catch { } }

// ───────────────────────── checkout
async function place() {
  const b = $('#place'); b.disabled = true; window.Notification && Notification.permission === 'default' && Notification.requestPermission();
  const v = getV(cvid()), g = v && S.info.mode !== 'pickup' ? gpsFor(v) : null;
  try {
    let o = await api('/orders', { m: 'POST', b: { vendorId: cvid(), who: S.grp ? S.grp.who : undefined, group: S.grp && S.grp.host ? S.grp.code : undefined, redeem: calc().rd > 0, items: lines().map(l => ({ id: l.iid, sel: l.sel, q: l.q, note: S.cart.notes?.[l.id] || '' })), ...S.info, lat: g ? g.lat : null, lng: g ? g.lng : null, sched: +S.info.later ? Date.now() + S.info.later * 60000 : null, mode: S.info.mode || 'delivery', tip: calc().tip } });
    const tok = o.ctoken; S.tok[o.id] = tok; LS.set('if_tok', S.tok);
    if (o.pay === 'Mobile money' || o.pay === 'Card') o = await api('/orders/' + o.id + '/pay', { m: 'POST', b: { momo: S.info.momo || S.info.phone } }).catch(e => { toast(e.message); return null; }) || o;
    S.info.later = 0; S.info.redeem = false; S.lp = null; if (S.grp && S.grp.host) { S.grp = null; LS.set('if_grp', null); S.gl = []; } S.info.ageOk = false; LS.set('if_info', S.info);
    S.orders = [o.id, ...S.orders]; LS.set('if_orders', S.orders); S.cart = { vid: null, q: {} }; S.cartItems = {}; saveCart(); LS.set('if_ci', {}); closeAll(); S.track = o; S.shareLoc = false; go('track'); cartUI(); window.scrollTo(0, 0);
    if (o.payUrl) setTimeout(() => location.href = o.payUrl, 400);
  } catch (e) { if (e.code === 'auth') { toast(t('signInToOrder')); closeAll(); openAuth('in'); } else toast(e.message); b.disabled = false; }
}

// ───────────────────────── tracking (live)
const PAYL = { unpaid: 'pUnpaid', pending: 'pPending', paid: 'pPaid', failed: 'pFailed', cash: 'pCash' };
const ISS = ['i1', 'i2', 'i3', 'i4', 'i5'], ISS_EN = ['Missing item', 'Wrong order', 'Cold or spoiled food', 'Very late', 'Other'];
const issueHTML = o => (o.earned ? `<p class="meta">${esc(t('earned', { n: o.earned }))}</p>` : '') + (o.refund ? `<p class="meta">${esc(t('lateRefund', { fee: fmt(o.refund) }))}</p>` : '')
  + (o.issue ? `<p class="meta">⚠ ${esc(t('reported', { why: t(ISS[ISS_EN.indexOf(o.issue.why)] || 'i5') }))}</p>` : o.status === 'delivered' ? (S.rep ? `<div class="order"><b>${esc(t('whatWrong'))}</b><div style="display:grid;gap:6px;margin-top:8px">${ISS.map((k, n) => `<button class="chip" data-iss="${ISS_EN[n]}">${esc(t(k))}</button>`).join('')}</div></div>` : `<button class="lnk" data-rep="1">${esc(t('report'))}</button>`) : '');
const rateHTML = o => o.status !== 'delivered' ? '' : (o.rating ? `<p class="meta">${esc(t('youRated', { n: o.rating }))}</p>` : `<div class="order"><b>${esc(t('rateQ'))}</b><div class="stars">${[1, 2, 3, 4, 5].map(n => `<button data-star="${n}" aria-label="${n} ★">★</button>`).join('')}</div></div>`) + `<button class="lnk" data-reorder="${o.id}">${esc(t('orderAgain'))}</button>`;
const custPoint = o => o.cloc ? { lat: o.cloc.lat, lng: o.cloc.lng } : o.lat != null ? { lat: o.lat, lng: o.lng } : null;
function etaHTML(o, i, n) {
  if (o.status === 'delivered') return '<div class="bar"><i style="width:100%"></i></div>';
  const v = getV(o.vendorId), when = new Date((o.sched || o.at) + (v ? v.eta : 30) * 60000).toLocaleTimeString(LANGS[S.lang].tag, { hour: 'numeric', minute: '2-digit' });
  return `<div class="meta">${o.sched ? esc(t('scheduled')) + ' · ' : ''}${o.mode === 'pickup' ? esc(t('readyAround')) : esc(t('estArrival'))}</div><div class="etab">${when}</div><div class="bar"><i style="width:${Math.max(6, Math.round(i / (n - 1) * 100))}%"></i></div>`;
}

let ROUTE = {}; S.follow = true;
// Distance, ETA and speed of the rider. The ETA comes from the real road route when we have one, else from the straight line.
function riderStats(o) {
  const c = custPoint(o); if (!o.loc || !c) return {}; const rt = ROUTE.id === o.id && ROUTE.mins;
  const d = rt ? ROUTE.km : km(o.loc.lat, o.loc.lng, c.lat, c.lng);
  return { d, mins: rt ? ROUTE.mins : Math.max(1, Math.round(d / 24 * 60)), kmh: o.loc.sp > .5 ? Math.round(o.loc.sp * 3.6) : null, stale: Date.now() - o.loc.t > 60000 };
}
const freshLine = o => { const r = riderStats(o); return (r.stale ? ic('warn') + ' ' + esc(t('signalLost', { ago: ago(o.loc.t) })) : esc(t('updated', { ago: ago(o.loc.t) }))) + (r.kmh ? ' · ' + r.kmh + ' km/h' : ''); };
function liveHTML(o) {
  if (o.mode === 'pickup' || o.status === 'delivered' || o.status === 'rejected') return '';
  if (o.status !== 'onway') return `<p class="meta" style="margin:10px 0">${ic('bike')} ${esc(t('riderWait'))}</p>`;
  const r = riderStats(o); let line = '';
  if (r.d !== undefined) line = r.d < 0.15 ? `<b>${esc(t('riderArriving'))}</b>` : `<b>${esc(t('riderAway', { km: distLabel(r.d), n: r.mins }))}</b>`;
  return `<div class="live-card" role="status"><span class="big">${ic('bike')}</span><div>${line || '<b>' + esc(t('sOnway')) + '</b>'}${o.rider ? `<span class="meta">${esc(t('riderLbl'))}: ${esc(o.rider)}</span>` : ''}${o.loc ? `<span class="meta" id="lastup">${freshLine(o)}</span>` : ''}</div></div>`;
}
setInterval(() => { const e = $('#lastup'); if (e && S.track && S.track.loc) e.innerHTML = freshLine(S.track); }, 5000);
const bearing = (p, q) => { const y = Math.sin(rad(q[1] - p[1])) * Math.cos(rad(q[0])), x = Math.cos(rad(p[0])) * Math.sin(rad(q[0])) - Math.sin(rad(p[0])) * Math.cos(rad(q[0])) * Math.cos(rad(q[1] - p[1])); return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360; };
function infoHTML(o) {
  CUR = o.cur || CUR;
  const FL = o.mode === 'pickup' ? FLOWL.filter(s => s !== 'onway') : FLOWL, i = FL.indexOf(o.status), ok = o.payStatus === 'paid' || o.payStatus === 'cash';
  const head = o.status === 'delivered' ? t('enjoy') : o.status === 'rejected' ? t('declined') : ok ? t('orderN', { id: o.id }) : t('finishPay');
  let body;
  if (!ok) body = o.payStatus === 'pending' ? (o.pay === 'Card' ? (o.payUrl ? `<a class="btn" href="${esc(o.payUrl)}">${esc(t('payLink'))}</a>` : `<p>${esc(t('payProc'))}</p>`) : `<p>${esc(t('payApprove', { num: o.momo || '' }))}</p>`) : `<p>${esc(o.payStatus === 'failed' ? t('payFailedMsg') : t('payWaiting'))}</p><button class="go" data-paynow="1">${esc(o.pay === 'Card' ? t('payNowCard', { amt: fmt(o.total) }) : t('payNowMomo', { amt: fmt(o.total) }))}</button>`;
  else if (o.status === 'rejected') body = `<p>${esc(t('rejectedMsg'))}</p>`;
  else body = `${etaHTML(o, i, FL.length)}${liveHTML(o)}<ol class="steps">${FL.map((s, k) => `<li class="${k < i || o.status === 'delivered' ? 'done' : k === i ? 'now' : ''}">${esc(statusLabel(o.type, s))}</li>`).join('')}</ol>`
    + (o.mode !== 'pickup' && ok && ['accepted', 'preparing', 'ready', 'onway'].includes(o.status) && S.tok[o.id] ? `<label class="switch"><input type="checkbox" id="shareloc" ${S.shareLoc ? 'checked' : ''}> ${esc(S.shareLoc ? t('sharingMine') : t('shareMine'))}</label>` : '');
  return `<h1>${esc(head)}</h1><p class="meta">${esc(o.vendor)} · ${esc(o.address)} · ${fmt(o.total)} · ${esc(t(PAYL[o.payStatus] || 'pPaid'))}${o.rider ? ' · ' + esc(t('riderLbl')) + ': ' + esc(o.rider) : ''}</p>${body}${rateHTML(o)}${issueHTML(o)}`;
}
function trackHTML() {
  const o = S.track; if (!o) return `<p class="meta">${esc(t('loading'))}</p>`; CUR = o.cur || CUR;
  return `<button class="back" data-view="orders">← ${esc(t('myOrders'))}</button><div id="tinfo">${infoHTML(o)}</div><div id="map" class="map" role="img" aria-label="${esc(t('mapLabel'))}"></div><div class="maptools"><button class="pill" data-act="follow" aria-pressed="${S.follow}">${ic('bike')} ${esc(t('follow'))}</button><button class="pill" data-act="fit">${ic('map')} ${esc(t('fitAll'))}</button></div>
  <div class="order">${o.lines.map(l => `<div class="row"><span>${l.q} × ${esc(l.n)}</span><span>${fmt(l.p * l.q)}</span></div>`).join('')}${o.mode === 'pickup' ? '' : `<div class="row meta"><span>${esc(t('deliveryFee'))}</span><span>${fmt(o.fee)}</span></div>`}<div class="row meta"><span>${esc(t('serviceFee'))}</span><span>${fmt(o.service || 0)}</span></div>${o.tip ? `<div class="row meta"><span>${esc(t('riderTip'))}</span><span>${fmt(o.tip)}</span></div>` : ''}${o.discount ? `<div class="row meta"><span>${esc(t('promo'))}</span><span>−${fmt(o.discount)}</span></div>` : ''}${o.tax ? `<div class="row meta"><span>${esc(o.taxIncl ? t('taxIncl', { r: Math.round(o.taxRate * 1000) / 10, amt: fmt(o.tax) }) : t('tax', { r: Math.round(o.taxRate * 1000) / 10 }))}</span><span>${o.taxIncl ? '' : fmt(o.tax)}</span></div>` : ''}${o.redeemed ? `<div class="row meta"><span>${esc(t('points'))}</span><span>−${fmt(o.redeemed)}</span></div>` : ''}<div class="row tot"><span>${esc(t('total'))}</span><span>${fmt(o.total)}</span></div></div><button class="go" data-view="home">${esc(t('orderMore'))}</button>`;
}
function syncTools() { const b = document.querySelector('[data-act=follow]'); if (b) b.setAttribute('aria-pressed', S.follow); }
function initMap() {
  const el = $('#map'); if (!el) return; if (!window.L || !S.track) { el.style.display = 'none'; const mt = $('.maptools'); if (mt) mt.style.display = 'none'; return; }
  const o = S.track; MAP = L.map(el).setView([o.vlat, o.vlng], 13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(MAP); MK = {};
  MK.route = L.polyline([], { color: '#D93A12', weight: 6, opacity: .85, lineCap: 'round' }).addTo(MAP);
  MK.trail = L.polyline([], { color: '#1D1511', weight: 3, opacity: .45, dashArray: '2 7' }).addTo(MAP); MK.leg = L.polyline([], { color: '#0B7A55', weight: 3, dashArray: '6 8' }).addTo(MAP);
  MAP.on('dragstart', () => { if (S.follow) { S.follow = false; syncTools(); } }); updateMap(true);
}
function glide(m, to, ms = 1200) {
  const from = m.getLatLng(); cancelAnimationFrame(m._raf); if (Math.abs(from.lat - to[0]) + Math.abs(from.lng - to[1]) < 1e-6) return; const t0 = performance.now();
  const step = now => { const k = Math.min(1, (now - t0) / ms), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; m.setLatLng([from.lat + (to[0] - from.lat) * e, from.lng + (to[1] - from.lng) * e]); if (k < 1) m._raf = requestAnimationFrame(step); };
  m._raf = requestAnimationFrame(step);
}
// Driving route from the rider to the customer (OpenStreetMap's public OSRM demo server; falls back to a straight dashed line).
async function fetchRoute(o) {
  const c = custPoint(o); if (!o.loc || !c || o.status !== 'onway') return;
  if (ROUTE.id === o.id && (Date.now() - ROUTE.at < 15000 || km(ROUTE.from[0], ROUTE.from[1], o.loc.lat, o.loc.lng) < .15)) return;
  const keep = ROUTE.id === o.id ? ROUTE : {}; ROUTE = { ...keep, id: o.id, at: Date.now(), from: [o.loc.lat, o.loc.lng] };
  try {
    const j = await (await fetch(`https://router.project-osrm.org/route/v1/driving/${o.loc.lng},${o.loc.lat};${c.lng},${c.lat}?overview=full&geometries=geojson`)).json(), r = j.routes && j.routes[0]; if (!r) return;
    ROUTE = { id: o.id, at: Date.now(), from: [o.loc.lat, o.loc.lng], pts: r.geometry.coordinates.map(([x, y]) => [y, x]), mins: Math.max(1, Math.round(r.duration / 60)), km: r.distance / 1000 };
    if (MK.route && S.track && S.track.id === o.id) MK.route.setLatLngs(ROUTE.pts); const el = $('#tinfo'); if (el && S.view === 'track' && S.track) el.innerHTML = infoHTML(S.track);
  } catch { }
}
function updateMap(fit) {
  const o = S.track; if (!MAP || !o) return; const pts = [];
  const put = (k, ll, label, name, cls) => { if (!ll) return; pts.push(ll); if (MK[k]) glide(MK[k], ll); else MK[k] = L.marker(ll, { icon: pinIcon(name, cls) }).addTo(MAP).bindTooltip(label); };
  put('v', [o.vlat, o.vlng], o.vendor, 'store', ''); const c = custPoint(o); put('c', c && [c.lat, c.lng], t('mapYou'), 'pin', 'me'); put('r', o.loc && [o.loc.lat, o.loc.lng], t('mapRider'), 'bike', 'rider');
  if (MK.trail) MK.trail.setLatLngs(o.trail || []);
  const hasRoute = ROUTE.id === o.id && ROUTE.pts && o.status === 'onway'; if (MK.route) MK.route.setLatLngs(hasRoute ? ROUTE.pts : []);
  if (MK.leg) MK.leg.setLatLngs(!hasRoute && o.loc && c ? [[o.loc.lat, o.loc.lng], [c.lat, c.lng]] : []);
  if (MK.r) { const tr = o.trail || [], hd = o.loc && o.loc.hd != null ? o.loc.hd : tr.length > 1 ? bearing(tr[tr.length - 2], tr[tr.length - 1]) : null, e = MK.r.getElement(), ar = e && e.querySelector('.hd'); if (ar && hd !== null) { ar.style.transform = `rotate(${hd}deg)`; ar.style.opacity = 1; } }
  const first = o.loc && !MK.seen; if (first) MK.seen = 1;
  if ((fit || first) && pts.length > 1) MAP.fitBounds(pts, { padding: [40, 40], maxZoom: 16 }); else if (S.follow && o.loc && o.status === 'onway') MAP.panTo([o.loc.lat, o.loc.lng], { animate: true, duration: 1 });
  fetchRoute(o);
}
function updateTrack() {
  if (S.view !== 'track' || S.mode !== 'customer' || !S.track) return; const el = $('#tinfo'); if (el && !(document.activeElement && el.contains(document.activeElement) && document.activeElement.type === 'text')) el.innerHTML = infoHTML(S.track); updateMap(false);
  const o = S.track, c = custPoint(o); if (o.status === 'onway' && o.loc && c && km(o.loc.lat, o.loc.lng, c.lat, c.lng) < .15 && !updateTrack.arr?.[o.id]) { (updateTrack.arr = updateTrack.arr || {})[o.id] = 1; navigator.vibrate && navigator.vibrate([200, 100, 200]); if (window.Notification && Notification.permission === 'granted') new Notification('Instadrop', { body: t('riderArriving') }); }
  if (o.status === 'delivered' || o.status === 'rejected') stopShare();
}
function listen(url, fn) { if (S.ev) { S.ev.close(); S.ev = null; } if (!url || !window.EventSource) return; const es = new EventSource(url); es.onmessage = e => { try { fn(JSON.parse(e.data)); } catch { } }; S.ev = es; }
function setPoll(fn, ms) { clearInterval(S.poll); S.poll = fn ? setInterval(fn, ms) : null; }
async function pollTrack() { if (!S.track) return; try { applyOrder(await api('/orders/' + S.track.id)); } catch { } }
function applyOrder(o) {
  if (!S.track || o.id !== S.track.id) return; const pv = S.track.status; S.track = o;
  if (pv !== o.status && window.Notification && Notification.permission === 'granted') new Notification('Instadrop', { body: t('orderN', { id: o.id }) + ': ' + statusLabel(o.type, o.status) });
  updateTrack();
}
// The customer can choose to share their live position with the rider while the order is on its way.
let SHARE = null, shareAt = 0;
function startShare() {
  const id = S.track && S.track.id, tok = S.tok[id]; if (!id || !tok || !geoOK()) return; S.shareLoc = true; stopShare(true);
  SHARE = navigator.geolocation.watchPosition(p => { if (Date.now() - shareAt < 4000) return; shareAt = Date.now(); api('/orders/' + id + '/customer-location', { m: 'POST', h: { 'x-token': tok }, b: { lat: p.coords.latitude, lng: p.coords.longitude } }).catch(() => { }); }, () => { S.shareLoc = false; toast(t('locDenied')); updateTrack(); }, { enableHighAccuracy: true, maximumAge: 5000 });
}
function stopShare(keep) { if (SHARE !== null) navigator.geolocation.clearWatch(SHARE); SHARE = null; if (keep) return; if (S.shareLoc && S.track && S.tok[S.track.id]) api('/orders/' + S.track.id + '/customer-location', { m: 'POST', h: { 'x-token': S.tok[S.track.id] }, b: { stop: true } }).catch(() => { }); S.shareLoc = false; }

// ───────────────────────── orders list
const ordersHTML = () => `<button class="back" data-view="home">← ${esc(t('back'))}</button><h1>${esc(t('myOrders'))}</h1><div id="olist" style="margin-top:14px">${S.orders.length ? `<p class="meta">${esc(t('loading'))}</p>` : `<p class="meta">${esc(t('noOrders'))}</p>`}</div>`;
async function loadOrders() {
  const el = $('#olist'); if (!el || !S.orders.length) return; const os = (await Promise.all(S.orders.map(id => api('/orders/' + id).catch(() => null)))).filter(Boolean);
  el.innerHTML = os.map(o => `<div class="order"><div class="row"><b>${o.id} · ${esc(o.vendor)}</b><span class="tag">${esc(statusLabel(o.type, o.status))}</span></div><div class="meta">${fmt(o.total, o.cur)} · ${new Date(o.at).toLocaleString(LANGS[S.lang].tag)}</div><button class="lnk" data-track="${o.id}">${esc(t('trackOrder'))}</button> <button class="lnk" data-reorder="${o.id}">${esc(t('reorder'))}</button></div>`).join('');
}

// ───────────────────────── staff (kitchen / store, rider, admin). These screens stay in English.
const NEXT = { placed: [['accepted', 'Accept'], ['rejected', 'Decline', 'no']], accepted: [['preparing', 'Start preparing']], preparing: [['ready', 'Mark ready']] };
function vendorUI() {
  if (!S.vendors.some(v => v.id === S.vauth.id) && S.vendors[0]) S.vauth = { id: S.vendors[0].id, pin: '' };
  $('#main').innerHTML = `<h1>Kitchen / Store</h1><p class="meta">Showing places in ${esc(regionName())}. Change region at the top to find others. Demo PINs in Kampala: Mama Rolex 1111, Lake Victoria Grill 2222, Napoli Corner 3333, FreshMart 4444, Green Basket 5555, Corner Shop 6666, Wine Cellar 7777, Chill Drinks 7778, HomePlus 7779. Every other place: see its PIN in Admin.</p>
  <div class="form"><label for="vid">Place</label><select id="vid">${S.vendors.map(v => `<option value="${v.id}" ${v.id === S.vauth.id ? 'selected' : ''}>${esc(v.name)} (${esc(v.city)})</option>`).join('')}</select><label for="vpin">PIN</label><input id="vpin" type="password" inputmode="numeric" value="${esc(S.vauth.pin)}"></div><div id="vctl" style="margin-top:16px"></div><div id="vlist" style="margin-top:16px"></div>`;
  loadVendorCtl(); listen(S.vauth.id ? '/api/stream/vendor/' + S.vauth.id : null, loadVendor); loadVendor();
}
async function loadVendorCtl() {
  const el = $('#vctl'); if (!el || !S.vauth.id) return;
  try {
    const v = await api('/vendors/' + S.vauth.id);
    el.innerHTML = `<div class="order"><div class="row"><b>${v.open ? 'Open for orders' : 'Closed'}</b><button class="act ${v.paused ? '' : 'no'}" data-vpause="${v.paused ? 0 : 1}">${v.paused ? 'Resume orders' : 'Pause orders'}</button></div>
    <label class="meta" for="vhrs">Opening hours, local time (08:00-22:00). Empty = always open.</label><div class="pwrow"><input id="vhrs" value="${esc(v.hours)}" placeholder="08:00-22:00"><button class="act" data-vhours="1">Save</button></div>
    <h3 class="cat" style="font-size:17px">Menu availability</h3>${v.items.map(i => `<div class="row"><span>${esc(i.n)}${i.out ? ' <span class="tag">Sold out</span>' : ''}</span><button class="act ${i.out ? '' : 'no'}" data-vout="${i.id}" data-o="${i.out ? 0 : 1}">${i.out ? 'Back in stock' : 'Mark sold out'}</button></div>`).join('')}</div>`;
  } catch { }
}
const vcall = async (p, b) => { try { await api(p, { m: 'PUT', b, h: { 'x-vendor': S.vauth.id, 'x-pin': S.vauth.pin } }); await loadVendors(); loadVendorCtl(); } catch (e) { toast(e.message); } };
async function loadVendor() {
  const el = $('#vlist'); if (!el || !S.vauth.pin) return;
  try {
    const os = await api('/vendor-orders', { h: { 'x-vendor': S.vauth.id, 'x-pin': S.vauth.pin } });
    el.innerHTML = os.length ? os.map(o => `<div class="order"><div class="row"><b>${o.id} · ${esc(o.name)}</b><span class="tag">${esc(statusLabel(o.type, o.status))}</span></div><div class="meta">${o.lines.map(l => l.q + ' × ' + esc(l.n) + (l.note ? ' (' + esc(l.note) + ')' : '')).join(', ')}<br>${fmt(o.total, o.cur)} · ${o.pay}${o.age ? ' · Check ID (' + o.age + '+)' : ''}${o.note ? ' · Note: ' + esc(o.note) : ''}${o.sched ? ' · Scheduled ' + new Date(o.sched).toLocaleString() : ''}${o.type === 'grocery' ? ' · If out of stock: ' + (o.subPref || 'refund') : ''}${o.issue ? ' · ⚠ ' + esc(o.issue.why) : ''}</div><div style="display:flex;gap:8px;margin-top:8px">${((o.mode === 'pickup' && o.status === 'ready') ? [['delivered', 'Mark picked up']] : NEXT[o.status] || []).map(([s, tt, c]) => `<button class="act ${c || ''}" data-set="${o.id}" data-s="${s}">${tt}</button>`).join('')}</div></div>`).join('') : '<p class="meta">No orders yet. New orders appear here automatically.</p>';
  } catch (e) { el.innerHTML = `<p class="meta">${esc(e.message)}</p>`; }
}
function riderUI() {
  $('#main').innerHTML = `<h1>Rider</h1><p class="meta">Demo PIN: 0000. Showing ${S.rAll ? 'deliveries in every region' : 'deliveries in ' + esc(regionName())}. <button class="lnk" data-act="rall">${S.rAll ? 'Only my region' : 'Show every region'}</button> Ready orders appear automatically. Your GPS is shared with the customer once you pick an order up.</p><div class="form"><label for="rname">Your name</label><input id="rname" value="${esc(S.rauth.name)}"><label for="rpin">PIN</label><input id="rpin" type="password" inputmode="numeric" value="${esc(S.rauth.pin)}"></div><div id="earn" class="order" style="margin-top:16px;display:none"></div><div id="rlist" style="margin-top:16px"></div>`;
  listen('/api/stream/riders', loadRider); loadRider();
}
const nav = (la, lo) => `https://www.google.com/maps/dir/?api=1&destination=${la},${lo}`;
async function loadRider() {
  const el = $('#rlist'); if (!el || !S.rauth.pin || !S.rauth.name) return;
  try {
    const os = await api('/rider-orders' + (S.rAll ? '' : '?region=' + encodeURIComponent(S.region)), { h: { 'x-pin': S.rauth.pin, 'x-rider': S.rauth.name } }), by = {};
    os.filter(o => o.status === 'delivered').forEach(o => by[o.cur] = (by[o.cur] || 0) + Math.round(o.fee * .8) + (o.tip || 0));
    const ern = Object.entries(by).map(([c, n]) => money(n, c)).join(' + ') || '0', ee = $('#earn'); if (ee) { ee.style.display = ''; ee.innerHTML = `<div class="row"><b>Your earnings</b><span>${ern}</span></div><div class="meta">80% of each delivery fee plus 100% of tips, shown openly.</div>`; }
    el.innerHTML = os.length ? os.map(o => { const cp = o.cloc || (o.lat != null ? o : null); return `<div class="order"><div class="row"><b>${o.id} · ${esc(o.vendor)}</b><span class="tag">${esc(statusLabel(o.type, o.status))}</span></div><div class="meta">${esc(o.city || '')} · Deliver to ${esc(o.name)}, ${esc(o.address)} · <a href="tel:${esc(o.phone)}">${esc(o.phone)}</a><br>${o.pay === 'Cash' ? 'Collect ' + fmt(o.total, o.cur) + ' cash' : 'Paid online (' + o.pay + ')'}${o.age ? '<br>Alcohol order: check ID. Customer must be ' + o.age + ' or older.' : ''}${o.cloc ? '<br>Customer is sharing their live location' : ''}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">${o.status === 'ready' ? `<button class="act" data-set="${o.id}" data-s="onway" data-rider="1">Pick up</button><a class="act" style="text-decoration:none" target="_blank" rel="noopener" href="${nav(o.vlat, o.vlng)}">Navigate to store</a>` : o.status === 'onway' ? `<button class="act" data-set="${o.id}" data-s="delivered" data-rider="1">Mark delivered</button><button class="act" data-gps="${o.id}">Share my GPS</button>${cp ? `<a class="act" style="text-decoration:none" target="_blank" rel="noopener" href="${nav(cp.cloc ? cp.lat : cp.lat, cp.lng)}">Navigate to customer</a>` : ''}<button class="act" data-sim="${o.id}">Simulate ride</button>` : ''}</div></div>`; }).join('') : '<p class="meta">Nothing to deliver right now.</p>';
  } catch (e) { el.innerHTML = `<p class="meta">${esc(e.message)}</p>`; }
}
async function setStatus(id, s, rider) {
  const h = rider ? { 'x-pin': S.rauth.pin, 'x-rider': S.rauth.name } : { 'x-vendor': S.vauth.id, 'x-pin': S.vauth.pin };
  try { await api('/orders/' + id, { m: 'PATCH', h, b: { status: s } }); if (s === 'delivered') stopGps(); if (s === 'onway') shareGps(id); rider ? loadRider() : loadVendor(); } catch (e) { toast(e.message); }
}
function stopGps() { if (GPS) { clearInterval(GPS.t); if (GPS.w != null) navigator.geolocation.clearWatch(GPS.w); GPS = null; } }
const postLoc = (id, lat, lng, ex = {}) => api('/orders/' + id + '/location', { m: 'POST', h: { 'x-pin': S.rauth.pin, 'x-rider': S.rauth.name }, b: { lat, lng, ...ex } }).catch(() => { });
function shareGps(id) { stopGps(); if (!geoOK()) return toast(t('locNoSupport')); GPS = { w: navigator.geolocation.watchPosition(p => postLoc(id, p.coords.latitude, p.coords.longitude, { sp: p.coords.speed, hd: p.coords.heading }), () => toast(t('locDenied')), { enableHighAccuracy: true }) }; toast('📍 GPS on'); }
async function simulate(id) {
  stopGps(); const o = await api('/orders/' + id), a = o.loc || { lat: o.vlat, lng: o.vlng }, c = custPoint(o), to = c || { lat: o.vlat + .01, lng: o.vlng + .01 }; let k = 0;
  GPS = { t: setInterval(() => { k++; postLoc(id, a.lat + (to.lat - a.lat) * k / 20, a.lng + (to.lng - a.lng) * k / 20, { sp: 8, hd: bearing([a.lat, a.lng], [to.lat, to.lng]) }); if (k >= 20) stopGps(); }, 1500) }; toast('Simulating a ride for 30 seconds');
}
const adm = (p, m, b) => api('/admin' + p, { m, b, h: { 'x-admin': S.aauth.pin } });
const val = id => ($('#' + id) || {}).value || '';
function adminUI() { $('#main').innerHTML = `<h1>Admin</h1><p class="meta">Demo PIN: 9999. Set the ADMIN_PIN environment variable to change it. Showing places in ${esc(regionName())}.</p><div class="form"><label for="apin">PIN</label><input id="apin" type="password" inputmode="numeric" value="${esc(S.aauth.pin)}"></div><div id="adm" style="margin-top:16px"></div>`; loadAdmin(); }
async function loadAdmin() {
  const el = $('#adm'); if (!el || !S.aauth.pin) return;
  try {
    const d = await adm('/overview?cc=' + S.cc + '&region=' + encodeURIComponent(S.region)), v = d.vendors.find(x => x.id === S.adminVid), cs = country(S.cc);
    el.innerHTML = `<div class="order"><div class="row"><b>Orders (all regions)</b><span>${d.stats.orders}</span></div><div class="row"><b>Delivered</b><span>${d.stats.delivered}</span></div><div class="row"><b>Delivered sales</b><span>${Object.entries(d.stats.revenue).map(([c, n]) => money(n, c)).join(' · ') || '0'}</span></div></div>
    <h2 class="cat">Restaurants and stores · ${esc(regionName())}</h2>${d.vendors.map(x => `<div class="order"><div class="row"><b>${esc(x.name)}</b><span class="tag">${esc(x.city || '')} · ${x.type}</span></div><div class="meta">PIN ${esc(x.pin)} · ${x.items.length} items · ${fmt(x.fee, x.cur)} delivery · radius ${x.radius || 15} km</div><div style="display:flex;gap:8px;margin-top:8px"><button class="act" data-edit="${x.id}">Edit menu</button><button class="act no" data-del="${x.id}">Delete</button></div><div style="display:flex;gap:8px;margin-top:8px"><input id="ph-${x.id}" placeholder="Photo URL (https://…)" value="${esc(x.img || '')}"><button class="act" data-setph="${x.id}">Save</button></div><div style="display:flex;gap:8px;margin-top:8px"><input id="hr-${x.id}" placeholder="Hours 08:00-22:00 (empty = always)" value="${esc(x.hours || '')}"><button class="act" data-sethrs="${x.id}">Save</button></div></div>`).join('')}
    ${v ? `<h2 class="cat">Menu: ${esc(v.name)}</h2>${v.items.map(i => `<div class="item"><div><h3>${esc(i.n)}${i.out ? ' (sold out)' : ''}</h3><p class="meta">${esc(i.c)} · ${fmt(i.p, v.cur)}${i.alc ? ' · 18+' : ''}</p><div class="pwrow"><input id="pr-${i.id}" inputmode="decimal" value="${i.p / 10 ** (country(v.country).dec || 0)}" aria-label="Price"><button class="act" data-setprice="${v.id}|${i.id}">Save price</button></div></div><button class="act no" data-delitem="${v.id}|${i.id}">Remove</button></div>`).join('') || '<p class="meta">No items yet.</p>'}
    <div class="form order"><label for="ai-c">Category</label><input id="ai-c" placeholder="Mains"><label for="ai-n">Item name</label><input id="ai-n"><label for="ai-d">Description</label><input id="ai-d"><label for="ai-p">Price (${v.cur}, e.g. 12.50)</label><input id="ai-p" inputmode="decimal"><label for="ai-t">Dietary tags (veg, vegan, gf, halal, spicy, nuts)</label><input id="ai-t"><label for="ai-i">Photo URL</label><input id="ai-i"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="ai-a"> Alcohol (age check at delivery)</label><label for="ai-o">Options, one group per line. ! = required, + = pick many</label><textarea id="ai-o" rows="3" placeholder="Size!: Medium=0, Large=4&#10;Toppings+: Cheese=2, Olives=1.5"></textarea><button class="go" data-additem="${v.id}">Add item</button></div>` : ''}
    <h2 class="cat">Add a restaurant or store</h2><div class="form order"><label for="av-name">Name</label><input id="av-name"><label for="av-type">Type</label><select id="av-type"><option value="food">Restaurant</option><option value="grocery">Grocery store</option><option value="drinks">Drinks & wine shop</option><option value="household">Household & home store</option></select>
    <label for="av-cc">Country (sets the currency)</label><select id="av-cc">${S.countries.map(c => `<option value="${c.code}" ${c.code === S.cc ? 'selected' : ''}>${c.flag} ${esc(c.n)} · ${c.cur}</option>`).join('')}</select>
    <label for="av-rg">State / region (customers there will see this place)</label><select id="av-rg">${(cs.regions || []).map(r => `<option value="${r.key}" ${r.key === S.region ? 'selected' : ''}>${esc(r.n)}</option>`).join('')}</select><label for="av-city">City</label><select id="av-city">${((regionObj(S.region) || { cities: [] }).cities).map(c => `<option>${esc(c.n)}</option>`).join('')}</select>
    <label for="av-cat">Category</label><input id="av-cat" placeholder="Pizza, Supermarket…"><label for="av-eta">Delivery time (minutes)</label><input id="av-eta" inputmode="numeric" value="30"><label for="av-fee">Delivery fee (in that currency, e.g. 2.50)</label><input id="av-fee" inputmode="decimal" placeholder="Leave empty for a default"><label for="av-rad">Delivery radius (km)</label><input id="av-rad" inputmode="numeric" value="15"><label for="av-pin">Staff PIN</label><input id="av-pin" inputmode="numeric">
    <label for="av-lat">Latitude (empty = the city centre)</label><input id="av-lat"><label for="av-lng">Longitude</label><input id="av-lng"><button class="go" id="addv">Add place</button></div>`;
  } catch (e) { el.innerHTML = `<p class="meta">${esc(e.message)}</p>`; }
}
async function adminAct(fn) { try { await fn(); loadAdmin(); } catch (e) { toast(e.message); } }

// ───────────────────────── render
function render() {
  if (MAP) { MAP.remove(); MAP = null; } if (VMARK) { VMARK.remove(); VMARK = null; }
  renderHeader(); updFab(); const m = $('#main'); CUR = (country(S.cc).cur) || CUR;
  if (S.mode === 'vendor') { setPoll(loadVendor, 15000); return vendorUI(); }
  if (S.mode === 'rider') { setPoll(loadRider, 15000); return riderUI(); }
  if (S.mode === 'admin') { setPoll(null); listen(null); return adminUI(); }
  if (S.view === 'track') { m.innerHTML = trackHTML(); initMap(); setPoll(pollTrack, S.track && S.track.payStatus === 'pending' ? 3000 : 15000); if (S.track) listen('/api/stream/order/' + S.track.id + (S.tok[S.track.id] ? '?t=' + encodeURIComponent(S.tok[S.track.id]) : ''), applyOrder); return; }
  listen(null); setPoll(null);
  if (S.view === 'home') { m.innerHTML = homeHTML(); if (S.vmode === 'map') initVMap(); } else if (S.view === 'menu') m.innerHTML = menuHTML(); else { m.innerHTML = ordersHTML(); loadOrders(); }
  document.title = 'Instadrop · ' + regionName();
}
function go(view, extra) { if (view) S.view = view; Object.assign(S, extra || {}); render(); }
async function openVendor(id) { try { S.v = await api('/vendors/' + id); go('menu'); window.scrollTo(0, 0); } catch (e) { toast(e.message); } }
const themeNow = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');

// ───────────────────────── events
document.addEventListener('click', e => {
  const hh = e.target.closest('[data-heart]'); if (hh) { e.stopPropagation(); const id = hh.dataset.heart; S.fav = S.fav.includes(id) ? S.fav.filter(x => x !== id) : [...S.fav, id]; LS.set('if_fav', S.fav); return refreshHome(); }
  const b = e.target.closest('button, a.btn'); if (!b) return; const d = b.dataset;
  if (b.id === 'theme') { const nx = themeNow() === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = nx; LS.set('if_theme', nx); return renderHeader(); }
  if (d.mode) { if (d.mode !== 'rider') stopGps(); S.mode = d.mode; S.view = 'home'; if (d.mode === 'customer') loadVendors().then(render); return render(); }
  if (d.act) {
    switch (d.act) {
      case 'region': return openSheet('region');
      case 'prefs': return openSheet('prefs');
      case 'close': return closeAll();
      case 'gps': return useMyLocation();
      case 'gps-addr': return fillAddress();
      case 'lang-auto': setLang(regionLang(), false); renderHeader(); sheetUI(); return render();
      case 'dismiss-lang': S.langNo[S.region] = 1; LS.set('if_langno', S.langNo); return refreshHome();
      case 'rall': S.rAll = !S.rAll; return riderUI();
      case 'follow': S.follow = !S.follow; syncTools(); if (S.follow && MK.r && S.track && S.track.loc) MAP.panTo([S.track.loc.lat, S.track.loc.lng]); return;
      case 'fit': { S.follow = false; syncTools(); const o = S.track, c = o && custPoint(o), ps = o ? [[o.vlat, o.vlng], o.loc && [o.loc.lat, o.loc.lng], c && [c.lat, c.lng]].filter(Boolean) : []; if (MAP && ps.length > 1) MAP.fitBounds(ps, { padding: [40, 40], maxZoom: 16 }); return; }
    }
  }
  if (d.lang) { setLang(d.lang, !d.auto); if (d.auto) { S.langSet = true; LS.set('if_langset', true); } renderHeader(); if (S.sheet) sheetUI(); return render(); }
  if (d.int) { S.int = S.int.includes(d.int) ? S.int.filter(x => x !== d.int) : [...S.int, d.int]; LS.set('if_int', S.int); sheetUI(); return; }
  if (d.region) return setRegion(d.region);
  if (d.city !== undefined && b.classList.contains('pill')) { S.city = d.city; S.cz = ''; return render(); }
  if (d.vm) { S.vmode = d.vm; return render(); }
  if (b.id === 'cartbtn' || b.id === 'fcart') { cartUI(true); loadLp(); return; } if (b.id === 'close') return closeAll(); if (b.id === 'place') return place();
  if (d.open) { const it = S.v.items.find(i => i.id === d.open); S.m = { i: it, sel: {}, q: 1 }; (it.opts || []).forEach(g => { if (g.req && !g.multi) S.m.sel[g.name] = [g.choices[0].n]; }); return modalUI(); }
  if (d.opt) { const [gi, ci] = d.opt.split('.').map(Number), g = S.m.i.opts[gi], n = g.choices[ci].n; let a = S.m.sel[g.name] || []; a = g.multi ? (a.includes(n) ? a.filter(x => x !== n) : [...a, n]) : (a.includes(n) && !g.req ? [] : [n]); S.m.sel[g.name] = a; return modalUI(); }
  if (d.mq) { S.m.q = Math.min(20, Math.max(1, S.m.q + +d.mq)); return modalUI(); }
  if (d.mclose) return closeAll();
  if (d.madd) { const m = S.m, miss = (m.i.opts || []).find(g => g.req && !(m.sel[g.name] || []).length); if (miss) return toast(t('chooseX', { x: miss.name })); const sel = [].concat(...(m.i.opts || []).map(g => (m.sel[g.name] || []).map(n => g.name + ':' + n))); if (addLine(sel.length ? m.i.id + '|' + sel.join('~') : m.i.id, m.i, sel, m.q, extras(m))) { closeAll(); render(); toast(t('added')); } return; }
  if (d.cd) { S.cart.q[d.cd] = Math.max(0, (S.cart.q[d.cd] || 0) + +d.d2); if (!cnt()) S.cart = { vid: null, q: {} }; saveCart(); syncGroup(); render(); return cartUI(false); }
  if (d.diet) { S.diet = S.diet.includes(d.diet) ? S.diet.filter(x => x !== d.diet) : [...S.diet, d.diet]; return render(); }
  if (d.redeem) { S.info.redeem = !S.info.redeem; LS.set('if_info', S.info); return cartUI(false); }
  if (d.vpause !== undefined) return vcall('/vendor/status', { paused: !!+d.vpause });
  if (d.vhours) return vcall('/vendor/status', { hours: val('vhrs') });
  if (d.vout) return vcall('/vendor/items/' + d.vout, { out: !!+d.o });
  if (d.setprice) { const [a, c] = d.setprice.split('|'); return adminAct(() => adm('/vendors/' + a + '/items/' + c, 'PUT', { p: val('pr-' + c) })); }
  if (d.sethrs) return adminAct(() => adm('/vendors/' + d.sethrs, 'PUT', { hours: val('hr-' + d.sethrs) }));
  if (d.setph) return adminAct(() => adm('/vendors/' + d.setph, 'PUT', { img: val('ph-' + d.setph) }));
  if (d.grp === 'start') { api('/groups', { m: 'POST', b: { vendorId: S.v.id } }).then(g => { S.grp = { code: g.code, vid: g.vid, host: true, who: S.info.name || 'Host' }; LS.set('if_grp', S.grp); S.gl = []; render(); toast(t('grpStarted', { code: g.code })); }).catch(x => toast(x.message)); return; }
  if (d.grp === 'leave') { S.grp = null; S.gl = []; LS.set('if_grp', null); return render(); }
  if (d.join) { const code = val('gcode').trim().toUpperCase(), who = (prompt(t('grpName')) || '').trim().slice(0, 30); if (!code || !who) return toast(t('grpNeed')); api('/groups/' + code).then(async g => { S.v = await api('/vendors/' + g.vid); if (S.v.region !== S.region) await setRegion(S.v.region, { render: false }); S.grp = { code, vid: g.vid, host: false, who }; LS.set('if_grp', S.grp); S.gl = []; S.cart = { vid: null, q: {} }; S.cartItems = {}; saveCart(); go('menu'); window.scrollTo(0, 0); }).catch(x => toast(x.message)); return; }
  if (d.tab) { S.tab = d.tab; S.cz = ''; return render(); }
  if (d.cz !== undefined && b.classList.contains('cc')) { S.cz = d.cz; return render(); }
  if (d.fl) { if (d.fl === 'near' && !S.geo) startGeo(); S.fl[d.fl] = !S.fl[d.fl]; return render(); }
  if (d.fm) { S.info.mode = d.fm; LS.set('if_info', S.info); render(); return cartUI(false); }
  if (d.tp) { S.info.tipPct = +d.tp; LS.set('if_info', S.info); return cartUI(false); }
  if (d.rep) { S.rep = !S.rep; $('#tinfo').innerHTML = infoHTML(S.track); return; }
  if (d.iss) { api('/orders/' + S.track.id + '/issue', { m: 'POST', b: { reason: d.iss } }).then(o => { S.rep = false; S.track = o; $('#tinfo').innerHTML = infoHTML(o); toast(t('reportSent')); }).catch(x => toast(x.message)); return; }
  if (d.star) { api('/orders/' + S.track.id + '/rate', { m: 'POST', b: { stars: +d.star } }).then(o => { S.track = o; $('#tinfo').innerHTML = infoHTML(o); toast(t('thanksRate')); }).catch(x => toast(x.message)); return; }
  if (d.reorder) { (async () => { try { const o = await api('/orders/' + d.reorder), v = await api('/vendors/' + o.vendorId); S.v = v; S.cart = { vid: v.id, q: {} }; S.cartItems = {}; snapshotVendor(); for (const l of o.lines) { const it = v.items.find(i => i.id === l.id); if (it) { S.cart.q[it.id] = l.q; S.cartItems[it.id] = { n: it.n, p: it.p, alc: it.alc }; } } if (!cnt()) { S.cart = { vid: null, q: {} }; return toast(t('gone')); } saveCart(); LS.set('if_ci', S.cartItems); S.mode = 'customer'; S.view = 'home'; render(); cartUI(true); } catch (x) { toast(x.message); } })(); return; }
  if (d.v) return openVendor(d.v);
  if (d.view) { S.view = d.view; stopShare(true); return render(); }
  if (d.track) { api('/orders/' + d.track).then(o => { S.track = o; S.shareLoc = false; go('track'); }); return; }
  if (d.paynow) { api('/orders/' + S.track.id + '/pay', { m: 'POST', b: { momo: S.info.momo || S.track.phone } }).then(o => { S.track = o; $('#tinfo').innerHTML = infoHTML(o); if (o.payUrl) location.href = o.payUrl; }).catch(x => toast(x.message)); return; }
  if (d.gps) return shareGps(d.gps); if (d.sim) return simulate(d.sim);
  if (d.edit) { S.adminVid = d.edit; return loadAdmin(); }
  if (d.del) { if (confirm('Delete this place and its menu?')) adminAct(() => adm('/vendors/' + d.del, 'DELETE')); return; }
  if (d.delitem) { const [a, c] = d.delitem.split('|'); return adminAct(() => adm('/vendors/' + a + '/items/' + c, 'DELETE')); }
  if (d.additem) return adminAct(() => adm('/vendors/' + d.additem + '/items', 'POST', { c: val('ai-c'), n: val('ai-n'), d: val('ai-d'), p: val('ai-p'), t: val('ai-t'), img: val('ai-i'), o: val('ai-o'), alc: ($('#ai-a') || {}).checked }));
  if (b.id === 'addv') return adminAct(() => adm('/vendors', 'POST', { name: val('av-name'), type: val('av-type'), cat: val('av-cat'), eta: val('av-eta'), fee: val('av-fee'), country: val('av-cc'), region: val('av-rg'), city: val('av-city'), radius: val('av-rad'), pin: val('av-pin'), lat: parseFloat(val('av-lat')) || null, lng: parseFloat(val('av-lng')) || null }));
  if (d.i) return change(d.i, +d.d);
  if (d.pay) { S.info.pay = d.pay; LS.set('if_info', S.info); return cartUI(true); }
  if (d.set) return setStatus(d.set, d.s, !!d.rider);
});
document.addEventListener('input', e => {
  const x = e.target;
  if (x.dataset.ln) { (S.cart.notes = S.cart.notes || {})[x.dataset.ln] = x.value; saveCart(); }
  if (x.dataset.f) { S.info[x.dataset.f] = x.type === 'checkbox' ? x.checked : x.value; LS.set('if_info', S.info); }
  if (x.id === 'search') { S.q = x.value; refreshGrid(); }
  if (x.id === 'pk-q') $('#rg-items').innerHTML = regionItems(country(S.cc).regions || [], x.value);
  if (x.id === 'vid' || x.id === 'vpin') { S.vauth = { id: $('#vid').value, pin: $('#vpin').value }; LS.set('if_v', S.vauth); loadVendor(); }
  if (x.id === 'apin') { S.aauth = { pin: x.value }; LS.set('if_a', S.aauth); loadAdmin(); }
  if (x.id === 'rname' || x.id === 'rpin') { S.rauth = { name: $('#rname').value, pin: $('#rpin').value }; LS.set('if_r', S.rauth); loadRider(); }
});
document.addEventListener('change', e => {
  const x = e.target;
  if (x.id === 'pk-cc') { S.cc = x.value; const c = country(S.cc); const first = (c.regions || [])[0]; if (first) setRegion(first.key, { keepSheet: true }).then(() => sheetUI()); return; }
  if (x.id === 'sort') { S.sort = x.value; if (S.sort === 'near' && !S.geo) startGeo(); return refreshGrid(); }
  if (x.id === 'shareloc') { x.checked ? startShare() : stopShare(); return updateTrack(); }
  if (x.id === 'f-phone') loadLp();
  if (x.id === 'vid') { S.vauth = { id: x.value, pin: '' }; LS.set('if_v', S.vauth); vendorUI(); }
  if (x.id === 'av-cc') { const c = country(x.value), r0 = (c.regions || [])[0]; $('#av-rg').innerHTML = (c.regions || []).map(r => `<option value="${r.key}">${esc(r.n)}</option>`).join(''); $('#av-city').innerHTML = r0 ? r0.cities.map(ci => `<option>${esc(ci.n)}</option>`).join('') : ''; }
  if (x.id === 'av-rg') { const r = regionObj(x.value); $('#av-city').innerHTML = r ? r.cities.map(ci => `<option>${esc(ci.n)}</option>`).join('') : ''; }
});
$('#scrim').onclick = closeAll; document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });

// ───────────────────────── boot
async function boot() {
  const th = LS.get('if_theme', null); if (th) document.documentElement.dataset.theme = th;
  setLang(S.lang); renderHeader();
  try { S.countries = await api('/countries'); } catch (e) { toast(e.message); }
  S.countries.forEach(c => (c.regions || []).forEach(r => { r.cc = c.code; }));
  let first = false;
  if (!regionObj(S.region)) { const cc = guessCountry(), r = (country(cc).regions || [])[0] || S.countries[0].regions[0]; S.region = r.key; S.cc = r.cc; first = true; LS.set('if_region', S.region); LS.set('if_cc', S.cc); } else S.cc = regionObj(S.region).cc;
  if (!S.langSet) setLang(regionLang());
  await loadVendors();
  const qs = new URLSearchParams(location.search), pd = qs.get('paid') || qs.get('track'); if (pd) { if (qs.get('t')) { S.tok[pd] = qs.get('t'); LS.set('if_tok', S.tok); if (!S.orders.includes(pd)) { S.orders.unshift(pd); LS.set('if_orders', S.orders); } } history.replaceState(null, '', '/'); try { S.track = await api('/orders/' + pd); S.view = 'track'; } catch { } }
  const resetting = await authInit();
  go(); cartUI();
  if (resetting) openSheet('reset'); else if (first) openSheet('region');
  // Resume live location when the person allowed it before and the browser still remembers that choice.
  if (LS.get('if_geo', false) && navigator.permissions) navigator.permissions.query({ name: 'geolocation' }).then(p => { if (p.state === 'granted') startGeo(); }).catch(() => { });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { });
}
boot();


