import { and, eq } from "drizzle-orm";
import type { Executor } from "@/lib/db";
import { orderEvents, orders, type Order, type OrderStatus } from "@/lib/db/schema";
import { ConflictError } from "@/lib/errors";
import { assertTransition, type TransitionActor } from "./state-machine";

export type OrderEventKind =
  | "created"
  | "payment"
  | "submitted"
  | "progress"
  | "partial_delivery"
  | "delivered"
  | "failed"
  | "cancelled"
  | "refund"
  | "note"
  | "status_change"
  | "measurement";

export async function appendOrderEvent(
  executor: Executor,
  input: {
    orderId: string;
    kind: OrderEventKind;
    message: string;
    fromStatus?: OrderStatus | null;
    toStatus?: OrderStatus | null;
    actor?: TransitionActor;
    actorLabel?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await executor.insert(orderEvents).values({
    orderId: input.orderId,
    kind: input.kind,
    message: input.message,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    actorId: input.actor?.userId ?? null,
    actorRole: input.actor?.kind ?? "system",
    actorLabel: input.actorLabel ?? input.actor?.label ?? input.actor?.kind ?? "system",
    metadata: input.metadata ?? {},
  });
}

export type TransitionOptions = {
  order: Order;
  to: OrderStatus;
  actor: TransitionActor;
  message: string;
  kind?: OrderEventKind;
  metadata?: Record<string, unknown>;
  extra?: Partial<Omit<Order, "id" | "status" | "updatedAt">>;
};

/**
 * Applies a validated status transition with optimistic concurrency (`where status = from`).
 * Returns the updated order, or throws ConflictError if another process moved it first.
 */
export async function transitionOrder(executor: Executor, options: TransitionOptions): Promise<Order> {
  const { order, to, actor } = options;
  assertTransition(order.status, to, actor);

  const now = new Date();
  const timestamps: Partial<Order> = {};
  if (to === "in_progress" && !order.startedAt) timestamps.startedAt = now;
  if ((to === "completed" || to === "partially_completed") && !order.completedAt) timestamps.completedAt = now;
  if (to === "cancelled") timestamps.cancelledAt = now;
  if (to === "refunded" || to === "partially_refunded") timestamps.refundedAt = now;

  const updated = await executor
    .update(orders)
    .set({ ...options.extra, ...timestamps, status: to, updatedAt: now })
    .where(and(eq(orders.id, order.id), eq(orders.status, order.status)))
    .returning();

  const row = updated[0];
  if (!row) {
    throw new ConflictError("This order changed while you were working on it. Refresh and try again.", {
      orderId: order.id,
      expectedStatus: order.status,
    });
  }

  await appendOrderEvent(executor, {
    orderId: order.id,
    kind: options.kind ?? "progress",
    message: options.message,
    fromStatus: order.status,
    toStatus: to,
    actor,
    metadata: options.metadata,
  });

  return row;
}
