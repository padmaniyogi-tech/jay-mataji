import { and, eq, inArray, sql } from "drizzle-orm";
import { db, getDbAsync, withTransaction } from "@/lib/db";
import {
  orders,
  payments,
  providers as providersTable,
  refunds,
  services,
  users,
  type Order,
  type OrderStatus,
  type Provider,
  type Service,
} from "@/lib/db/schema";
import { ProviderPermanentError } from "@/lib/errors";
import { getEnv } from "@/lib/env";
import { getPlatformSettings } from "@/lib/settings";
import { formatPaise } from "@/lib/money";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { notifyStaff, notifyUser } from "@/lib/notifications";
import { enqueueOutbox } from "@/lib/jobs/outbox";
import { enqueueJob } from "@/lib/jobs/queue";
import { listEnabledProviders, createAdapter } from "@/lib/providers/registry";
import { routeOrder } from "@/lib/providers/routing";
import type { ProviderAdapter } from "@/lib/providers/types";
import { parseInstagramUrl } from "@/lib/instagram";
import { appendOrderEvent, transitionOrder } from "./events";
import { deriveMeasurementFields, recordMeasurement } from "./measurements";
import { createRefundRequest } from "./refunds";
import type { TransitionActor } from "./state-machine";

const SYSTEM: TransitionActor = { kind: "system", label: "automation" };
const MAX_SUBMIT_RETRIES = 5;
const POLLABLE: OrderStatus[] = ["in_progress", "partially_completed", "pending_review"];

/* -------------------------------------------------------------------------- */
/* Loaders                                                                    */
/* -------------------------------------------------------------------------- */

export async function getOrderById(orderId: string): Promise<Order | null> {
  await getDbAsync();
  const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  return rows[0] ?? null;
}

export async function getServiceById(serviceId: string): Promise<Service | null> {
  await getDbAsync();
  const rows = await db.select().from(services).where(eq(services.id, serviceId)).limit(1);
  return rows[0] ?? null;
}

async function getProviderById(providerId: string): Promise<Provider | null> {
  const rows = await db.select().from(providersTable).where(eq(providersTable.id, providerId)).limit(1);
  return rows[0] ?? null;
}

function pollDelaySeconds(provider: Provider): number {
  const configured = provider.config?.pollSeconds;
  if (typeof configured === "number" && configured >= 3) return configured;
  if (provider.kind === "mock") return 6;
  return 300;
}

function maxCampaignSeconds(provider: Provider, service: Service): number {
  if (provider.kind === "mock") {
    const sim = typeof provider.config?.simulationSeconds === "number" ? provider.config.simulationSeconds : 90;
    return sim * 3 + 600;
  }
  return Math.max(service.estimatedDurationHours, 24) * 3 * 3600;
}

/* -------------------------------------------------------------------------- */
/* Failure handling (shared by automation and admin)                          */
/* -------------------------------------------------------------------------- */

