// Tells the other servers about changes (orders, menus, loyalty, profile edits) over Redis pub/sub, so every server stays current
// and live tracking (SSE) works no matter which server a customer is connected to. Without REDIS_URL everything is a no-op.
'use strict';
const crypto = require('crypto'), redis = require('./redis').fromEnv();
const ME = crypto.randomBytes(6).toString('hex'), handlers = {}; let started = false, lastWarn = 0;
const CH = 'instadrop:bus';
module.exports = {
  id: ME, enabled: !!redis, redis,
  publish(type, data) { if (!redis) return; redis.publish(CH, JSON.stringify({ s: ME, t: type, d: data })).catch(e => { if (Date.now() - lastWarn > 30000) { lastWarn = Date.now(); console.warn('[bus] publish failed:', e.message); } }); },
  handle(type, fn) { handlers[type] = fn; if (!redis || started) return; started = true; redis.subscribe(CH, raw => { let m; try { m = JSON.parse(raw); } catch { return; } if (m.s === ME) return; const h = handlers[m.t]; if (h) h(m.d); }); }
};
