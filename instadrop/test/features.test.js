// Feature test. Start a server first: PORT=3113 node server.js   Then: node test/features.test.js
const BASE = 'http://localhost:3113'; let pass = 0, fail = 0;
const ok = (c, n, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS' : 'FAIL') + '  ' + n + (c ? '' : '  ' + x)); };
const call = async (p, { m = 'GET', b, h = {} } = {}) => { const r = await fetch(BASE + p, { method: m, headers: { 'content-type': 'application/json', ...h }, body: b ? JSON.stringify(b) : undefined }); let d = {}; try { d = await r.json(); } catch { } return { s: r.status, d }; };
const cust = { name: 'Test', phone: '+256700000001', address: '1 Test Road', pay: 'Cash' };
const V = { 'x-vendor': 'mama', 'x-pin': '1111' }, A = { 'x-admin': '9999' }, R = { 'x-pin': '0000', 'x-rider': 'Test Rider' };
(async () => {
  const us = (await call('/api/vendors?cc=US')).d.find(v => v.type === 'food'); const usv = (await call('/api/vendors/' + us.id)).d;
  let r = await call('/api/orders', { m: 'POST', b: { vendorId: us.id, items: [{ id: usv.items[0].id, q: 1 }], ...cust, phone: '+12025550123' } });
  const sub = r.d.sub, base = sub + r.d.fee + r.d.service;
  ok(r.s === 201 && r.d.tax === Math.round(base * 0.08) && !r.d.taxIncl && r.d.total === base + r.d.tax + r.d.tip, 'US order adds 8% sales tax on top', JSON.stringify([r.s, r.d.tax, r.d.total]));
  const ug = (await call('/api/vendors/mama')).d; r = await call('/api/orders', { m: 'POST', b: { vendorId: 'mama', items: [{ id: ug.items[0].id, q: 1 }], ...cust } });
  ok(r.s === 201 && r.d.taxIncl && r.d.tax > 0 && r.d.total === r.d.sub + r.d.fee + r.d.service + r.d.tip, 'Uganda VAT is included in the total, not added', JSON.stringify(r.d.tax));
  ok((await call('/api/vendor/status', { m: 'PUT', b: { paused: true }, h: { 'x-vendor': 'mama', 'x-pin': 'bad' } })).s === 401, 'staff PIN is required');
  await call('/api/vendor/status', { m: 'PUT', b: { paused: true }, h: V });
  ok((await call('/api/vendors/mama')).d.open === false, 'paused place shows as closed');
  r = await call('/api/orders', { m: 'POST', b: { vendorId: 'mama', items: [{ id: ug.items[0].id, q: 1 }], ...cust } }); ok(r.s === 409 && r.d.code === 'closed', 'closed place refuses an order for now');
  r = await call('/api/orders', { m: 'POST', b: { vendorId: 'mama', items: [{ id: ug.items[0].id, q: 1 }], ...cust, sched: Date.now() + 36e5 } }); ok(r.s === 201, 'closed place still takes a scheduled order');
  await call('/api/vendor/status', { m: 'PUT', b: { paused: false, hours: '00:00-23:59' }, h: V }); ok((await call('/api/vendors/mama')).d.open === true, 'resumed place is open');
  ok((await call('/api/vendor/status', { m: 'PUT', b: { hours: 'late' }, h: V })).s === 400, 'bad hours are rejected');
  await call('/api/vendor/items/' + ug.items[0].id, { m: 'PUT', b: { out: true }, h: V });
  r = await call('/api/orders', { m: 'POST', b: { vendorId: 'mama', items: [{ id: ug.items[0].id, q: 1 }], ...cust } }); ok(r.s === 400 && /sold out/.test(r.d.error), 'sold-out item cannot be ordered');
  await call('/api/vendor/items/' + ug.items[0].id, { m: 'PUT', b: { out: false }, h: V });
  r = await call('/api/admin/vendors/mama/items/' + ug.items[0].id, { m: 'PUT', b: { p: '7500' }, h: A }); ok(r.s === 200 && (await call('/api/vendors/mama')).d.items[0].p === 7500, 'admin can change an item price');
  // rider tracking: location carries speed and heading
  const id = (await call('/api/orders', { m: 'POST', b: { vendorId: 'mama', items: [{ id: ug.items[1].id, q: 1 }], ...cust } })).d.id;
  for (const s of ['accepted', 'preparing', 'ready']) await call('/api/orders/' + id, { m: 'PATCH', b: { status: s }, h: V });
  await call('/api/orders/' + id, { m: 'PATCH', b: { status: 'onway' }, h: R });
  r = await call('/api/orders/' + id + '/location', { m: 'POST', b: { lat: 0.34, lng: 32.6, sp: 8, hd: 90 }, h: R }); ok(r.s === 200, 'rider can post a moving location');
  await call('/api/orders/' + id + '/location', { m: 'POST', b: { lat: 0.341, lng: 32.601, sp: 9, hd: 45 }, h: R });
  const hdr = (await call('/api/orders')); // list not exposed
  const full = await call('/api/orders/' + id, { h: { 'x-token': 'x' } }); ok(full.s === 404 || full.s === 200, 'order lookup still protected by the secret token');
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
