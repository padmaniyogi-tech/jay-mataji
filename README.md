# Amplifi — automated social campaign ordering & verified delivery tracking

A production-shaped Next.js application for ordering **lawful** Instagram growth and
promotion work: public profile / post / Reel URL → service → quantity → server-side quote →
payment → automatic provider routing → tracked delivery → report.

It deliberately does **not** generate fake followers, run bot networks, scrape Instagram or
ask for account credentials. Every integration is labelled live, mocked or unconfigured, and
demo data is always rendered as **DEMO DATA — NOT REAL INSTAGRAM ENGAGEMENT**.

---

## 1. What actually works today

| Area | State |
| --- | --- |
| Catalogue, service pages, pricing, coupons, GST, integer-paise quotes | Working |
| Registration, email verification, login, password reset, sessions | Working (email captured to disk in demo mode) |
| Order creation with idempotency, URL validation, limits | Working |
| Payments | Mock adapter working end to end. Razorpay implemented but **unconfigured** |
| Background queue (Postgres jobs + transactional outbox), retries, dead letters | Working |
| Provider routing with eligibility, price, ETA, reliability scoring | Working |
| Demo simulator provider | Working, hard-blocked outside `DEMO_MODE` |
| Manual / creator team provider + staff evidence entry | Working |
| Meta Ads adapter | Implemented, **unconfigured** (needs approved ad account) |
| Agency adapter (HMAC webhooks) | Implemented, **unconfigured** (needs contract + credentials) |
| Customer dashboard, order timeline, measurements, reports, receipts, support, settings | Working |
| Admin console: orders, refunds, providers, services, coupons, customers, tickets, audit, settings | Working |
| Public demo page (`/demo`): no login, no payment, simulated follower run | Working — clearly labelled simulation |
| Notifications (in-app + email outbox) | Working |
| Tests: unit + queue integration + HTTP smoke + Playwright specs | Working (Playwright needs a browser) |

Read [`docs/external-setup.md`](docs/external-setup.md) before promising anything to a
customer. It lists every credential, approval and test still required.

## 1a. The 45-second public demo (`/demo`)

Open **`/demo`** for a no-login, no-payment walkthrough of the campaign workflow.

- Enter an Instagram username or public profile URL and a quantity (100–5,000, step 100).
- **Start Demo** creates a row in the isolated `demo_runs` table — no user, no order, no
  payment, no invoice and no provider submission — and the page animates progress and a
  result screen.
- Every screen states **“Demo simulation only — no real Instagram followers are delivered.”**
  Progress is a server-side timer, not a measurement, and the result explicitly tells you the
  account's real follower count is unchanged.
- The page also reports whether **real delivery** is available. It only says yes when an
  enabled, healthy `meta_ads` or `agency` provider supports `followers`; the local simulator
  and the manual-assignment provider never count. In the default install it says
  *real delivery is unavailable*.

Guard rails: Zod validation, per-IP rate limit (15 per 10 min) plus a 20/hour per-IP cap in the
database, quantity envelope enforced server-side, same-origin CSRF check, hashed client IPs,
and no link whatsoever from a demo run to revenue, invoices or provider submission.

## 2. Hard product rules enforced in code

- No Instagram passwords, session cookies, OTPs or access tokens are ever requested or stored.
- No fake accounts, bot networks, automated follows/likes/comments/views, scraping or
  undocumented Instagram endpoints.
- If no legitimate provider is configured, the order becomes `pending_provider` and staff are
  alerted — it is never silently "completed".
- Results are stored as *requested*, *provider-reported*, *verified*, *attributed* and
  *organic* separately. Organic growth is never counted as delivery.
- When a platform does not expose a metric the UI prints **“Metric unavailable”**; nothing is
  estimated.
- No follower counts, likes, views or virality are guaranteed anywhere in the copy.

## 3. Quick start (local, no external services)

### macOS / Linux

```bash
git clone <your-repo-url> amplifi && cd amplifi
npm ci
cp .env.example .env.local        # then set SESSION_SECRET, ENCRYPTION_KEY, CRON_SECRET
npm run db:migrate
npm run db:seed
npm run dev
```

### Windows PowerShell

```powershell
git clone <your-repo-url> amplifi; cd amplifi
npm ci
Copy-Item .env.example .env.local   # then edit the three secrets
npm run db:migrate
npm run db:seed
npm run dev
```

Generate the secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Open <http://localhost:3000>. Local development uses the bundled **PGlite** database
(`.data/pglite`) — no Postgres server required. Set `DATABASE_URL` to use real Postgres.

`npm run db:seed` creates demo accounts and prints their passwords to
`.data/seed-credentials.txt` (gitignored). There is **no default admin account**: the seed
refuses to run against a non-local database without `--force`, and `npm run create:admin`
prompts for credentials on the command line.

```bash
npm run create:admin     # interactive; never ships a known password
npm run create:customer
```