export async function failOrder(input: {
  order: Order;
  reason: string;
  code: string;
  actor?: TransitionActor;
  createRefund?: boolean;
}): Promise<Order> {
  const settings = await getPlatformSettings();
  const actor = input.actor ?? SYSTEM;

  const result = await withTransaction(async (tx) => {
    const updated = await transitionOrder(tx, {
      order: input.order,
      to: "failed",
      actor,
      kind: "failed",
      message: `Campaign failed: ${input.reason}`,
      extra: { failureCode: input.code, failureMessage: input.reason.slice(0, 1000) },
      metadata: { code: input.code },
    });

    let refundCreated = false;
    let refundAmount = 0;
    if (input.createRefund !== false && input.order.paymentStatus === "paid") {
      const existing = await tx
        .select({ id: refunds.id })
        .from(refunds)
        .where(and(eq(refunds.orderId, input.order.id), inArray(refunds.status, ["requested", "approved", "processing", "processed"])))
        .limit(1);
      if (!existing[0]) {
        const delivered = input.order.verifiedCount ?? input.order.attributedCount ?? 0;
        refundAmount = Math.max(Math.round(input.order.totalPaise * (1 - Math.min(delivered / Math.max(input.order.quantity, 1), 1))), 0);
        if (refundAmount > 0) {
          await createRefundRequest(tx, {
            order: input.order,
            amountPaise: refundAmount,
            reason: `Automatic refund review: ${input.reason}`.slice(0, 1000),
          });
          refundCreated = true;
        }
      }
    }

    await notifyUser(tx, {
      userId: input.order.userId,
      orderId: input.order.id,
      type: "order.failed",
      title: `Action needed for ${input.order.publicId}`,
      body: refundCreated
        ? `Campaign failed: ${input.reason} A refund review for ${formatPaise(refundAmount)} has been raised with our finance team.`
        : `Campaign failed: ${input.reason} Our team has been notified.`,
      href: `/dashboard/orders/${input.order.publicId}`,
      email: {
        template: "order_failed",
        data: {
          name: "there",
          orderId: input.order.publicId,
          reason: input.reason,
          refundWindow: `${settings.refundWindowDays} days`,
          orderUrl: `${getEnv().APP_URL}/dashboard/orders/${input.order.publicId}`,
        },
        dedupeKey: `email:failed:${input.order.id}:${input.code}`,
      },
    });

    await notifyStaff(tx, {
      type: "order.failed",
      title: `Campaign failed for ${input.order.publicId}`,
      body: `${input.reason}${refundCreated ? ` Refund of ${formatPaise(refundAmount)} requested.` : ""}`,
      href: `/admin/orders/${input.order.publicId}`,
      roles: ["admin", "finance"],
      orderId: input.order.id,
      email: {
        template: "admin_no_provider",
        data: {
          orderId: input.order.publicId,
          serviceName: "campaign",
          quantity: input.order.quantity,
          reason: input.reason,
          adminUrl: `${getEnv().APP_URL}/admin/orders/${input.order.publicId}`,
        },
      },
    });

    return { updated, refundCreated, refundAmount };
  });

  await recordAudit(db, {
    action: "order.failed",
    entityType: "order",
    entityId: input.order.publicId,
    actorId: actor.userId ?? null,
    actorRole: actor.kind,
    metadata: { code: input.code, reason: input.reason, refundCreated: result.refundCreated, refundAmount: result.refundAmount },
  });

  return result.updated;
}

/* -------------------------------------------------------------------------- */
/* 1. Route: choose an eligible provider                                      */
/* -------------------------------------------------------------------------- */

