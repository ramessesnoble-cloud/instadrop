// Rate-limit counters. `withRedis` makes a limiter that counts in Redis (shared by all servers, atomic via Lua) and, if Redis is
// unreachable, quietly falls back to the `fallback` limiter instead of blocking sign-ins ("fail open to local limits").
'use strict';
const HIT = "local n=redis.call('INCR',KEYS[1]); local t=redis.call('PTTL',KEYS[1]); if t<0 then redis.call('PEXPIRE',KEYS[1],ARGV[1]); t=tonumber(ARGV[1]) end; return {n,t}";
const OVER = "local n=tonumber(redis.call('GET',KEYS[1]) or '0'); local t=redis.call('PTTL',KEYS[1]); return {n,t}";
let lastWarn = 0;
const warn = e => { if (Date.now() - lastWarn > 30000) { lastWarn = Date.now(); console.warn('[limiter] Redis unavailable, using local limits:', e.message); } };

// adapt a sync in-memory Limiter (auth.js) to the async interface
const local = m => ({ hit: async (k, max, ms) => m.hit(k, max, ms), over: async (k, max) => m.over(k, max), clear: async k => m.clear(k) });

function withRedis(redis, fallback, prefix = 'instadrop:rl:') {
  return {
    async hit(key, max, ms) { try { const [n, t] = await redis.eval(HIT, [prefix + key], [ms]); return { ok: n <= max, retry: Math.max(1, Math.ceil(t / 1000)) }; } catch (e) { warn(e); return fallback.hit(key, max, ms); } },
    async over(key, max) { try { const [n, t] = await redis.eval(OVER, [prefix + key], []); return n >= max && t > 0 ? Math.max(1, Math.ceil(t / 1000)) : 0; } catch (e) { warn(e); return fallback.over(key, max); } },
    async clear(key) { try { await redis.cmd('DEL', prefix + key); } catch (e) { warn(e); } return fallback.clear(key); }
  };
}
module.exports = { local, withRedis };
