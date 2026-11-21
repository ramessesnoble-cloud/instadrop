// Account storage behind one small interface. Two backends:
//   file     – append-only journals + in-memory indexes. Zero setup, one server only (development, demos).
//   postgres – every lookup and write goes to PostgreSQL, so any number of servers share the same accounts and sessions.
// Pick with DATABASE_URL (postgres://user:pass@host:5432/dbname). Everything is async so auth.js is identical for both.
'use strict';
const fs = require('fs'), path = require('path');

// ───────────────────────── file backend
class Journal {
  constructor(file) { this.file = file; this.q = []; this.busy = false; this.lines = 0; }
  load(apply) { let n = 0; try { for (const l of fs.readFileSync(this.file, 'utf8').split('\n')) { if (!l) continue; try { apply(JSON.parse(l)); n++; } catch { } } } catch { } this.lines = n; return n; }
  append(rec) { this.q.push(JSON.stringify(rec)); this.lines++; if (!this.busy) this.flush(); }
  flush() { if (!this.q.length) { this.busy = false; return; } this.busy = true; const c = this.q.join('\n') + '\n'; this.q = []; fs.appendFile(this.file, c, { mode: 0o600 }, e => { if (e) console.error('[auth] write failed:', e.message); this.flush(); }); }
  flushSync() { if (this.q.length) { try { fs.appendFileSync(this.file, this.q.join('\n') + '\n', { mode: 0o600 }); } catch { } this.q = []; } }
  compact(recs) { const t = this.file + '.tmp'; fs.writeFileSync(t, recs.map(r => JSON.stringify(r)).join('\n') + (recs.length ? '\n' : ''), { mode: 0o600 }); fs.renameSync(t, this.file); this.lines = recs.length; }
}
function fileStore(dir) {
  const userLog = new Journal(path.join(dir, 'users.ndjson')), sessLog = new Journal(path.join(dir, 'sessions.ndjson'));
  const U = { byId: new Map(), byEmail: new Map(), byPhone: new Map() }, F = { byId: new Map(), byHash: new Map(), byUser: new Map() }, R = new Map();
  const idxUser = u => { U.byId.set(u.id, u); if (u.email) U.byEmail.set(u.email, u.id); if (u.phone) U.byPhone.set(u.phone, u.id); };
  const unhash = f => { F.byHash.delete(f.cur); f.prev.forEach(h => F.byHash.delete(h)); };
  const idxFam = f => { const old = F.byId.get(f.sid); if (old) unhash(old); F.byId.set(f.sid, f); if (!F.byUser.has(f.uid)) F.byUser.set(f.uid, new Set()); F.byUser.get(f.uid).add(f.sid); if (!f.rev) { F.byHash.set(f.cur, f.sid); f.prev.forEach(h => F.byHash.set(h, f.sid)); } };
  const putFam = f => { idxFam(f); sessLog.append(f); };
  const s = {
    kind: 'file',
    async init() {
      userLog.load(idxUser); sessLog.load(idxFam); const now = Date.now(); let drop = 0;
      for (const f of [...F.byId.values()]) if (f.exp < now || f.rev) { F.byId.delete(f.sid); unhash(f); const set = F.byUser.get(f.uid); if (set) set.delete(f.sid); drop++; }
      if (userLog.lines > U.byId.size * 2 + 100) userLog.compact([...U.byId.values()]);
      if (drop || sessLog.lines > F.byId.size * 3 + 100) sessLog.compact([...F.byId.values()]);
      process.on('exit', () => { userLog.flushSync(); sessLog.flushSync(); });
    },
    async userById(id) { return U.byId.get(id) || null; },
    async userFind(id) { return U.byId.get(id.email ? U.byEmail.get(id.email) : U.byPhone.get(id.phone)) || null; },
    async userPut(u) { idxUser(u); userLog.append(u); },
    async userCreate(u) { if ((u.email && U.byEmail.has(u.email)) || (u.phone && U.byPhone.has(u.phone))) return false; idxUser(u); userLog.append(u); return true; },
    async mfaCommit(u) { idxUser(u); userLog.append(u); return true; },
    async famById(sid) { return F.byId.get(sid) || null; },
    async famByHash(h) { return F.byId.get(F.byHash.get(h)) || null; },
    async famsOf(uid) { return [...(F.byUser.get(uid) || [])].map(x => F.byId.get(x)).filter(f => f && !f.rev && f.exp > Date.now()); },
    async famPut(f) { putFam(f); },
    async famRotate(f, oldCur) { if (f.rev || F.byHash.get(oldCur) !== f.sid) return false; putFam(f); return true; }, // f is the live object, so the hash index still says who owned the old token
    async famRevoke(sid) { const f = F.byId.get(sid); if (!f || f.rev) return; f.rev = true; putFam(f); },
    async famRevokeUser(uid, except) { for (const f of await s.famsOf(uid)) if (f.sid !== except) await s.famRevoke(f.sid); },
    async resetPut(hash, uid, exp) { R.set(hash, { uid, exp }); },
    async resetTake(hash) { const e = R.get(hash); R.delete(hash); return e && e.exp > Date.now() ? e : null; },
    async cleanup() { const now = Date.now(); for (const [k, v] of R) if (v.exp < now) R.delete(k); },
    async close() { userLog.flushSync(); sessLog.flushSync(); }
  };
  return s;
}