export async function handleOrderRoute(payload: { orderId: string }): Promise<void> {
  const order = await getOrderById(payload.orderId);
  if (!order) return;
  if (!["paid", "pending_provider"].includes(order.status)) {
    logger.debug("route_skipped_status", { orderId: order.id, status: order.status });
    return;
  }
  const service = await getServiceById(order.serviceId);
  if (!service) return;
  const settings = await getPlatformSettings();

  if (service.requiresManualReview && order.status === "paid") {
    await withTransaction(async (tx) => {
      await transitionOrder(tx, {
        order,
        to: "pending_review",
        actor: SYSTEM,
        message: "Routed to campaign review: this service requires a brief review before submission.",
        metadata: { reason: "service_requires_manual_review" },
      });
      await notifyStaff(tx, {
        type: "order.review",
        title: `Review needed for ${order.publicId}`,
        body: `${service.name} requires manual review before routing.`,
        href: `/admin/orders/${order.publicId}`,
        roles: ["admin", "support"],
        orderId: order.id,
      });
    });
    return;
  }

  if (!settings.autoRouteEnabled) {
    await withTransaction(async (tx) => {
      await transitionOrder(tx, {
        order,
        to: "pending_review",
        actor: SYSTEM,
        message: "Automatic routing is disabled in platform settings; queued for staff review.",
      });
    });
    return;
  }

  const target = parseInstagramUrl(order.targetUrl);
  const providerRows = await listEnabledProviders();
  const decision = await routeOrder(
    {
      service,
      target,
      quantity: order.quantity,
      orderPublicId: order.publicId,
      brief: order.brief,
      audienceCountry: order.audienceCountry,
    },
    providerRows,
  );

  if (!decision.selected) {
    await withTransaction(async (tx) => {
      const latest = await tx.select().from(orders).where(eq(orders.id, order.id)).limit(1);
      const current = latest[0];
      if (!current || !["paid", "pending_provider"].includes(current.status)) return;
      const updated =
        current.status === "paid"
          ? await transitionOrder(tx, {
              order: current,
              to: "pending_provider",
              actor: SYSTEM,
              message: `No eligible provider available. ${decision.reason}`,
              extra: { providerId: null, providerError: decision.reason.slice(0, 1000) },
            })
          : await tx
              .update(orders)
              .set({ providerError: decision.reason.slice(0, 1000), updatedAt: new Date() })
              .where(eq(orders.id, current.id))
              .returning()
              .then((rows) => rows[0]!);

      if (current.status === "paid") {
        await notifyUser(tx, {
          userId: updated.userId,
          orderId: updated.id,
          type: "order.pending_provider",
          title: `${updated.publicId} is awaiting a delivery partner`,
          body: "Your payment is safe. No eligible delivery partner is configured for this service yet, so the team has been notified and will route it manually. You can request a cancellation any time before delivery starts.",
          href: `/dashboard/orders/${updated.publicId}`,
          email: {
            template: "order_needs_review",
            data: {
              name: "there",
              orderId: updated.publicId,
              orderUrl: `${getEnv().APP_URL}/dashboard/orders/${updated.publicId}`,
            },
            dedupeKey: `email:pending-provider:${updated.id}`,
          },
        });
      }
      await notifyStaff(tx, {
        type: "order.pending_provider",
        title: `No eligible provider for ${updated.publicId}`,
        body: decision.reason,
        href: `/admin/orders/${updated.publicId}`,
        roles: ["admin"],
        orderId: updated.id,
        email: {
          template: "admin_no_provider",
          data: {
            orderId: updated.publicId,
            serviceName: service.name,
            quantity: updated.quantity,
            reason: decision.reason,
            adminUrl: `${getEnv().APP_URL}/admin/orders/${updated.publicId}`,
          },
        },
      });
    });
    return;
  }

  const selected = decision.selected;
  await withTransaction(async (tx) => {
    const latest = await tx.select().from(orders).where(eq(orders.id, order.id)).limit(1);
    const current = latest[0];
    if (!current || !["paid", "pending_provider"].includes(current.status)) return;
    await transitionOrder(tx, {
      order: current,
      to: "queued",
      actor: SYSTEM,
      message: `Routed to ${selected.provider.name}.`,
      extra: { providerId: selected.provider.id, providerError: null },
      metadata: {
        providerKey: selected.provider.key,
        score: selected.score,
        candidateCount: decision.candidates.length,
      },
    });
    await enqueueOutbox(tx, "order.submit", `order:submit:${order.id}:0`, { orderId: order.id, attempt: 0 });
  });
}

/* -------------------------------------------------------------------------- */
/* 2. Submit: call the provider exactly once per attempt                      */
/* -------------------------------------------------------------------------- */

