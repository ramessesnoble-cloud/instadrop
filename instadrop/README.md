# Instadrop

Delivery for anything you eat, drink or use at home: restaurant food, groceries, wine and drinks, household items.
Customer app, kitchen/store dashboard, rider app, admin panel, live map, mobile money and card payments.
Works in 18 countries out of the box, each with its own currency. Needs Node 18+. No npm install needed.

    node server.js
    open http://localhost:3000

## What is new in Instadrop
- **Four store types** plus an "Everything" tab: Food, Groceries, Drinks & wine, Home (cleaning, kitchen, bedroom, lighting, bathroom). Search also looks inside menus, so "wine" or "detergent" finds the right stores.
- **Global**: pick your country at the top (auto-detected from the browser language). Uganda, Kenya, Tanzania, Rwanda, Ghana, Nigeria, South Africa, UK, US, Canada, Australia, Germany, France, India, UAE, Brazil, Mexico, Japan. Every country has demo stores of all four types.
- **Currency follows the country**: prices are stored in each currency's minor unit (cents, pence, whole UGX/JPY) and shown with the right symbol and decimals. Delivery fees, tips, loyalty and free-service-fee thresholds scale per country. Revenue and rider earnings are totalled per currency, never mixed.
- **Alcohol**: flag items as alcohol in Admin. The customer must confirm the country's legal age (18 in most places, 21 in the US, India and UAE, 19 Canada, 20 Japan), the order is stamped with it, and kitchens and riders see "Check ID". Check local licensing rules before selling alcohol in any country.
- **Payments by country**: Mobile money (Uganda, Kenya, Tanzania, Rwanda, Ghana), Card (everywhere), Cash (everywhere). Phone numbers work with any country code.
- Admin: choose a country when adding a store (sets currency and map default), pick the store type, tick "Alcohol" on items, and type prices like 12.50.
- Promo code is now DROP10. Order numbers start with ID-.


## Version 3: regions, languages, live location, accounts
- **Regions**: 18 countries, 153 states/regions (Texas, Quebec, Lagos…), each with cities. First visit asks for country and region; only places serving that region show. GPS picks the nearest city. Orders outside a place's delivery radius are refused (turn off with `RANGE_CHECK=off`).
- **Languages**: English, Swahili, French, Spanish, Portuguese, German, Hindi, Arabic (right-to-left) and Japanese. The region sets the default (Quebec: French, Texas: English or Spanish by browser); the person can switch any time and pick interests for a "For you" ranking. Staff screens stay English.
- **Live**: location watching, distance labels, nearest-first sort, rider position and trail on a map, Server-Sent Events (polling fallback), installable PWA.
- **Accounts** (optional by default, `REQUIRE_LOGIN=1` to force): email or phone + password, two-step verification (authenticator app + recovery codes), password reset links, device list with remote sign-out, sign out everywhere. Orders follow the account across devices.

### PostgreSQL
Set `DATABASE_URL` and everything is stored in PostgreSQL instead of files:

    DATABASE_URL=postgres://user:pass@host:5432/instadrop JWT_SECRET=<32+ chars> NODE_ENV=production node server.js

- Tables are created automatically on start (`migrations.js`, safe with several servers starting at once). Needs PostgreSQL 12+.
- An empty database is filled from `data.json` if it exists, otherwise the demo places. Existing file data is never deleted.
- No driver to install: `pg.js` speaks the PostgreSQL protocol itself (SCRAM-SHA-256, md5, password, TLS with `?sslmode=require`).
- Accounts, sessions, reset links and login-failure counters are read and written in the database, so **any number of servers can share them** (log in on one, refresh on another). Vendors, orders, loyalty and group carts are saved to the database and loaded into memory at start.
- `PG_POOL` sets connections per server (default 10).

### Redis (optional, for several servers)
Add `REDIS_URL=redis://:password@host:6379/0` (`rediss://` for TLS) to link servers together:

- **Shared rate limits**: per-IP flood limits and login/MFA guess counters are counted in Redis, so they hold across all servers.
- **Live updates between servers**: an order, menu edit or loyalty change on one server reaches the others at once, and customers watching live tracking on any server get the push.
- **Profile cache invalidation** across servers.
- If Redis goes down, sign-in keeps working with local limits and reconnects by itself (`/api/health` shows `redis: up|down|off`). Redis holds no data you cannot lose: PostgreSQL stays the source of truth.
- Like PostgreSQL there is no driver to install (`redis.js`). Keep Redis on a private network with a password: orders travel through it.

### Environment variables
| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Required in production (32+ chars), identical on every server. In development a `.jwt-secret` file is created. |
| `NODE_ENV=production` | Enforces the secret and secure cookies. |
| `DATABASE_URL` | PostgreSQL connection string. Unset = files. |
| `REDIS_URL` | Redis connection string. Unset = no cross-server features. `REDIS_TIMEOUT_MS` (default 800) caps each command. |
| `DATA_DIR` | Where journals and the dev secret are written in file mode. |
| `TRUST_PROXY=1` | Read the client IP from `X-Forwarded-For` (only behind your own load balancer). |
| `HASH_CONCURRENCY` / `HASH_QUEUE` | Parallel password hashes per server (default 4) and queue length before answering 503. |
| `REQUIRE_LOGIN`, `RANGE_CHECK` | Force sign-in to order; disable delivery-radius check. |

Password reset links are printed to the server console until you connect an email/SMS sender in `notify()` in `auth.js`.
Read `docs/SCALING.md` before putting this in front of real users.

## Demo PINs
- Uganda: Mama Rolex 1111, Lake Victoria Grill 2222, Napoli Corner 3333, FreshMart 4444, Green Basket 5555, Corner Shop 6666, The Wine Cellar 7777, Chill Drinks Depot 7778, HomePlus 7779
- Other countries' demo stores have PINs 7001 and up: see them in Admin.
- Rider: 0000 (RIDER_PIN)   Admin: 9999 (ADMIN_PIN)
- Delete data.json once to load new demo data on an existing install.

## Payments
Demo mode is the default: mobile money approves after 5 seconds (a number ending in 00 is declined), cards after 4 seconds.

Real MTN MoMo:

    MOMO_MODE=mtn MOMO_SUB_KEY=... MOMO_API_USER=... MOMO_API_KEY=... node server.js

Use MOMO_ENV=sandbox with MOMO_CURRENCY=EUR while testing. For production set MOMO_ENV and MOMO_BASE.

Real cards through Stripe Checkout:

    STRIPE_KEY=sk_test_... node server.js

Both are written to the providers' APIs but have not been run against their servers: test with sandbox or test keys first. M-Pesa, Airtel Money, UPI and other local methods need an adapter in startPayment() and refreshPayment().

## Live map
Leaflet and OpenStreetMap (internet needed). Riders can press "Share my GPS" (HTTPS or localhost) or "Simulate ride".

## Not included
Offline mode (as requested). Still to do before going live: real accounts instead of PINs, HTTPS, a real database instead of data.json, tax/VAT per country, and translations (English only for now).
