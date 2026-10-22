import { getEnv } from "@/lib/env";

/**
 * Shown whenever the deployment runs in demo mode. It is deliberately loud: no one should
 * mistake simulated campaigns or mock payments for real delivery.
 */
export function DemoBanner() {
  const env = getEnv();
  if (!env.DEMO_MODE) return null;
  return (
    <div className="demo-stripe border-b border-accent-300 bg-accent-50">
      <div className="container-page flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2 text-center text-xs font-semibold text-accent-900">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-500 px-2 py-0.5 text-white">DEMO MODE</span>
        <span>
          Simulated provider + {env.PAYMENTS_PROVIDER === "mock" ? "mock payments" : "Razorpay test payments"}. No real
          Instagram engagement is generated and no money is charged.
        </span>
      </div>
    </div>
  );
}