export async function handleOrderSubmit(payload: { orderId: string; attempt?: number }): Promise<void> {
  const order = await getOrderById(payload.orderId);
  if (!order || order.status !== "queued") return;
  const service = await getServiceById(order.serviceId);
  if (!service) return;

  const provider = order.providerId ? await getProviderById(order.providerId) : null;
  if (!provider || !provider.enabled) {
    await withTransaction(async (tx) => {
      const latest = (await tx.select().from(orders).where(eq(orders.id, order.id)).limit(1))[0];
      if (!latest || latest.status !== "queued") return;
      await transitionOrder(tx, {
        order: latest,
        to: "pending_provider",
        actor: SYSTEM,
        message: "Assigned provider is no longer enabled. Order returned to the routing queue.",
      });
      await enqueueOutbox(tx, "order.route", `order:route:${order.id}:requeue:${Date.now()}`, { orderId: order.id }, {
        availableAt: new Date(Date.now() + 60_000),
      });
    });
    return;
  }

  if (provider.kind === "mock" && !getEnv().DEMO_MODE) {
    await failOrder({ order, reason: "Demo provider cannot be used outside DEMO_MODE.", code: "mock_not_allowed" });
    return;
  }

  const adapter: ProviderAdapter = createAdapter(provider);
  let submission;
  try {
    submission = await adapter.createCampaign({
      orderId: order.id,
      orderPublicId: order.publicId,
      idempotencyKey: `${order.publicId}:${provider.id}`,
      attempt: order.retryCount,
      service: { kind: service.kind, name: service.name, unitLabel: service.unitLabel },
      target: parseInstagramUrl(order.targetUrl),
      quantity: order.quantity,
      audienceCountry: order.audienceCountry,
      brief: order.brief,
      baselineCount: order.baselineCount,
    });
  } catch (err) {
    if (err instanceof ProviderPermanentError) {
      await failOrder({ order, reason: err.message, code: err.code });
      return;
    }
    const nextAttempt = order.retryCount + 1;
    const message = err instanceof Error ? err.message : "Provider submission failed.";
    if (nextAttempt > MAX_SUBMIT_RETRIES) {
      await failOrder({ order, reason: `Provider submission failed after ${MAX_SUBMIT_RETRIES} retries: ${message}`, code: "submit_retries_exhausted" });
      return;
    }
    const delayMs = Math.min(5_000 * Math.pow(2, nextAttempt - 1), 10 * 60_000);
    await withTransaction(async (tx) => {
      const latest = (await tx.select().from(orders).where(eq(orders.id, order.id)).limit(1))[0];
      if (!latest || latest.status !== "queued") return;
      await tx
        .update(orders)
        .set({
          retryCount: nextAttempt,
          providerError: message.slice(0, 1000),
          nextAttemptAt: new Date(Date.now() + delayMs),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));
      await appendOrderEvent(tx, {
        orderId: order.id,
        kind: "progress",
        message: `Transient provider error (retry ${nextAttempt}/${MAX_SUBMIT_RETRIES} in ${Math.round(delayMs / 1000)}s): ${message}`,
        actor: SYSTEM,
        metadata: { retry: nextAttempt, delayMs },
      });
      await enqueueOutbox(tx, "order.submit", `order:submit:${order.id}:${nextAttempt}`, { orderId: order.id, attempt: nextAttempt }, {
        availableAt: new Date(Date.now() + delayMs),
      });
    });
    logger.warn("provider_submit_retry", { orderPublicId: order.publicId, attempt: nextAttempt, message });
    return;
  }

  const nextStatus: OrderStatus = submission.requiresStaffAction ? "pending_review" : "in_progress";
  const delay = pollDelaySeconds(provider);

  await withTransaction(async (tx) => {
    const latest = (await tx.select().from(orders).where(eq(orders.id, order.id)).limit(1))[0];
    if (!latest || latest.status !== "queued") return;

    await transitionOrder(tx, {
      order: latest,
      to: nextStatus,
      actor: SYSTEM,
      kind: "submitted",
      message: submission.message ?? `Submitted to ${provider.name} (ref ${submission.providerRef}).`,
      extra: {
        providerRef: submission.providerRef,
        providerResponse: submission.raw,
        submittedAt: submission.submittedAt,
        providerError: null,
        nextAttemptAt: null,
        ...(submission.requiresStaffAction ? {} : { startedAt: submission.submittedAt }),
      },
      metadata: { providerKey: provider.key, providerRef: submission.providerRef, state: submission.state },
    });

    if (submission.requiresStaffAction) {
      await notifyUser(tx, {
        userId: order.userId,
        orderId: order.id,
        type: "order.needs_review",
        title: `${order.publicId} is with our campaign team`,
        body: submission.message ?? "A campaign manager is completing the final steps for your order.",
        href: `/dashboard/orders/${order.publicId}`,
        email: {
          template: "order_needs_review",
          data: { name: "there", orderId: order.publicId, orderUrl: `${getEnv().APP_URL}/dashboard/orders/${order.publicId}` },
          dedupeKey: `email:review:${order.id}`,
        },
      });
      await notifyStaff(tx, {
        type: "order.review",
        title: `Action needed for ${order.publicId}`,
        body: submission.message ?? "Provider requires staff activation.",
        href: `/admin/orders/${order.publicId}`,
        roles: ["admin", "support"],
        orderId: order.id,
      });
    } else {
      await notifyUser(tx, {
        userId: order.userId,
        orderId: order.id,
        type: "order.started",
        title: `Your campaign ${order.publicId} has started`,
        body: `Delivery partner: ${provider.name}. Estimated duration: ${service.estimatedDurationHours} hours. Progress is reported only when verified measurements are available.`,
        href: `/dashboard/orders/${order.publicId}`,
        email: {
          template: "order_started",
          data: {
            name: "there",
            orderId: order.publicId,
            serviceName: service.name,
            providerName: ` with ${provider.name}`,
            duration: `${service.estimatedDurationHours} hours`,
            orderUrl: `${getEnv().APP_URL}/dashboard/orders/${order.publicId}`,
          },
          dedupeKey: `email:started:${order.id}`,
        },
      });
    }

    await enqueueOutbox(tx, "order.poll", `order:poll:${order.id}:0`, { orderId: order.id, seq: 0 }, {
      availableAt: new Date(Date.now() + delay * 1000),
    });
    await enqueueOutbox(
      tx,
      "order.timeout",
      `order:timeout:${order.id}`,
      { orderId: order.id },
      { availableAt: new Date(Date.now() + maxCampaignSeconds(provider, service) * 1000) },
    );
  });
}

