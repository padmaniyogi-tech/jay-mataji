import { and, eq, inArray, sql } from "drizzle-orm";
import { db, getDbAsync, withTransaction } from "@/lib/db";
import { orders, refunds, type Order, type OrderStatus } from "@/lib/db/schema";
import { AppError, ForbiddenError, NotFoundError, ProviderPermanentError } from "@/lib/errors";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { notifyUser } from "@/lib/notifications";
import { enqueueJob } from "@/lib/jobs/queue";
import { enqueueOutbox } from "@/lib/jobs/outbox";
import { createAdapter, getProviderById } from "@/lib/providers/registry";
import type { AdminOrderAction } from "@/lib/validation";
import type { SessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { appendOrderEvent, transitionOrder } from "./events";
import { createRefundRequest } from "./refunds";
import type { TransitionActor } from "./state-machine";
import { ORDER_STATUS_META, type OrderStatusName } from "./status";

async function loadOrder(publicId: string) {
  await getDbAsync();
  const rows = await db.select().from(orders).where(eq(orders.publicId, publicId)).limit(1);
  const order = rows[0];
  if (!order) throw new NotFoundError("Order not found.");
  return order;
}

function actorFor(user: SessionUser): TransitionActor {
  return {
    kind: user.role === "admin" ? "admin" : user.role === "finance" ? "finance" : "support",
    userId: user.id,
    label: user.email,
  };
}

function requireManage(user: SessionUser): void {
  if (!hasPermission(user.role, "orders:manage") && !hasPermission(user.role, "refunds:approve")) {
    throw new ForbiddenError("You do not have permission to manage orders.");
  }
}

/** Staff order actions used by the admin order page. All are audited. */
export async function performAdminOrderAction(input: {
  publicId: string;
  actor: SessionUser;
  action: AdminOrderAction;
}): Promise<{ message: string; order: Order }> {
  requireManage(input.actor);
  const order = await loadOrder(input.publicId);
  const actor = actorFor(input.actor);
  const action = input.action;

  switch (action.action) {
    case "retry_provider": {
      if (!["queued", "in_progress", "pending_review", "pending_provider"].includes(order.status)) {
        throw new AppError("Provider retry is only available for active orders.", { status: 409, code: "not_retryable" });
      }
      if (order.status === "queued" || order.status === "pending_provider") {
        await enqueueJob(
          {
            type: order.status === "queued" ? "order.submit" : "order.route",
            dedupeKey: `${order.status === "queued" ? "order:submit" : "order:route"}:manual:${order.id}:${Date.now()}`,
            payload: { orderId: order.id, attempt: order.retryCount },
            runAt: new Date(),
          },
          db,
        );
      } else {
        await enqueueJob(
          {
            type: "order.poll",
            dedupeKey: `order:poll:manual:${order.id}:${Date.now()}`,
            payload: { orderId: order.id, seq: Math.floor(Date.now() / 1000) },
            runAt: new Date(),
          },
          db,
        );
      }
      await appendOrderEvent(db, {
        orderId: order.id,
        kind: "note",
        message: `Staff requested a provider retry/poll refresh (${input.actor.email}).`,
        actor,
      });
      await audit(input, "order.retry_provider", order, {});
      return { message: "Retry scheduled.", order };
    }

    case "route": {
      await enqueueJob(
        { type: "order.route", dedupeKey: `order:route:manual:${order.id}:${Date.now()}`, payload: { orderId: order.id } },
        db,
      );
      await appendOrderEvent(db, {
        orderId: order.id,
        kind: "note",
        message: `Routing re-run requested by ${input.actor.email}.`,
        actor,
      });
      await audit(input, "order.route_requested", order, {});
      return { message: "Routing queued.", order };
    }

    case "cancel": {
      if (ORDER_STATUS_META[order.status].terminal && order.status !== "failed") {
        throw new AppError("This order is already in a terminal state.", { status: 409, code: "terminal" });
      }
      const updated = await withTransaction(async (tx) => {
        const next = await transitionOrder(tx, {
          order,
          to: "cancelled",
          actor,
          kind: "cancelled",
          message: `Cancelled by ${input.actor.email}: ${action.reason}`,
          extra: { cancellationRequestedAt: order.cancellationRequestedAt ?? new Date() },
          metadata: { reason: action.reason },
        });
        if (order.paymentStatus === "paid") {
          const existing = await tx
            .select({ id: refunds.id })
            .from(refunds)
            .where(and(eq(refunds.orderId, order.id), inArray(refunds.status, ["requested", "approved", "processing", "processed"])))
            .limit(1);
          if (!existing[0]) {
            const delivered = order.verifiedCount ?? order.attributedCount ?? 0;
            const amount = Math.max(Math.round(order.totalPaise * (1 - Math.min(delivered / Math.max(order.quantity, 1), 1))), 0);
            if (amount > 0) {
              await createRefundRequest(tx, { order, amountPaise: amount, reason: `Cancellation: ${action.reason}`, requestedBy: input.actor.id });
            }
          }
        }
        await notifyUser(tx, {
          userId: order.userId,
          orderId: order.id,
          type: "order.cancelled",
          title: `Order ${order.publicId} cancelled`,
          body: `Our team cancelled this order. Reason: ${action.reason}. Any eligible refund is reviewed by finance.`,
          href: `/dashboard/orders/${order.publicId}`,
        });
        return next;
      });
      await audit(input, "order.cancelled", order, { reason: action.reason });
      return { message: "Order cancelled.", order: updated };
    }

    case "note": {
      await db
        .update(orders)
        .set({ adminNotes: sql`coalesce(${orders.adminNotes}, '') || ${`\n[${new Date().toISOString()}] ${input.actor.email}: ${action.note}`}`, updatedAt: new Date() })
        .where(eq(orders.id, order.id));
      await appendOrderEvent(db, {
        orderId: order.id,
        kind: "note",
        message: `Staff note: ${action.note}`,
        actor,
      });
      await audit(input, "order.note_added", order, {});
      return { message: "Note saved.", order };
    }

    case "mark_in_progress": {
      if (order.status !== "pending_review") {
        throw new AppError("Only orders in review can be moved to in progress.", { status: 409, code: "not_in_review" });
      }
      if (order.providerId) {
        const provider = await getProviderById(order.providerId);
        if (provider?.kind === "meta_ads" && order.providerRef) {
          const adapter = createAdapter(provider);
          if ("activateCampaign" in adapter && typeof adapter.activateCampaign === "function") {
            try {
              await (adapter as unknown as { activateCampaign: (ref: string) => Promise<void> }).activateCampaign(order.providerRef);
            } catch (err) {
              if (err instanceof ProviderPermanentError) {
                throw new AppError(`Provider activation failed: ${err.message}`, { status: 502, code: "activation_failed" });
              }
              throw err;
            }
          }
        }
      }
      const updated = await withTransaction(async (tx) => {
        const next = await transitionOrder(tx, {
          order,
          to: "in_progress",
          actor,
          message: `Activated by ${input.actor.email} after review.`,
          kind: "progress",
          extra: { startedAt: order.startedAt ?? new Date() },
        });
        await enqueueOutbox(tx, "order.poll", `order:poll:admin:${order.id}:${Date.now()}`, { orderId: order.id, seq: 0 }, {
          availableAt: new Date(Date.now() + 5_000),
        });
        await notifyUser(tx, {
          userId: order.userId,
          orderId: order.id,
          type: "order.started",
          title: `Campaign ${order.publicId} is live`,
          body: "Your campaign passed review and is now in progress.",
          href: `/dashboard/orders/${order.publicId}`,
        });
        return next;
      });
      await audit(input, "order.marked_in_progress", order, {});
      return { message: "Order moved to in progress.", order: updated };
    }

    case "record_delivery": {
      const provider = order.providerId ? await getProviderById(order.providerId) : null;
      if (provider?.kind !== "manual") {
        throw new AppError(
          "Verified delivery can only be recorded for manual/creator assignments. Automated providers report their own evidence.",
          { status: 409, code: "manual_only" },
        );
      }
      if (order.providerRef && (order.status === "pending_payment" || order.status === "paid")) {
        throw new AppError("This assignment has not started yet.", { status: 409, code: "not_started" });
      }
      const delivered = action.deliveredQuantity;
      if (delivered > order.quantity) {
        throw new AppError("Delivered quantity cannot exceed the requested quantity.", { status: 422, code: "invalid_quantity" });
      }
      const now = new Date();
      const updated = await withTransaction(async (tx) => {
        const { orderMeasurements } = await import("@/lib/db/schema");
        await tx.insert(orderMeasurements).values({
          orderId: order.id,
          source: "manual_verification",
          isVerified: true,
          latestCount: action.latestCount ?? delivered,
          attributedCount: delivered,
          remainingTarget: Math.max(order.quantity - delivered, 0),
          providerRef: order.providerRef,
          evidence: {
            verifiedBy: input.actor.email,
            note: action.note ?? null,
            method: "staff_manual_verification",
          },
          notes: action.note ?? "Verified by campaign team.",
          capturedAt: now,
        });

        const patch = {
          verifiedCount: delivered,
          attributedCount: delivered,
          latestCount: action.latestCount ?? delivered,
          providerReportedCount: delivered,
          remainingTarget: Math.max(order.quantity - delivered, 0),
          measurementSource: "manual_verification" as const,
          lastMeasuredAt: now,
          measurementNotes: `Verified by ${input.actor.email}${action.note ? `: ${action.note}` : ""}`,
          completedAt: now,
        };

        let current = order;
        if (current.status === "pending_review") {
          current = await transitionOrder(tx, {
            order: current,
            to: "in_progress",
            actor,
            message: "Assignment started; recording verified delivery.",
          });
        }
        const finalStatus: OrderStatus = delivered >= order.quantity ? "completed" : "partially_completed";
        if (!["in_progress", "partially_completed"].includes(current.status)) {
          throw new AppError(`Cannot record delivery from status ${current.status}.`, { status: 409, code: "invalid_status" });
        }
        const next = await transitionOrder(tx, {
          order: current,
          to: finalStatus,
          actor,
          kind: delivered >= order.quantity ? "delivered" : "partial_delivery",
          message:
            delivered >= order.quantity
              ? `Verified delivery completed: ${delivered.toLocaleString("en-IN")} ${delivered === 1 ? "deliverable" : "units"} confirmed by ${input.actor.email}.`
              : `Verified partial delivery: ${delivered.toLocaleString("en-IN")} of ${order.quantity.toLocaleString("en-IN")} units.`,
          extra: patch,
        });
        await notifyUser(tx, {
          userId: order.userId,
          orderId: order.id,
          type: delivered >= order.quantity ? "order.completed" : "order.partial",
          title: delivered >= order.quantity ? `Campaign ${order.publicId} completed` : `${order.publicId} partially delivered`,
          body:
            delivered >= order.quantity
              ? `Our team verified delivery of ${delivered.toLocaleString("en-IN")} units. Open the report for evidence.`
              : `Verified delivery: ${delivered.toLocaleString("en-IN")} of ${order.quantity.toLocaleString("en-IN")}. You can request a refund for the remainder.`,
          href: `/dashboard/orders/${order.publicId}`,
        });
        return next;
      });
      await audit(input, "order.delivery_recorded", order, { delivered, note: action.note });
      return { message: "Verified delivery recorded.", order: updated };
    }

    case "assign_provider": {
      const provider = await getProviderById(action.providerId);
      if (!provider) throw new NotFoundError("Provider not found.");
      if (!provider.enabled) throw new AppError("That provider is disabled.", { status: 409, code: "provider_disabled" });
      if (provider.kind === "mock" && !getEnv().DEMO_MODE) {
        throw new AppError("The demo provider cannot be assigned outside demo mode.", { status: 409, code: "mock_not_allowed" });
      }
      if (!["pending_provider", "pending_review"].includes(order.status)) {
        throw new AppError("Providers can only be assigned to orders awaiting routing or review.", { status: 409, code: "not_assignable" });
      }
      const updated = await withTransaction(async (tx) => {
        const next = await transitionOrder(tx, {
          order,
          to: "queued",
          actor,
          message: `Provider manually assigned: ${provider.name}.`,
          extra: { providerId: provider.id, providerError: null },
        });
        await enqueueOutbox(tx, "order.submit", `order:submit:${order.id}:manual:${Date.now()}`, { orderId: order.id, attempt: 0 }, {
          availableAt: new Date(),
        });
        return next;
      });
      await audit(input, "order.provider_assigned", order, { providerId: provider.id, providerKey: provider.key });
      return { message: `Assigned to ${provider.name}.`, order: updated };
    }

    case "force_status": {
      if (input.actor.role !== "admin") throw new ForbiddenError("Only administrators can force a status change.");
      const target = action.status as OrderStatus;
      if (!ORDER_STATUS_META[target as OrderStatusName]) {
        throw new AppError("Unknown status.", { status: 422, code: "unknown_status" });
      }
      const updated = await withTransaction(async (tx) =>
        transitionOrder(tx, {
          order,
          to: target,
          actor,
          kind: "status_change",
          message: `Status forced to ${target} by ${input.actor.email}: ${action.reason}`,
          metadata: { reason: action.reason, forced: true },
        }),
      );
      await audit(input, "order.status_forced", order, { to: target, reason: action.reason });
      return { message: `Status set to ${target}.`, order: updated };
    }

    default: {
      throw new AppError("Unsupported action.", { status: 422, code: "unsupported_action" });
    }
  }
}

async function audit(input: { publicId: string; actor: SessionUser }, action: string, order: Order, metadata: Record<string, unknown>) {
  await recordAudit(db, {
    action,
    entityType: "order",
    entityId: input.publicId,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    actorRole: input.actor.role,
    metadata: { ...metadata, orderId: order.id, status: order.status },
  });
  logger.info(action, { orderPublicId: input.publicId, actor: input.actor.email });
}

export { actorFor, requireManage };
