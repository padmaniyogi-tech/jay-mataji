import { listProviders, createAdapter } from "./registry";
import { getEnv } from "@/lib/env";

export type ProviderAvailability = {
  configured: number;
  demo: number;
  manual: number;
  unavailable: number;
  usable: boolean;
  headline: string;
  detail: string;
  demoOnly: boolean;
};

/**
 * User-facing description of how a given service can actually be delivered right now.
 * This is what stops the product from implying that a URL + quantity alone creates results.
 */
export async function describeProviderAvailability(serviceKind: string): Promise<ProviderAvailability> {
  const env = getEnv();
  const rows = await listProviders();
  let configured = 0;
  let demo = 0;
  let manual = 0;
  let unavailable = 0;

  for (const provider of rows) {
    const adapter = createAdapter(provider);
    const caps = adapter.capabilities();
    if (!caps.kinds.includes(serviceKind)) continue;
    if (!provider.enabled) {
      unavailable += 1;
      continue;
    }
    if (provider.kind === "mock") {
      demo += 1;
      continue;
    }
    if (provider.kind === "manual") {
      manual += 1;
      continue;
    }
    if (adapter.isConfigured() && provider.health !== "down" && provider.health !== "unconfigured") {
      configured += 1;
    } else {
      unavailable += 1;
    }
  }

  const usable = configured + demo + manual > 0;
  const demoOnly = demo > 0 && configured === 0;

  let headline = "Ready for automated routing";
  let detail = "An eligible provider will be selected automatically after payment.";

  if (!usable) {
    headline = "Requires provider configuration";
    detail =
      "No approved delivery partner is enabled for this service yet. You can still place an order: it will sit in a clearly labelled awaiting-provider state and our team will be notified. You can cancel for a refund before delivery starts.";
  } else if (demoOnly) {
    headline = env.DEMO_MODE ? "Demo delivery (simulated)" : "Awaiting production provider";
    detail = env.DEMO_MODE
      ? "This environment only has the demo simulator enabled. Orders will complete with simulated, clearly labelled results — no real Instagram activity occurs."
      : "Only the demo simulator is enabled, which cannot run outside demo mode. Enable an authorized provider before selling this service.";
  } else if (configured === 0 && manual > 0) {
    headline = "Managed by our campaign team";
    detail =
      "Orders are reviewed and delivered by staff (creator assignment or manual configuration of the ad account). Results are recorded only after human verification.";
  } else if (configured > 0 && manual > 0) {
    detail = "Can be delivered by authorized advertising or assigned to our campaign team, depending on eligibility.";
  }

  return { configured, demo, manual, unavailable, usable, headline, detail, demoOnly };
}
