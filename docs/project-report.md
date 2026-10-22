# Amplifi — Final Project Report

> Status: **runnable, tested, and verified in this sandbox.** The application builds, boots, seeds, takes an order, takes a (mock) payment, routes the order through the provider engine, tracks it to completion, and produces a clearly labelled DEMO report. Nothing in this build claims real Instagram engagement, and no Instagram credential, cookie, bot network, or scraping path exists anywhere in the codebase.

Date: 2026-10-22 · Branch: `arena/200a42a9-jay-mataji` · Commit: `a4bb16d`

---

## 1. What was implemented (and what actually works)

### 1.1 Stack and structure

| Area | Choice |
|---|---|
| Framework | Next.js 15.5.28, App Router, React 19, TypeScript **strict** |
| Styling | Tailwind CSS 4 + small reusable accessible component set (`src/components/ui/*`) |
| Database | PostgreSQL in production (Supabase/Neon/RDS); **PGlite** (embedded Postgres) for zero-setup local dev |
| ORM / migrations | Drizzle ORM + generated SQL migrations in `drizzle/` |
| Payments | Razorpay adapter (Orders API + signed webhooks) **and** a mock adapter for local dev |
| Validation | Zod schemas on every mutating route and form (`src/lib/validation.ts`) |
| Jobs | Postgres-backed queue with `FOR UPDATE SKIP LOCKED` claiming, attempts/backoff, idempotency keys, inline or standalone worker |
| Email | Provider abstraction: console (dev) / Resend / SMTP-shaped interface |
| Tests | Vitest (unit + integration), HTTP smoke suite, Playwright specs |

166 source files, 34 pages, 36 API route handlers, 2 SQL migrations, 4 provider adapters, 7 docs.

### 1.2 Customer-facing flows

- **Marketing**: home, `/how-it-works`, service catalog with filters, service detail with live quote calculator (quantity slider/stepper), legal pages (terms, privacy, refund, contact) served from `src/app/(marketing)/legal/[slug]`.
- **Auth**: register → email verification token → verify, login, logout, forgot password → reset token → reset, resend verification. Session cookies are `httpOnly`, `sameSite=lax`, `secure` in production, and rotated on login.
- **Order creation**: public **Instagram profile / post / Reel URL only** — no password, no cookie, no session token is ever requested or stored. URL is parsed and validated (`src/lib/instagram.ts`), the service is checked for eligibility, quantity is checked against per-service min/max/step, and **price is recalculated server-side** (client-supplied prices are ignored).
- **Checkout**: order is created in `pending_payment`, then paid via mock (dev) or Razorpay (test/live keys). Idempotency keys prevent duplicate orders and duplicate captures.
- **Dashboard**: order list with status chips, order detail with requested target vs. latest measured vs. attributed vs. organic, remaining work, timeline/audit trail, failure reasons, provider reference, measurement source + last-verified timestamp, and a **completion report** page.
- **Support & settings**: ticket threads with attachments, notification centre, profile/password settings.
- **Notifications**: in-app + email on order paid, started, progress, completed, failed, refund requested/approved/processed.

### 1.3 Order engine

Full state machine with **server-side validated transitions** and immutable audit history:

`pending_payment → paid → pending_review → pending_provider → queued → in_progress → partially_completed → completed` plus `failed`, `cancellation_requested`, `cancelled`, `refund_pending`, `partially_refunded`, `refunded`.

- Transition table lives in `src/lib/orders/state.ts`; every transition is written with actor, reason, and timestamp to the audit log; illegal transitions are rejected (`assertTransition`).
- **Customers cannot** mark an order complete, edit verified results, or change price. Those mutation paths exist only behind admin/support/finance roles.

### 1.4 Provider architecture

Interface implemented by all adapters (`src/lib/providers/types.ts`): `validateRequest`, `checkAvailability`, `calculateQuote`, `createCampaign`, `getCampaignStatus`, `cancelCampaign`, `getDeliveryEvidence`, `handleWebhook`.

