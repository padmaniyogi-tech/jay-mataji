# Security checklist

> Status legend: **Implemented** (code present and exercised), **Implemented, needs config**
> (code present but only effective with production settings), **Not audited** (deliberately not
> claimed). This project has **not** undergone a third-party security audit or a formal
> compliance certification. Do not claim PCI-DSS, SOC 2 or ISO 27001 status.

## Authentication & sessions

- [x] Passwords hashed with bcrypt (cost 12); never logged, never emailed.
- [x] Session tokens are 32-byte random values; only their SHA-256 hash is stored.
- [x] Session cookie is `HttpOnly`, `SameSite=Lax`, `Secure` when `APP_URL` is HTTPS.
- [x] Sessions expire after 14 days and are revoked on logout and password change.
- [x] Email verification required before order creation (demo mode may auto-verify).
- [x] Password reset tokens are single-use, hashed at rest, 1-hour expiry.
- [x] Login/registration/reset are rate limited per IP and per account.
- [x] Unknown-account login still performs a bcrypt comparison (no timing oracle).
- [x] No default admin account ships with the app; `scripts/seed.ts` writes credentials to a
      gitignored file and refuses to run against a non-local database without `--force`.

## Authorisation

- [x] Every page and API route resolves the session server-side (`requireUser`,
      `requirePermission`, `requireRole`).
- [x] Customers can only read their own orders (`getOrderForViewer` checks ownership).
- [x] Refund approval requires `refunds:approve` (finance/admin).
- [x] Provider/service/coupon/settings/user management requires `admin`.
- [x] Last active administrator cannot be demoted or suspended; self-role change blocked.
- [x] Staff actions write an audit entry with actor id, email, role and metadata.
- [x] Internal ticket notes are filtered out of customer queries.

## Input, pricing & business logic

- [x] All request bodies validated with Zod; unknown fields rejected by schema shape.
- [x] Money is integer paise everywhere; quotes recomputed server-side on order creation.
- [x] Client-supplied prices are ignored; the payable amount is recalculated from the
      service row + coupon + tax at insert time.
- [x] Coupon redemption counted inside the order transaction.
- [x] Quantity min/max/step enforced server-side.
- [x] Only public `instagram.com` profile/post/reel URLs accepted; credentials in URLs
      rejected; non-Instagram hosts rejected.
- [x] Order status transitions validated by a state machine; terminal states are terminal.
- [x] Customers cannot mark orders completed, set verified counts or force refunds.
- [x] Duplicate order creation prevented by a per-user idempotency key (unique index).
- [x] Duplicate provider submission prevented by a stable idempotency key.

## Payments

- [x] Razorpay signature verified with HMAC-SHA256 (`crypto.timingSafeEqual`).
- [x] Webhooks verified against the raw request body before any JSON parse side effect.
- [x] Webhook replay protection via unique `(source, external_id)`; duplicates return 200
      without reprocessing.
- [x] Payment amount compared to the stored order total before marking paid.
- [x] Refunds require an approved refund row, are clamped to `captured − already refunded`
      and are idempotent per refund id.
- [x] Mock payments are blocked outside demo/test configuration.
- [ ] **Needs config:** real gateway keys, webhook secret, and a live-mode smoke test.

## Data protection

- [x] SQL access exclusively through Drizzle parameterised queries; no string concatenation
      of user input into SQL.
- [x] React escapes rendered strings; no `dangerouslySetInnerHTML` anywhere.
- [x] Uploads restricted by extension + magic bytes (PNG/JPEG/WebP/PDF), 5 MB cap, random
      storage keys, owner-or-staff access, `nosniff` + `default-src 'none'` on download.
- [x] Path traversal blocked when resolving stored uploads.
- [x] Provider secrets encrypted at rest (AES-256-GCM) and masked in the admin UI.
- [x] Structured JSON logs; no passwords, tokens or card data logged.
- [x] CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` set
      globally in `next.config.ts`.
- [x] Same-origin check (`assertSameOrigin`) on state-changing API routes as CSRF defence.
- [ ] **Needs config:** at-rest database encryption, automated backups, log retention policy.

## Abuse & operations

- [x] Per-route rate limiting on auth, quotes, orders, payments, support, uploads, admin.
- [x] `/api/health` exposes status without secrets and returns 503 when the DB is down.
- [x] `/api/cron/tick` requires `CRON_SECRET` (Bearer or query secret).
- [x] Dead-letter queue for jobs that exhaust retries; staff alerts on permanent failures.
- [x] Payment expiry sweep (60 min) and stuck-order sweep (`pending_provider`).
- [ ] **Not implemented:** WAF/CDN rules, bot detection, CAPTCHA, Sentry/uptime monitoring.
- [ ] **Not implemented:** independent penetration test. Do not claim one.

## Deployment hygiene

- [x] Secrets only via environment variables; `.env*` gitignored (except `.env.example`).
- [x] `DEMO_MODE` refuses to be silently enabled; production with mock payments demands an
      explicit demo flag and logs a loud warning.
- [x] PGlite refuses to start when `NODE_ENV=production`.
- [x] Docker image runs as a non-root user with a health check.
- [x] Dependency versions pinned exactly; `npm ci` used in CI/Docker.
- [ ] **Needs config:** `npm audit` in CI, secret rotation schedule, least-privilege DB user.
