# Provider onboarding guide

Amplifi routes every paid order to a **provider adapter**. Adapters are the only place
that talks to an external delivery system, and each one must be honest about what it can
and cannot measure.

## 1. The adapter contract

`src/lib/providers/types.ts` defines `ProviderAdapter`:

```ts
interface ProviderAdapter {
  readonly kind: ProviderKind;                       // mock | manual | meta | agency
  capabilities(): AdapterCapabilities;               // kinds, min/max, ETA, measurement
  isConfigured(): boolean;                           // credentials + config present
  healthCheck(): Promise<HealthResult>;              // healthy | degraded | down | unconfigured
  validateRequest(input): Promise<ValidationResult>; // eligibility, URL shape, quantity
  checkAvailability(input): Promise<AvailabilityResult>;
  calculateQuote(input): Promise<ProviderQuote>;     // internal cost, never the customer price
  createCampaign(input): Promise<CreateCampaignResult>;
  getCampaignStatus(ref): Promise<CampaignStatusResult>;
  cancelCampaign(ref): Promise<CancelResult>;
  getDeliveryEvidence(ref): Promise<DeliveryEvidence>;
  handleWebhook(payload, headers): Promise<WebhookResult>;
}
```

Rules:

- **Costs are internal.** Customer pricing is decided server-side in `src/lib/pricing.ts`
  and stored on the order. A provider can never set the amount charged.
- **Evidence is explicit.** `DeliveryEvidence.source` must be one of
  `provider_api | provider_report | manual_verification | demo_simulation | unavailable`.
  If the platform cannot measure something, return `unavailable` — the UI then renders
  “Metric unavailable”. Do not estimate.
- **Idempotency is mandatory.** `createCampaign` receives an idempotency key
  (`<orderPublicId>:<providerId>`). Store and honour it; repeated submissions must return
  the same provider reference.
- **No secrets in logs.** Credentials live encrypted in `providers.encrypted_credentials`
  (AES-256-GCM). Never log tokens, never return them to the browser.

## 2. Adding an adapter

1. Create `src/lib/providers/<name>.ts` implementing `ProviderAdapter`.
2. Register it in `src/lib/providers/registry.ts` (`createAdapter`).
3. Add the provider row via the seed file or a migration
   (`providers.supported_kinds`, min/max quantity, priority, reliability).
4. Add env vars to `src/lib/env.ts` **as optional** and to `.env.example`.
5. Document in `docs/external-setup.md` what the adapter can and cannot deliver.
6. Add tests using recorded fixtures — never hit the live API in CI.

## 3. Become "live"

An adapter is live only when **all** of the following are true:

- [ ] Credentials are set in the deployment's secret store (not in git).
- [ ] `isConfigured()` returns true and the admin health check shows `healthy`.
- [ ] One real end-to-end campaign completed: submit → webhook/poll → evidence → reconcile.
- [ ] Duplicate submissions and duplicate webhooks were tested and are ignored.
- [ ] Failure paths tested: timeout, 4xx, 5xx, partial delivery.
- [ ] `docs/external-setup.md` updated with the date and the person who verified it.

Until then the provider row must stay `enabled = false`. The routing engine skips disabled
or unconfigured providers, and orders fall back to `pending_provider` with a staff alert —
never to a fake success.

## 4. Webhooks

- Agency: `POST /api/webhooks/agency`, `X-Signature: sha256=<hmac>` over the raw body,
  secret `AGENCY_WEBHOOK_SECRET`.
- Meta: `GET /api/webhooks/meta` handshake (`hub.verify_token` =
  `META_WEBHOOK_VERIFY_TOKEN`), `POST` with `X-Hub-Signature-256`.
- Razorpay: `POST /api/webhooks/razorpay`, `X-Razorpay-Signature` HMAC-SHA256.

Every webhook is recorded in `webhooks` with a unique `(source, external_id)` pair before
processing, so replays return `{ duplicate: true }` and are never applied twice. Invalid
signatures are recorded but never processed.

## 5. Reconciliation

`reconcileProviderRef()` maps a provider reference back to an order and enqueues a poll.
For agencies, send the order's `publicId` in `metadata.orderPublicId` to make matching
deterministic.