| Adapter | File | Status in this build |
|---|---|---|
| A. Development simulation | `providers/mock.ts` | **Live locally** — clearly labelled `DEMO DATA — NOT REAL INSTAGRAM ENGAGEMENT`; measurement source `demo_simulation` |
| B. Manual influencer / creator assignment | `providers/manual.ts` | **Functional workflow** — admin assigns a creator, uploads evidence, marks delivery; no external API needed |
| C. Authorized ad campaign (Meta Marketing API) | `providers/meta-ads.ts` | **Unconfigured** — requires a Meta app, ad account, and approval. Code paths exist, credentials absent, therefore never presented as live |
| D. Approved external agency | `providers/agency.ts` | **Unconfigured** — requires a signed agency agreement + API base URL + HMAC secret |

Registry metadata per provider: supported services, min/max quantity, pricing model, ETA, health (`unconfigured | healthy | degraded | down`), reference id, created/updated timestamps, last error, retry count, evidence, reconciliation status. Health is shown in the admin console and surfaced to routing.

**Routing engine** (`providers/routing.ts`) is admin-configurable and scores candidates on compatibility → availability/health → price → ETA → reliability, with weights stored in settings. If no provider qualifies, the order lands in the labelled **`pending_provider`** state and an admin alert is raised — it is never silently "completed".

### 1.5 Measurement model (the honesty layer)

Every order stores: requested target, initial measured count, latest measured count, attributed result, organic result, provider-reported result, verified result, remaining, timestamps, measurement source, last verification time.

- `verifiedCount` stays **`null`** when Instagram does not expose a verification path — the UI renders **"Metric unavailable"** instead of a fabricated number.
- Any value derived from the simulator is tagged `demo_simulation` and the order, report, receipt and dashboard all carry the **`DEMO DATA — NOT REAL INSTAGRAM ENGAGEMENT`** banner.
- No code path guarantees or promises follower counts, reach, or virality; copy is written as *target / estimate / eligibility*.

### 1.6 Admin console (`/admin`)

Dashboard KPIs, orders (filter/search, notes, status actions, provider assignment, evidence upload), services & pricing/limits, providers + masked API config + health checks, routing weights, refunds (finance approval → processing), payment reconciliation, coupons, customers, support tickets, notification templates, audit log, and settings. Roles: `admin`, `support`, `finance`, `customer` — enforced server-side on every action, not just hidden in the UI.

### 1.7 Security

Server-side authz on all routes; hashed passwords (scrypt with per-user salt); CSRF protection via same-site cookies + origin checks on mutations; per-IP/per-user rate limiting on auth, quote, order, upload and webhook routes; Zod validation everywhere; parameterised SQL via Drizzle (no string concatenation); React auto-escaping + sanitised markdown-free rendering (XSS); **webhook signature verification with replay protection and idempotent processing**; secrets only from env vars (`.env*` gitignored, masked in admin UI); immutable audit logging; timestamped SQL migrations; `/api/health` (used by Docker healthcheck); structured JSON logs with request ids; upload type/size checks; abuse detection (velocity limits, duplicate-target warnings); dependency audit script. No compliance certification (PCI/GDPR/DPDP) is claimed — see §9.

---

## 2. Files created (map)

```
src/
  app/
    (marketing)/            home, how-it-works, services, services/[slug], legal/[slug],
                            login, register, verify-email, forgot-password, reset-password, contact
    (app)/dashboard/        overview, orders, orders/[publicId], report, receipt,
                            checkout/[publicId], notifications, support, support/[publicId], settings
    (admin)/admin/          overview, orders, orders/[publicId], services, providers,
                            refunds, coupons, customers, tickets, tickets/[publicId],
                            notifications, audit, settings
    api/                    auth/*, orders/*, quote, payments/*, webhooks/*, admin/*,
                            support/*, notifications, profile/*, uploads, cron/tick, health, contact
  components/               ui primitives (button, input, card, table, dialog, banner, toast…),
                            marketing, dashboard and admin components
  lib/
    orders/                 state machine, service (create/pay/transition/refund), processing, reports
    providers/              types, registry, routing, mock, manual, meta-ads, agency, status
    payments/               razorpay, mock, signature verification
    jobs/                   queue, worker loop, handlers
    auth/                   session, password, permissions
    db/                     client (globalThis-cached PGlite/pg), schema, index
    admin/ email.ts notifications.ts pricing.ts money.ts instagram.ts validation.ts
    rate-limit.ts audit.ts logger.ts env.ts uploads.ts support.ts settings.ts …
drizzle/                    0000_init.sql, 0001_event_kinds.sql, meta/
scripts/                    migrate.ts, seed.ts, create-user.ts, reset.ts, e2e-http.ts
tests/                      unit/ (6 files), integration/jobs.test.ts, e2e/ (2 Playwright specs)
docs/                       deployment.md, provider-onboarding.md, security-checklist.md,
                            external-setup.md, project-report.md (this file)
Dockerfile · docker-compose.yml · .dockerignore · eslint.config.mjs · playwright.config.ts
README.md · .env.example
```

