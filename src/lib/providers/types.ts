import type { Provider, Service, measurementSourceEnum } from "@/lib/db/schema";
import type { InstagramTarget } from "@/lib/instagram";

export type MeasurementSource = (typeof measurementSourceEnum.enumValues)[number];

export type ProviderCapability = {
  /** Service kinds this adapter can legitimately deliver. */
  kinds: string[];
  /** True only when the mechanism can actually deliver the requested metric. */
  guaranteesQuantity: boolean;
  requiresManualApproval: boolean;
  /** How results are evidenced. "none" means no measurement is available. */
  evidenceSource: MeasurementSource;
  notes: string[];
};

export type ValidationInput = {
  orderPublicId: string;
  service: Pick<Service, "kind" | "minQuantity" | "maxQuantity" | "requiresContentUrl" | "requiresAudience">;
  target: InstagramTarget;
  quantity: number;
  audienceCountry?: string | null;
  brief?: string | null;
};

export type ValidationResult = { ok: true; warnings?: string[] } | { ok: false; reason: string; permanent: boolean };

export type AvailabilityResult = {
  available: boolean;
  reason?: string;
  health: "healthy" | "degraded" | "down" | "unconfigured";
};

export type ProviderQuote = {
  costPaise: number;
  estimatedDurationHours: number;
  currency: "INR";
  breakdown?: Record<string, string | number>;
};

export type CampaignSubmissionInput = {
  orderId: string;
  orderPublicId: string;
  idempotencyKey: string;
  attempt: number;
  service: Pick<Service, "kind" | "name" | "unitLabel">;
  target: InstagramTarget;
  quantity: number;
  audienceCountry?: string | null;
  brief?: string | null;
  baselineCount?: number | null;
};

export type CampaignSubmission = {
  providerRef: string;
  /** "submitted" leaves the campaign awaiting activation/staff action. */
  state: "submitted" | "active";
  requiresStaffAction?: boolean;
  raw: Record<string, unknown>;
  submittedAt: Date;
  message?: string;
};

export type CampaignState =
  | "pending"
  | "active"
  | "paused"
  | "delivered"
  | "partially_delivered"
  | "failed"
  | "cancelled";

export type DeliveryEvidence = {
  source: MeasurementSource;
  verified: boolean;
  demo: boolean;
  capturedAt: Date;
  metric: string;
  providerReportedQuantity: number | null;
  verifiedQuantity: number | null;
  baselineCount: number | null;
  latestCount: number | null;
  notes: string[];
  raw: Record<string, unknown>;
};

export type CampaignStatusReport = {
  state: CampaignState;
  deliveredQuantity: number | null;
  providerRef: string;
  evidence: DeliveryEvidence;
  message?: string;
  finishedAt?: Date;
};

export type WebhookRequest = {
  headers: Headers;
  rawBody: string;
  parsed: Record<string, unknown> | null;
};

export type WebhookResult = {
  handled: boolean;
  externalId: string;
  signatureValid: boolean;
  orderPublicId?: string;
  message?: string;
};

export type HealthResult = {
  status: "healthy" | "degraded" | "down" | "unconfigured";
  message: string;
  checkedAt: Date;
};

/**
 * Every delivery mechanism implements this contract. Adapters must be explicit about
 * what they can and cannot measure — see `capabilities()` and docs/provider-onboarding.md.
 */
export interface ProviderAdapter {
  readonly key: string;
  readonly name: string;
  readonly providerKind: Provider["kind"];
  readonly config: Provider["config"];

  isConfigured(): boolean;
  capabilities(): ProviderCapability;
  validateRequest(input: ValidationInput): Promise<ValidationResult>;
  checkAvailability(input: {
    serviceKind: string;
    quantity: number;
  }): Promise<AvailabilityResult>;
  calculateQuote(input: { serviceKind: string; quantity: number }): Promise<ProviderQuote>;
  createCampaign(input: CampaignSubmissionInput): Promise<CampaignSubmission>;
  getCampaignStatus(providerRef: string): Promise<CampaignStatusReport>;
  cancelCampaign(providerRef: string): Promise<{ cancelled: boolean; message: string }>;
  getDeliveryEvidence(providerRef: string): Promise<DeliveryEvidence>;
  handleWebhook(request: WebhookRequest): Promise<WebhookResult>;
  healthCheck(): Promise<HealthResult>;
}

export function emptyEvidence(notes: string[] = ["No measurement available from this provider."]): DeliveryEvidence {
  return {
    source: "unavailable",
    verified: false,
    demo: false,
    capturedAt: new Date(),
    metric: "unavailable",
    providerReportedQuantity: null,
    verifiedQuantity: null,
    baselineCount: null,
    latestCount: null,
    notes,
    raw: {},
  };
}
