import { z } from "zod";
import { getEnv } from "@/lib/env";
import { ProviderPermanentError, ProviderTransientError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { verifyHmacSha256 } from "@/lib/crypto";
import type { Provider } from "@/lib/db/schema";
import type {
  AvailabilityResult,
  CampaignState,
  CampaignStatusReport,
  CampaignSubmission,
  CampaignSubmissionInput,
  DeliveryEvidence,
  HealthResult,
  ProviderAdapter,
  ProviderCapability,
  ProviderQuote,
  ValidationInput,
  ValidationResult,
  WebhookRequest,
  WebhookResult,
} from "./types";

/**
 * APPROVED EXTERNAL PROMOTIONAL AGENCY PROVIDER.
 *
 * This adapter speaks a documented, versioned partner contract (docs/provider-onboarding.md):
 *
 *   GET  {base}/health
 *   POST {base}/v1/campaigns                    (Authorization: Bearer, Idempotency-Key)
 *   GET  {base}/v1/campaigns/{id}
 *   POST {base}/v1/campaigns/{id}/cancel
 *   GET  {base}/v1/campaigns/{id}/evidence
 *   POST {base}/webhooks/campaign              (X-Signature: hex HMAC-SHA256 of raw body)
 *
 * It is NOT enabled until a partner has signed terms, supplied sandbox credentials and
 * passed a test campaign. Until then `isConfigured()` is false and routing skips it.
 * Nothing here invents an endpoint: partners must implement this contract.
 */
const campaignSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  deliveredQuantity: z.number().int().nonnegative().nullable().optional(),
  baselineCount: z.number().int().nonnegative().nullable().optional(),
  latestCount: z.number().int().nonnegative().nullable().optional(),
  metric: z.string().optional(),
  reportUrl: z.string().url().optional(),
  notes: z.array(z.string()).optional(),
  finishedAt: z.string().optional(),
});

type AgencyCampaign = z.infer<typeof campaignSchema>;

const STATUS_MAP: Record<string, CampaignState> = {
  pending: "pending",
  accepted: "pending",
  active: "active",
  running: "active",
  paused: "paused",
  delivered: "delivered",
  completed: "delivered",
  partially_delivered: "partially_delivered",
  failed: "failed",
  cancelled: "cancelled",
};

export class AgencyProviderAdapter implements ProviderAdapter {
  readonly key: string;
  readonly name: string;
  readonly providerKind = "agency" as const;
  readonly config: Provider["config"];

  constructor(provider: Pick<Provider, "key" | "name" | "config">) {
    this.key = provider.key;
    this.name = provider.name;
    this.config = provider.config ?? {};
  }

  private env() {
    return getEnv();
  }

  isConfigured(): boolean {
    const env = this.env();
    return Boolean(env.AGENCY_API_BASE_URL && env.AGENCY_API_KEY);
  }

  capabilities(): ProviderCapability {
    return {
      kinds: ["followers", "likes", "content_promotion", "influencer_promotion", "advertising_campaign", "reel_views", "video_views"],
      guaranteesQuantity: false,
      requiresManualApproval: true,
      evidenceSource: "provider_report",
      notes: [
        "Only enabled after partner onboarding and a verified sandbox submission.",
        "Delivery is reported by the partner; this platform records it as provider-reported evidence and never as guaranteed engagement.",
        "Partner must supply a signed delivery report for reconciliation.",
      ],
    };
  }

