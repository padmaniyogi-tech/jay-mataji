import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import type {
  CheckoutHandoff,
  ParsedWebhook,
  PaymentGateway,
  PaymentIntentInput,
  RefundResult,
  VerifiedPayment,
} from "./types";

/**
 * Razorpay (India) integration using the official server SDK.
 *
 * Server-only: the browser receives `publicKey` (key_id) and the Razorpay order id, never
 * the key secret. Payment success is only trusted after server-side signature verification
 * or a signature-verified webhook — never from a client "success" callback alone.
 *
 * Docs: https://razorpay.com/docs/api/orders/ , /api/payments/ , /api/refunds/ ,
 *       /webhooks/ (X-Razorpay-Signature = HMAC-SHA256(raw body, webhook secret))
 */

type RazorpayLike = {
  orders: { create: (o: Record<string, unknown>) => Promise<{ id: string; amount: number; currency: string; status: string }> };
  payments: {
    fetch: (id: string) => Promise<Record<string, unknown>>;
    refund: (id: string, o: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };
};

let client: RazorpayLike | null = null;

async function getClient(): Promise<RazorpayLike> {
  if (client) return client;
  const env = getEnv();
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
  }
  const mod = (await import("razorpay")) as unknown as { default: new (opts: { key_id: string; key_secret: string }) => RazorpayLike };
  client = new mod.default({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  return client;
}

function safeEqualHex(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export class RazorpayGateway implements PaymentGateway {
  readonly name = "razorpay" as const;
  readonly mode: "test" | "live";
  readonly demo = false;

  constructor() {
    this.mode = getEnv().RAZORPAY_MODE;
  }

  isConfigured(): boolean {
    const env = getEnv();
    return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
  }

  async createIntent(input: PaymentIntentInput): Promise<CheckoutHandoff> {
    const env = getEnv();
    if (!this.isConfigured()) throw new Error("Razorpay credentials are not configured.");
    const rz = await getClient();
    const order = await rz.orders.create({
      amount: input.amountPaise,
      currency: "INR",
      receipt: input.receipt.slice(0, 40),
      payment_capture: 1,
      notes: { orderPublicId: input.orderPublicId, ...(input.notes ?? {}) },
    });
    return {
      provider: "razorpay",
      mode: this.mode,
      providerOrderId: order.id,
      amountPaise: input.amountPaise,
      currency: "INR",
      publicKey: env.RAZORPAY_KEY_ID,
      merchantName: env.APP_NAME,
      description: `Order ${input.orderPublicId}`,
      prefill: { name: input.customer.name, email: input.customer.email, contact: input.customer.phone ?? undefined },
      demo: false,
    };
  }

  async verifyPayment(input: {
    providerOrderId: string;
    providerPaymentId: string;
    signature: string;
  }): Promise<VerifiedPayment> {
    const env = getEnv();
    if (!env.RAZORPAY_KEY_SECRET) throw new Error("Razorpay secret is not configured.");
    const expected = createHmac("sha256", env.RAZORPAY_KEY_SECRET)
      .update(`${input.providerOrderId}|${input.providerPaymentId}`)
      .digest("hex");
    const signatureValid = safeEqualHex(expected, input.signature);
    if (!signatureValid) {
      logger.warn("razorpay_signature_invalid", { providerOrderId: input.providerOrderId });
      return {
        ok: false,
        provider: "razorpay",
        providerPaymentId: null,
        amountPaise: null,
        method: null,
        reason: "Payment signature verification failed.",
        raw: {},
      };
    }
    // Signature proves Razorpay issued it; also confirm amount/status/order server-side.
    const payment = await this.fetchPayment(input.providerPaymentId);
    if (!payment.ok) return payment;
    if (payment.raw.order_id && payment.raw.order_id !== input.providerOrderId) {
      return {
        ok: false,
        provider: "razorpay",
        providerPaymentId: null,
        amountPaise: null,
        method: null,
        reason: "Payment does not belong to this order.",
        raw: payment.raw,
      };
    }
    const status = String(payment.raw.status ?? "");
    if (!["captured", "authorized"].includes(status)) {
      return {
        ok: false,
        provider: "razorpay",
        providerPaymentId: null,
        amountPaise: null,
        method: null,
        reason: `Payment is not captured (status: ${status || "unknown"}).`,
        raw: payment.raw,
      };
    }
    return payment;
  }

  async fetchPayment(providerPaymentId: string): Promise<VerifiedPayment> {
    const rz = await getClient();
    const payment = await rz.payments.fetch(providerPaymentId);
    const amount = typeof payment.amount === "number" ? payment.amount : null;
    return {
      ok: true,
      provider: "razorpay",
      providerPaymentId: String(payment.id ?? providerPaymentId),
      amountPaise: amount,
      method: typeof payment.method === "string" ? payment.method : null,
      raw: payment,
    };
  }

  async refund(input: {
    providerPaymentId: string;
    amountPaise: number;
    reason: string;
    refundId: string;
  }): Promise<RefundResult> {
    const rz = await getClient();
    try {
      const refund = await rz.payments.refund(input.providerPaymentId, {
        amount: input.amountPaise,
        speed: "normal",
        notes: { reason: input.reason.slice(0, 200), internalRefundId: input.refundId },
      });
      const status = String(refund.status ?? "pending");
      return {
        ok: true,
        providerRefundId: typeof refund.id === "string" ? refund.id : null,
        amountPaise: typeof refund.amount === "number" ? refund.amount : input.amountPaise,
        status: status === "processed" ? "processed" : status === "failed" ? "failed" : "pending",
        raw: refund,
      };
    } catch (err) {
      const message = (err as { error?: { description?: string } }).error?.description ?? (err as Error).message;
      logger.error("razorpay_refund_failed", { message });
      return { ok: false, providerRefundId: null, amountPaise: input.amountPaise, status: "failed", message, raw: {} };
    }
  }

  parseWebhook(rawBody: string, headers: Headers): ParsedWebhook {
    const env = getEnv();
    const signature = headers.get("x-razorpay-signature") ?? "";
    if (!env.RAZORPAY_WEBHOOK_SECRET) {
      return { valid: false, eventId: "unverified", eventType: "unknown", reason: "Webhook secret not configured", raw: {} };
    }
    const expected = createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest("hex");
    if (!safeEqualHex(expected, signature)) {
      return { valid: false, eventId: "invalid", eventType: "unknown", reason: "Invalid X-Razorpay-Signature", raw: {} };
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return { valid: false, eventId: "invalid", eventType: "unknown", reason: "Malformed JSON", raw: {} };
    }
    const eventType = String(parsed.event ?? "unknown");
    // Razorpay sends x-razorpay-event-id for deduplication; fall back to a hash of body.
    const eventId =
      headers.get("x-razorpay-event-id") ??
      createHmac("sha256", "event").update(rawBody).digest("hex").slice(0, 40);

    const payload = parsed.payload as
      | {
          payment?: { entity?: Record<string, unknown> };
          refund?: { entity?: Record<string, unknown> };
        }
      | undefined;

    const payment = payload?.payment?.entity;
    const refund = payload?.refund?.entity;

    return {
      valid: true,
      eventId,
      eventType,
      payment: payment
        ? {
            providerOrderId: typeof payment.order_id === "string" ? payment.order_id : null,
            providerPaymentId: typeof payment.id === "string" ? payment.id : null,
            amountPaise: typeof payment.amount === "number" ? payment.amount : null,
            status: typeof payment.status === "string" ? payment.status : null,
            method: typeof payment.method === "string" ? payment.method : null,
            email: typeof payment.email === "string" ? payment.email : null,
          }
        : undefined,
      refund: refund
        ? {
            providerRefundId: typeof refund.id === "string" ? refund.id : null,
            providerPaymentId: typeof refund.payment_id === "string" ? refund.payment_id : null,
            amountPaise: typeof refund.amount === "number" ? refund.amount : null,
            status: typeof refund.status === "string" ? refund.status : null,
          }
        : undefined,
      raw: parsed,
    };
  }
}
