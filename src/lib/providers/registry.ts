import { and, eq } from "drizzle-orm";
import { db, getDbAsync, type Executor } from "@/lib/db";
import { providers, type Provider } from "@/lib/db/schema";
import { NotFoundError } from "@/lib/errors";
import { getEnv } from "@/lib/env";
import type { ProviderAdapter } from "./types";
import { MockProviderAdapter } from "./mock";
import { ManualProviderAdapter } from "./manual";
import { MetaAdsProviderAdapter } from "./meta-ads";
import { AgencyProviderAdapter } from "./agency";

/** Builds the adapter for a provider row. Adapters read credentials from env only. */
export function createAdapter(provider: Provider): ProviderAdapter {
  switch (provider.kind) {
    case "mock":
      return new MockProviderAdapter(provider);
    case "manual":
      return new ManualProviderAdapter(provider);
    case "meta_ads":
      return new MetaAdsProviderAdapter(provider);
    case "agency":
      return new AgencyProviderAdapter(provider);
    default:
      throw new Error(`Unknown provider kind: ${String(provider.kind)}`);
  }
}

export async function listProviders(executor: Executor = db): Promise<Provider[]> {
  await getDbAsync();
  return executor.select().from(providers).orderBy(providers.priority);
}

export async function getProviderByKey(key: string, executor: Executor = db): Promise<Provider | null> {
  await getDbAsync();
  const rows = await executor.select().from(providers).where(eq(providers.key, key)).limit(1);
  return rows[0] ?? null;
}

export async function getProviderById(id: string, executor: Executor = db): Promise<Provider | null> {
  await getDbAsync();
  const rows = await executor.select().from(providers).where(eq(providers.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function requireProvider(id: string): Promise<Provider> {
  const provider = await getProviderById(id);
  if (!provider) throw new NotFoundError("Provider not found.");
  return provider;
}

/** Enabled providers whose kind is allowed in the current environment. */
export async function listEnabledProviders(executor: Executor = db): Promise<Provider[]> {
  await getDbAsync();
  return executor.select().from(providers).where(eq(providers.enabled, true)).orderBy(providers.priority);
}

/**
 * Demo guard: the mock provider is only usable when the deployment is explicitly in
 * demo mode, or an admin turned the mock row on for QA while DEMO_MODE is set.
 */
export function assertProviderUsable(provider: Provider): void {
  if (provider.kind === "mock" && !getEnv().DEMO_MODE) {
    throw new Error("Demo provider cannot be used outside DEMO_MODE.");
  }
}

export async function providerForOrder(providerId: string | null): Promise<ProviderAdapter | null> {
  if (!providerId) return null;
  const provider = await getProviderById(providerId);
  return provider ? createAdapter(provider) : null;
}

export async function findProviderByKind(kind: Provider["kind"]): Promise<Provider | null> {
  await getDbAsync();
  const rows = await db
    .select()
    .from(providers)
    .where(and(eq(providers.kind, kind), eq(providers.enabled, true)))
    .orderBy(providers.priority)
    .limit(1);
  return rows[0] ?? null;
}
