import { AppError, ForbiddenError } from "@/lib/errors";
import type { OrderStatus } from "@/lib/db/schema";
import { ORDER_STATUS_META, type OrderStatusName } from "./status";

/**
 * Order state machine.
 *
 * Every status change must go through `assertTransition`. The automation ("system" actor)
 * drives delivery transitions; customers can only *request* cancellation/refund; financial
 * finalisation (refunded / partially_refunded) is restricted to finance/admin.
 */

export type ActorKind = "system" | "customer" | "support" | "finance" | "admin";

export type TransitionActor = {
  kind: ActorKind;
  userId?: string | null;
  label?: string;
};

const ALLOWED: Record<OrderStatusName, OrderStatusName[]> = {
  pending_payment: ["paid", "cancelled", "failed"],
  paid: ["pending_review", "pending_provider", "queued", "in_progress", "failed", "refund_pending", "cancelled"],
  pending_review: ["pending_provider", "queued", "in_progress", "failed", "cancelled", "refund_pending"],
  pending_provider: ["queued", "pending_review", "failed", "cancelled", "refund_pending"],
  queued: ["in_progress", "pending_provider", "failed", "cancelled", "cancellation_requested", "refund_pending"],
  in_progress: [
    "partially_completed",
    "completed",
    "failed",
    "cancellation_requested",
    "refund_pending",
    "cancelled",
  ],
  partially_completed: ["completed", "refund_pending", "partially_refunded", "failed", "cancelled"],
  completed: ["refund_pending"],
  failed: ["refund_pending", "partially_refunded", "refunded"],
  cancellation_requested: ["cancelled", "in_progress", "partially_completed", "refund_pending"],
  cancelled: ["refund_pending", "refunded", "failed"],
  refund_pending: ["partially_refunded", "refunded", "failed"],
  partially_refunded: ["refunded"],
  refunded: [],
};

export const TERMINAL_STATUSES = new Set<OrderStatusName>(
  (Object.keys(ORDER_STATUS_META) as OrderStatusName[]).filter((s) => ORDER_STATUS_META[s].terminal),
);

export function allowedNextStatuses(from: OrderStatus): OrderStatus[] {
  return (ALLOWED[from as OrderStatusName] ?? []).slice() as OrderStatus[];
}

export type TransitionCheck = { ok: true } | { ok: false; reason: string };

export function canTransition(from: OrderStatus, to: OrderStatus, actor: TransitionActor): TransitionCheck {
  if (from === to) return { ok: false, reason: `Order is already ${from}.` };

  const allowed = ALLOWED[from as OrderStatusName];
  if (!allowed) return { ok: false, reason: `Unknown current status: ${from}.` };
  if (!allowed.includes(to as OrderStatusName)) {
    return { ok: false, reason: `Transition ${from} → ${to} is not permitted by the order state machine.` };
  }

  // Automation may never fabricate verified completion of a paid order without provider evidence;
  // that rule is enforced in the orders service (evidence requirement), not here.
  if (actor.kind === "customer") {
    const customerAllowed: Partial<Record<OrderStatusName, OrderStatusName[]>> = {
      pending_payment: ["cancelled"],
      paid: ["cancelled"],
      pending_review: ["cancelled"],
      pending_provider: ["cancelled"],
      queued: ["cancellation_requested"],
      in_progress: ["cancellation_requested"],
      partially_completed: ["refund_pending"],
      failed: ["refund_pending"],
      completed: ["refund_pending"],
      cancelled: ["refund_pending"],
    };
    if (!(customerAllowed[from as OrderStatusName] ?? []).includes(to as OrderStatusName)) {
      return { ok: false, reason: "Customers can only request cancellation or a refund from this status." };
    }
    return { ok: true };
  }

  if (to === "partially_refunded" || to === "refunded") {
    if (actor.kind !== "finance" && actor.kind !== "admin" && actor.kind !== "system") {
      return { ok: false, reason: "Only finance or admin roles can finalise refunds." };
    }
  }

  if (to === "pending_review" && actor.kind === "support") {
    return { ok: true };
  }

  if (actor.kind === "support") {
    const supportDenied: OrderStatusName[] = ["refunded", "partially_refunded", "paid"];
    if (supportDenied.includes(to as OrderStatusName)) {
      return { ok: false, reason: "Support agents cannot perform financial or payment transitions." };
    }
  }

  if (actor.kind === "finance") {
    const financeDenied: OrderStatusName[] = ["in_progress", "partially_completed", "completed", "queued", "failed"];
    if (financeDenied.includes(to as OrderStatusName)) {
      return { ok: false, reason: "Finance roles can manage payment and refund transitions only." };
    }
  }

  return { ok: true };
}

export function assertTransition(from: OrderStatus, to: OrderStatus, actor: TransitionActor): void {
  const check = canTransition(from, to, actor);
  if (!check.ok) {
    throw new AppError(check.reason, {
      code: "invalid_transition",
      status: actor.kind === "customer" ? 403 : 409,
    });
  }
}

/** Guard used by admin/support variants that must never be reachable by customers. */
export function assertStaff(actor: TransitionActor): void {
  if (!["admin", "support", "finance", "system"].includes(actor.kind)) {
    throw new ForbiddenError("Staff access required.");
  }
}

export function isCancellable(status: OrderStatus): boolean {
  return ["pending_payment", "paid", "pending_review", "pending_provider", "queued"].includes(status);
}