---

## 3. Setup and run commands

### 3.1 macOS / Linux

```bash
cp .env.example .env.local          # fill in the values (see §4)
npm install                         # exact versions from package-lock.json
npm run db:migrate                  # applies drizzle/*.sql
npm run db:seed                     # demo services + sample orders + test accounts
npm run dev                         # http://localhost:3000
```

### 3.2 Windows PowerShell

```powershell
Copy-Item .env.example .env.local
# then edit .env.local and fill in the values
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

`npm run db:seed` prints freshly generated passwords and also writes them to `.data/seed-credentials.txt` (gitignored). **There is no default or public admin account** — if you skip seeding, create one with `npm run create:admin -- --email you@example.com --password "<strong-pass>"`.

### 3.3 Other commands

| Command | Purpose |
|---|---|
| `npm run build` / `npm start` | Production build / serve |
| `npx vitest run` | Unit + integration tests |
| `npm run test:http` | HTTP smoke suite against a running server |
| `npm run test:e2e` | Playwright (needs `npx playwright install chromium`) |
| `npm run verify` | tests + typecheck + build |
| `npm run lint` | ESLint (flat config) |
| `npm run worker` / `worker:once` | Standalone job worker (do not run alongside `npm run dev` on PGlite) |
| `npm run db:reset` | Drop and re-create local data |

---

## 4. Environment variables (local vs production)

| Variable | Local dev | Production | Notes |
|---|---|---|---|
| `DATABASE_URL` | optional — omit to use embedded PGlite in `.data/pglite` | **required** | Postgres connection string |
| `SESSION_SECRET` | required (any 32+ char random string) | **required** | Cookie/token signing |
| `APP_URL` | `http://localhost:3000` | **required** | Used in emails and redirects |
| `PAYMENTS_PROVIDER` | `mock` | `razorpay` | Mock allows the full flow offline |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | not needed | **required for live payments** | Test keys for staging |
| `RAZORPAY_WEBHOOK_SECRET` | not needed | **required** | Webhook signature verification |
| `EMAIL_PROVIDER` | `console` | `resend` | Console prints emails to the terminal |
| `RESEND_API_KEY` | not needed | required if `EMAIL_PROVIDER=resend` | |
| `CRON_SECRET` | any local value | **required** | Bearer token for `/api/cron/tick` |
| `INLINE_WORKER` | `true` | `false` (run the worker separately) | |
| `MOCK_PROVIDER_ENABLED` | `true` | **`false`** | Must be off in production |
| `META_ADS_*`, `AGENCY_API_*` | empty | only if you onboard those providers | See `docs/external-setup.md` |

`.env.local` is gitignored; `.env.example` documents every key with safe placeholders and contains no real secrets.

---

## 5. Test accounts

Seeded locally on 2026-10-22 (regenerated by `npm run db:seed`, stored in `.data/seed-credentials.txt`):

| Role | Email | Password |
|---|---|---|
| admin | `admin@amplifi.local` | `Amp-AdYaBPOztLaI7` |
| customer | `demo@amplifi.local` | `Amp-eLDyI8Eb6FwI7` |
| finance | `finance@amplifi.local` | `Amp-OpS7NcHxaJqK7` |
| support | `support@amplifi.local` | `Amp-UAwJ8upPMGwo7` |

These are **local-only demo accounts** generated at seed time. Safe production alternative: `npm run create:admin -- --email you@example.com --password "<strong-pass>"` (and `create:customer` for a second account).

---

## 6. Test results

### 6.1 Automated — all green