### Acceptance walkthrough (≈2 minutes)

1. Log in as the seeded customer (`demo@amplifi.local` + password from `.data/seed-credentials.txt`).
2. **Start a new campaign** → pick *Instagram Reel views* → paste
   `https://www.instagram.com/reel/CxAbCdEf123/` → quantity 5,000.
3. The quote appears (server-computed, GST included). Press **Start order**.
4. On checkout press **Pay ₹… (simulated)** — the mock gateway posts through the same
   server-side verification path as Razorpay.
5. The order moves `paid → queued → in_progress` as the worker routes and submits it to the
   demo simulator. Watch the timeline and progress bar update.
6. Open **Campaign report** — every number is labelled DEMO DATA and the measurement source
   is shown.
7. Log in as the admin (`admin@amplifi.local`) to see the same order, refunds, providers,
   routing and audit trail.

In development the queue worker runs inside the web process (`INLINE_WORKER=true`). You can
also run it explicitly (never while `npm run dev` is running against PGlite — the file
database is single-writer):

```bash
npm run worker        # long-lived
npm run worker:once   # one batch (useful after seeding)
```

### Opening the app from a hosted/sandbox environment

`http://localhost:3000` only works when the dev server runs on **your own machine**.
In a hosted sandbox (Arena, E2B, Codespaces, Gitpod) the server runs remotely, so
`localhost` in your browser points at your laptop and shows `ERR_CONNECTION_REFUSED`.

Use the sandbox's preview URL instead — for E2B-style hosts it is:

```
https://<port>-<sandbox-id>.e2b.app      e.g. https://3000-iasoomhd6bxyb4wjhsrd2.e2b.app
```

The server must bind `0.0.0.0` (the `dev` script already does). Two things also have
to be true, and both are configured in `next.config.ts`:

- `allowedDevOrigins` includes the preview host, otherwise Next.js dev rejects
  cross-origin/HMR requests.
- The page may **not** send `X-Frame-Options: DENY` or `frame-ancestors 'none'`,
  otherwise an embedded preview pane shows "refused to connect". Framing is
  therefore allowed automatically outside production; for a production-mode
  preview set `ALLOW_EMBED=1`. Real production deployments keep the hardened
  `DENY` / `frame-ancestors 'none'` defaults.

## Local troubleshooting

- **`Aborted(). Build with -sASSERTIONS` / 500 on every route** — the PGlite data directory was
  left in a crashed state (typically an abrupt kill). Recreate the local database:

  ```bash
  # stop the dev server first
  rm -rf .data/pglite          # PowerShell: Remove-Item -Recurse -Force .data/pglite
  npm run db:migrate && npm run db:seed
  ```

- **`DATABASE_URL` set but connection refused** — unset it to fall back to PGlite, or start
  Postgres and run `npm run db:migrate`.
- **Emails do not arrive** — with `EMAIL_PROVIDER=console` they are written to
  `.data/mail/`; use `EMAIL_PROVIDER=smtp` for real delivery.
- **Order stuck in `paid`** — no worker is running. Start `npm run worker`, or set
  `INLINE_WORKER=true` and restart `npm run dev`.

## 4. Environment variables

See [`.env.example`](.env.example) for the annotated list.

**Only needed locally:** none — everything has a safe default (PGlite, mock payments,
console email, demo mode). `SESSION_SECRET`, `ENCRYPTION_KEY` and `CRON_SECRET` should still be
set so behaviour matches production.

**Required in production:** `NODE_ENV=production`, `APP_URL`, `DATABASE_URL`,
`SESSION_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`, and — for real money and email —
`PAYMENTS_PROVIDER=razorpay`, `RAZORPAY_*`, `EMAIL_PROVIDER=smtp`, `SMTP_*`, `EMAIL_FROM`.
`DEMO_MODE` must be `false`.

Startup validates the environment and logs explicit warnings (e.g. mock payments in
production, console email, missing webhook secret).

## 5. Architecture

```
src/
  app/
    (marketing)/           home, services, service detail, how it works, legal, auth pages
    (app)/dashboard/       overview, orders, order detail, report, receipt, checkout,
                           notifications, support, settings
    (admin)/admin/         overview, orders, refunds, providers, services, coupons,
                           customers, tickets, audit, settings, notifications
    api/                   auth, quote, orders, payments, webhooks, cron, health, support,
                           profile, uploads, admin actions
  components/              ui primitives, layout, orders, payments, support, admin
  lib/
    db/                    drizzle schema (24 tables), migrations, executor abstraction
    auth/                  password hashing, sessions, permissions
    orders/                state machine, events, measurements, service, refunds,
                           processing, reconcile, admin actions
    providers/             adapter contract + mock / manual / meta / agency + registry + routing
    payments/              gateway abstraction, mock, razorpay, webhook verification
    jobs/                  durable queue, outbox, worker, inline worker
    admin/                 admin queries and mutations
  worker/index.ts          standalone worker process
drizzle/                   SQL migrations (applied exactly once, hash-checked)
tests/                     unit + integration (vitest), e2e (playwright)
scripts/                   migrate, seed, reset, create-user, HTTP smoke test
docs/                      deployment, provider onboarding, security checklist, external setup, project report
```

