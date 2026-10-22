"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/lib/money";
import { callApi } from "@/components/app/action-button";

type Handoff = {
  provider: "mock" | "razorpay";
  mode: "demo" | "test" | "live";
  providerOrderId: string;
  amountPaise: number;
  currency: "INR";
  publicKey?: string;
  merchantName: string;
  description: string;
  prefill: { name: string; email: string; contact?: string };
  mockAuthorizePath?: string;
  demo: boolean;
};

type RazorpayInstance = { open: () => void; on: (event: string, cb: (payload: unknown) => void) => void };
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function PaymentPanel({
  orderPublicId,
  handoff,
  amountPaise,
}: {
  orderPublicId: string;
  handoff: Handoff | null;
  amountPaise: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<Handoff | null>(handoff);

  async function refreshHandoff() {
    setLoading("handoff");
    setError(null);
    try {
      const result = await callApi(`/api/orders/${orderPublicId}/checkout`, {});
      if (!result.ok) {
        setError(result.error?.message ?? "Could not start checkout.");
        return;
      }
      setCurrent((result.data as { checkout: Handoff }).checkout);
    } finally {
      setLoading(null);
    }
  }

  async function payDemo(outcome: "success" | "failure") {
    setLoading(outcome);
    setError(null);
    try {
      const result = await callApi(current?.mockAuthorizePath ?? "/api/payments/mock/authorize", {
        orderPublicId,
        outcome,
      });
      if (!result.ok) {
        setError(result.error?.message ?? "Simulated payment failed.");
        return;
      }
      const redirectTo = (result.data as { redirectTo?: string }).redirectTo;
      router.push(redirectTo ?? `/dashboard/orders/${orderPublicId}?paid=1`);
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  async function payRazorpay() {
    if (!current) return;
    setLoading("razorpay");
    setError(null);
    const loaded = await loadRazorpayScript();
    if (!loaded) {
      setError("Could not load the payment gateway. Check your connection or disable script blockers.");
      setLoading(null);
      return;
    }
    if (!current.publicKey) {
      setError("Payment gateway key is missing. Contact support.");
      setLoading(null);
      return;
    }

    const rzp = new window.Razorpay!({
      key: current.publicKey,
      amount: current.amountPaise,
      currency: current.currency,
      name: current.merchantName,
      description: current.description,
      order_id: current.providerOrderId,
      prefill: current.prefill,
      theme: { color: "#6b21d8" },
      modal: {
        ondismiss: () => {
          setLoading(null);
          setError("Payment window closed before completion. No money was captured.");
        },
      },
      handler: async (response: Record<string, string>) => {
        const result = await callApi("/api/payments/razorpay/verify", {
          orderPublicId,
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
        });
        if (!result.ok) {
          setError(result.error?.message ?? "We could not verify the payment. Support has been notified.");
          setLoading(null);
          return;
        }
        router.push(`/dashboard/orders/${orderPublicId}?paid=1`);
        router.refresh();
      },
    });
    rzp.on("payment.failed", () => {
      setError("The payment failed. No money was captured — you can retry.");
      setLoading(null);
    });
    rzp.open();
  }

  if (!current) {
    return (
      <div className="space-y-3">
        <Alert tone="warn" title="Payment gateway not ready">
          Your order exists, but we could not create a payment link. No money has been charged. Retry below.
        </Alert>
        <Button onClick={refreshHandoff} loading={loading === "handoff"}>
          Create payment link
        </Button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-canvas/60 px-4 py-3">
        <div>
          <p className="text-xs text-ink-faint">Amount due</p>
          <p className="text-xl font-bold tabular-nums">{formatPaise(amountPaise)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={current.provider === "mock" ? "demo" : "info"}>
            {current.provider === "mock" ? "TEST PAYMENT" : `Razorpay ${current.mode}`}
          </Badge>
          <span className="text-xs text-ink-faint">
            via {current.provider === "razorpay" ? "Razorpay (cards, UPI, netbanking)" : "demo adapter"}
          </span>
        </div>
      </div>

      {current.provider === "mock" ? (
        <>
          <Alert tone="demo" title="Demo payment — no money is charged">
            This deployment uses the mock payment adapter. The button below simulates a successful gateway callback through
            the same server-side verification path used for real payments.
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => payDemo("success")} loading={loading === "success"} size="lg">
              Pay {formatPaise(amountPaise)} (simulated)
            </Button>
            <Button onClick={() => payDemo("failure")} variant="secondary" loading={loading === "failure"}>
              Simulate a declined payment
            </Button>
          </div>
        </>
      ) : (
        <>
          <Alert tone="info" title="Secure Razorpay checkout">
            You&apos;ll pay {formatPaise(amountPaise)} through Razorpay. We never see or store your card details. Payment is
            verified server-side before the order is processed.
          </Alert>
          <Button onClick={payRazorpay} loading={loading === "razorpay"} size="lg">
            Open Razorpay checkout
          </Button>
        </>
      )}

      {error && (
        <Alert tone="danger" title="Payment not completed">
          {error}
        </Alert>
      )}

      <div className="text-xs leading-relaxed text-ink-faint">
        <p>Cards, UPI and netbanking are handled by the gateway. Duplicate callbacks are ignored using event IDs.</p>
        <button className="mt-2 underline hover:text-ink" onClick={refreshHandoff} type="button">
          Refresh payment link
        </button>
      </div>
    </div>
  );
}