  private async call(
    path: string,
    init: { method?: "GET" | "POST"; body?: unknown; idempotencyKey?: string } = {},
  ): Promise<unknown> {
    const env = this.env();
    if (!this.isConfigured()) throw new ProviderPermanentError("Agency provider is not configured.", "agency_unconfigured");
    const base = env.AGENCY_API_BASE_URL!.replace(/\/$/, "");
    const method = init.method ?? (init.body ? "POST" : "GET");
    const headers: Record<string, string> = {
      authorization: `Bearer ${env.AGENCY_API_KEY}`,
      accept: "application/json",
      "user-agent": "amplifi-platform/1.0",
    };
    if (init.body !== undefined) headers["content-type"] = "application/json";
    if (init.idempotencyKey) headers["idempotency-key"] = init.idempotencyKey;

    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      });
    } catch (err) {
      throw new ProviderTransientError(`Agency API network error: ${(err as Error).message}`, "agency_network");
    }
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const message =
        (json as { error?: { message?: string } } | null)?.error?.message ?? `Agency API HTTP ${res.status}`;
      const transient = res.status === 429 || res.status >= 500;
      logger.warn("agency_api_error", { status: res.status, path });
      if (transient) throw new ProviderTransientError(message, "agency_transient");
      throw new ProviderPermanentError(message, `agency_${res.status}`);
    }
    return json;
  }

  async validateRequest(input: ValidationInput): Promise<ValidationResult> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        reason:
          "No promotional partner is connected for this service. Configure an approved agency (AGENCY_API_BASE_URL + AGENCY_API_KEY) to enable automatic submission.",
        permanent: true,
      };
    }
    if (input.quantity <= 0) return { ok: false, reason: "Quantity must be positive.", permanent: true };
    return { ok: true, warnings: ["Partner-reported delivery; counts are not guaranteed and are reconciled against the partner report."] };
  }

  async checkAvailability(): Promise<AvailabilityResult> {
    if (!this.isConfigured()) return { available: false, health: "unconfigured", reason: "Agency provider not configured." };
    try {
      const health = (await this.call("/health", { method: "GET" })) as { status?: string };
      return health?.status === "ok"
        ? { available: true, health: "healthy" }
        : { available: false, health: "degraded", reason: "Partner health endpoint reports a degraded state." };
    } catch (err) {
      return { available: false, health: "down", reason: (err as Error).message };
    }
  }

  async calculateQuote(input: { quantity: number }): Promise<ProviderQuote> {
    const unit = Number(this.config.costPerUnitPaise ?? 0);
    return {
      costPaise: unit * input.quantity + Number(this.config.fixedCostPaise ?? 0),
      estimatedDurationHours: Number(this.config.estimatedDurationHours ?? 120),
      currency: "INR",
    };
  }

  async createCampaign(input: CampaignSubmissionInput): Promise<CampaignSubmission> {
    const raw = await this.call("/v1/campaigns", {
      body: {
        externalOrderId: input.orderPublicId,
        service: input.service.kind,
        targetUrl: input.target.normalizedUrl,
        targetType: input.target.kind,
        quantity: input.quantity,
        audienceCountry: input.audienceCountry ?? "IN",
        brief: input.brief ?? null,
      },
      idempotencyKey: input.idempotencyKey,
    });
    const parsed = campaignSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ProviderPermanentError(
        `Agency response did not match the required contract: ${parsed.error.issues[0]?.message ?? "unknown"}`,
        "agency_bad_response",
      );
    }
    return {
      providerRef: parsed.data.id,
      state: STATUS_MAP[parsed.data.status] === "active" ? "active" : "submitted",
      requiresStaffAction: STATUS_MAP[parsed.data.status] === "pending",
      submittedAt: new Date(),
      raw: parsed.data as unknown as Record<string, unknown>,
      message: parsed.data.notes?.[0] ?? `Partner accepted the campaign (status: ${parsed.data.status}).`,
    };
  }

  private async fetchCampaign(providerRef: string): Promise<AgencyCampaign> {
    const raw = await this.call(`/v1/campaigns/${encodeURIComponent(providerRef)}`, { method: "GET" });
    const parsed = campaignSchema.safeParse(raw);
    if (!parsed.success) throw new ProviderPermanentError("Agency status response did not match the contract.", "agency_bad_response");
    return parsed.data;
  }

  async getCampaignStatus(providerRef: string): Promise<CampaignStatusReport> {
    const campaign = await this.fetchCampaign(providerRef);
    const state = STATUS_MAP[campaign.status] ?? "pending";
    return {
      state,
      deliveredQuantity: campaign.deliveredQuantity ?? null,
      providerRef,
      message: campaign.notes?.[0],
      finishedAt: campaign.finishedAt ? new Date(campaign.finishedAt) : undefined,
      evidence: {
        source: "provider_report",
        verified: false,
        demo: false,
        capturedAt: new Date(),
        metric: campaign.metric ?? "provider_reported",
        providerReportedQuantity: campaign.deliveredQuantity ?? null,
        verifiedQuantity: null,
        baselineCount: campaign.baselineCount ?? null,
        latestCount: campaign.latestCount ?? null,
        notes: [
          "Figures are partner-reported. Verified counts require the partner's signed delivery report.",
          ...(campaign.notes ?? []),
        ],
        raw: { campaign: campaign as unknown as Record<string, unknown>, reportUrl: campaign.reportUrl ?? null },
      },
    };
  }

  async cancelCampaign(providerRef: string): Promise<{ cancelled: boolean; message: string }> {
    const raw = (await this.call(`/v1/campaigns/${encodeURIComponent(providerRef)}/cancel`, { body: {} })) as {
      cancelled?: boolean;
      message?: string;
    };
    return { cancelled: raw?.cancelled === true, message: raw?.message ?? "Cancellation request sent to partner." };
  }

  async getDeliveryEvidence(providerRef: string): Promise<DeliveryEvidence> {
    const raw = await this.call(`/v1/campaigns/${encodeURIComponent(providerRef)}/evidence`, { method: "GET" });
    return {
      source: "provider_report",
      verified: Boolean((raw as { verified?: boolean })?.verified),
      demo: false,
      capturedAt: new Date(),
      metric: String((raw as { metric?: string })?.metric ?? "provider_reported"),
      providerReportedQuantity: Number((raw as { deliveredQuantity?: number })?.deliveredQuantity ?? 0) || null,
      verifiedQuantity: Number((raw as { verifiedQuantity?: number })?.verifiedQuantity ?? 0) || null,
      baselineCount: null,
      latestCount: null,
      notes: ["Partner delivery evidence.", ...((raw as { notes?: string[] })?.notes ?? [])],
      raw: raw as Record<string, unknown>,
    };
  }

  async handleWebhook(request: WebhookRequest): Promise<WebhookResult> {
    const secret = this.env().AGENCY_WEBHOOK_SECRET;
    if (!secret) {
      return { handled: false, externalId: "unverified", signatureValid: false, message: "AGENCY_WEBHOOK_SECRET is not set." };
    }
    const signature = request.headers.get("x-signature") ?? "";
    const valid = verifyHmacSha256(request.rawBody, secret, signature);
    if (!valid) return { handled: false, externalId: "invalid", signatureValid: false, message: "Invalid signature." };
    const id = String(request.parsed?.id ?? request.parsed?.campaignId ?? "");
    if (!id) return { handled: false, externalId: "missing", signatureValid: true, message: "Missing webhook id." };
    return {
      handled: true,
      externalId: id,
      signatureValid: true,
      orderPublicId: typeof request.parsed?.externalOrderId === "string" ? request.parsed.externalOrderId : undefined,
      message: "Partner webhook accepted.",
    };
  }

  async healthCheck(): Promise<HealthResult> {
    if (!this.isConfigured()) {
      return {
        status: "unconfigured",
        message: "Agency provider inactive. Complete partner onboarding and set AGENCY_API_BASE_URL + AGENCY_API_KEY.",
        checkedAt: new Date(),
      };
    }
    try {
      const health = (await this.call("/health", { method: "GET" })) as { status?: string; message?: string };
      return {
        status: health?.status === "ok" ? "healthy" : "degraded",
        message: health?.message ?? `Partner health: ${health?.status ?? "unknown"}`,
        checkedAt: new Date(),
      };
    } catch (err) {
      return { status: "down", message: (err as Error).message, checkedAt: new Date() };
    }
  }
}