/* -------------------------------------------------------------------------- */
/* 3. Poll: collect verified progress and reconcile                           */
/* -------------------------------------------------------------------------- */

export async function handleOrderPoll(payload: { orderId: string; seq: number }): Promise<void> {
  const order = await getOrderById(payload.orderId);
  if (!order || !POLLABLE.includes(order.status) || !order.providerRef || !order.providerId) return;

  const provider = await getProviderById(order.providerId);
  if (!provider) return;
  const service = await getServiceById(order.serviceId);
  if (!service) return;

  // Manual assignments only progress when staff record verified delivery.
  if (provider.kind === "manual" && order.status !== "pending_review" && order.verifiedCount === null) {
    await scheduleNextPoll(order, provider, payload.seq + 1);
    return;
  }

  const adapter = createAdapter(provider);
  let report;
  try {
    report = await adapter.getCampaignStatus(order.providerRef);
  } catch (err) {
    if (err instanceof ProviderPermanentError) {
      await failOrder({ order, reason: `Provider status error: ${err.message}`, code: err.code });
      return;
    }
    const message = err instanceof Error ? err.message : "Provider status request failed.";
    logger.warn("poll_transient_error", { orderPublicId: order.publicId, message });
    await withTransaction(async (tx) => {
      await appendOrderEvent(tx, {
        orderId: order.id,
        kind: "progress",
        message: `Status check failed (will retry): ${message}`,
        actor: SYSTEM,
      });
    });
    await scheduleNextPoll(order, provider, payload.seq + 1, 30);
    return;
  }

  const demo = report.evidence.demo;
  const applied = deriveMeasurementFields(order, report.evidence);
  const delivered =
    report.deliveredQuantity ?? applied.verifiedCount ?? applied.attributedCount ?? null;

  const hasData =
    delivered !== null ||
    applied.latestCount !== null ||
    applied.providerReportedCount !== null ||
    applied.verifiedCount !== null;

  // Persist measurements even for intermediate states, but never invent numbers.
  if (hasData) {
    await withTransaction(async (tx) => {
      await recordMeasurement(tx, {
        orderId: order.id,
        evidence: report.evidence,
        applied,
        providerRef: order.providerRef,
        notes: report.evidence.notes.join(" • "),
      });
      await tx
        .update(orders)
        .set({
          baselineCount: applied.baselineCount,
          latestCount: applied.latestCount,
          providerReportedCount: applied.providerReportedCount,
          attributedCount: applied.attributedCount,
          verifiedCount: applied.verifiedCount,
          remainingTarget: applied.remainingTarget,
          measurementSource: applied.measurementSource,
          lastMeasuredAt: applied.lastMeasuredAt,
          measurementNotes: applied.measurementNotes,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));
    });
  }

  if (report.state === "failed") {
    await failOrder({
      order,
      reason: report.message ?? "Provider reported the campaign failed.",
      code: "provider_failed",
    });
    return;
  }

  if (report.state === "cancelled") {
    await withTransaction(async (tx) => {
      const latest = (await tx.select().from(orders).where(eq(orders.id, order.id)).limit(1))[0];
      if (!latest || !POLLABLE.includes(latest.status)) return;
      await transitionOrder(tx, {
        order: latest,
        to: "cancelled",
        actor: SYSTEM,
        kind: "cancelled",
        message: report.message ?? "Provider reported the campaign as cancelled.",
      });
    });
    return;
  }

  if ((report.state === "delivered" || report.state === "partially_delivered") && hasData) {
    const effectiveDelivered = delivered ?? 0;
    if (effectiveDelivered >= order.quantity) {
      await completeOrder(order, report.evidence, effectiveDelivered, demo);
    } else {
      await partiallyCompleteOrder(order, report.evidence, effectiveDelivered, demo);
    }
    return;
  }

  // Still running: emit a throttled progress notification, then poll again.
  const previousPercent = order.attributedCount !== null ? Math.floor((order.attributedCount / order.quantity) * 100) : 0;
  const nextPercent = applied.attributedCount !== null ? Math.floor((applied.attributedCount / order.quantity) * 100) : 0;
  const crossedMilestone = Math.floor(nextPercent / 25) > Math.floor(previousPercent / 25);

  if (crossedMilestone) {
    await withTransaction(async (tx) => {
      await appendOrderEvent(tx, {
        orderId: order.id,
        kind: "progress",
        message: `${nextPercent}% of the requested target reported${demo ? " (demo simulation)" : ""}.`,
        actor: SYSTEM,
        metadata: { percent: nextPercent, demo },
      });
      await notifyUser(tx, {
        userId: order.userId,
        orderId: order.id,
        type: "order.progress",
        title: `Progress on ${order.publicId}: ${nextPercent}%`,
        body: demo
          ? `DEMO DATA — NOT REAL INSTAGRAM ENGAGEMENT. Simulated progress is ${nextPercent}% of your target.`
          : `${nextPercent}% of your requested target has been reported by the delivery partner.`,
        href: `/dashboard/orders/${order.publicId}`,
      });
    });
  }

  await scheduleNextPoll(order, provider, payload.seq + 1);
}

