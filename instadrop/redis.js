// Minimal Redis client with no dependencies: RESP2 over TCP or TLS (redis:// or rediss://), AUTH, SELECT, pipelining,
// Lua scripts (EVALSHA with automatic fallback) and a dedicated subscriber connection for pub/sub.
// It reconnects by itself. While Redis is down, commands fail fast so callers can fall back instead of hanging.
'use strict';
const net = require('net'), tls = require('tls'), crypto = require('crypto');

class Parser { // incremental RESP2 reader
  constructor(onReply) { this.buf = Buffer.alloc(0); this.onReply = onReply; }
  push(d) { this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d; for (;;) { const r = this.read(0); if (!r) break; this.buf = this.buf.subarray(r.end); this.onReply(r.v); } }
  read(o) {
    if (o >= this.buf.length) return null; const t = String.fromCharCode(this.buf[o]), e = this.buf.indexOf('\r\n', o); if (e < 0) return null;
    const line = this.buf.toString('utf8', o + 1, e), next = e + 2;
    if (t === '+') return { v: line, end: next };
    if (t === '-') return { v: new Error(line), end: next };
    if (t === ':') return { v: +line, end: next };
    if (t === '$') { const n = +line; if (n < 0) return { v: null, end: next }; if (this.buf.length < next + n + 2) return null; return { v: this.buf.toString('utf8', next, next + n), end: next + n + 2 }; }
    if (t === '*') { const n = +line; if (n < 0) return { v: null, end: next }; const a = []; let p = next; for (let i = 0; i < n; i++) { const r = this.read(p); if (!r) return null; a.push(r.v); p = r.end; } return { v: a, end: p }; }
    throw new Error('Bad Redis reply');
  }
}
const encode = args => { let s = '*' + args.length + '\r\n'; const parts = []; for (const a of args) { const b = Buffer.isBuffer(a) ? a : Buffer.from(String(a)); parts.push(Buffer.from(s + '$' + b.length + '\r\n'), b, Buffer.from('\r\n')); s = ''; } return Buffer.concat(parts); };

class Link { // one connection, auto-reconnecting
  constructor(cfg, onPush) { this.cfg = cfg; this.onPush = onPush; this.q = []; this.up = false; this.closed = false; this.delay = 200; this.connect(); }
  connect() {
    if (this.closed) return; const c = this.cfg;
    const sock = c.tls ? tls.connect({ host: c.host, port: c.port, servername: c.host, rejectUnauthorized: c.tls !== 'no-verify' }) : net.connect(c.port, c.host); this.sock = sock; sock.setNoDelay(true);
    this.parser = new Parser(r => this.reply(r));
    sock.on(c.tls ? 'secureConnect' : 'connect', async () => {
      try {
        if (c.password) await this.raw(c.user ? ['AUTH', c.user, c.password] : ['AUTH', c.password]);
        if (c.db) await this.raw(['SELECT', c.db]);
        this.up = true; this.delay = 200; if (this.onUp) this.onUp();
      } catch (e) { console.error('[redis] login failed:', e.message); sock.destroy(); }
    });
    sock.on('data', d => { try { this.parser.push(d); } catch { sock.destroy(); } });
    const down = () => { if (this.dead === sock) return; this.dead = sock; this.up = false; const q = this.q; this.q = []; for (const p of q) p.reject(new Error('Redis connection lost')); if (!this.closed) { setTimeout(() => this.connect(), this.delay).unref(); this.delay = Math.min(this.delay * 2, 5000); } };
    sock.on('error', () => { }); sock.on('close', down);
  }
  reply(r) {
    if (this.onPush && Array.isArray(r) && (r[0] === 'message' || r[0] === 'pmessage')) return this.onPush(r);
    if (this.onPush && Array.isArray(r) && (r[0] === 'subscribe' || r[0] === 'unsubscribe')) { const p = this.q.shift(); if (p) p.resolve(r); return; }
    const p = this.q.shift(); if (p) r instanceof Error ? p.reject(r) : p.resolve(r);
  }
  raw(args) { return new Promise((resolve, reject) => { this.q.push({ resolve, reject }); this.sock.write(encode(args)); }); }
  send(args, timeout) {
    if (!this.up) return Promise.reject(new Error('Redis is not connected'));
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Redis timeout')), timeout || this.cfg.timeout); // the late reply is still read and dropped, so replies stay in order
      this.q.push({ resolve: v => { clearTimeout(t); resolve(v); }, reject: e => { clearTimeout(t); reject(e); } }); this.sock.write(encode(args));
    });
  }
  close() { this.closed = true; try { this.sock.destroy(); } catch { } }
}

function parseUrl(url) { const u = new URL(url); return { host: u.hostname || 'localhost', port: +u.port || 6379, user: u.username ? decodeURIComponent(u.username) : '', password: u.password ? decodeURIComponent(u.password) : '', db: +u.pathname.slice(1) || 0, tls: u.protocol === 'rediss:' ? (u.searchParams.get('verify') === 'no' ? 'no-verify' : true) : false, timeout: +process.env.REDIS_TIMEOUT_MS || 800 }; }

class Redis {
  constructor(url) { this.cfg = parseUrl(url); this.link = new Link(this.cfg); this.sha = new Map(); this.handlers = new Map(); this.subLink = null; }
  get up() { return this.link.up; }
  cmd(...args) { return this.link.send(args); }
  publish(ch, msg) { return this.link.send(['PUBLISH', ch, msg]); }
  async eval(script, keys, args) {
    let sha = this.sha.get(script); if (!sha) { sha = crypto.createHash('sha1').update(script).digest('hex'); this.sha.set(script, sha); }
    try { return await this.link.send(['EVALSHA', sha, keys.length, ...keys, ...args]); }
    catch (e) { if (!/NOSCRIPT/.test(e.message)) throw e; return this.link.send(['EVAL', script, keys.length, ...keys, ...args]); }
  }
  // Subscribe on a separate connection (a subscribed connection can't run normal commands). Re-subscribes after reconnects.
  subscribe(channel, fn) {
    this.handlers.set(channel, fn);
    if (!this.subLink) {
      this.subLink = new Link(this.cfg, r => { const h = this.handlers.get(r[0] === 'pmessage' ? r[2] : r[1]); if (h) try { h(r[0] === 'pmessage' ? r[3] : r[2]); } catch (e) { console.error('[redis] handler error:', e.message); } });
      this.subLink.onUp = () => { for (const ch of this.handlers.keys()) this.subLink.raw(['SUBSCRIBE', ch]).catch(() => { }); };
    } else if (this.subLink.up) this.subLink.raw(['SUBSCRIBE', channel]).catch(() => { });
  }
  close() { this.link.close(); if (this.subLink) this.subLink.close(); }
}
let shared; const fromEnv = () => { if (shared !== undefined) return shared; shared = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null; if (shared) shared.link.onUp = () => console.log('[redis] connected'); return shared; };
module.exports = { Redis, fromEnv };
