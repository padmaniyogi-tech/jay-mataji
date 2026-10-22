# Deployment guide

Two supported topologies:

1. **Single container + managed Postgres** (simplest): `next start` plus one worker process.
2. **docker compose** (this repo ships `docker-compose.yml`): app + worker + Postgres 16.

## 0. Prerequisites

- Node.js >= 20.9 (22 LTS recommended) for bare-metal; Docker 24+ for containers.
- A Postgres 15/16 database (Supabase, Neon, RDS, Cloud SQL, or self-hosted).
- A public HTTPS URL. Cookies are marked `Secure` when `APP_URL` starts with `https://`.
- Optional but required for real money: Razorpay merchant account (KYC approved).
- Optional but required for real email: SMTP provider with a verified sender domain.

## 1. Environment variables

Copy `.env.example` to `.env` (or paste the variables into your host's secret manager).

**Required in production**

| Variable | Notes |
| --- | --- |
| `NODE_ENV` | `production` |
| `APP_URL` | Public HTTPS origin, no trailing slash |
| `DATABASE_URL` | Postgres connection string with SSL |
| `SESSION_SECRET` | 32+ random bytes; rotating it signs everyone out |
| `ENCRYPTION_KEY` | 32-byte base64/hex key used for provider credentials |
| `CRON_SECRET` | Random string; authenticates the scheduler |
| `PAYMENTS_PROVIDER` | `razorpay` |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Gateway keys |
| `RAZORPAY_WEBHOOK_SECRET` | Must match the dashboard webhook secret |
| `EMAIL_PROVIDER` | `smtp` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Provider credentials |
| `EMAIL_FROM` | Verified sender |
| `DEMO_MODE` | Must be unset or `false` |

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

`ENCRYPTION_KEY` must remain stable: changing it makes stored provider credentials
unreadable (re-enter them after rotation).

## 2. Database

```bash
npm ci
npm run db:migrate      # applies drizzle/*.sql exactly once, tracked in __migrations
```

`db:migrate` is safe to run on every release. Never enable automatic DDL in production;
the app only auto-migrates when `NODE_ENV !== "production"`.

Optional demo data (**never on a live instance**):

```bash
npm run db:seed
```

## 3. Build & run

```bash
npm run build
npm run start           # 0.0.0.0:3000
```

Run the worker as a separate process (same image, different command):

```bash
npm run worker
```

If you cannot run a long-lived worker, schedule:

```bash
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/tick
```

every minute (Vercel Cron, GitHub Actions, systemd timer, Kubernetes CronJob). The endpoint
runs one worker batch and sweeps orders stuck in `pending_provider`.

## 4. Docker

```bash
cp .env.example .env        # fill in POSTGRES_PASSWORD, SESSION_SECRET, APP_URL…
docker compose build
docker compose up -d
docker compose exec app npm run db:migrate
docker compose logs -f app worker
```

The app container health-checks `/api/health`; the worker shares the same env.

## 5. Reverse proxy / TLS

Terminate TLS at your proxy (Caddy/Nginx/ALB) and forward to port 3000. Preserve the
`Host` header and set `X-Forwarded-Proto`. The app sets its own security headers, so do not
strip `Content-Security-Policy`.

## 6. Razorpay webhook

Dashboard → Settings → Webhooks:

- URL: `https://your-domain/api/webhooks/razorpay`
- Secret: same value as `RAZORPAY_WEBHOOK_SECRET`
- Events: `payment.captured`, `payment.failed`, `refund.processed`

Test it:

```bash
curl -i -X POST https://your-domain/api/webhooks/razorpay -H 'content-type: application/json' -d '{}'
# expect 400 invalid signature (proves verification is active)
```

## 7. Backups & restores

- Enable automated daily backups + point-in-time recovery on the managed database.
- Keep at least 7 daily and 4 weekly copies outside the primary region.
- **Test a restore quarterly**: restore to staging, run `npm run db:migrate`, then
  `npm run verify` and one order smoke test.
- Uploads live on disk in `.data/uploads`; if you scale horizontally, move them to object
  storage before adding a second app instance.

## 8. Rollback

```bash
docker compose down
git checkout <previous-tag>
docker compose build && docker compose up -d
npm run db:migrate
```

Database migrations are forward-only. A rollback requires restoring the matching backup;
plan destructive column changes as two releases (expand, then contract).

## 9. Monitoring

- Point an uptime monitor at `/api/health` (expects HTTP 200 and `status: ok`).
- Ship stdout JSON logs to your log platform; alert on `"level":"error"`.
- Alert on rows in `jobs` with `status = 'dead'` and on `audit_logs` actions
  `refund.failed` / `provider.health_checked` with a non-healthy status.

## 10. Post-deploy checklist

- [ ] `GET /api/health` returns `status: ok`
- [ ] Register a fresh account, receive the verification email, verify it
- [ ] Customer flow with a mock or ₹1 test payment completes
- [ ] Worker processed the order (status moved past `paid`)
- [ ] Admin console loads, provider health check runs
- [ ] `POST /api/cron/tick` without `CRON_SECRET` returns 401
- [ ] `DEMO_MODE` is false and no "DEMO DATA" badge appears on real orders
