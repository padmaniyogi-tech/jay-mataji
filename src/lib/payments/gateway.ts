import { getEnv } from "@/lib/env";
import type { PaymentGateway } from "./types";
import { MockPaymentGateway } from "./mock";
import { RazorpayGateway } from "./razorpay";

export function getPaymentGateway(): PaymentGateway {
  const env = getEnv();
  if (env.PAYMENTS_PROVIDER === "razorpay") {
    const gateway = new RazorpayGateway();
    if (!gateway.isConfigured()) {
      throw new Error(
        "PAYMENTS_PROVIDER=razorpay but RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are missing. Set them in .env.local or switch to mock for demo mode.",
      );
    }
    return gateway;
  }
  const mock = new MockPaymentGateway();
  if (!mock.isConfigured()) {
    throw new Error(
      "Mock payments require DEMO_MODE=true. Configure Razorpay credentials for real payments instead of disabling demo mode.",
    );
  }
  return mock;
}

export function paymentProviderName(): "mock" | "razorpay" {
  return getEnv().PAYMENTS_PROVIDER === "razorpay" ? "razorpay" : "mock";
}

export * from "./types";
