// Instadrop accounts: sign up, sign in, sessions and login protection. Zero dependencies (Node 18+).
//
// Built around the six ideas for logging in millions of users:
//  1. Load balancing  – auth is STATELESS. Access tokens are signed, so any server verifies them with the shared JWT_SECRET;
//                       nothing about a login lives in one process's memory except rate-limit counters (see docs/SCALING.md).
//  2. Verify password – only a salted, memory-hard hash (scrypt) is stored. No plaintext, ever. Unknown accounts cost the same time as known ones.
//  3. No bottleneck   – users are looked up by index (Map on email / phone), hot profiles come from a small LRU cache that never holds hashes,
//                       and hashing runs through a bounded queue so a login spike cannot exhaust memory.
//  4. Sessions/tokens – 15-minute access token (signed JWT) + 30-day refresh token that rotates on every use. Reusing an old refresh
//                       token revokes that whole login (theft detection). The refresh token lives in an HttpOnly cookie.
//  5. Protect login   – per-IP and per-account rate limits (HTTP 429), uniform error messages, optional TOTP multi-factor authentication
//                       with recovery codes.
//  6. Reset / devices – single-use password-reset links, a "your devices" list and sign-out-everywhere.
const crypto = require('crypto'), fs = require('fs'), path = require('path'), { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);
const DIR = process.env.DATA_DIR || __dirname, PROD = process.env.NODE_ENV === 'production';
const CFG = {
  accessTtl: 15 * 60, refreshTtl: 30 * 86400, mfaTtl: 5 * 60, maxSessions: 10,
  scrypt: { N: 1 << 16, r: 8, p: 2 },                       // 64 MiB per hash, memory-hard (OWASP-recommended scrypt setting)
  hashers: +process.env.HASH_CONCURRENCY || 4, queueMax: +process.env.HASH_QUEUE || 400, // at most this many hashes at once; more wait; too many waiting -> 503
  trust: +process.env.TRUST_PROXY || 0                      // number of reverse proxies in front (so X-Forwarded-For can be trusted)
};

