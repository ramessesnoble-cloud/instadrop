# Sign-in at 10 million users: what is built, what is not

## What the code does today
Follows the six steps from the reference video:

1. **Stateless auth servers.** Any server can serve any request. With `DATABASE_URL` set, nothing about a login is kept only in one server's memory.
2. **Password hashing.** scrypt (N=2^16, r=8, p=2, 64 MiB per hash) with a per-user salt. Lookups go through an in-memory index on normalised email / E.164 phone. Hashing runs in a bounded queue; when it is full the API answers `503` + `Retry-After` instead of falling over.
3. **Cache.** Public profiles are cached in an LRU. Hashes and secrets are never cached or returned.
4. **Tokens.** 15-minute HS256 access token (verified by any API server with the shared `JWT_SECRET`, no database call) plus a rotating refresh token in an HttpOnly, SameSite=Strict cookie. Reusing an old refresh token revokes that whole device session. Access tokens are kept in memory by the page, never in localStorage.
5. **Abuse protection.** Per-IP and per-account limits return `429` + `Retry-After`; unknown-account logins cost the same as real ones (no account enumeration by response or timing); CSRF header required on cookie endpoints.
6. **MFA.** TOTP with sealed secrets, replay protection, recovery codes. Reset links are single use and sign out every device.

Tested with `47` end-to-end assertions (signup, tampered/`alg=none` tokens, brute force, refresh reuse, MFA with an independent TOTP implementation, order privacy, 24 concurrent logins).

## PostgreSQL (built and tested)
Set `DATABASE_URL`. See the README. What lives where:

| Data | In PostgreSQL | Shared by all servers? |
|---|---|---|
| Users, password hashes, MFA | `users` | Yes: every lookup hits the database (unique indexes on email and phone settle sign-up races) |
| Login sessions / refresh tokens | `sessions` | Yes: rotation is a compare-and-swap, so of two simultaneous refreshes with one token only one wins |
| Password reset links | `resets` | Yes: `DELETE … RETURNING`, so a link works once even across servers |
| Wrong-password and wrong-MFA counters | `limits` (unlogged) | Yes: guesses spread over servers do not multiply the allowance |
| Vendors, menus, orders, loyalty, group carts | `vendors`, `orders`, `kv` | **Saved, but not yet shared live**: each server loads them at start and keeps a copy in memory |

Tested against PostgreSQL 16 (native, SCRAM-SHA-256): the 47 auth checks pass on both the file and the PostgreSQL backend, and `test/multi-server.test.js` checks two servers on one database (cross-server login and refresh, one winner in a simultaneous refresh race, duplicate sign-up race, single-use reset link, lockout across servers). A full browser run (sign up, order, track, reload, devices, MFA setup, sign out) passes on PostgreSQL.

## Honest limits
- **Orders and menus across servers.** A second server will not see an order or menu edit made on the first until it restarts, because those are cached in memory. Fix: make order/vendor reads query the database (`ordr()` and the vendor list become async) and publish changes with `LISTEN/NOTIFY` so each server can push live updates (SSE) to its own viewers. Until then, run **one app server** with PostgreSQL, or route each region to one server, and scale the *sign-in* tier freely.
- **Memory at 10M users.** All orders are loaded into memory at start. Load only recent orders (and read old ones from the table) before the order table gets large.
- **Per-IP request limits** are still per server (they blunt floods only). Use your load balancer / CDN rate limiting in front, or Redis.
- **Argon2id** is not in Node 22. scrypt is a sound substitute. On Node 24+ switch `hashPw/checkPw` to `crypto.argon2`.
- **Measured throughput**: about 7 logins/second on a 2-CPU sandbox with 64 MiB scrypt. That is expected: hashing is deliberately expensive. Refresh and API calls do not hash. Ten million *accounts* is easy; the hard number is *simultaneous logins*. Plan (peak logins per second ÷ ~3 per core) cores.
- **Not tested**: TLS to PostgreSQL (`sslmode=require`), `docker-compose.yml`, PgBouncer, the nginx sketch, any Redis use. The PostgreSQL driver in `pg.js` is our own and small: for critical production you may prefer the official `pg` package (anything with `query(sql, params)` and `tx(fn)` fits).

## Going to many servers
1. Run **PostgreSQL** with backups and a replica; put PgBouncer (transaction mode) in front when you have many servers (`PG_POOL` small per server).
2. Run N identical servers behind a load balancer: same `JWT_SECRET`, `DATABASE_URL`, `TRUST_PROXY=1`, `NODE_ENV=production`, `UV_THREADPOOL_SIZE` ≥ `HASH_CONCURRENCY`, health check `GET /api/health`. SSE needs long-lived connections allowed.
3. Dedicate cores to `/api/auth/login|signup|password|reset`, the only CPU-heavy routes.
4. Finish the order/vendor sharing described above before serving orders from more than one server.
5. Rotate `JWT_SECRET` by accepting two keys for one access-token lifetime (15 minutes).
6. Plug a real email/SMS provider into `notify()`; add email/phone verification before trusting `verified`.

Untested nginx sketch:
```nginx
upstream instadrop { least_conn; server 10.0.0.11:3000; server 10.0.0.12:3000; keepalive 64; }
server {
  listen 443 ssl http2;
  location / { proxy_pass http://instadrop; proxy_http_version 1.1; proxy_set_header Connection ""; proxy_set_header X-Forwarded-For $remote_addr; proxy_set_header X-Forwarded-Proto $scheme; proxy_buffering off; proxy_read_timeout 1h; }
}
```
