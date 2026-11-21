// Minimal PostgreSQL client with no dependencies: the v3 wire protocol over TCP (optionally TLS).
// Supports SCRAM-SHA-256 (the modern default), md5 and cleartext passwords, parameterised queries, transactions and a small pool.
// Values are sent as text parameters, so `$1` works for text, numbers, booleans, json and arrays without type juggling.
// If you prefer the official driver, anything exposing `query(sql, params)` and `tx(fn)` can replace this file.
'use strict';
const net = require('net'), tls = require('tls'), crypto = require('crypto');

const i32 = n => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; }, i16 = n => { const b = Buffer.alloc(2); b.writeInt16BE(n); return b; };
const cstr = s => Buffer.concat([Buffer.from(String(s), 'utf8'), Buffer.from([0])]);
const msg = (type, ...parts) => { const body = Buffer.concat(parts); return Buffer.concat([Buffer.from(type), i32(body.length + 4), body]); };
const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest(), sha256 = d => crypto.createHash('sha256').update(d).digest();

function parseArray(s) { // text arrays like {a,"b c",NULL}
  const out = []; let i = 1;
  while (i < s.length - 1) {
    if (s[i] === '"') { let v = ''; i++; while (s[i] !== '"') { if (s[i] === '\\') i++; v += s[i++]; } i++; out.push(v); }
    else { let j = i; while (s[j] !== ',' && s[j] !== '}') j++; const v = s.slice(i, j); out.push(v === 'NULL' ? null : v); i = j; }
    if (s[i] === ',') i++;
  }
  return out;
}
const TYPES = { 16: v => v === 't', 20: Number, 21: Number, 23: Number, 700: Number, 701: Number, 1700: Number, 114: JSON.parse, 3802: JSON.parse, 1009: parseArray, 1015: parseArray };
function enc(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? 't' : 'f';
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v)) return '\\x' + v.toString('hex');
  if (Array.isArray(v)) return '{' + v.map(x => x === null ? 'NULL' : '"' + String(x).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"').join(',') + '}';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

class Conn {
  constructor(cfg) { this.cfg = cfg; this.buf = Buffer.alloc(0); this.cur = null; this.dead = false; this.ready = this.open(); }
  open() {
    return new Promise((resolve, reject) => {
      let settled = false; const fail = e => { this.dead = true; if (!settled) { settled = true; reject(e); } else if (this.cur) { this.cur.reject(e); this.cur = null; } };
      const sock = net.connect(this.cfg.port, this.cfg.host); this.sock = sock; sock.setNoDelay(true);
      sock.once('error', fail); sock.on('close', () => fail(new Error('PostgreSQL connection closed')));
      const start = () => {
        const params = Buffer.concat([cstr('user'), cstr(this.cfg.user), cstr('database'), cstr(this.cfg.database), cstr('client_encoding'), cstr('UTF8'), cstr('application_name'), cstr('instadrop'), Buffer.from([0])]);
        this.sock.write(Buffer.concat([i32(params.length + 8), i32(196608), params]));
        this.sock.on('data', d => { this.buf = Buffer.concat([this.buf, d]); this.drain(); });
      };
      this.onReady = () => { if (!settled) { settled = true; resolve(this); } }; this.onError = fail;
      if (this.cfg.ssl) {
        sock.once('connect', () => sock.write(Buffer.concat([i32(8), i32(80877103)])));
        sock.once('data', d => {
          if (d[0] !== 0x53) return fail(new Error('Server does not support TLS'));
          this.sock = tls.connect({ socket: sock, servername: this.cfg.host, rejectUnauthorized: this.cfg.ssl !== 'no-verify' }); this.sock.once('error', fail); start();
        });
      } else sock.once('connect', start);
    });
  }
  drain() {
    while (this.buf.length >= 5) {
      const len = this.buf.readInt32BE(1); if (this.buf.length < len + 1) return;
      const t = String.fromCharCode(this.buf[0]), body = this.buf.subarray(5, len + 1); this.buf = this.buf.subarray(len + 1); this.on(t, body);
    }
  }
  on(t, b) {
    if (t === 'R') return this.auth(b);
    if (t === 'E') { const e = {}; for (let i = 0; i < b.length && b[i];) { const k = String.fromCharCode(b[i]); const j = b.indexOf(0, i + 1); e[k] = b.toString('utf8', i + 1, j); i = j + 1; } const err = new Error(e.M || 'PostgreSQL error'); err.code = e.C; err.detail = e.D; err.constraint = e.n; if (this.cur) this.cur.err = err; else this.onError(err); return; }
    if (!this.cur && t !== 'Z' && t !== 'S' && t !== 'K' && t !== 'N') return;
    const q = this.cur;
    if (t === 'T') { const n = b.readInt16BE(0); let o = 2; q.fields = []; for (let i = 0; i < n; i++) { const j = b.indexOf(0, o); q.fields.push({ name: b.toString('utf8', o, j), oid: b.readInt32BE(j + 7) }); o = j + 19; } }
    else if (t === 'D') { const n = b.readInt16BE(0); let o = 2; const row = {}; for (let i = 0; i < n; i++) { const l = b.readInt32BE(o); o += 4; const f = q.fields[i]; if (l < 0) row[f.name] = null; else { const s = b.toString('utf8', o, o + l); o += l; const p = TYPES[f.oid]; row[f.name] = p ? p(s) : s; } } q.rows.push(row); }
    else if (t === 'C') { const m = /(\d+)$/.exec(b.toString('utf8', 0, b.length - 1)); q.count = m ? +m[1] : 0; }
    else if (t === 'Z') { this.cur = null; if (this.onReady) { const r = this.onReady; this.onReady = null; r(); } if (!q) return; q.err ? q.reject(q.err) : q.resolve({ rows: q.rows, rowCount: q.count }); }
  }
  auth(b) {
    const c = b.readInt32BE(0);
    if (c === 0) return;
    if (c === 3) return this.sock.write(msg('p', cstr(this.cfg.password)));
    if (c === 5) { const md = x => crypto.createHash('md5').update(x).digest('hex'); return this.sock.write(msg('p', cstr('md5' + md(Buffer.concat([Buffer.from(md(this.cfg.password + this.cfg.user)), b.subarray(4, 8)]))))); }
    if (c === 10) { this.nonce = crypto.randomBytes(18).toString('base64'); this.first = 'n=,r=' + this.nonce; const init = Buffer.from('n,,' + this.first); return this.sock.write(msg('p', cstr('SCRAM-SHA-256'), i32(init.length), init)); }
    if (c === 11) {
      const sf = b.toString('utf8', 4), a = Object.fromEntries(sf.split(',').map(x => [x[0], x.slice(2)]));
      if (!a.r.startsWith(this.nonce)) return this.onError(new Error('SCRAM nonce mismatch'));
      const salted = crypto.pbkdf2Sync(this.cfg.password, Buffer.from(a.s, 'base64'), +a.i, 32, 'sha256'), ck = hmac(salted, 'Client Key');
      const noProof = 'c=biws,r=' + a.r, am = this.first + ',' + sf + ',' + noProof, sig = hmac(sha256(ck), am);
      this.serverSig = hmac(hmac(salted, 'Server Key'), am).toString('base64');
      return this.sock.write(msg('p', Buffer.from(noProof + ',p=' + Buffer.from(ck.map((x, i) => x ^ sig[i])).toString('base64'))));
    }
    if (c === 12) { if (b.toString('utf8', 4) !== 'v=' + this.serverSig) this.onError(new Error('SCRAM server signature mismatch')); return; }
    this.onError(new Error('Unsupported PostgreSQL authentication method ' + c));
  }
  async query(sql, params) {
    await this.ready; if (this.dead) throw new Error('PostgreSQL connection closed');
    return new Promise((resolve, reject) => {
      this.cur = { rows: [], fields: [], count: 0, resolve, reject, err: null };
      if (!params) return this.sock.write(msg('Q', cstr(sql)));
      const ps = params.map(enc);
      this.sock.write(Buffer.concat([msg('P', cstr(''), cstr(sql), i16(0)), msg('B', cstr(''), cstr(''), i16(0), i16(ps.length), ...ps.map(p => p === null ? i32(-1) : Buffer.concat([i32(Buffer.byteLength(p)), Buffer.from(p)])), i16(0)), msg('D', Buffer.from('P'), cstr('')), msg('E', cstr(''), i32(0)), msg('S')]));
    });
  }
  close() { this.dead = true; try { this.sock.write(msg('X')); this.sock.end(); } catch { } }
}

function parseUrl(url) {
  const u = new URL(url); const ssl = u.searchParams.get('sslmode') || process.env.PGSSLMODE || '';
  return { host: u.hostname || 'localhost', port: +u.port || 5432, user: decodeURIComponent(u.username || 'postgres'), password: decodeURIComponent(u.password || ''), database: decodeURIComponent(u.pathname.slice(1) || u.username),
    ssl: ssl === 'disable' || !ssl ? false : ssl === 'no-verify' ? 'no-verify' : true, max: +process.env.PG_POOL || +u.searchParams.get('max') || 10 };
}

class Pool {
  constructor(url) { this.cfg = parseUrl(url); this.idle = []; this.all = new Set(); this.wait = []; }
  async get() {
    while (this.idle.length) { const c = this.idle.pop(); if (!c.dead) return c; this.all.delete(c); }
    if (this.all.size < this.cfg.max) { const c = new Conn(this.cfg); this.all.add(c); try { await c.ready; return c; } catch (e) { this.all.delete(c); throw e; } }
    return new Promise(r => this.wait.push(r));
  }
  put(c) { if (c.dead) { this.all.delete(c); if (this.wait.length) this.get().then(this.wait.shift()); return; } if (this.wait.length) this.wait.shift()(c); else this.idle.push(c); }
  async query(sql, params) { const c = await this.get(); try { return await c.query(sql, params); } finally { this.put(c); } }
  async tx(fn) {
    const c = await this.get();
    try { await c.query('BEGIN'); const r = await fn({ query: (s, p) => c.query(s, p) }); await c.query('COMMIT'); return r; }
    catch (e) { try { await c.query('ROLLBACK'); } catch { c.dead = true; } throw e; }
    finally { this.put(c); }
  }
  async end() { for (const c of this.all) c.close(); this.all.clear(); this.idle = []; }
}
module.exports = { Pool, parseUrl };
