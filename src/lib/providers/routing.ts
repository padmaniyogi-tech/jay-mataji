import type { Provider, Service } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createAdapter } from "./registry";
import type { ProviderAdapter, ValidationInput } from "./types";

export type RoutingInput = {
  service: Service;
  target: ValidationInput["target"];
  quantity: number;
  orderPublicId: string;
  brief?: string | null;
  audienceCountry?: string | null;
  attempt?: number;
};

export type Candidate = {
  provider: Provider;
  adapter: ProviderAdapter;
  eligible: boolean;
  score: number;
  costPaise: number | null;
  estimatedDurationHours: number | null;
  reasons: string[];
};

export type RoutingDecision = {
  selected: Candidate | null;
  candidates: Candidate[];
  reason: string;
};

/**
 * Deterministic, admin-tunable routing.
 *
 * A provider is eligible only when ALL hold:
 *  - the row is enabled and the service kind is supported by its adapter
 *  - the service's optional `providerKinds` allow-list includes it
 *  - health is not `down`/`unconfigured` and the adapter's own credentials check passes
 *  - quantity is inside both its own and the service's limits
 *  - the adapter's validateRequest() accepts the order
 *  - the mock adapter is never used outside DEMO_MODE
 *
 * Ranking among eligible providers: priority (asc) → reliability (desc) → estimated
 * duration (asc) → cost (asc). Admins change priority/reliability on /admin/providers.
 */
export async function routeOrder(
  input: RoutingInput,
  providerRows: Provider[],
): Promise<RoutingDecision> {
  const env = getEnv();
  const allowList = input.service.metadata?.providerKinds;

  const candidates: Candidate[] = [];
  for (const provider of providerRows) {
    const adapter = createAdapter(provider);
    const reasons: string[] = [];
    let eligible = provider.enabled;
    if (!provider.enabled) reasons.push("Provider is disabled.");

    if (provider.kind === "mock" && !env.DEMO_MODE) {
      eligible = false;
      reasons.push("Demo provider is only available in DEMO_MODE.");
    }

    if (allowList && allowList.length > 0 && !allowList.includes(provider.kind)) {
      eligible = false;
      reasons.push(`Service only allows ${allowList.join(", ")} providers.`);
    }

    const caps = adapter.capabilities();
    if (!caps.kinds.includes(input.service.kind)) {
      eligible = false;
      reasons.push(`Does not support ${input.service.kind} services.`);
    }

    if (provider.health === "down") {
      eligible = false;
      reasons.push("Provider health is down.");
    }
    if (provider.health === "unconfigured" || !adapter.isConfigured()) {
      eligible = false;
      reasons.push("Credentials not configured / connection not verified.");
    }

    if (input.quantity < provider.minQuantity) {
      eligible = false;
      reasons.push(`Minimum quantity is ${provider.minQuantity.toLocaleString("en-IN")}.`);
    }
    if (input.quantity > provider.maxQuantity) {
      eligible = false;
      reasons.push(`Maximum quantity is ${provider.maxQuantity.toLocaleString("en-IN")}.`);
    }

    let costPaise: number | null = null;
    let estimatedDurationHours: number | null = null;

    if (eligible) {
      try {
        const quote = await adapter.calculateQuote({ serviceKind: input.service.kind, quantity: input.quantity });
        costPaise = quote.costPaise;
        estimatedDurationHours = quote.estimatedDurationHours;
        const availability = await adapter.checkAvailability({
          serviceKind: input.service.kind,
          quantity: input.quantity,
        });
        if (!availability.available) {
          eligible = false;
          reasons.push(availability.reason ?? "Provider reports no availability.");
        }
        const validation = await adapter.validateRequest({
          orderPublicId: input.orderPublicId,
          service: input.service,
          target: input.target,
          quantity: input.quantity,
          audienceCountry: input.audienceCountry,
          brief: input.brief,
        });
        if (!validation.ok) {
          eligible = false;
          reasons.push(validation.reason);
        }
        if (validation.ok && validation.warnings?.length) reasons.push(...validation.warnings);
      } catch (err) {
        eligible = false;
        reasons.push(`Provider check failed: ${(err as Error).message}`);
      }
    }

    candidates.push({
      provider,
      adapter,
      eligible,
      score: scoreProvider(provider, estimatedDurationHours, costPaise),
      costPaise,
      estimatedDurationHours,
      reasons,
    });
  }

  const eligible = candidates
    .filter((c) => c.eligible)
    .sort((a, b) => b.score - a.score || a.provider.priority - b.provider.priority);

  const selected = eligible[0] ?? null;
  const reason = selected
    ? `Routed to ${selected.provider.name} (priority ${selected.provider.priority}, reliability ${selected.provider.reliabilityScore}).`
    : candidates.length === 0
      ? "No delivery providers are registered for this service."
      : "No eligible provider: " +
        candidates
          .map((c) => `${c.provider.name}: ${c.reasons.filter(Boolean)[0] ?? "unavailable"}`)
          .join(" • ");

  logger.info("routing_decision", {
    orderPublicId: input.orderPublicId,
    serviceKind: input.service.kind,
    selected: selected?.provider.key ?? null,
    eligibleCount: eligible.length,
    candidateCount: candidates.length,
  });

  return { selected, candidates, reason };
}

function scoreProvider(provider: Provider, durationHours: number | null, costPaise: number | null): number {
  const priorityScore = Math.max(0, 100 - provider.priority);
  const reliabilityScore = provider.reliabilityScore;
  const speedScore = durationHours === null ? 0 : Math.max(0, 100 - Math.min(durationHours, 400) / 4);
  const costScore = costPaise === null ? 0 : Math.max(0, 100 - Math.min(costPaise / 10_000, 100));
  // Weights documented in docs/architecture.md — admins influence them via priority/reliability.
  return Math.round(priorityScore * 0.4 + reliabilityScore * 0.3 + speedScore * 0.2 + costScore * 0.1);
}