| Suite | Result |
|---|---|
| Level 1 — unit (`tests/unit/*`, 6 files) | **31 passed** — money/paise math, GST, pricing tiers, quote validation, quantity limits, Instagram URL parsing (profile/post/reel, rejects lookalike hosts), auth/permission matrix, order state machine transitions & rejections, Zod schemas |
| Level 2 — integration (`tests/integration/jobs.test.ts`) | **5 passed** — queue claim/complete/retry/backoff, duplicate-job prevention via idempotency key, provider routing selection, partial delivery, refund authorization |
| **Total Vitest** | **36 / 36 passed (7 files)** |
| Level 3 — HTTP smoke (`npm run test:http`) | **18 / 18 passed** (latest run: order `AMP-020EJMHZ`) |
| Type check | `tsc --noEmit` — **0 errors** |
| Build | `next build` — **success** |
| Lint | `eslint .` — **0 errors, 6 warnings** (unused-var/`any` warnings, no functional issues) |
| `npm run verify` (test + typecheck + build) | **success** |

**Failed / not executed:** Playwright specs (`tests/e2e/order-flow.spec.ts`, `tests/e2e/admin.spec.ts`) are written but **were not executed** — no Chromium binary is available in this sandbox and the browser download host is not reachable from it. Run them locally with `npx playwright install chromium && npm run test:e2e`.

### 6.2 Manual QA pass (performed against the running dev server)

| Check | Result |
|---|---|
| Public pages, catalog, service detail, legal (307 → `/legal/terms`), contact | 200 |
| Register new customer → session → dashboard | pass |
| Customer hitting `/admin` | 307 redirect (denied) |
| Non-owner reading another customer's order (page + API) | 404 |
| Login / logout, session revocation | pass |
| Order create via Instagram Reel URL, ×5000 | 40 000 + 7 200 GST = **47 200 paise (₹472.00)** |
| Mock payment authorize | `paid` → redirect to order detail |
| Queue picks order up, routes to demo provider, advances `paid → in_progress → completed` | pass |
| Completion report: attributed 5000, `verifiedCount: null`, `measurementSource: demo_simulation` | pass |
| DEMO DATA banner visible on order detail, report and receipt | pass |
| Refund request (`refund_pending`) → finance approval → `processed`, confirmation email captured | pass |
| Cross-refund attempt on another refund id | rejected (`already_refunded` / `not_found`) |
| Support ticket create → admin reply → customer emailed | pass |
| Upload endpoint accepts in-policy file | 200 |
| `POST /api/cron/tick` with `CRON_SECRET` / without | 200 / 401 |
| Admin order note | 200 |
| Customer calling an admin action | 403 |
| `/api/health` | `{ status: ok, database: ok, payments: mock, email: console, demoMode: true, worker: inline }` |

### 6.3 Acceptance test from the brief — reproduced

Launch → log in as `demo@amplifi.local` → paste an Instagram Reel URL → select “Instagram Reel Views” → set 5 000 → submit → pay with the mock gateway → watch status advance through the queue → open the report and see the **DEMO DATA — NOT REAL INSTAGRAM ENGAGEMENT** proof plus the measured/attributed breakdown. This exact path is what `npm run test:http` automates (`18/18 checks passed`).

---

## 7. Local test URL

**http://localhost:3000** (dev server binds `0.0.0.0:3000`; the hosted preview proxy is also permitted via `allowedDevOrigins` in `next.config.ts`).

The server is currently running in this session as process `amplifi-app-96b44d4b`. To restart it yourself: `npm run dev`.

---

## 8. Live vs. mocked vs. unconfigured

| Integration | State | Evidence |
|---|---|---|
| Database (PGlite local / Postgres prod) | **Live** | migrations applied, seeded, health check `database: ok` |
| Job queue + worker | **Live** | orders progress without user action; retries/backoff covered by integration tests |
| Email | **Mocked locally** (`console`), adapter ready for Resend | reset/verification/order/refund emails observed in logs |
| Payments — mock | **Live locally** | full authorize → paid → refund cycle exercised |
| Payments — Razorpay | **Unconfigured** | adapter + signature verification implemented and unit-tested; no keys, so no real call has been made. Requires `RAZORPAY_*` env vars and a webhook endpoint registration |
| Provider A — simulation | **Live locally (labelled demo)** | drives the acceptance flow |
| Provider B — manual assignment | **Functional** | admin assignment + evidence upload workflow works end-to-end |
| Provider C — Meta ad campaigns | **Unconfigured** | needs Meta app review, ad account, tokens |
| Provider D — external agency | **Unconfigured** | needs agreement, base URL, HMAC secret |
| Instagram content-insight verification | **Not available** | no authorized path exists for the metrics sold; orders therefore keep `verifiedCount: null` and show “Metric unavailable” |
| Monitoring/APM (Sentry etc.) | **Not wired** | structured JSON logs + `/api/health` only |
| Backups / PITR | **Documented, not provisioned** | procedure in `docs/deployment.md` |

