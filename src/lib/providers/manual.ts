import { eq, sql } from "drizzle-orm";
import { db, getDbAsync } from "@/lib/db";
import { orders, type Provider } from "@/lib/db/schema";
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
  WebhookResult,
} from "./types";
import { emptyEvidence } from "./types";

/**
 * MANUAL INFLUENCER / CREATOR ASSIGNMENT PROVIDER.
 *
 * Used for services that genuinely need a human: creator collaborations, sponsored posts,
 * campaign briefs. The "integration" is an internal assignment queue: an order routed here
 * becomes `pending_review`, staff assign a vetted creator, then record what the creator
 * actually delivered (with screenshot/URL evidence) in the admin order view.
 *
 * It is honest by construction: nothing is reported as delivered until a staff member
 * records verification, and the source is marked `manual_verification`.
 */
export class ManualProviderAdapter implements ProviderAdapter {
  readonly key: string;
  readonly name: string;
  readonly providerKind = "manual" as const;
  readonly config: Provider["config"];

  constructor(provider: Pick<Provider, "key" | "name" | "config">) {
    this.key = provider.key;
    this.name = provider.name;
    this.config = provider.config ?? {};
  }

  isConfigured(): boolean {
    return Boolean(this.config.teamEmail ?? true);
  }

  capabilities(): ProviderCapability {
    return {
      kinds: ["followers", "likes", "content_promotion", "influencer_promotion", "advertising_campaign", "reel_views", "video_views"],
      // Human-delivered campaigns never guarantee an exact count.
      guaranteesQuantity: false,
      requiresManualApproval: true,
      evidenceSource: "manual_verification",
      notes: [
        "Staff assign an approved creator/influencer and record verified deliverables.",
        "No follower, view or like count can be guaranteed by a creator collaboration.",
        "Requires an active partner network and signed campaign terms before enabling in production.",
      ],
    };
  }

  async validateRequest(input: ValidationInput): Promise<ValidationResult> {
    if (!input.brief || input.brief.trim().length < 20) {
      return {
        ok: false,
        reason: "Influencer and promotion campaigns need a campaign brief of at least 20 characters.",
        permanent: false,
      };
    }
    return { ok: true, warnings: ["A creator will be assigned by our campaign team; results are reported as measured, not guaranteed."] };
  }

  async checkAvailability(input: { serviceKind: string; quantity: number }): Promise<AvailabilityResult> {
    const maxBriefs = Number(this.config.maxConcurrentBriefs ?? 25);
    if (input.quantity > maxBriefs * 100_000) {
      return { available: false, reason: "Requested scale exceeds current creator network capacity.", health: "degraded" };
    }
    return { available: true, health: "healthy" };
  }

  async calculateQuote(_input: { quantity: number }): Promise<ProviderQuote> {
    return {
      costPaise: 0,
      estimatedDurationHours: Number(this.config.estimatedDurationHours ?? 168),
      currency: "INR",
      breakdown: { note: "Creator costs are quoted per assignment by the campaign team." },
    };
  }

  async createCampaign(input: CampaignSubmissionInput): Promise<CampaignSubmission> {
    return {
      providerRef: `manual_${input.orderPublicId}`,
      state: "submitted",
      requiresStaffAction: true,
      submittedAt: new Date(),
      raw: {
        assignmentQueue: "influencer_ops",
        briefLength: input.brief?.length ?? 0,
        requestedQuantity: input.quantity,
        note: "Awaiting creator assignment by the campaign team.",
      },
      message: "Brief received. A campaign manager will assign a creator and update this order.",
    };
  }

  private async loadOrder(providerRef: string) {
    await getDbAsync();
    const publicId = providerRef.replace(/^manual_/, "");
    const rows = await db.select().from(orders).where(eq(orders.publicId, publicId)).limit(1);
    return rows[0] ?? null;
  }

  async getCampaignStatus(providerRef: string): Promise<CampaignStatusReport> {
    const order = await this.loadOrder(providerRef);
    if (!order) {
      return {
        state: "failed",
        deliveredQuantity: null,
        providerRef,
        evidence: emptyEvidence(["Manual assignment not found."]),
        message: "Assignment not found.",
      };
    }
    const verified = order.verifiedCount;
    const target = order.quantity;
    const notes = [
      "Manual verification by the campaign team — no automatic Instagram measurement is used.",
      order.adminNotes ? `Staff note: ${order.adminNotes}` : "Staff note: none yet.",
    ];
    const evidence: DeliveryEvidence = {
      source: "manual_verification",
      verified: verified !== null,
      demo: false,
      capturedAt: order.lastMeasuredAt ?? new Date(),
      metric: "verified_units",
      providerReportedQuantity: order.providerReportedCount,
      verifiedQuantity: verified,
      baselineCount: order.baselineCount,
      latestCount: order.latestCount,
      notes,
      raw: { providerRef, staffNote: order.adminNotes ?? null },
    };

    if (order.status === "cancelled") {
      return { state: "cancelled", deliveredQuantity: verified, providerRef, evidence };
    }
    if (order.status === "failed") {
      return { state: "failed", deliveredQuantity: verified, providerRef, evidence, message: order.failureMessage ?? undefined };
    }
    if (verified !== null && verified >= target) {
      return { state: "delivered", deliveredQuantity: verified, providerRef, evidence, finishedAt: order.completedAt ?? undefined };
    }
    if (verified !== null && verified > 0) {
      return {
        state: "partially_delivered",
        deliveredQuantity: verified,
        providerRef,
        evidence,
        message: `Verified delivery recorded: ${verified} of ${target}.`,
      };
    }
    return {
      state: order.status === "pending_review" ? "pending" : "active",
      deliveredQuantity: null,
      providerRef,
      evidence,
      message:
        order.status === "pending_review"
          ? "Awaiting creator assignment."
          : "Assignment in progress; no verified delivery recorded yet.",
    };
  }

  async cancelCampaign(providerRef: string): Promise<{ cancelled: boolean; message: string }> {
    const order = await this.loadOrder(providerRef);
    if (!order) return { cancelled: false, message: "Assignment not found." };
    await db
      .update(orders)
      .set({ adminNotes: sql`coalesce(${orders.adminNotes}, '') || ' [cancelled via provider adapter]'`, updatedAt: new Date() })
      .where(eq(orders.id, order.id));
    return { cancelled: true, message: "Assignment cancelled. Notify the assigned creator externally if one was engaged." };
  }

  async getDeliveryEvidence(providerRef: string): Promise<DeliveryEvidence> {
    const status = await this.getCampaignStatus(providerRef);
    return status.evidence;
  }

  async handleWebhook(): Promise<WebhookResult> {
    return {
      handled: false,
      externalId: "n/a",
      signatureValid: false,
      message: "The manual provider has no webhook endpoint; staff update delivery in the admin console.",
    };
  }

  async healthCheck(): Promise<HealthResult> {
    return {
      status: "healthy",
      message: "Manual assignment queue available. Requires staffed campaign operations.",
      checkedAt: new Date(),
    };
  }
}
