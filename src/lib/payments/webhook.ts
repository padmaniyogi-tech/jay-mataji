import { and, eq } from "drizzle-orm";
import { db, getDbAsync } from "@/lib/db";
import { orders, payments, refunds, webhookEvents } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sha256 } from "@/lib/crypto";
import { formatPaise } from "@/lib/money";
import { notifyUser } from "@/lib/notifications";
import { appendOrderEvent } from "@/lib/orders/events";
import { confirmPayment } from "@/lib/orders/service";
import { reconcileRefundWebhook } from "@/lib/orders/refunds";
import { getPaymentGateway } from "./gateway";

export type WebhookOutcome = {
  status: number;
  body: Record<string, unknown>;
};

/** Records a webhook once; returns false when it is a duplicate delivery. */
export async function recordWebhook(input: {
  source: string;
  externalId: string;
  payload: Record<string, unknown>;
  signatureValid: boolean;
}): Promise<{ id: string; duplicate: boolean }> {
  const inserted = await db
    .insert(webhookEvents)
    .values({
      source: input.source,
      externalId: input.externalId,
      payloadHash: sha256(JSON.stringify(input.payload)).slice(0, 64),
      signatureValid: input.signatureValid,
      payload: input.payload,
      status: "received",
    })
    .onConflictDoNothing({ target: [webhookEvents.source, webhookEvents.externalId] })
    .returning({ id: webhookEvents.id });

  if (inserted[0]) return { id: inserted[0].id, duplicate: false };

  const existing = await db
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(and(eq(webhookEvents.source, input.source), eq(webhookEvents.externalId, input.externalId)))
    .limit(1);
  return { id: existing[0]?.id ?? "unknown", duplicate: true };
}

export async function finishWebhook(id: string, status: "processed" | "ignored" | "failed", error?: string): Promise<void> {
  await db
    .update(webhookEvents)
    .set({ status, processedAt: new Date(), error: error?.slice(0, 1000) ?? null })
    .where(eq(webhookEvents.id, id));
}