// ───────────────────────── postgres backend
const U_COLS = 'id,email,phone,name,pw,role,verified,mfa,created,last', F_COLS = 'sid,uid,cur,prev,ua,ip,created,last,exp,rev';
const num = x => x === null || x === undefined ? x : +x;
const userRow = r => r && ({ id: r.id, email: r.email, phone: r.phone, name: r.name, pw: r.pw, role: r.role, verified: r.verified, mfa: r.mfa, created: num(r.created), last: num(r.last) || undefined });
const famRow = r => r && ({ sid: r.sid, uid: r.uid, cur: r.cur, prev: r.prev || [], ua: r.ua, ip: r.ip, created: num(r.created), last: num(r.last), exp: num(r.exp), rev: r.rev });
function pgStore(pool) {
  const q = (s, p) => pool.query(s, p), uVals = u => [u.id, u.email || null, u.phone || null, u.name, u.pw, u.role || 'customer', !!u.verified, u.mfa || null, u.created, u.last || null];
  const s = {
    kind: 'postgres', pool,
    async init() { await require('./migrations').run(pool); },
    async userById(id) { return userRow((await q('select ' + U_COLS + ' from users where id=$1', [id])).rows[0]); },
    async userFind(id) { return userRow((await q('select ' + U_COLS + ' from users where ' + (id.email ? 'email=$1' : 'phone=$1'), [id.email || id.phone])).rows[0]); },
    async userPut(u) { await q('insert into users(' + U_COLS + ') values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (id) do update set email=$2,phone=$3,name=$4,pw=$5,role=$6,verified=$7,mfa=$8,last=$10', uVals(u)); },
    async userCreate(u) { return (await q('insert into users(' + U_COLS + ') values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict do nothing returning id', uVals(u))).rowCount === 1; },
    async mfaCommit(u, before) { return (await q('update users set mfa=$2 where id=$1 and mfa=$3::jsonb returning id', [u.id, u.mfa, before])).rowCount === 1; },
    async famById(sid) { return famRow((await q('select ' + F_COLS + ' from sessions where sid=$1', [sid])).rows[0]); },
    async famByHash(h) { return famRow((await q('select ' + F_COLS + ' from sessions where cur=$1 or prev @> array[$1]::text[] limit 1', [h])).rows[0]); },
    async famsOf(uid) { return (await q('select ' + F_COLS + ' from sessions where uid=$1 and not rev and exp>$2', [uid, Date.now()])).rows.map(famRow); },
    async famPut(f) { await q('insert into sessions(' + F_COLS + ') values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (sid) do update set cur=$3,prev=$4,ip=$6,last=$8,rev=$10', [f.sid, f.uid, f.cur, f.prev, f.ua, f.ip, f.created, f.last, f.exp, f.rev]); },
    // compare-and-swap: only one of two simultaneous refreshes with the same token can win, on any server
    async famRotate(f, oldCur) { return (await q('update sessions set cur=$2,prev=$3,last=$4,ip=$5 where sid=$1 and cur=$6 and not rev returning sid', [f.sid, f.cur, f.prev, f.last, f.ip, oldCur])).rowCount === 1; },
    async famRevoke(sid) { await q('update sessions set rev=true where sid=$1', [sid]); },
    async famRevokeUser(uid, except) { await q('update sessions set rev=true where uid=$1 and not rev and ($2::uuid is null or sid<>$2::uuid)', [uid, except || null]); },
    async resetPut(hash, uid, exp) { await q('insert into resets(hash,uid,exp) values ($1,$2,$3)', [hash, uid, exp]); },
    async resetTake(hash) { const r = (await q('delete from resets where hash=$1 returning uid,exp', [hash])).rows[0]; return r && num(r.exp) > Date.now() ? { uid: r.uid, exp: num(r.exp) } : null; }, // single use, even across servers
    // login/MFA failure counters shared by every server, so spreading guesses across servers does not multiply the allowance
    async limitHit(key, max, ms) { const now = Date.now(), r = (await q('insert into limits(key,n,reset) values ($1,1,$2) on conflict (key) do update set n=case when limits.reset<=$3 then 1 else limits.n+1 end, reset=case when limits.reset<=$3 then $2 else limits.reset end returning n,reset', [key, now + ms, now])).rows[0]; return { ok: r.n <= max, retry: Math.max(1, Math.ceil((r.reset - now) / 1000)) }; },
    async limitOver(key, max) { const now = Date.now(), r = (await q('select n,reset from limits where key=$1 and reset>$2', [key, now])).rows[0]; return r && r.n >= max ? Math.max(1, Math.ceil((r.reset - now) / 1000)) : 0; },
    async limitClear(key) { await q('delete from limits where key=$1', [key]); },
    async cleanup() { const now = Date.now(); await q('delete from limits where reset<$1', [now]); await q('delete from resets where exp<$1', [now]); await q('delete from sessions where exp<$1 or (rev and last<$2)', [now, now - 7 * 86400000]); },
    async close() { await pool.end(); }
  };
  return s;
}

function create(dir) {
  if (process.env.DATABASE_URL) { const { Pool } = require('./pg'); return pgStore(new Pool(process.env.DATABASE_URL)); }
  return fileStore(dir);
}
module.exports = { create, fileStore, pgStore };
