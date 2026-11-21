// Database schema, applied in order and recorded in schema_migrations. Safe to run on every start and from many servers at once
// (a Postgres advisory lock lets one server migrate while the others wait).
module.exports = [
  { v: 1, sql: `
    create table users(
      id uuid primary key, email text unique, phone text unique, name text not null, pw text not null, role text not null default 'customer',
      verified boolean not null default false, mfa jsonb, created bigint not null, last bigint);
    create table sessions(
      sid uuid primary key, uid uuid not null references users(id) on delete cascade, cur text not null, prev text[] not null default '{}',
      ua text, ip text, created bigint not null, last bigint not null, exp bigint not null, rev boolean not null default false);
    create index sessions_cur on sessions(cur);
    create index sessions_prev on sessions using gin(prev);
    create index sessions_uid on sessions(uid) where not rev;
    create table resets(hash text primary key, uid uuid not null references users(id) on delete cascade, exp bigint not null);` },
  { v: 2, sql: `
    create table vendors(id text primary key, country text, region text, body jsonb not null);
    create index vendors_region on vendors(region);
    create table orders(id text primary key, user_id uuid, vendor_id text not null, region text, status text, at bigint not null, body jsonb not null);
    create index orders_user on orders(user_id, at desc) where user_id is not null;
    create index orders_vendor on orders(vendor_id, at desc);
    create index orders_region_status on orders(region, status);
    create table kv(key text primary key, value jsonb not null);` },
  { v: 3, sql: `create unlogged table limits(key text primary key, n int not null, reset bigint not null);` }
];
module.exports.run = async function migrate(pool) {
  await pool.tx(async c => {
    await c.query('select pg_advisory_xact_lock(727274)');
    await c.query('create table if not exists schema_migrations(v int primary key, at timestamptz not null default now())');
    const done = new Set((await c.query('select v from schema_migrations')).rows.map(r => r.v));
    for (const m of module.exports) if (!done.has(m.v)) { await c.query(m.sql); await c.query('insert into schema_migrations(v) values ($1)', [m.v]); console.log('[db] applied migration', m.v); }
  });
};