export async function processRazorpayWebhook(req: Request): Promise<WebhookOutcome> {
  await getDbAsync();
  const env = getEnv();
  if (env.PAYMENTS_PROVIDER !== "razorpay") {
    return { status: 404, body: { error: "Razorpay webhooks are not enabled on this deployment." } };
  }

  const rawBody = await req.text();
  const gateway = getPaymentGateway();
  const parsed = gateway.parseWebhook(rawBody, req.headers);

  if (!parsed.valid) {
    await recordWebhook({
      source: "razorpay",
      externalId: `invalid_${sha256(rawBody).slice(0, 32)}`,
      payload: { reason: parsed.reason },
      signatureValid: false,
    }).then(({ id }) => finishWebhook(id, "failed", parsed.reason));
    logger.warn("webhook_signature_invalid", { source: "razorpay", reason: parsed.reason });
    return { status: 400, body: { error: "Invalid webhook signature." } };
  }

  const { id: eventRowId, duplicate } = await recordWebhook({
    source: "razorpay",
    externalId: parsed.eventId,
    payload: parsed.raw,
    signatureValid: true,
  });

  if (duplicate) {
    logger.info("webhook_duplicate_ignored", { source: "razorpay", eventId: parsed.eventId });
    return { status: 200, body: { received: true, duplicate: true } };
  }

  try {
    switch (parsed.eventType) {
      case "payment.captured":
      case "payment.authorized":
      case "order.paid": {
        const providerOrderId = parsed.payment?.providerOrderId;
        if (!providerOrderId) {
          await finishWebhook(eventRowId, "ignored", "No order id in payload");
          return { status: 200, body: { received: true, ignored: "no_order" } };
        }
        const paymentRows = await db.select().from(payments).where(eq(payments.providerOrderId, providerOrderId)).limit(1);
        const payment = paymentRows[0];
        if (!payment) {
          await finishWebhook(eventRowId, "ignored", "Unknown payment order");
          return { status: 200, body: { received: true, ignored: "unknown_payment" } };
        }
        const orderRows = await db.select().from(orders).where(eq(orders.id, payment.orderId)).limit(1);
        const order = orderRows[0];
        if (!order) {
          await finishWebhook(eventRowId, "ignored", "Order missing");
          return { status: 200, body: { received: true, ignored: "unknown_order" } };
        }
        if (!parsed.payment?.providerPaymentId) {
          await finishWebhook(eventRowId, "ignored", "No payment id");
          return { status: 200, body: { received: true, ignored: "no_payment_id" } };
        }
        await confirmPayment({
          orderPublicId: order.publicId,
          providerOrderId,
          providerPaymentId: parsed.payment.providerPaymentId,
          source: "webhook",
          method: parsed.payment.method ?? null,
        });
        await finishWebhook(eventRowId, "processed");
        return { status: 200, body: { received: true, processed: "payment" } };
      }

      case "payment.failed": {
        const providerOrderId = parsed.payment?.providerOrderId;
        if (!providerOrderId) {
          await finishWebhook(eventRowId, "ignored", "No order id");
          return { status: 200, body: { received: true, ignored: "no_order" } };
        }
        const paymentRows = await db.select().from(payments).where(eq(payments.providerOrderId, providerOrderId)).limit(1);
        const payment = paymentRows[0];
        if (!payment) {
          await finishWebhook(eventRowId, "ignored", "Unknown payment");
          return { status: 200, body: { received: true, ignored: "unknown_payment" } };
        }
        const updated = await db
          .update(payments)
          .set({ status: "failed", failureReason: "Gateway reported payment failure.", updatedAt: new Date() })
          .where(and(eq(payments.id, payment.id), eq(payments.status, "pending")))
          .returning({ id: payments.id });
        if (updated[0]) {
          const orderRows = await db.select().from(orders).where(eq(orders.id, payment.orderId)).limit(1);
          const order = orderRows[0];
          if (order && order.status === "pending_payment") {
            await appendOrderEvent(db, {
              orderId: order.id,
              kind: "payment",
              message: "Gateway reported the payment as failed. No money was captured.",
              actor: { kind: "system", label: "razorpay-webhook" },
            });
            await notifyUser(db, {
              userId: order.userId,
              orderId: order.id,
              type: "payment.failed",
              title: `Payment failed for ${order.publicId}`,
              body: "Your payment attempt did not complete and no money was captured. You can retry from the order page.",
              href: `/dashboard/orders/${order.publicId}`,
              email: {
                template: "payment_failed",
                data: { name: "there", orderId: order.publicId, orderUrl: `${env.APP_URL}/dashboard/orders/${order.publicId}` },
                dedupeKey: `email:payment-failed:${order.id}:${parsed.eventId}`,
              },
            });
          }
        }
        await finishWebhook(eventRowId, "processed");
        return { status: 200, body: { received: true, processed: "payment_failed" } };
      }

      case "refund.processed":
      case "refund.created":
      case "payment.refunded": {
        const providerRefundId = parsed.refund?.providerRefundId;
        if (!providerRefundId) {
          await finishWebhook(eventRowId, "ignored", "No refund id");
          return { status: 200, body: { received: true, ignored: "no_refund_id" } };
        }
        const reconciled = await reconcileRefundWebhook({
          providerRefundId,
          providerPaymentId: parsed.refund?.providerPaymentId,
          status: parsed.refund?.status,
          amountPaise: parsed.refund?.amountPaise,
        });
        if (!reconciled.matched) {
          const known = await db.select({ id: refunds.id }).from(refunds).where(eq(refunds.providerRefundId, providerRefundId)).limit(1);
          await finishWebhook(eventRowId, "ignored", known[0] ? "already reconciled" : "unknown refund");
          return { status: 200, body: { received: true, ignored: "unknown_refund" } };
        }
        await finishWebhook(eventRowId, "processed");
        logger.info("refund_webhook_reconciled", { providerRefundId });
        return { status: 200, body: { received: true, processed: "refund" } };
      }

      default:
        await finishWebhook(eventRowId, "ignored", `Unhandled event ${parsed.eventType}`);
        return { status: 200, body: { received: true, ignored: parsed.eventType } };
    }
  } catch (err) {
    const message = (err as Error).message;
    await finishWebhook(eventRowId, "failed", message);
    logger.error("webhook_processing_failed", { source: "razorpay", eventId: parsed.eventId, message });
    // Razorpay retries non-2xx responses; a genuine processing error should be retried.
    return { status: 500, body: { error: "Webhook processing failed." } };
  }
}

/** Provider webhooks that only need to trigger reconciliation (agency/meta). */
export async function enqueueReconciliationForProviderRef(
  providerRefs: string[],
  reason: string,
): Promise<number> {
  if (providerRefs.length === 0) return 0;
  const { enqueueReconciliationForOrder } = await import("@/lib/orders/reconcile");
  let count = 0;
  for (const ref of providerRefs) {
    if (!ref) continue;
    const rows = await db.select({ id: orders.id }).from(orders).where(eq(orders.providerRef, ref)).limit(1);
    if (rows[0]) {
      await enqueueReconciliationForOrder(rows[0].id, reason);
      count += 1;
    }
  }
  return count;
}

export function webhookBodySummary(event: string, amountPaise?: number | null): string {
  return amountPaise ? `${event} (${formatPaise(amountPaise)})` : event;
}