async function scheduleNextPoll(order: Order, provider: Provider, seq: number, overrideSeconds?: number): Promise<void> {
  const delay = overrideSeconds ?? pollDelaySeconds(provider);
  await withTransaction(async (tx) => {
    const latest = (await tx.select().from(orders).where(eq(orders.id, order.id)).limit(1))[0];
    if (!latest || !POLLABLE.includes(latest.status)) return;
    await enqueueOutbox(tx, "order.poll", `order:poll:${order.id}:${seq}`, { orderId: order.id, seq }, {
      availableAt: new Date(Date.now() + delay * 1000),
    });
  });
}

async function completeOrder(order: Order, evidence: Parameters<typeof deriveMeasurementFields>[1], delivered: number, demo: boolean): Promise<void> {
  const result = await withTransaction(async (tx) => {
    const latest = (await tx.select().from(orders).where(eq(orders.id, order.id)).limit(1))[0];
    if (!latest || !POLLABLE.includes(latest.status)) return null;
    const updated = await transitionOrder(tx, {
      order: latest,
      to: "completed",
      actor: SYSTEM,
      kind: "delivered",
      message: demo
        ? `Demo simulation finished: ${delivered.toLocaleString("en-IN")} of ${order.quantity.toLocaleString("en-IN")} simulated units. NOT real Instagram engagement.`
        : `Delivery reconciled: ${delivered.toLocaleString("en-IN")} of ${order.quantity.toLocaleString("en-IN")} units reported by the provider.`,
      extra: {
        remainingTarget: 0,
        completedAt: new Date(),
        lastMeasuredAt: evidence.capturedAt,
        measurementSource: evidence.source,
        ...(evidence.verified && evidence.verifiedQuantity !== null ? { verifiedCount: evidence.verifiedQuantity } : {}),
      },
      metadata: { delivered, demo, source: evidence.source, verified: evidence.verified },
    });

    await appendOrderEvent(tx, {
      orderId: order.id,
      kind: "measurement",
      message: `Final measurement source: ${evidence.source}${evidence.verified ? " (verified)" : " (not verified)"}.`,
      actor: SYSTEM,
      metadata: { evidence: evidence.raw, demo },
    });

    const resultText = demo
      ? `${delivered.toLocaleString("en-IN")} simulated units (DEMO DATA — no real Instagram activity)`
      : `${delivered.toLocaleString("en-IN")} units reported by the provider${evidence.verified ? " and verified" : ""}`;

    await notifyUser(tx, {
      userId: order.userId,
      orderId: order.id,
      type: "order.completed",
      title: demo ? `Demo simulation finished for ${order.publicId}` : `Campaign ${order.publicId} completed`,
      body: demo
        ? `DEMO DATA — NOT REAL INSTAGRAM ENGAGEMENT. The simulated campaign finished with ${resultText}.`
        : `Your campaign is complete. ${resultText}.`,
      href: `/dashboard/orders/${order.publicId}`,
      email: {
        template: "order_completed",
        data: {
          name: "there",
          orderId: order.publicId,
          serviceName: demo ? "Demo simulation" : "Campaign",
          quantity: order.quantity.toLocaleString("en-IN"),
          result: resultText,
          reportUrl: `${getEnv().APP_URL}/dashboard/orders/${order.publicId}/report`,
        },
        dedupeKey: `email:completed:${order.id}`,
      },
    });

    return updated;
  });

  if (result) {
    await recordAudit(db, {
      action: "order.completed",
      entityType: "order",
      entityId: order.publicId,
      actorRole: "system",
      metadata: { delivered, demo, source: evidence.source, verified: evidence.verified },
    });
    logger.info("order_completed", { orderPublicId: order.publicId, delivered, demo });
  }
}