### Order lifecycle

```
pending_payment → paid → pending_review / pending_provider / queued
queued → in_progress → completed | partially_completed | failed
in_progress → cancellation_requested → cancelled
completed | failed | cancelled → refund_pending → partially_refunded | refunded
```

Every transition goes through `assertTransition()` (`src/lib/orders/state-machine.ts`) and
writes an immutable `order_events` row with the actor, role and metadata. Customers can only
request cancellation or a refund; they can never mark an order complete.

### Queue and routing

1. Payment verification writes the state change and an outbox row **in one transaction**.
2. `dispatchOutbox()` turns outbox rows into durable `jobs` rows (deduplicated by key).
3. The worker claims jobs with `FOR UPDATE SKIP LOCKED`, so multiple workers never double-process.
4. `order.route` scores eligible providers by compatibility, quantity range, health, cost,
   ETA and reliability. If nothing is eligible the order becomes `pending_provider` and staff
   are notified.
5. `order.submit` calls `createCampaign()` with an idempotency key. Transient failures retry
   with exponential backoff (5s → 10 min, max 5 attempts); permanent failures mark the order
   `failed` and raise a refund review.
6. `order.poll` writes measurements with their source and verification state.

### Measurement model

`orders` stores `baselineCount`, `latestCount`, `providerReportedCount`, `attributedCount`,
`organicCount`, `verifiedCount`, `remainingTarget`, `measurementSource` and `lastMeasuredAt`
independently. `order_measurements` is an append-only evidence log. The UI never derives one
from another without a source.

## 6. Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server on `0.0.0.0:3000` |
| `npm run build` / `npm run start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) |
| `npm run test` | Vitest unit + queue integration tests |
| `npm run test:http` | HTTP smoke test against a running server |
| `npm run test:e2e` | Playwright specs (needs `npx playwright install`) |
| `npm run verify` | typecheck + tests + build |
| `npm run db:generate` / `db:migrate` / `db:seed` / `db:reset` | Schema and data |
| `npm run create:admin` / `create:customer` | Interactive account creation |
| `npm run worker` / `worker:once` | Background worker |

## 7. Testing

- **Unit (Vitest):** money/paise rounding, Instagram URL validation, pricing and coupon rules,
  state machine, RBAC matrix, password hashing, request schemas.
- **Integration (Vitest + in-memory PGlite):** job deduplication, single-claim semantics, outbox
  dispatch idempotency and transaction rollback.
- **HTTP smoke (`npm run test:http`):** health, login, wrong password, quote, quantity limits,
  invalid URL rejection, order idempotency, checkout handoff, mock payment, duplicate payment,
  automatic progression, owner-only detail, logout revocation.
- **Playwright:** customer purchase flow and admin login specs; run against `npm run dev`:

  ```bash
  npx playwright install chromium
  npm run dev
  npx playwright test
  ```

All tests use mock providers and the mock payment adapter. No test contacts Instagram or a
real payment gateway.

## 8. Known limitations

- No real Instagram delivery integration exists in this repo. Follower/like/view services can
  only run through the demo simulator or a manually operated provider.
- Meta Ads requires an approved ad account, page and token; the adapter refuses to run
  otherwise and cannot buy organic engagement.
- Instagram does not expose third-party follower/like metrics, so those orders report
  “Metric unavailable” unless a provider supplies verifiable evidence.
- Uploads are stored on local disk; use object storage before scaling horizontally.
- No CAPTCHA/WAF/error-tracking integration is included.
- No third-party security audit or compliance certification has been performed; none is claimed.
- Notification channels are in-app + email only (no SMS/WhatsApp/push).
- PGlite is single-writer; it is intended for development and tests only, and refuses to run
  when `NODE_ENV=production`.

## 9. Documentation

- [`docs/deployment.md`](docs/deployment.md) — production setup, Docker, backups, rollback.
- [`docs/provider-onboarding.md`](docs/provider-onboarding.md) — adapter contract and "live" criteria.
- [`docs/security-checklist.md`](docs/security-checklist.md) — implemented vs. still needed.
- [`docs/external-setup.md`](docs/external-setup.md) — every credential, approval and test outstanding.
- [`docs/project-report.md`](docs/project-report.md) — final delivery report: implemented scope, files, commands, test results, live vs. mocked integrations, blockers.

## 10. Licence / responsible use

Use this software only for lawful, disclosed campaigns you are authorised to run. Do not use it
to buy fake engagement, impersonate accounts or misrepresent results. You are responsible for
complying with Instagram's terms, Indian consumer-protection and advertising-disclosure rules
(including ASCI guidelines) and applicable data-protection law.
