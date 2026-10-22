import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { settings } from "@/lib/db/schema";

export type PlatformSettings = {
  taxRateBps: number;
  taxLabel: string;
  supportEmail: string;
  refundWindowDays: number;
  maxActiveOrdersPerUser: number;
  autoRouteEnabled: boolean;
  demoBanner: boolean;
  maintenanceMessage: string | null;
};

export const DEFAULT_SETTINGS: PlatformSettings = {
  taxRateBps: 1800,
  taxLabel: "GST (18%)",
  supportEmail: "support@amplifi.local",
  refundWindowDays: 14,
  maxActiveOrdersPerUser: 10,
  autoRouteEnabled: true,
  demoBanner: true,
  maintenanceMessage: null,
};

const SETTINGS_KEY = "platform";

let cache: { value: PlatformSettings; expiresAt: number } | null = null;

export async function getPlatformSettings(force = false): Promise<PlatformSettings> {
  if (!force && cache && cache.expiresAt > Date.now()) return cache.value;
  try {
    const rows = await db.select().from(settings).where(sql`${settings.key} = ${SETTINGS_KEY}`).limit(1);
    const stored = (rows[0]?.value ?? {}) as Partial<PlatformSettings>;
    const merged = { ...DEFAULT_SETTINGS, ...stored };
    cache = { value: merged, expiresAt: Date.now() + 15_000 };
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS, demoBanner: getEnv().DEMO_MODE };
  }
}

export async function updatePlatformSettings(partial: Partial<PlatformSettings>): Promise<PlatformSettings> {
  const current = await getPlatformSettings(true);
  const next = { ...current, ...partial };
  await db
    .insert(settings)
    .values({ key: SETTINGS_KEY, value: next as unknown as Record<string, unknown> })
    .onConflictDoUpdate({ target: settings.key, set: { value: next as unknown as Record<string, unknown>, updatedAt: new Date() } });
  cache = { value: next, expiresAt: Date.now() + 15_000 };
  return next;
}

export function invalidateSettingsCache(): void {
  cache = null;
}