// ── secrets ───────────────────────────────────────────────────────────────
function loadSecret() {
  if (process.env.JWT_SECRET) { if (process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters'); return Buffer.from(process.env.JWT_SECRET); }
  if (PROD) throw new Error('Set JWT_SECRET (the same value on every server) before running in production');
  const f = path.join(DIR, '.jwt-secret');
  try { return fs.readFileSync(f); } catch { const s = crypto.randomBytes(48); fs.writeFileSync(f, s, { mode: 0o600 }); console.warn('[auth] Created a development JWT secret in .jwt-secret. In production set JWT_SECRET instead.'); return s; }
}
const SECRET = loadSecret(), ENC = crypto.createHash('sha256').update('enc:').update(SECRET).digest();
const b64u = b => Buffer.from(b).toString('base64url');
const safeEq = (a, b) => { a = Buffer.from(String(a)); b = Buffer.from(String(b)); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const sha = s => crypto.createHash('sha256').update(s).digest('base64url');

// ── signed access tokens (JWT, HS256) ─────────────────────────────────────
function sign(claims, ttl) {
  const now = Math.floor(Date.now() / 1000), h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), p = b64u(JSON.stringify({ ...claims, iat: now, exp: now + ttl }));
  return h + '.' + p + '.' + crypto.createHmac('sha256', SECRET).update(h + '.' + p).digest('base64url');
}
function verify(tok, purpose) { // returns the claims, or null. Purpose-bound tokens (like the MFA step) cannot be used as access tokens.
  const a = String(tok || '').split('.'); if (a.length !== 3) return null;
  let head, c; try { head = JSON.parse(Buffer.from(a[0], 'base64url')); } catch { return null; }
  if (head.alg !== 'HS256') return null; // never accept "none" or other algorithms
  if (!safeEq(crypto.createHmac('sha256', SECRET).update(a[0] + '.' + a[1]).digest('base64url'), a[2])) return null;
  try { c = JSON.parse(Buffer.from(a[1], 'base64url')); } catch { return null; }
  if (!(c.exp > Date.now() / 1000) || (c.pur || undefined) !== purpose) return null; return c;
}

// ── storage: file journals (one server) or PostgreSQL (many servers), chosen by DATABASE_URL. See store.js ─
const store = require('./store').create(DIR);
const ready = store.init().then(() => { setInterval(() => store.cleanup().catch(() => { }), 6 * 3600 * 1000).unref(); });
ready.catch(e => { console.error('[auth] storage failed to start:', e.message); process.exit(1); });

// ── small LRU cache for hot account data (never contains password hashes or MFA secrets) ─
class LRU {
  constructor(max, ttl) { this.max = max; this.ttl = ttl; this.m = new Map(); }
  get(k) { const e = this.m.get(k); if (!e) return; if (e.t < Date.now()) { this.m.delete(k); return; } this.m.delete(k); this.m.set(k, e); return e.v; }
  set(k, v) { this.m.delete(k); this.m.set(k, { v, t: Date.now() + this.ttl }); if (this.m.size > this.max) this.m.delete(this.m.keys().next().value); }
  del(k) { this.m.delete(k); }
}
const cache = new LRU(50000, 60000);
const bus = require('./bus'); // Redis pub/sub between servers (no-op without REDIS_URL)
const publicUser = u => ({ id: u.id, name: u.name, email: u.email || null, phone: u.phone || null, role: u.role, mfa: !!(u.mfa && u.mfa.on), created: u.created });
const profile = async id => { let p = cache.get(id); if (!p) { const u = await store.userById(id); if (!u) return null; p = publicUser(u); cache.set(id, p); } return p; };
const dropProfile = id => { cache.del(id); bus.publish('user', { id }); }; // other servers drop their copy too
bus.handle('user', d => cache.del(d.id));
const putUser = async u => { await store.userPut(u); dropProfile(u.id); };

// ── rate limiting (in memory per server; use Redis when you run many servers) ─
class Limiter {
  constructor() { this.m = new Map(); setInterval(() => { const n = Date.now(); for (const [k, e] of this.m) if (e.reset <= n) this.m.delete(k); }, 60000).unref(); }
  hit(key, max, ms) { const now = Date.now(); let e = this.m.get(key); if (!e || e.reset <= now) { e = { n: 0, reset: now + ms }; this.m.set(key, e); } e.n++; return { ok: e.n <= max, retry: Math.max(1, Math.ceil((e.reset - now) / 1000)) }; }
  over(key, max) { const e = this.m.get(key); return e && e.reset > Date.now() && e.n >= max ? Math.max(1, Math.ceil((e.reset - Date.now()) / 1000)) : 0; }
  clear(key) { this.m.delete(key); }
}
const RL = new Limiter();
// Account-level counters (wrong passwords, wrong MFA codes) live in the database when there is one, so they hold across all servers.
// Per-IP request limits stay in memory per server: they only blunt floods, and a load balancer spreads one client's IP across servers evenly enough.
const LIMITS = require('./limiter');
const mem = LIMITS.local(RL);
const dbLimits = store.limitHit ? { hit: (k, m, ms) => store.limitHit(k, m, ms), over: (k, m) => store.limitOver(k, m), clear: k => store.limitClear(k) } : mem;
const IPL = bus.redis ? LIMITS.withRedis(bus.redis, mem) : mem;       // per-IP flood limits: Redis (shared) or this server's memory
const AL = bus.redis ? LIMITS.withRedis(bus.redis, dbLimits) : dbLimits; // account guess counters: Redis, else PostgreSQL, else memory
const MIN = 60e3, HOUR = 60 * MIN;

// ── passwords ─────────────────────────────────────────────────────────────
let active = 0; const waiting = [];
function limited(fn) { // bounded concurrency: hashing is deliberately heavy, so never run unlimited copies at once
  return new Promise((res, rej) => {
    const run = async () => { active++; try { res(await fn()); } catch (e) { rej(e); } finally { active--; const n = waiting.shift(); if (n) n(); } };
    if (active < CFG.hashers) run(); else if (waiting.length >= CFG.queueMax) rej(Object.assign(new Error('Busy, try again in a moment'), { code: 'busy' })); else waiting.push(run);
  });
}
const derive = (pw, salt, N, r, p) => limited(() => scrypt(pw.normalize('NFKC'), salt, 32, { N, r, p, maxmem: 256 * 1024 * 1024 }));
async function hashPw(pw) { const { N, r, p } = CFG.scrypt, salt = crypto.randomBytes(16), dk = await derive(pw, salt, N, r, p); return ['scrypt', N, r, p, salt.toString('base64'), dk.toString('base64')].join('$'); }
async function checkPw(pw, stored) {
  const a = String(stored).split('$'); if (a[0] !== 'scrypt' || a.length !== 6) return { ok: false };
  const [, N, r, p] = a.map(Number), salt = Buffer.from(a[4], 'base64'), want = Buffer.from(a[5], 'base64'), got = await derive(pw, salt, N, r, p);
  return { ok: got.length === want.length && crypto.timingSafeEqual(got, want), rehash: N !== CFG.scrypt.N || r !== CFG.scrypt.r || p !== CFG.scrypt.p }; // parameters improved since this hash was made
}
let DUMMY; const dummy = async () => DUMMY || (DUMMY = await hashPw(crypto.randomBytes(12).toString('hex'))); // unknown accounts take as long as real ones
dummy().catch(() => { }); // prepared at start-up so the first unknown-account login is not slower than the rest
const COMMON = new Set(['password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123', 'iloveyou', '11111111', '00000000', 'abc12345', 'letmein1', 'welcome1', 'admin123', 'instadrop', '1q2w3e4r', 'asdfghjk', 'baseball', 'football1']);
function pwProblem(pw, ...personal) {
  pw = String(pw || '').normalize('NFKC');
  if (pw.length < 8) return 'Use at least 8 characters'; if (pw.length > 128) return 'Use at most 128 characters';
  const lc = pw.toLowerCase(); if (COMMON.has(lc) || /^(.)\1+$/.test(pw)) return 'That password is too common. Choose a less guessable one';
  if (personal.some(x => x && lc === String(x).toLowerCase())) return 'Your password cannot be your name, email or phone'; return null;
}

// ── identifiers ───────────────────────────────────────────────────────────
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
function parseId(raw, dial) {
  const s = String(raw || '').trim().normalize('NFKC'); if (!s || s.length > 254) return null;
  if (s.includes('@')) return EMAIL.test(s) ? { email: s.toLowerCase(), key: 'e:' + s.toLowerCase() } : null;
  const intl = /^(\+|00)/.test(s); let d = s.replace(/\D/g, ''); if (/^00/.test(s)) d = d.slice(2);
  const n = intl ? d : d.startsWith('0') ? String(dial || '') + d.slice(1) : String(dial || '') && d.startsWith(String(dial)) ? d : String(dial || '') + d;
  return /^\d{8,15}$/.test(n) ? { phone: '+' + n, key: 'p:+' + n } : null;
}
const findUser = id => store.userFind(id);

// ── sessions ──────────────────────────────────────────────────────────────
const cookieOf = (req, name) => { for (const c of String(req.headers.cookie || '').split(';')) { const i = c.indexOf('='); if (i > 0 && c.slice(0, i).trim() === name) return decodeURIComponent(c.slice(i + 1).trim()); } return ''; };
const secure = req => !!(req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https');
const setRefresh = (req, res, tok, age) => res.setHeader('Set-Cookie', 'idr=' + encodeURIComponent(tok) + '; HttpOnly; SameSite=Strict; Path=/api/auth; Max-Age=' + age + (secure(req) ? '; Secure' : ''));
const ipOf = req => { if (CFG.trust) { const x = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean); if (x.length) return x[Math.max(0, x.length - CFG.trust)]; } return req.socket.remoteAddress || ''; };
const device = req => String(req.headers['user-agent'] || '').replace(/[^\x20-\x7e]/g, '').slice(0, 120);
function newRefresh() { return crypto.randomBytes(32).toString('base64url'); }
function accessFor(u, sid) { return sign({ sub: u.id, role: u.role, sid }, CFG.accessTtl); }
async function startSession(req, res, u) {
  const mine = (await store.famsOf(u.id)).sort((a, b) => a.last - b.last);
  while (mine.length >= CFG.maxSessions) await store.famRevoke(mine.shift().sid); // keep the newest devices
  const tok = newRefresh(), now = Date.now(), f = { sid: crypto.randomUUID(), uid: u.id, cur: sha(tok), prev: [], created: now, last: now, exp: now + CFG.refreshTtl * 1000, ua: device(req), ip: ipOf(req), rev: false };
  await store.famPut(f); setRefresh(req, res, tok, CFG.refreshTtl);
  return { access: accessFor(u, f.sid), expires: CFG.accessTtl, user: await profile(u.id) };
}
const claims = req => { const m = /^Bearer (.+)$/.exec(req.headers.authorization || ''); return m ? verify(m[1]) : null; };

// ── TOTP multi-factor (RFC 6238, works with Google Authenticator, Authy, 1Password…) ─
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32(buf) { let bits = 0, v = 0, o = ''; for (const x of buf) { v = (v << 8) | x; bits += 8; while (bits >= 5) { o += B32[(v >>> (bits - 5)) & 31]; bits -= 5; } } if (bits) o += B32[(v << (5 - bits)) & 31]; return o; }
function unb32(s) { let bits = 0, v = 0; const o = []; for (const ch of s.replace(/=+$/, '').toUpperCase()) { const i = B32.indexOf(ch); if (i < 0) continue; v = (v << 5) | i; bits += 5; if (bits >= 8) { o.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(o); }
function hotp(secret, counter) { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(counter)); const h = crypto.createHmac('sha1', secret).update(b).digest(), o = h[19] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); }
function totpStep(secret, code, last) { const now = Math.floor(Date.now() / 30000); for (const d of [0, -1, 1]) { const s = now + d; if (s > (last || 0) && safeEq(hotp(secret, s), String(code).replace(/\s/g, ''))) return s; } return null; } // a code can only be used once
const seal = t => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', ENC, iv), ct = Buffer.concat([c.update(t, 'utf8'), c.final()]); return b64u(Buffer.concat([iv, c.getAuthTag(), ct])); };
const unseal = s => { const b = Buffer.from(s, 'base64url'), d = crypto.createDecipheriv('aes-256-gcm', ENC, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'); };

// ── delivery of reset links / codes (console in development; plug in email / SMS providers here) ─
const notify = require('./notify').send; // email via RESEND_KEY, SMS via TWILIO_*, or NOTIFY_WEBHOOK; otherwise printed to the console

// ── HTTP routes ───────────────────────────────────────────────────────────
async function handle(req, res, p, m, b, { send, fail }) {
  const ip = ipOf(req), body = b && typeof b === 'object' ? b : {};
  const tooMany = (retry, msg) => { res.setHeader('Retry-After', retry); return fail(res, 429, msg || 'Too many attempts. Try again in ' + (retry > 90 ? Math.ceil(retry / 60) + ' minutes' : retry + ' seconds'), { code: 'rate', retry }); };
  const guard = async (key, max, ms) => { const r = await IPL.hit(key, max, ms); if (r.ok) return false; tooMany(r.retry); return true; }; // true = answered 429, caller must stop
  const needUser = async () => { const c = claims(req); if (!c) { fail(res, 401, 'Please sign in', { code: 'auth' }); return null; } const u = await store.userById(c.sub); if (!u) { fail(res, 401, 'Please sign in', { code: 'auth' }); return null; } return { c, u }; };
  const csrf = () => req.headers['x-requested-with'] === 'instadrop';
  const busy = e => e.code === 'busy' ? (res.setHeader('Retry-After', 5), fail(res, 503, e.message, { code: 'busy' })) : null;
  try {
    // ── sign up
    if (m === 'POST' && p === '/api/auth/signup') {
      if (await guard('su:' + ip, 10, HOUR)) return true;
      const id = parseId(body.identifier ?? body.email ?? body.phone, body.dial), name = String(body.name || '').trim().normalize('NFKC').slice(0, 60);
      if (!name) return fail(res, 400, 'Enter your name'), true;
      if (!id) return fail(res, 400, 'Enter a valid email address or phone number'), true;
      const prob = pwProblem(body.password, name, id.email, id.phone); if (prob) return fail(res, 400, prob, { code: 'weak' }), true;
      const exists = () => (fail(res, 409, 'An account with this ' + (id.email ? 'email' : 'phone number') + ' already exists. Sign in instead', { code: 'exists' }), true);
      if (await findUser(id)) return exists();
      const pw = await hashPw(body.password);
      const u = { id: crypto.randomUUID(), name, email: id.email || null, phone: id.phone || null, pw, role: 'customer', created: Date.now(), verified: false, mfa: null };
      if (!(await store.userCreate(u))) return exists(); // the database's unique index decides races between servers
      send(res, 201, await startSession(req, res, u)); return true;
    }
    // ── sign in (step 1)
    if (m === 'POST' && p === '/api/auth/login') {
      if (await guard('li:' + ip, 40, 10 * MIN)) return true;
      const id = parseId(body.identifier ?? body.email ?? body.phone, body.dial), pw = String(body.password || '');
      if (!id || !pw || pw.length > 128) return fail(res, 401, 'Wrong email / phone or password', { code: 'bad' }), true;
      const wait = await AL.over('fail:' + id.key, 5); if (wait) return tooMany(wait, 'Too many wrong attempts for this account. Try again in ' + Math.ceil(wait / 60) + ' minutes, or reset your password'), true;
      const u = await findUser(id), r = await checkPw(pw, u ? u.pw : await dummy());
      if (!u || !r.ok) { await AL.hit('fail:' + id.key, 5, 15 * MIN); return fail(res, 401, 'Wrong email / phone or password', { code: 'bad' }), true; } // same message and time whether the account exists or not
      await AL.clear('fail:' + id.key);
      if (r.rehash) { u.pw = await hashPw(pw); } u.last = Date.now(); await putUser(u);
      if (u.mfa && u.mfa.on) { send(res, 200, { mfa: true, mfaToken: sign({ sub: u.id, pur: 'mfa' }, CFG.mfaTtl) }); return true; }
      send(res, 200, await startSession(req, res, u)); return true;
    }
    // ── sign in (step 2, only when multi-factor is on)
    if (m === 'POST' && p === '/api/auth/mfa/verify') {
      if (await guard('mf:' + ip, 40, 10 * MIN)) return true;
      const c = verify(body.mfaToken, 'mfa'), u = c && await store.userById(c.sub); if (!u || !u.mfa) return fail(res, 401, 'Sign in again', { code: 'auth' }), true;
      const wait = await AL.over('mfa:' + u.id, 5); if (wait) return tooMany(wait), true;
      const code = String(body.code || '').trim(); let good = false; const before = JSON.stringify(u.mfa);
      const step = totpStep(unb32(unseal(u.mfa.secret)), code, u.mfa.last); if (step) { u.mfa.last = step; good = true; }
      else { const h = sha(code.toLowerCase().replace(/\s/g, '')), i = (u.mfa.rec || []).indexOf(h); if (i >= 0) { u.mfa.rec.splice(i, 1); good = true; } }
      if (!good) { await AL.hit('mfa:' + u.id, 5, 5 * MIN); return fail(res, 401, 'That code is not right', { code: 'bad' }), true; }
      if (!(await store.mfaCommit(u, before))) return fail(res, 401, 'That code is not right', { code: 'bad' }), true; // a code or recovery code works once, even across servers
      dropProfile(u.id); await AL.clear('mfa:' + u.id); send(res, 200, await startSession(req, res, u)); return true;
    }
    // ── silent sign-in on page load / token renewal: the refresh token rotates every time
    if (m === 'POST' && p === '/api/auth/refresh') {
      if (!csrf()) return fail(res, 400, 'Bad request'), true; if (await guard('rf:' + ip, 300, 10 * MIN)) return true;
      const tok = cookieOf(req, 'idr'); if (!tok) return fail(res, 401, 'Not signed in', { code: 'auth' }), true;
      const h = sha(tok), f = await store.famByHash(h);
      const drop = () => { setRefresh(req, res, '', 0); return fail(res, 401, 'Not signed in', { code: 'auth' }), true; };
      if (!f || f.rev || f.exp < Date.now()) return drop();
      if (f.cur !== h) { await store.famRevoke(f.sid); console.warn('[auth] refresh token reuse detected, session revoked for user', f.uid); return drop(); } // an old token came back: assume theft, end this login everywhere it was copied
      const u = await store.userById(f.uid); if (!u) return drop();
      const old = f.cur, next = newRefresh(); f.prev = [f.cur, ...f.prev].slice(0, 5); f.cur = sha(next); f.last = Date.now(); f.ip = ip;
      if (!(await store.famRotate(f, old))) return drop(); // lost a race with another refresh using the same token
      setRefresh(req, res, next, CFG.refreshTtl);
      send(res, 200, { access: accessFor(u, f.sid), expires: CFG.accessTtl, user: await profile(u.id) }); return true;
    }
    if (m === 'POST' && p === '/api/auth/logout') {
      if (!csrf()) return fail(res, 400, 'Bad request'), true; const f = await store.famByHash(sha(cookieOf(req, 'idr'))); if (f) await store.famRevoke(f.sid); setRefresh(req, res, '', 0); send(res, 200, { ok: true }); return true;
    }
    // everything below needs a valid access token
    if (!p.startsWith('/api/auth/')) return false;
    if (m === 'POST' && (p === '/api/auth/forgot' || p === '/api/auth/reset')) {
      if (p.endsWith('forgot')) { // always the same answer, so nobody can use this to discover who has an account
        if (await guard('fg:' + ip, 10, HOUR)) return true;
        const id = parseId(body.identifier, body.dial); if (id && (await IPL.hit('fgid:' + id.key, 3, HOUR)).ok) { const u = await findUser(id); if (u) { const tok = crypto.randomBytes(32).toString('base64url'); await store.resetPut(sha(tok), u.id, Date.now() + 30 * MIN); notify(id.email || id.phone, 'Reset your Instadrop password', 'Open /?reset=' + tok + ' (valid 30 minutes)'); } }
        send(res, 200, { ok: true }); return true;
      }
      if (await guard('rs:' + ip, 20, HOUR)) return true;
      const th = sha(String(body.token || '')), e = await store.resetTake(th); if (!e) return fail(res, 400, 'This reset link has expired. Ask for a new one', { code: 'expired' }), true;
      const u = await store.userById(e.uid), prob = u && pwProblem(body.password, u.name, u.email, u.phone); if (!u) return fail(res, 400, 'This reset link has expired. Ask for a new one', { code: 'expired' }), true;
      if (prob) { await store.resetPut(th, u.id, e.exp); return fail(res, 400, prob, { code: 'weak' }), true; } // a too-weak password does not burn the link
      u.pw = await hashPw(body.password); await putUser(u); await store.famRevokeUser(u.id); // a reset signs out every device
      await AL.clear('fail:' + (u.email ? 'e:' + u.email : 'p:' + u.phone)); send(res, 200, { ok: true }); return true;
    }
    const a = await needUser(); if (!a) return true; const { c, u } = a;
    if (m === 'GET' && p === '/api/auth/me') { send(res, 200, { user: await profile(u.id) }); return true; }
    if (m === 'PATCH' && p === '/api/auth/me') { const name = String(body.name || '').trim().slice(0, 60); if (!name) return fail(res, 400, 'Enter your name'), true; u.name = name; await putUser(u); send(res, 200, { user: await profile(u.id) }); return true; }
    if (m === 'GET' && p === '/api/auth/sessions') {
      const list = (await store.famsOf(u.id)).sort((x, y) => y.last - x.last)
        .map(f => ({ sid: f.sid, device: f.ua, ip: f.ip.replace(/(\d+)$/, '•••').replace(/:[0-9a-f]*$/i, ':•••'), created: f.created, last: f.last, current: f.sid === c.sid }));
      send(res, 200, { sessions: list }); return true;
    }
    let r;
    if (m === 'DELETE' && (r = p.match(/^\/api\/auth\/sessions\/([\w-]+)$/))) { const f = await store.famById(r[1]); if (!f || f.uid !== u.id) return fail(res, 404, 'Not found'), true; await store.famRevoke(f.sid); if (f.sid === c.sid) setRefresh(req, res, '', 0); send(res, 200, { ok: true }); return true; }
    if (m === 'POST' && p === '/api/auth/logout-all') { await store.famRevokeUser(u.id); setRefresh(req, res, '', 0); send(res, 200, { ok: true }); return true; }
    // sensitive actions ask for the password again
    const reauth = async () => { const w = await AL.over('fail:' + (u.email ? 'e:' + u.email : 'p:' + u.phone), 5); if (w) { tooMany(w); return false; } const r2 = await checkPw(String(body.password || ''), u.pw); if (!r2.ok) { await AL.hit('fail:' + (u.email ? 'e:' + u.email : 'p:' + u.phone), 5, 15 * MIN); fail(res, 401, 'Wrong password', { code: 'bad' }); return false; } return true; };
    if (m === 'POST' && p === '/api/auth/password') {
      if (!(await reauth())) return true; const prob = pwProblem(body.newPassword, u.name, u.email, u.phone); if (prob) return fail(res, 400, prob, { code: 'weak' }), true;
      u.pw = await hashPw(body.newPassword); await putUser(u); await store.famRevokeUser(u.id, c.sid); send(res, 200, { ok: true }); return true;
    }
    if (m === 'POST' && p === '/api/auth/mfa/setup') {
      if (u.mfa && u.mfa.on) return fail(res, 409, 'Two-step verification is already on'), true;
      const sec = crypto.randomBytes(20); u.mfa = { on: false, pending: seal(b32(sec)) }; await putUser(u); const label = encodeURIComponent('Instadrop:' + (u.email || u.phone));
      send(res, 200, { secret: b32(sec), uri: 'otpauth://totp/' + label + '?secret=' + b32(sec) + '&issuer=Instadrop&digits=6&period=30' }); return true;
    }
    if (m === 'POST' && p === '/api/auth/mfa/enable') {
      if (!u.mfa || !u.mfa.pending) return fail(res, 400, 'Start the setup first'), true; const w = await AL.over('mfa:' + u.id, 5); if (w) return tooMany(w), true;
      const sec = unb32(unseal(u.mfa.pending)), step = totpStep(sec, body.code, 0); if (!step) { await AL.hit('mfa:' + u.id, 5, 5 * MIN); return fail(res, 400, 'That code is not right. Check the clock on your phone and try again', { code: 'bad' }), true; }
      const codes = Array.from({ length: 8 }, () => crypto.randomBytes(5).toString('hex').replace(/(.{5})(.{5})/, '$1-$2'));
      u.mfa = { on: true, secret: u.mfa.pending, last: step, rec: codes.map(x => sha(x)) }; await putUser(u); send(res, 200, { recovery: codes }); return true; // shown once
    }
    if (m === 'POST' && p === '/api/auth/mfa/disable') {
      if (!u.mfa || !u.mfa.on) return fail(res, 400, 'Two-step verification is off'), true; if (!(await reauth())) return true;
      const code = String(body.code || '').trim(), step = totpStep(unb32(unseal(u.mfa.secret)), code, u.mfa.last), rec = (u.mfa.rec || []).includes(sha(code.toLowerCase().replace(/\s/g, '')));
      if (!step && !rec) return fail(res, 401, 'That code is not right', { code: 'bad' }), true; u.mfa = null; await putUser(u); send(res, 200, { ok: true }); return true;
    }
    return false;
  } catch (e) { if (busy(e)) return true; throw e; }
}

module.exports = { handle, ready, store, user: claims, ipOf, limiter: IPL, flush: () => store.close(), CFG, _t: { hotp, unb32, parseId, pwProblem, verify, sign } };