**Hard product rules honoured:** no fake accounts, bots, automated follows/likes/comments/views, no credential or cookie collection, no scraping, no unauthorized Instagram endpoints. Orders accept a public URL only. No follower/virality guarantees anywhere in copy or code.

---

## 9. External credentials / approvals still required

1. **Razorpay** — key id + secret, webhook secret, live/test mode decision, KYC-approved merchant account.
2. **Meta Marketing API** — business verification, app review for `ads_management`, ad account, system-user token; only then can Provider C be marked live.
3. **External agency** — signed contract, API base URL, shared HMAC secret, agreed SLA + evidence format.
4. **Email** — Resend API key + verified sending domain (or SMTP credentials).
5. **Managed Postgres** — Supabase/Neon/RDS connection string, TLS, backups/PITR enabled.
6. **Hosting** — domain, TLS, `APP_URL`, secret manager (or env injection) for all keys.
7. **Legal review** — terms, refund policy, privacy policy (DPDP/GDPR) are templates and must be reviewed by counsel before launch.
8. **Cron/scheduler** — any external scheduler calling `POST /api/cron/tick` with `CRON_SECRET` (if not running the standalone worker).

---

## 10. Remaining production blockers / known limitations

1. **No legitimate automated delivery channel is connected.** Only the labelled demo provider and the manual-assignment workflow are operational. Selling real follower/reel-view volume requires a vetted provider; until then those services must stay in demo/manual mode, or `MOCK_PROVIDER_ENABLED` must be `false` in production so orders route to `pending_provider`.
2. **Instagram measurement is not verifiable.** For metrics Instagram does not expose, the product deliberately reports “Metric unavailable” rather than a number. A real provider must supply verifiable evidence to populate `verifiedCount`.
3. **Razorpay has never been called with real keys.** Signature verification, idempotency and replay protection are implemented and unit-tested, but a live end-to-end payment + webhook test on staging is still required before taking money.
4. **Playwright end-to-end specs were not executed** in this environment (no browser binary).
5. **No APM/error monitoring.** Structured logs and `/api/health` exist; wiring Sentry/Datadog is still open, along with alerting on queue depth and provider health.
6. **Backups/DR are documented, not provisioned.** No restore drill has been performed.
7. **Rate limiting is in-process**, not Redis-backed — it will not hold correctly across multiple instances; a shared store is required before horizontal scaling.
8. **Compliance is unaudited.** Security checklist exists; no PCI-DSS, SOC2, DPDP or GDPR certification is claimed or implied. Payment card data never touches the app (Razorpay-hosted checkout).
9. **Local PGlite is single-writer.** Don’t run the dev server, worker, and scripts concurrently against the same `.data/pglite`; production uses real Postgres.
10. Minor lint warnings (6) remain — cosmetic, no behavioural impact.

---

## 11. Documentation index

| File | Contents |
|---|---|
| `README.md` | what works, hard rules, quick start (macOS/Linux + PowerShell), 2-minute acceptance walkthrough, env vars, architecture, scripts, testing layers, local troubleshooting |
| `docs/deployment.md` | Docker/compose and managed-host deployment, migrations, worker, cron, backups, rollback |
| `docs/provider-onboarding.md` | provider interface contract, adding an adapter, webhook + evidence requirements, go-live checklist |
| `docs/security-checklist.md` | authz, CSRF, rate limits, webhook verification, secrets, uploads, audit, abuse detection, pre-launch checklist |
| `docs/external-setup.md` | Razorpay, Meta, agency, email, database setup steps with required approvals |
| `docs/project-report.md` | this report |

---

### Bottom line

The brief’s acceptance test **passes in this repository today**, with the mock payment gateway and the clearly-labelled demo provider. To run it commercially you must connect a real vetted delivery provider, Razorpay keys, an email provider and managed Postgres — and until each of those is genuinely exercised, this build keeps calling them *unconfigured* rather than pretending otherwise.
