export type PaymentMode = "demo" | "test" | "live";

export type PaymentIntentInput = {
  orderPublicId: string;
  amountPaise: number;
  currency: "INR";
  receipt: string;
  customer: { name: string; email: string; phone?: string | null };
  notes?: Record<string, string>;
};

export type CheckoutHandoff = {
  provider: "mock" | "razorpay";
  mode: PaymentMode;
  providerOrderId: string;
  amountPaise: number;
  currency: "INR";
  /** Public key only — never the secret. */
  publicKey?: string;
  merchantName: string;
  description: string;
  prefill: { name: string; email: string; contact?: string };
  /** Demo-only endpoint the browser can call to simulate a completed payment. */
  mockAuthorizePath?: string;
  /** True when the UI must display a DEMO label. */
  demo: boolean;
};

export type VerifiedPayment = {
  ok: boolean;
  provider: "mock" | "razorpay";
  providerPaymentId: string | null;
  amountPaise: number | null;
  method: string | null;
  reason?: string;
  raw: Record<string, unknown>;
};

export type RefundResult = {
  ok: boolean;
  providerRefundId: string | null;
  amountPaise: number;
  status: "processed" | "pending" | "failed";
  message?: string;
  raw: Record<string, unknown>;
};

export type ParsedWebhook = {
  valid: boolean;
  eventId: string;
  eventType: string;
  reason?: string;
  payment?: {
    providerOrderId?: string | null;
    providerPaymentId?: string | null;
    amountPaise?: number | null;
    status?: string | null;
    method?: string | null;
    email?: string | null;
  };
  refund?: {
    providerRefundId?: string | null;
    providerPaymentId?: string | null;
    amountPaise?: number | null;
    status?: string | null;
  };
  raw: Record<string, unknown>;
};

export interface PaymentGateway {
  readonly name: "mock" | "razorpay";
  readonly mode: PaymentMode;
  readonly demo: boolean;
  isConfigured(): boolean;
  createIntent(input: PaymentIntentInput): Promise<CheckoutHandoff>;
  verifyPayment(input: {
    providerOrderId: string;
    providerPaymentId: string;
    signature: string;
  }): Promise<VerifiedPayment>;
  fetchPayment(providerPaymentId: string): Promise<VerifiedPayment>;
  refund(input: {
    providerPaymentId: string;
    amountPaise: number;
    reason: string;
    refundId: string;
  }): Promise<RefundResult>;
  parseWebhook(rawBody: string, headers: Headers): ParsedWebhook;
}
