// Two servers + PostgreSQL + Redis. Start both with the same DATABASE_URL, REDIS_URL, DATA_DIR (so same JWT secret):
//   PORT=3112 ... node server.js    and    PORT=3113 ... node server.js
// Then: node test/redis.test.js     (run on freshly started servers: it uses up the per-IP sign-up allowance)
const A = 'http://localhost:3112', B = 'http://localhost:3113';
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
const J = { 'content-type': 'application/json', 'x-requested-with': 'instadrop' };
const call = async (base, p, { m = 'POST', b, h = {} } = {}) => { const r = await fetch(base + p, { method: m, headers: { ...J, ...h }, body: b ? JSON.stringify(b) : undefined }); let d = {}; try { d = await r.json(); } catch { } return { s: r.status, d }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  // order made on A is known to B, and B's live stream sees changes made on A
  const o = await call(A, '/api/orders', { b: { vendorId: 'mama', items: [{ id: 'mama-0', q: 1 }], name: 'Redis Test', phone: '0772555111', address: 'x', pay: 'Cash', mode: 'pickup' } });
  ok(o.s === 200 || o.s === 201, 'order placed on server A'); const id = o.d.id, tok = o.d.ctoken; await sleep(300);
  let r = await call(B, '/api/orders/' + id, { m: 'GET', h: { 'x-token': tok } }); ok(r.s === 200 && r.d.status === 'placed', 'server B already knows that order (pub/sub)');
  const ctl = new AbortController(); const events = []; const sres = await fetch(B + '/api/stream/order/' + id + '?t=' + tok, { signal: ctl.signal });
  (async () => { try { const rd = sres.body.getReader(), dec = new TextDecoder(); for (;;) { const { value, done } = await rd.read(); if (done) break; events.push(dec.decode(value)); } } catch { } })();
  await sleep(300);
  r = await call(A, '/api/orders/' + id, { m: 'PATCH', b: { status: 'accepted' }, h: { 'x-vendor': 'mama', 'x-pin': '1111' } }); ok(r.s === 200, 'vendor accepts the order on server A');
  await sleep(500); ok(events.join('').includes('"status":"accepted"'), 'customer connected to server B receives the live update');
  r = await call(B, '/api/orders/' + id, { m: 'PATCH', b: { status: 'preparing' }, h: { 'x-vendor': 'mama', 'x-pin': '1111' } }); ok(r.s === 200, 'next step done on server B (it had the latest state)');
  await sleep(300); r = await call(A, '/api/orders/' + id, { m: 'GET', h: { 'x-token': tok } }); ok(r.d.status === 'preparing', 'and server A sees it'); ctl.abort();
  // a new place added in admin on A shows up on B without a restart
  const nm = 'Sync Test ' + Date.now(); r = await call(A, '/api/admin/vendors', { b: { name: nm, type: 'food', cc: 'US', country: 'US', region: 'US-TX', city: 'Austin' }, h: { 'x-admin': '9999' } }); ok(r.s === 200 || r.s === 201, 'place added on A');
  await sleep(1500); r = await call(B, '/api/vendors?cc=US&region=US-TX', { m: 'GET' }); ok(Array.isArray(r.d) && r.d.some(v => v.name === nm), 'place visible on B (database write + pub/sub)');
  // health shows redis
  r = await call(B, '/api/health', { m: 'GET' }); ok(r.d.redis === 'up', 'health reports redis up');
  // per-IP sign-up limit (10/hour) is counted in Redis, so it is shared: 6 on A + 6 on B => only 10 succeed
  const res = [], ids = []; for (let i = 0; i < 12; i++) { const id = 'rl' + Date.now() + i + '@example.com'; ids.push(id); res.push((await call(i % 2 ? B : A, '/api/auth/signup', { b: { name: 'S' + i, identifier: id, password: 'long enough passphrase' } })).s); }
  ok(res.filter(s => s === 201).length === 10 && res.filter(s => s === 429).length === 2, 'sign-up limit shared across servers: ' + res.join(','));
  const l = await call(A, '/api/auth/login', { b: { identifier: ids[11], password: 'long enough passphrase' } }); ok(l.s === 401, 'a sign-up answered with 429 did not create an account (login says ' + l.s + ')');
  console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
