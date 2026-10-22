import { ProviderPermanentError, ProviderTransientError } from "@/lib/errors";
import type { Provider } from "@/lib/db/schema";
import type {
  AvailabilityResult,
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
 * DEMO SIMULATION PROVIDER — never touches Instagram.
 *
 * It exists so the full order → payment → routing → progress → report workflow can be
 * exercised without spending money or connecting a partner. Every measurement it emits is
 * tagged `demo: true` with `source: "demo_simulation"`; the UI must render it with the
 * "DEMO DATA — NOT REAL INSTAGRAM ENGAGEMENT" label.
 *
 * QA controls (add to the campaign brief):
 *   [fail]     → permanent submission failure
 *   [retry]    → first submission fails transiently, second succeeds
 *   [partial]  → delivers 60% of the target then finishes
 *   [stuck]    → never progresses past activation (timeout / stale-order testing)
 *
 * The provider reference carries everything needed to compute progress, so the simulation
 * is stateless and every poll/webhook agrees: mock_<orderPublicId>_<epochSeconds>_<qty>_<scenario>
 */

export type MockScenario = "success" | "partial" | "stuck";

function parseRef(ref: string): { publicId: string; startedAt: Date; quantity: number; scenario: MockScenario } {
  const parts = ref.split("_");
  if (parts.length < 5 || parts[0] !== "mock") throw new ProviderPermanentError(`Invalid demo provider reference: ${ref}`);
  const [, publicId, epoch, qty, scenario] = parts as [string, string, string, string, string];
  const quantity = Number(qty);
  const startedAt = new Date(Number(epoch) * 1000);
  if (!publicId || !Number.isFinite(quantity) || Number.isNaN(startedAt.getTime())) {
    throw new ProviderPermanentError(`Malformed demo provider reference: ${ref}`);
  }
  return {
    publicId,
    startedAt,
    quantity,
    scenario: (["success", "partial", "stuck"] as const).includes(scenario as MockScenario)
      ? (scenario as MockScenario)
      : "success",
  };
}

export class MockProviderAdapter implements ProviderAdapter {
  readonly key: string;
  readonly name: string;
  readonly providerKind = "mock" as const;
  readonly config: Provider["config"];
  private min: number;
  private max: number;

  constructor(provider: Pick<Provider, "key" | "name" | "config" | "minQuantity" | "maxQuantity">) {
    this.key = provider.key;
    this.name = provider.name;
    this.config = provider.config ?? {};
    this.min = provider.minQuantity;
    this.max = provider.maxQuantity;
  }

  private num(key: string, fallback: number): number {
    const raw = this.config[key];
    const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : fallback;
  }

  get simulationSeconds(): number {
    return Math.max(this.num("simulationSeconds", 90), 10);
  }

  isConfigured(): boolean {
    return true;
  }

  capabilities(): ProviderCapability {
    return {
      kinds: [
        "followers",
        "reel_views",
        "video_views",
        "likes",
        "content_promotion",
        "advertising_campaign",
      ],
      guaranteesQuantity: true,
      requiresManualApproval: false,
      evidenceSource: "demo_simulation",
      notes: [
        "DEMO ONLY: simulates progress. It never accesses Instagram or generates real engagement.",
        "Enable only in demo mode or for QA; results are always labelled DEMO DATA.",
      ],
    };
  }

  async validateRequest(input: ValidationInput): Promise<ValidationResult> {
    if (!input.orderPublicId) return { ok: false, reason: "Missing order reference.", permanent: true };
    if (input.quantity < this.min || input.quantity > this.max) {
      return { ok: false, reason: `Demo provider accepts between ${this.min} and ${this.max} units.`, permanent: true };
    }
    return { ok: true, warnings: ["Simulated delivery — no real Instagram activity will occur."] };
  }

  async checkAvailability(): Promise<AvailabilityResult> {
    return { available: true, health: "healthy" };
  }

  async calculateQuote(input: { quantity: number }): Promise<ProviderQuote> {
    return {
      costPaise: 0,
      estimatedDurationHours: Math.max(Math.ceil(this.simulationSeconds / 3600), 1),
      currency: "INR",
      breakdown: { note: "Demo provider — no provider cost.", simulatedUnits: input.quantity },
    };
  }

  async createCampaign(input: CampaignSubmissionInput): Promise<CampaignSubmission> {
    const brief = input.brief ?? "";
    if (brief.includes("[retry]") && input.attempt === 0) {
      throw new ProviderTransientError("Simulated transient provider timeout (demo scenario [retry]).");
    }
    if (brief.includes("[fail]")) {
      throw new ProviderPermanentError("Simulated provider rejection (demo scenario [fail]).");
    }
    const scenario: MockScenario = brief.includes("[partial]") ? "partial" : brief.includes("[stuck]") ? "stuck" : "success";
    const epoch = Math.floor(Date.now() / 1000);
    return {
      providerRef: `mock_${input.orderPublicId}_${epoch}_${input.quantity}_${scenario}`,
      state: "active",
      submittedAt: new Date(epoch * 1000),
      raw: {
        demo: true,
        scenario,
        acknowledgedQuantity: input.quantity,
        idempotencyKey: input.idempotencyKey,
        note: "DEMO DATA — no request left this server.",
      },
      message: "Demo campaign accepted for simulation.",
    };
  }

  private compute(providerRef: string): {
    fraction: number;
    delivered: number;
    target: number;
    scenario: MockScenario;
    startedAt: Date;
  } {
    const { startedAt, quantity, scenario } = parseRef(providerRef);
    const effectiveQuantity = scenario === "partial" ? Math.floor(quantity * 0.6) : quantity;
    const elapsed = (Date.now() - startedAt.getTime()) / 1000;
    const fraction = scenario === "stuck" ? 0 : Math.min(Math.max(elapsed / this.simulationSeconds, 0), 1);
    return {
      fraction,
      delivered: Math.floor(effectiveQuantity * fraction),
      target: effectiveQuantity,
      scenario,
      startedAt,
    };
  }

  async getCampaignStatus(providerRef: string): Promise<CampaignStatusReport> {
    const { fraction, delivered, target, scenario, startedAt } = this.compute(providerRef);
    const finished = fraction >= 1;
    const evidence: DeliveryEvidence = {
      source: "demo_simulation",
      verified: false,
      demo: true,
      capturedAt: new Date(),
      metric: "simulated_units",
      providerReportedQuantity: delivered,
      verifiedQuantity: null,
      baselineCount: 0,
      latestCount: delivered,
      notes: [
        "DEMO DATA — NOT REAL INSTAGRAM ENGAGEMENT.",
        `Simulation started ${startedAt.toISOString()}; no external request was made.`,
      ],
      raw: { simulationSeconds: this.simulationSeconds, fraction, scenario },
    };

    if (finished) {
      return {
        state: scenario === "partial" ? "partially_delivered" : "delivered",
        deliveredQuantity: target,
        providerRef,
        evidence: { ...evidence, providerReportedQuantity: target, latestCount: target },
        finishedAt: new Date(startedAt.getTime() + this.simulationSeconds * 1000),
        message: scenario === "partial" ? "Demo simulation finished below target (partial)." : "Demo simulation finished.",
      };
    }

    return {
      state: fraction > 0 ? "active" : "pending",
      deliveredQuantity: delivered,
      providerRef,
      evidence,
      message:
        scenario === "stuck"
          ? "Demo scenario [stuck]: the campaign is intentionally not progressing."
          : `Demo simulation in progress (${Math.round(fraction * 100)}%).`,
    };
  }

  async cancelCampaign(providerRef: string): Promise<{ cancelled: boolean; message: string }> {
    parseRef(providerRef);
    return { cancelled: true, message: "Demo campaign stopped. No real campaign existed." };
  }

  async getDeliveryEvidence(providerRef: string): Promise<DeliveryEvidence> {
    const { fraction, delivered } = this.compute(providerRef);
    return {
      source: "demo_simulation",
      verified: false,
      demo: true,
      capturedAt: new Date(),
      metric: "simulated_units",
      providerReportedQuantity: delivered,
      verifiedQuantity: null,
      baselineCount: 0,
      latestCount: delivered,
      notes: ["DEMO DATA — NOT REAL INSTAGRAM ENGAGEMENT.", `Simulation fraction at capture: ${fraction.toFixed(2)}`],
      raw: { providerRef },
    };
  }

  async handleWebhook(request: WebhookRequest): Promise<WebhookResult> {
    const id = String(request.parsed?.id ?? "");
    if (!id) return { handled: false, externalId: "missing", signatureValid: false, message: "Missing demo webhook id." };
    const orderPublicId = typeof request.parsed?.orderPublicId === "string" ? request.parsed.orderPublicId : undefined;
    return { handled: true, externalId: id, signatureValid: true, orderPublicId, message: "Demo webhook accepted." };
  }

  async healthCheck(): Promise<HealthResult> {
    return {
      status: "healthy",
      message: "Demo provider ready. All output is simulated and labelled as such.",
      checkedAt: new Date(),
    };
  }
}
