// Vendors, menus, orders, loyalty points and group carts in PostgreSQL.
// The server keeps a working copy in memory (fast reads, same code as the file mode) and writes every change through to the
// database in small batches. On start it loads from the database; an empty database is filled from data.json (if present) or the demo seed.
'use strict';
const fs = require('fs');
module.exports = function appDb(pool) {
  const known = new Map(), kvKnown = new Map(), pendingOrders = new Map(), touched = new Set();
  let timer = null, restTimer = null, chain = Promise.resolve(), db = null;
  const j = JSON.stringify;
  const orderVals = o => [o.id, o.userId || null, o.vendorId, o.region || null, o.status || null, o.at, o];

  async function load() {
    const [v, o, kv] = await Promise.all([pool.query('select id, body from vendors order by region, id'), pool.query('select body from orders order by at'), pool.query('select key, value from kv')]);
    const d = { vendors: v.rows.map(r => r.body), orders: o.rows.map(r => r.body), loyalty: {}, groups: {} };
    for (const r of kv.rows) { if (r.key.startsWith('loyalty:')) d.loyalty[r.key.slice(8)] = r.value; else if (r.key.startsWith('group:')) d.groups[r.key.slice(6)] = r.value; else if (r.key === 'seeded') d.seeded = r.value; }
    for (const x of d.vendors) known.set(x.id, j(x)); for (const r of kv.rows) kvKnown.set(r.key, j(r.value));
    return d;
  }
  const kvEntries = () => { const e = [['seeded', db.seeded ?? null]]; for (const k of touched) { const [kind, id] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)]; const v = kind === 'loyalty' ? (db.loyalty || {})[id] : (db.groups || {})[id]; e.push([k, v === undefined ? undefined : v]); } return e; };

  async function writeRest(full) {
    if (!db) return;
    const ups = [], gone = new Set(known.keys());
    for (const v of db.vendors) { gone.delete(v.id); const s = j(v); if (known.get(v.id) !== s) ups.push([v, s]); }
    const kv = full ? (() => { const e = [['seeded', db.seeded ?? null]]; for (const k in db.loyalty || {}) e.push(['loyalty:' + k, db.loyalty[k]]); for (const k in db.groups || {}) e.push(['group:' + k, db.groups[k]]); return e; })() : kvEntries(); touched.clear();
    await pool.tx(async c => {
      for (const [v, s] of ups) { await c.query('insert into vendors(id,country,region,body) values ($1,$2,$3,$4) on conflict (id) do update set country=$2,region=$3,body=$4', [v.id, v.country || null, v.region || null, v]); known.set(v.id, s); }
      for (const id of gone) { await c.query('delete from vendors where id=$1', [id]); known.delete(id); }
      for (const [k, v] of kv) {
        if (v === undefined) { if (kvKnown.has(k)) { await c.query('delete from kv where key=$1', [k]); kvKnown.delete(k); } continue; }
        const s = j(v); if (kvKnown.get(k) === s) continue; await c.query('insert into kv(key,value) values ($1,$2) on conflict (key) do update set value=$2', [k, v]); kvKnown.set(k, s);
      }
    });
  }
  async function writeOrders() {
    const os = [...pendingOrders.values()]; pendingOrders.clear(); if (!os.length) return;
    try { await pool.tx(async c => { for (const o of os) await c.query('insert into orders(id,user_id,vendor_id,region,status,at,body) values ($1,$2,$3,$4,$5,$6,$7) on conflict (id) do update set status=$5, body=$7', orderVals(o)); }); }
    catch (e) { console.error('[db] order write failed, will retry:', e.message); for (const o of os) if (!pendingOrders.has(o.id)) pendingOrders.set(o.id, o); timer = setTimeout(flushOrders, 2000); }
  }
  const run = fn => (chain = chain.then(fn).catch(e => console.error('[db] write failed:', e.message)));
  const flushOrders = () => { timer = null; return run(writeOrders); };
  const flushRest = () => { restTimer = null; return run(() => writeRest(false)); };
  return {
    kind: 'postgres', pool,
    async init() { await require('./migrations').run(pool); },
    async load() { const empty = (await pool.query('select (select count(*) from vendors) as n')).rows[0].n === 0; if (empty) return null; db = await load(); return db; },
    // first start: take what we have (data.json import or fresh seed) and write all of it
    async adopt(d) { db = d; await writeRest(true); for (const o of d.orders || []) pendingOrders.set(o.id, o); await writeOrders(); },
    attach(d) { db = d; },
    queueOrder(o) { pendingOrders.set(o.id, o); if (!timer) timer = setTimeout(flushOrders, 100); },
    queueRest() { if (!restTimer) restTimer = setTimeout(flushRest, 600); },
    touch(kind, id) { touched.add(kind + ':' + id); },
    async flush() { if (timer) { clearTimeout(timer); timer = null; } if (restTimer) { clearTimeout(restTimer); restTimer = null; } await chain; await run(writeOrders); await run(() => writeRest(false)); },
    async close() { await this.flush(); await pool.end(); },
    importFile(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
  };
};
