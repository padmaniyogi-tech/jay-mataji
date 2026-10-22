import { and, eq, inArray, sql } from "drizzle-orm";
import { db, getDbAsync, withTransaction, type Executor } from "@/lib/db";
import { orders, payments, refunds, users, type Order, type Refund } from "@/lib/db/schema";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { formatPaise } from "@/lib/money";
import { recordAudit } from "@/lib/audit";
import { notifyStaff, notifyUser } from "@/lib/notifications";
import { getPaymentGateway } from "@/lib/payments/gateway";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { appendOrderEvent } from "./events";
import type { SessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";

const REFUNDABLE_ORDER_STATUSES = ["completed", "partially_completed", "failed", "cancelled", "refund_pending"];

export async function refundedTotal(orderId: string, executor: Executor = db): Promise<number> {
  const rows = await executor
    .select({ total: sql<number>`coalesce(sum(${refunds.amountPaise}), 0)::int` })
    .from(refunds)
    .where(and(eq(refunds.orderId, orderId), inArray(refunds.status, ["approved", "processing", "processed"])));
  return Number(rows[0]?.total ?? 0);
}

/**
 * Creates a refund request. Amounts are always clamped to what was actually captured and
 * what has not already been refunded/queued, so a customer can never be refunded twice.
 */
export async function createRefundRequest(
  executor: Executor,
  input: {
    order: Order;
    amountPaise: number;
    reason: string;
    requestedBy?: string | null;
    autoApprove?: boolean;
  },
): Promise<Refund> {
  const paidRows = await executor.select().from(payments).where(and(eq(payments.orderId, input.order.id), eq(payments.status, "paid"))).limit(1);
  const payment = paidRows[0];
  if (!payment) throw new ValidationError("This order has no captured payment to refund.");

  const already = await refundedTotal(input.order.id, executor);
  const remaining = Math.max(payment.amountPaise - already, 0);
  if (remaining <= 0) throw new AppError("This payment has already been fully refunded.", { status: 409, code: "already_refunded" });

  const amount = Math.min(Math.max(input.amountPaise, 1), remaining);
  const inserted = await executor
    .insert(refunds)
    .values({
      orderId: input.order.id,
      paymentId: payment.id,
      amountPaise: amount,
      status: input.autoApprove ? "approved" : "requested",
      reason: input.reason.slice(0, 1000),
      requestedBy: input.requestedBy ?? null,
    })
    .returning();
  const refund = inserted[0];
  if (!refund) throw new Error("Refund insert returned no row.");

  logger.info("refund_requested", {
    orderPublicId: input.order.publicId,
    amountPaise: amount,
    autoApprove: Boolean(input.autoApprove),
  });
  return refund;
}

export async function approveRefund(input: {
  refundId: string;
  actor: SessionUser;
  amountPaise?: number;
  note?: string;
}): Promise<Refund> {
  await getDbAsync();
  if (!hasPermission(input.actor.role, "refunds:approve")) throw new ForbiddenError("Only finance or admin can approve refunds.");

  const rows = await db.select().from(refunds).where(eq(refunds.id, input.refundId)).limit(1);
  const refund = rows[0];
  if (!refund) throw new NotFoundError("Refund not found.");
  if (!["requested", "failed"].includes(refund.status)) {
    throw new AppError(`Refund is ${refund.status} and cannot be approved again.`, { status: 409, code: "refund_not_approvable" });
  }
  const orderRows = await db.select().from(orders).where(eq(orders.id, refund.orderId)).limit(1);
  const order = orderRows[0];
  if (!order) throw new NotFoundError("Order not found.");

  const paidRows = await db.select().from(payments).where(and(eq(payments.orderId, order.id), eq(payments.status, "paid"))).limit(1);
  const payment = paidRows[0];
  if (!payment) throw new ValidationError("The payment for this order is not in a refundable state.");

  const already = await refundedTotal(order.id);
  const remaining = Math.max(payment.amountPaise - already, 0);
  const amount = Math.min(input.amountPaise ?? refund.amountPaise, remaining);
  if (amount <= 0) throw new AppError("Nothing remains to refund on this payment.", { status: 409, code: "already_refunded" });

  const updated = await withTransaction(async (tx) => {
    const next = await tx
      .update(refunds)
      .set({
        status: "approved",
        amountPaise: amount,
        approvedBy: input.actor.id,
        deciderNote: input.note ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(refunds.id, refund.id), inArray(refunds.status, ["requested", "failed"])))
      .returning();
    const row = next[0];
    if (!row) throw new AppError("Refund changed while you were approving it. Refresh and retry.", { status: 409, code: "conflict" });

    await appendOrderEvent(tx, {
      orderId: order.id,
      kind: "refund",
      message: `Refund of ${formatPaise(amount)} approved by ${input.actor.email}.${input.note ? ` Note: ${input.note}` : ""}`,
      actor: { kind: input.actor.role === "admin" ? "admin" : "finance", userId: input.actor.id, label: input.actor.email },
      metadata: { refundId: refund.id, amountPaise: amount },
    });
    return row;
  });

  await recordAudit(db, {
    action: "refund.approved",
    entityType: "refund",
    entityId: refund.id,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    actorRole: input.actor.role,
    metadata: { orderPublicId: order.publicId, amountPaise: amount },
  });

  // Executed by the worker (durable, retry-safe) rather than inside the HTTP request.
  const { enqueueJob } = await import("@/lib/jobs/queue");
  await enqueueJob(
    { type: "refund.process", dedupeKey: `refund:process:${refund.id}`, payload: { refundId: refund.id, amountPaise: amount } },
    db,
  );

  return updated;
}

export async function rejectRefund(input: { refundId: string; actor: SessionUser; note: string }): Promise<Refund> {
  await getDbAsync();
  if (!hasPermission(input.actor.role, "refunds:approve")) throw new ForbiddenError("Only finance or admin can reject refunds.");

  const rows = await db.select().from(refunds).where(eq(refunds.id, input.refundId)).limit(1);
  const refund = rows[0];
  if (!refund) throw new NotFoundError("Refund not found.");
  if (refund.status !== "requested") {
    throw new AppError(`Refund is ${refund.status} and cannot be rejected.`, { status: 409, code: "refund_not_rejectable" });
  }
  const orderRows = await db.select().from(orders).where(eq(orders.id, refund.orderId)).limit(1);
  const order = orderRows[0];
  if (!order) throw new NotFoundError("Order not found.");

  const updated = await withTransaction(async (tx) => {
    const next = await tx
      .update(refunds)
      .set({ status: "rejected", approvedBy: input.actor.id, deciderNote: input.note, updatedAt: new Date() })
      .where(and(eq(refunds.id, refund.id), eq(refunds.status, "requested")))
      .returning();
    const row = next[0];
    if (!row) throw new AppError("Refund changed while you were reviewing it.", { status: 409, code: "conflict" });

    // Return the order to a stable post-delivery status.
    const restoreTo = order.verifiedCount !== null && order.verifiedCount >= order.quantity ? "completed" : "failed";
    if (order.status === "refund_pending") {
      await tx.update(orders).set({ status: restoreTo, updatedAt: new Date() }).where(eq(orders.id, order.id));
    }
    await appendOrderEvent(tx, {
      orderId: order.id,
      kind: "refund",
      message: `Refund rejected by ${input.actor.email}: ${input.note}`,
      actor: { kind: input.actor.role === "admin" ? "admin" : "finance", userId: input.actor.id, label: input.actor.email },
      metadata: { refundId: refund.id },
    });

    await notifyUser(tx, {
      userId: order.userId,
      orderId: order.id,
      type: "refund.rejected",
      title: `Refund update for ${order.publicId}`,
      body: `Your refund request was reviewed and declined. Reason: ${input.note}`,
      href: `/dashboard/orders/${order.publicId}`,
    });
    return row;
  });

  await recordAudit(db, {
    action: "refund.rejected",
    entityType: "refund",
    entityId: refund.id,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    actorRole: input.actor.role,
    metadata: { orderPublicId: order.publicId, note: input.note },
  });

  return updated;
}

/**
 * Executes an approved refund exactly once. The status flip to `processing` is the lock:
 * a second worker (or repeated webhook) can no longer call the gateway.
 */
export async function processRefund(refundId: string): Promise<{ processed: boolean; message: string }> {
  await getDbAsync();
  const rows = await db.select().from(refunds).where(eq(refunds.id, refundId)).limit(1);
  const refund = rows[0];
  if (!refund) return { processed: false, message: "Refund not found." };
  if (refund.status === "processed") return { processed: false, message: "Refund already processed (idempotent skip)." };
  if (refund.status !== "approved") return { processed: false, message: `Refund is ${refund.status}; nothing to execute.` };

  const orderRows = await db.select().from(orders).where(eq(orders.id, refund.orderId)).limit(1);
  const order = orderRows[0];
  if (!order) throw new NotFoundError("Order not found.");
  const paymentRows = await db.select().from(payments).where(eq(payments.id, refund.paymentId)).limit(1);
  const payment = paymentRows[0];
  if (!payment) throw new NotFoundError("Payment not found.");
  if (!payment.providerPaymentId) throw new ValidationError("Payment gateway reference is missing; refund must be handled manually.");

  const locked = await db
    .update(refunds)
    .set({ status: "processing", updatedAt: new Date() })
    .where(and(eq(refunds.id, refund.id), eq(refunds.status, "approved")))
    .returning();
  if (locked.length === 0) return { processed: false, message: "Refund was already claimed by another worker." };

  const gateway = getPaymentGateway();
  const result = await gateway.refund({
    providerPaymentId: payment.providerPaymentId,
    amountPaise: refund.amountPaise,
    reason: refund.reason,
    refundId: refund.id,
  });

  if (!result.ok) {
    await db
      .update(refunds)
      .set({
        status: "failed",
        providerResponse: result.raw,
        deciderNote: `${refund.deciderNote ?? ""}\nRefund failed: ${result.message ?? "unknown"}`.trim(),
        updatedAt: new Date(),
      })
      .where(eq(refunds.id, refund.id));
    await appendOrderEvent(db, {
      orderId: order.id,
      kind: "refund",
      message: `Refund attempt failed: ${result.message ?? "provider error"}. Finance notified.`,
      actor: { kind: "system", label: "refund-worker" },
      metadata: { refundId: refund.id },
    });
    await notifyStaff(db, {
      type: "refund.failed",
      title: `Refund failed for ${order.publicId}`,
      body: `Gateway refund failed: ${result.message ?? "unknown error"}. Verify in the gateway dashboard before retrying.`,
      href: `/admin/refunds`,
      roles: ["admin", "finance"],
    });
    return { processed: false, message: result.message ?? "Refund failed." };
  }

  await withTransaction(async (tx) => {
    await tx
      .update(refunds)
      .set({
        status: "processed",
        providerRefundId: result.providerRefundId,
        providerResponse: result.raw,
        processedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(refunds.id, refund.id));

    const refundedRows = await tx
      .select({ total: sql<number>`coalesce(sum(${refunds.amountPaise}), 0)::int` })
      .from(refunds)
      .where(and(eq(refunds.orderId, order.id), eq(refunds.status, "processed")));
    const totalRefunded = Number(refundedRows[0]?.total ?? refund.amountPaise);
    const fully = totalRefunded >= payment.amountPaise;

    await tx
      .update(orders)
      .set({
        refundAmountPaise: totalRefunded,
        refundedAt: new Date(),
        status: fully ? "refunded" : "partially_refunded",
        paymentStatus: fully ? "refunded" : "partially_refunded",
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    await tx
      .update(payments)
      .set({ status: fully ? "refunded" : "partially_refunded", updatedAt: new Date() })
      .where(eq(payments.id, payment.id));

    await appendOrderEvent(tx, {
      orderId: order.id,
      kind: "refund",
      message: `Refund of ${formatPaise(refund.amountPaise)} processed (${result.providerRefundId ?? "no gateway id"}).`,
      fromStatus: order.status,
      toStatus: fully ? "refunded" : "partially_refunded",
      actor: { kind: "system", label: "refund-worker" },
      metadata: { refundId: refund.id, providerRefundId: result.providerRefundId, demo: getEnv().DEMO_MODE },
    });

    const customerRows = await tx.select({ name: users.name }).from(users).where(eq(users.id, order.userId)).limit(1);
    await notifyUser(tx, {
      userId: order.userId,
      orderId: order.id,
      type: "refund.processed",
      title: `Refund processed for ${order.publicId}`,
      body: `${formatPaise(refund.amountPaise)} was refunded to your original payment method. Reference: ${result.providerRefundId ?? "pending"}.`,
      href: `/dashboard/orders/${order.publicId}`,
      email: {
        template: "order_refunded",
        data: {
          name: customerRows[0]?.name ?? "there",
          orderId: order.publicId,
          amount: formatPaise(refund.amountPaise),
          refundRef: result.providerRefundId ?? "pending",
        },
        dedupeKey: `email:refund:${refund.id}`,
      },
    });
  });

  await recordAudit(db, {
    action: "refund.processed",
    entityType: "refund",
    entityId: refund.id,
    actorLabel: "system",
    metadata: { orderPublicId: order.publicId, amountPaise: refund.amountPaise, providerRefundId: result.providerRefundId },
  });

  return { processed: true, message: `Refund processed (${formatPaise(refund.amountPaise)}).` };
}

/** Used by the Razorpay refund webhook so out-of-band refunds stay reconciled. */
export async function reconcileRefundWebhook(input: {
  providerRefundId: string;
  providerPaymentId?: string | null;
  status?: string | null;
  amountPaise?: number | null;
}): Promise<{ matched: boolean; refundId: string | null }> {
  await getDbAsync();
  const rows = await db.select().from(refunds).where(eq(refunds.providerRefundId, input.providerRefundId)).limit(1);
  if (!rows[0]) return { matched: false, refundId: null };
  const refund = rows[0];
  if (refund.status === "processed") return { matched: true, refundId: refund.id };
  if (input.status === "processed") {
    await db
      .update(refunds)
      .set({ status: "processed", processedAt: new Date(), updatedAt: new Date() })
      .where(eq(refunds.id, refund.id));
    return { matched: true, refundId: refund.id };
  }
  return { matched: true, refundId: refund.id };
}

export { REFUNDABLE_ORDER_STATUSES };
