# External credentials & approvals — what is real, mocked or blocked

This file is the single source of truth for integration status. **Nothing here may be
described to a customer as "live" until the stated test has actually been performed.**

| Area | Status in this repository | What is required to go live | Verification test |
| --- | --- | --- | --- |
| Payments (Razorpay) | **Implemented, not activated.** `PAYMENTS_PROVIDER=mock` by default. Razorpay SDK path, order creation, signature verification and webhook idempotency are implemented and unit-checked. | Razorpay merchant account + KYC approval, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, webhook URL `https://your-domain/api/webhooks/razorpay`. | Create a ₹1 test payment in test mode, confirm the webhook marks the order `paid`, then replay the same webhook and confirm `duplicate: true`. |
| Email (SMTP) | **Implemented, console by default.** Emails are written to `.data/mail/*.eml` in development. | SMTP/API provider (Resend, SES, Postmark, Fastmail…) + sender domain verification (SPF/DKIM). | Register an account, receive the verification email, click the link, see `emailVerifiedAt` set. |
| Instagram Graph / Meta Ads | **Adapter implemented, unconfigured.** It refuses to run without a token, ad account and page id, and it can only buy *authorized advertising* (reach/impressions/video views/engagement on ads you own or are authorized to run). | Meta app review, `ads_management` + `instagram_basic` permissions, an ad account with a payment method, a connected Instagram professional account, and approval to run ads on the customer's behalf. | Create a tiny campaign from the admin console, receive the Meta webhook, and reconcile `providerRef` → status. |
| Instagram profile/post metrics | **Not available.** The Instagram Graph API does not allow third-party follower/like/comment injection, and private profile analytics are not exposed to us. | Nothing legitimate. This platform must not promise these numbers. | N/A — the UI shows "Metric unavailable" and the report explains why. |
| Follower / like / view "delivery" | **Not offered by any live adapter.** The only implementation is the demo simulator, which is hard-blocked outside `DEMO_MODE`. | A lawful, contractually authorized provider (e.g. a brand/creator partnership or an approved agency) that can deliver and evidence the service. | Contract + written authorization + provider API/webhook documentation. |
| Approved external agency adapter | **Implemented, unconfigured.** Requires HMAC-signed webhooks and an HTTPS API base URL. | Signed commercial agreement, agency API credentials, `AGENCY_WEBHOOK_SECRET`, agreed evidence format. | Submit a real order to the agency sandbox and reconcile its callback. |
| Influencer / creator assignment | **Manual workflow only.** Staff assign a vetted creator and record evidence manually in the admin console. | Signed creator agreement per campaign, disclosure compliance (#ad / paid partnership). | Staff records delivery, customer sees `manual_verification` evidence. |
| SMS / WhatsApp notifications | **Not implemented.** | Provider account + template approval. | N/A |
| Analytics (>basic) | **Not implemented.** No third-party analytics or pixel is loaded. | Consent tooling + DPA before adding any vendor. | N/A |
| Uptime / error monitoring | **Not implemented.** Structured JSON logs and `/api/health` exist. | Sentry (or equivalent) DSN and an uptime monitor pointed at `/api/health`. | Trigger a handled error and confirm it appears in the monitor. |
| Object storage for uploads | **Local disk stub.** Files are written under `.data/uploads` with owner-only access. | S3-compatible bucket + signed URLs (swap `src/lib/uploads.ts`). | Upload evidence as a customer, confirm another customer gets 404. |
| Backups / PITR | **Documented only.** | Managed Postgres with automated backups + tested restore. | Restore into staging and run `npm run db:migrate` + smoke test. |

## Hard rules this platform follows

1. Never ask for an Instagram password, session cookie, OTP or access token.
2. Never create fake accounts, bot networks, or automated follows/likes/comments/views.
3. Never scrape Instagram or call undocumented endpoints.
4. Never present simulated data as real engagement — demo rows carry
   `measurementSource = demo_simulation` and the UI renders
   **DEMO DATA — NOT REAL INSTAGRAM ENGAGEMENT**.
5. Never claim a provider integration is live before credentials, calls and webhooks are
   tested and the health check turns `healthy`.
6. Never guarantee follower counts, likes, views or virality.


## Public demo (`/demo`) and what "real delivery" means

The public demo page is a **simulation only**. It is safe to expose because:

- it writes to `demo_runs`, a table with no user, payment, invoice or provider reference;
- its progress is a timer, never a measurement of an Instagram account;
- it cannot place orders or reach any delivery adapter.

`getRealDeliveryStatus()` in `src/lib/demo/service.ts` decides whether the page may say real
delivery is available. It returns `available: true` only when a provider row is **enabled**,
**healthy**, of kind `meta_ads` or `agency`, and lists `followers` in `supported_kinds`.
The bundled `mock` (simulator) and `manual` (staff assignment) providers are explicitly
excluded — neither can add followers to an account.

To ever claim real follower delivery you must:

1. Contract a legitimate provider (Meta ad campaign or an approved agency) and configure its
   credentials through the admin console (stored encrypted) or environment variables.
2. Run a health check until the provider reports `healthy`.
3. Place one real, paid test order and independently verify the delivered result
   (provider evidence + an actual profile measurement). Until that verification exists,
   `verifiedCount` stays `null` and the UI prints **"Metric unavailable"**.
