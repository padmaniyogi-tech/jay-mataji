import { createHmac } from "node:crypto";
import { getEnv } from "@/lib/env";
import type {
  CheckoutHandoff,
  ParsedWebhook,
  PaymentGateway,
  PaymentIntentInput,
  RefundResult,
  VerifiedPayment,
} from "./types";

const MOCK_SECRET = "amplifi-demo-payment-secret";

export function mockSignature(providerOrderId: string, providerPaymentId: string): string {
  return createHmac("sha256", MOCK_SECRET).update(`${providerOrderId}|${providerPaymentId}`).digest("hex");
}

/**
 * DEMO PAYMENT ADAPTER.
 *
 * Used when PAYMENTS_PROVIDER=mock (default in demo mode). It never contacts Razorpay and
 * never moves money. The UI must show "TEST PAYMENT — no money is charged" whenever
 * `mode` is "demo".
 */
export class MockPaymentGateway implements PaymentGateway {
  readonly name = "mock" as const;
  readonly mode = "demo" as const;
  readonly demo = true;

  isConfigured(): boolean {
    return getEnv().DEMO_MODE;
  }

  async createIntent(input: PaymentIntentInput): Promise<CheckoutHandoff> {
    if (!this.isConfigured()) throw new Error("Mock payments are only available in DEMO_MODE.");
    if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
      throw new Error("Mock payment amount must be a positive integer in paise.");
    }
    const providerOrderId = `mock_order_${input.orderPublicId}_${Date.now()}`;
    return {
      provider: "mock",
      mode: "demo",
      providerOrderId,
      amountPaise: input.amountPaise,
      currency: "INR",
      merchantName: getEnv().APP_NAME,
      description: `Demo payment for ${input.orderPublicId}`,
      prefill: { name: input.customer.name, email: input.customer.email, contact: input.customer.phone ?? undefined },
      mockAuthorizePath: `/api/payments/mock/authorize`,
      demo: true,
    };
  }

  async verifyPayment(input: {
    providerOrderId: string;
    providerPaymentId: string;
    signature: string;
  }): Promise<VerifiedPayment> {
    const expected = mockSignature(input.providerOrderId, input.providerPaymentId);
    const ok = expected === input.signature && input.providerPaymentId.startsWith("mockpay_");
    return {
      ok,
      provider: "mock",
      providerPaymentId: ok ? input.providerPaymentId : null,
      amountPaise: null,
      method: "demo",
      reason: ok ? undefined : "Invalid demo payment signature.",
      raw: { demo: true, providerOrderId: input.providerOrderId },
    };
  }

  async fetchPayment(providerPaymentId: string): Promise<VerifiedPayment> {
    return {
      ok: providerPaymentId.startsWith("mockpay_"),
      provider: "mock",
      providerPaymentId,
      amountPaise: null,
      method: "demo",
      raw: { demo: true },
    };
  }

  async refund(input: { amountPaise: number; refundId: string }): Promise<RefundResult> {
    return {
      ok: true,
      providerRefundId: `mockrefund_${input.refundId.slice(0, 12)}`,
      amountPaise: input.amountPaise,
      status: "processed",
      message: "Demo refund recorded. No money moved.",
      raw: { demo: true },
    };
  }

  parseWebhook(rawBody: string): ParsedWebhook {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return { valid: false, eventId: "invalid", eventType: "invalid", reason: "Malformed JSON", raw: {} };
    }
    const payment = (parsed.payload as { payment?: { entity?: Record<string, unknown> } } | undefined)?.payment?.entity;
    return {
      valid: true,
      eventId: String(parsed.id ?? `mock_${Date.now()}`),
      eventType: String(parsed.event ?? "payment.captured"),
      payment: {
        providerOrderId: typeof payment?.order_id === "string" ? payment.order_id : null,
        providerPaymentId: typeof payment?.id === "string" ? payment.id : null,
        amountPaise: typeof payment?.amount === "number" ? payment.amount : null,
        status: typeof payment?.status === "string" ? payment.status : null,
        method: typeof payment?.method === "string" ? payment.method : null,
      },
      raw: parsed,
    };
  }
}
