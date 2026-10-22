import type { Executor } from "@/lib/db";
import { orderMeasurements, type Order } from "@/lib/db/schema";
import type { DeliveryEvidence } from "@/lib/providers/types";

/**
 * Measurement model (deliberately separated):
 *  requested     = order.quantity (what the customer asked for)
 *  baseline      = measured at campaign start, only if a real measurement exists
 *  latest        = latest provider/platform total, if exposed
 *  providerReported = what the partner says it delivered
 *  attributed    = portion credibly attributed to this campaign
 *  organic       = never inferred. Stays null unless a provider reports it explicitly.
 *  verified      = confirmed against provider evidence (manual verification / signed report)
 *
 * "No data" must remain null → the UI renders "Metric unavailable". We never fabricate.
 */
export type MeasurementApplication = {
  baselineCount: number | null;
  latestCount: number | null;
  providerReportedCount: number | null;
  attributedCount: number | null;
  organicCount: number | null;
  verifiedCount: number | null;
  remainingTarget: number | null;
  measurementSource: Order["measurementSource"];
  lastMeasuredAt: Date;
  measurementNotes: string | null;
};

export function deriveMeasurementFields(
  order: Pick<Order, "quantity" | "baselineCount">,
  evidence: DeliveryEvidence,
  options: { attributedOverride?: number | null; notes?: string[] } = {},
): MeasurementApplication {
  const attributed = options.attributedOverride ?? evidence.providerReportedQuantity ?? null;
  const verified = evidence.verified ? (evidence.verifiedQuantity ?? attributed) : null;

  // Remaining target is based on the best available delivered figure, never on a guess.
  const deliveredForRemaining = verified ?? attributed ?? evidence.verifiedQuantity ?? null;
  const remainingTarget = deliveredForRemaining === null ? null : Math.max(order.quantity - deliveredForRemaining, 0);

  return {
    baselineCount: evidence.baselineCount ?? order.baselineCount ?? null,
    latestCount: evidence.latestCount ?? null,
    providerReportedCount: evidence.providerReportedQuantity ?? null,
    attributedCount: attributed,
    organicCount: null, // Never derived from total-count deltas.
    verifiedCount: verified,
    remainingTarget,
    measurementSource: evidence.source,
    lastMeasuredAt: evidence.capturedAt,
    measurementNotes: [...evidence.notes, ...(options.notes ?? [])].join(" • ").slice(0, 2000) || null,
  };
}

export async function recordMeasurement(
  executor: Executor,
  input: {
    orderId: string;
    evidence: DeliveryEvidence;
    applied: MeasurementApplication;
    providerRef?: string | null;
    notes?: string;
  },
): Promise<void> {
  await executor.insert(orderMeasurements).values({
    orderId: input.orderId,
    source: input.evidence.source,
    isVerified: input.evidence.verified,
    baselineCount: input.applied.baselineCount,
    latestCount: input.applied.latestCount,
    attributedCount: input.applied.attributedCount,
    remainingTarget: input.applied.remainingTarget,
    providerRef: input.providerRef ?? null,
    evidence: input.evidence.raw ?? {},
    notes: input.notes ?? input.applied.measurementNotes ?? null,
    capturedAt: input.evidence.capturedAt,
  });
}

/** Progress percent is only shown when a delivered count exists. */
export function progressPercent(quantity: number, delivered: number | null): number | null {
  if (delivered === null || quantity <= 0) return null;
  return Math.min(Math.round((delivered / quantity) * 100), 100);
}