async function partiallyCompleteOrder(order: Order, evidence: Parameters<typeof deriveMeasurementFields>[1], delivered: number, demo: boolean): Promise<void> {
  const remaining = Math.max(order.quantity - delivered, 0);
  const suggestedRefund = Math.round(order.totalPaise * (1 - Math.min(delivered / order.quantity, 1)));

  await withTransaction(async (tx) => {
    const latest = (await tx.select().from(orders).where(eq(orders.id, order.id)).limit(1))[0];
    if (!latest || !POLLABLE.includes(latest.status)) return;

    await transitionOrder(tx, {
      order: latest,
      to: "partially_completed",
      actor: SYSTEM,
      kind: "partial_delivery",
      message: demo
        ? `Demo simulation ended below target: ${delivered.toLocaleString("en-IN")} of ${order.quantity.toLocaleString("en-IN")} simulated units (DEMO DATA).`
        : `Provider finished below target: ${delivered.toLocaleString("en-IN")} of ${order.quantity.toLocaleString("en-IN")} units.`,
      extra: {
        remainingTarget: remaining,
        completedAt: new Date(),
        lastMeasuredAt: evidence.capturedAt,
        measurementSource: evidence.source,
        ...(evidence.verified && evidence.verifiedQuantity !== null ? { verifiedCount: evidence.verifiedQuantity } : {}),
      },
      metadata: { delivered, remaining, demo, suggestedRefundPaise: suggestedRefund },
    });

    await notifyUser(tx, {
      userId: order.userId,
      orderId: order.id,
      type: "order.partial",
      title: demo ? `Demo simulation ended early for ${order.publicId}` : `${order.publicId} was partially delivered`,
      body: demo
        ? `DEMO DATA — NOT REAL INSTAGRAM ENGAGEMENT. The simulation delivered ${delivered.toLocaleString("en-IN")} of ${order.quantity.toLocaleString("en-IN")} simulated units.`
        : `The delivery partner reported ${delivered.toLocaleString("en-IN")} of ${order.quantity.toLocaleString("en-IN")} units. You can request a refund for the undelivered portion.`,
      href: `/dashboard/orders/${order.publicId}`,
      email: {
        template: "order_progress",
        data: {
          name: "there",
          orderId: order.publicId,
          message: `Delivery ended at ${delivered.toLocaleString("en-IN")} of ${order.quantity.toLocaleString("en-IN")} requested units. A partial refund may be available.`,
          orderUrl: `${getEnv().APP_URL}/dashboard/orders/${order.publicId}`,
        },
        dedupeKey: `email:partial:${order.id}`,
      },
    });

    await notifyStaff(tx, {
      type: "order.partial",
      title: `Partial delivery on ${order.publicId}`,
      body: `Delivered ${delivered}/${order.quantity}. Suggested partial refund: ${formatPaise(suggestedRefund)}.`,
      href: `/admin/orders/${order.publicId}`,
      roles: ["admin", "finance"],
      orderId: order.id,
    });
  });

  await recordAudit(db, {
    action: "order.partially_completed",
    entityType: "order",
    entityId: order.publicId,
    actorRole: "system",
    metadata: { delivered, remaining, demo },
  });
}

