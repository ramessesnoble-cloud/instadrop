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

## PostgreSQL and Redis (built and tested)
Set `DATABASE_URL` (PostgreSQL) and `REDIS_URL` (Redis). See the README.

| Data / job | Where | Shared by all servers? |
|---|---|---|
| Users, password hashes, MFA | PostgreSQL `users` | Yes: every lookup hits the database (unique indexes settle sign-up races) |
| Login sessions / refresh tokens | PostgreSQL `sessions` | Yes: rotation is a compare-and-swap, so of two simultaneous refreshes with one token only one wins |
| Password reset links | PostgreSQL `resets` | Yes: `DELETE … RETURNING`, single use across servers |
| Per-IP flood limits, wrong-password and wrong-MFA counters | Redis (atomic Lua); without Redis: PostgreSQL for account counters, memory for IP limits | Yes with Redis |
| Vendors, menus, orders, loyalty, group carts | PostgreSQL `vendors`, `orders`, `kv`, with a working copy in each server's memory | Saved by every server; kept current between servers by Redis pub/sub |
| Live tracking pushes (SSE) | Pub/sub: the server that changed an order publishes it, every server pushes to its own viewers | Yes with Redis |
| Profile cache | In-memory LRU (60 s) per server, invalidated everywhere by pub/sub | Yes with Redis |

Tested (PostgreSQL 16 and Redis 7, native, with passwords): the 47 auth checks pass on files, on PostgreSQL, and on PostgreSQL + Redis; `test/multi-server.test.js` and `test/redis.test.js` run two servers on one database and one Redis: cross-server login/refresh, one winner in a refresh race, duplicate sign-up race, single-use reset link, lockout across servers, a per-IP sign-up limit shared across servers, an order placed on one server visible on the other, a customer connected to server B receiving a live update caused on server A, a new place added on A appearing on B, Redis stopped and restarted (sign-in kept working on local limits, then pub/sub resumed). A full browser run passes on PostgreSQL + Redis.

## Honest limits
- **Order edits are last-writer-wins.** Servers copy each other's orders through pub/sub. If two servers change the same order within a few milliseconds, one change can overwrite the other. Normal use (kitchen, then rider, then customer, seconds apart) is fine. Before big scale, move order changes to a single atomic database update (`UPDATE … WHERE status = $expected`).
- **Messages lost while a server is disconnected from Redis are not replayed.** A server that missed some restores itself on restart (it reloads from PostgreSQL). Use Redis Streams if you need guaranteed delivery.
- **Memory at 10M users.** Every server keeps every order in memory. Load only recent orders (read old ones from the table) before the order table gets large. Rider GPS pings publish the whole order each time: throttle them before thousands of live riders.
- **Argon2id** is not in Node 22. scrypt is a sound substitute. On Node 24+ switch `hashPw/checkPw` to `crypto.argon2`.
- **Measured throughput**: about 6–7 logins/second on a 2-CPU sandbox with 64 MiB scrypt. That is expected: hashing is deliberately expensive. Refresh and API calls do not hash. Ten million *accounts* is easy; the hard number is *simultaneous logins*. Plan (peak logins per second ÷ ~3 per core) cores.
- **Not tested**: TLS to PostgreSQL or Redis (`sslmode=require`, `rediss://`), Redis Cluster/Sentinel (the client talks to one address: put a managed or proxied endpoint in front), PgBouncer, `docker-compose.yml`, the nginx sketch. `pg.js` and `redis.js` are our own small clients: for critical production you may prefer the official `pg` and `ioredis`/`redis` packages.

## Going to many servers
1. Run **PostgreSQL** with backups and a replica, and a private, password-protected **Redis**; put PgBouncer (transaction mode) in front when you have many servers (`PG_POOL` small per server).
2. Run N identical servers behind a load balancer: same `JWT_SECRET`, `DATABASE_URL`, `TRUST_PROXY=1`, `NODE_ENV=production`, `UV_THREADPOOL_SIZE` ≥ `HASH_CONCURRENCY`, health check `GET /api/health`. SSE needs long-lived connections allowed.
3. Dedicate cores to `/api/auth/login|signup|password|reset`, the only CPU-heavy routes.
4. Make order changes atomic in the database (see the first limit above) before heavy multi-server order traffic.
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