/* -------------------------------------------------------------------------- */
/* 4. Timeouts and payment expiry                                             */
/* -------------------------------------------------------------------------- */

export async function handleOrderTimeout(payload: { orderId: string }): Promise<void> {
  const order = await getOrderById(payload.orderId);
  if (!order) return;
  if (["completed", "partially_completed", "failed", "cancelled", "refunded", "partially_refunded"].includes(order.status)) return;
  if (order.status === "pending_review" && order.verifiedCount !== null) return;
  await failOrder({
    order,
    reason: "The campaign did not report completion within the expected delivery window. Our team will review the provider status and any refund.",
    code: "campaign_timeout",
  });
}

export async function handlePaymentExpire(payload: { orderId: string }): Promise<void> {
  const order = await getOrderById(payload.orderId);
  if (!order || order.status !== "pending_payment") return;
  const ageMinutes = (Date.now() - order.createdAt.getTime()) / 60_000;
  if (ageMinutes < 55) return;

  await withTransaction(async (tx) => {
    const latest = (await tx.select().from(orders).where(eq(orders.id, order.id)).limit(1))[0];
    if (!latest || latest.status !== "pending_payment") return;
    await transitionOrder(tx, {
      order: latest,
      to: "cancelled",
      actor: SYSTEM,
      kind: "cancelled",
      message: "Checkout expired before payment was completed.",
      extra: { cancelledAt: new Date() },
    });
    await tx
      .update(payments)
      .set({ status: "failed", failureReason: "Checkout expired before capture.", updatedAt: new Date() })
      .where(and(eq(payments.orderId, order.id), eq(payments.status, "pending")));
    await notifyUser(tx, {
      userId: order.userId,
      orderId: order.id,
      type: "order.expired",
      title: `Payment expired for ${order.publicId}`,
      body: "Checkout expired after 60 minutes. No money was captured. Start a new order whenever you're ready.",
      href: `/dashboard/orders/${order.publicId}`,
    });
  });
}

/* -------------------------------------------------------------------------- */
/* 5. Provider health                                                         */
/* -------------------------------------------------------------------------- */

export async function handleProviderHealth(payload: { providerId?: string }): Promise<void> {
  await getDbAsync();
  const rows = payload.providerId
    ? await db.select().from(providersTable).where(eq(providersTable.id, payload.providerId))
    : await db.select().from(providersTable).where(eq(providersTable.enabled, true));

  for (const provider of rows) {
    const adapter = createAdapter(provider);
    let health;
    try {
      health = await adapter.healthCheck();
    } catch (err) {
      health = { status: "down" as const, message: (err as Error).message, checkedAt: new Date() };
    }
    await db
      .update(providersTable)
      .set({
        health: health.status,
        lastHealthCheckAt: health.checkedAt,
        lastHealthMessage: health.message.slice(0, 1000),
        updatedAt: new Date(),
      })
      .where(eq(providersTable.id, provider.id));
  }
}

/* -------------------------------------------------------------------------- */
/* 6. Platform sweeps (scheduled by worker)                                   */
/* -------------------------------------------------------------------------- */

/** Re-drives orders stuck in pending_provider (admin alerting safety net). */
export async function sweepPendingProviderOrders(olderThanMinutes = 30): Promise<number> {
  await getDbAsync();
  const rows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.status, "pending_provider"),
        sql`${orders.updatedAt} < now() - (${olderThanMinutes} * interval '1 minute')`,
      ),
    )
    .limit(10);
  for (const row of rows) {
    await enqueueJob(
      { type: "order.route", dedupeKey: `order:route:sweep:${row.id}:${Math.floor(Date.now() / 3_600_000)}`, payload: { orderId: row.id } },
      db,
    );
  }
  return rows.length;
}

export async function getCustomerEmail(userId: string): Promise<string | null> {
  const rows = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return rows[0]?.email ?? null;
}
