import { and, eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db, getDbAsync } from "@/lib/db";
import { demoRuns, providers, type DemoRun } from "@/lib/db/schema";
import { InstagramUrlError, parseInstagramUrl } from "@/lib/instagram";
import { logger } from "@/lib/logger";
import { randomId } from "@/lib/ids";

/**
 * Public DEMO simulation of an Instagram follower campaign.
 *
 * Hard rules encoded here:
 *  - Nothing in this module is a delivery mechanism. `simulatedDelivered` is a timer,
 *    not an Instagram measurement, and it is stored in its own table with no money,
 *    no user and no provider reference.
 *  - We never ask for, accept or store Instagram credentials, cookies or tokens.
 *  - Real delivery is only ever reported when a genuinely configured, enabled and
 *    healthy non-simulator provider supports the `followers` service. In the default
 *    installation none exists, so the API returns `available: false`.
 */

/** Demo limits are deliberately small: this is a UI simulation, not a bulk tool. */
export const DEMO_LIMITS = {
  min: 100,
  max: 5_000,
  step: 100,
  /** One demo run's simulated timeline. Short enough to watch, long enough to read. */
  durationSeconds: 45,
  /** Server-side guard against demo spam, in addition to per-IP rate limiting. */
  maxRunsPerHourPerIp: 20,
} as const;

const USERNAME_RE = /^[A-Za-z0-9._]{1,30}$/;
const RESERVED = new Set(["p", "reel", "reels", "tv", "explore", "stories", "accounts", "legal", "about"]);

export class DemoInputError extends Error {
  status = 422;
  code = "demo_input_invalid";
  constructor(message: string) {
    super(message);
    this.name = "DemoInputError";
  }
}

export type NormalizedTarget = { handle: string; profileUrl: string };

/**
 * Accepts `@handle`, `handle`, `instagram.com/handle` or a full profile URL.
 * Post/Reel links are rejected: follower campaigns target a profile, and accepting a
 * post URL would imply we could count anyone's followers from a single post.
 */
export function normalizeDemoTarget(raw: string): NormalizedTarget {
  const input = raw.trim();
  if (!input) throw new DemoInputError("Enter an Instagram username or public profile URL.");

  const looksLikeUrl = /^https?:\/\//i.test(input) || /instagram\.com/i.test(input);

  if (!looksLikeUrl) {
    const cleaned = input.replace(/^@+/, "").toLowerCase();
    if (!USERNAME_RE.test(cleaned)) {
      throw new DemoInputError(
        "Instagram usernames use letters, numbers, periods and underscores — up to 30 characters.",
      );
    }
    if (RESERVED.has(cleaned)) {
      throw new DemoInputError("That is an Instagram section, not a username. Try a real profile name.");
    }
    return { handle: cleaned, profileUrl: `https://www.instagram.com/${cleaned}/` };
  }

  let target;
  try {
    // Bare "instagram.com/name" gets a scheme so the shared parser can handle it.
    target = parseInstagramUrl(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch (err) {
    throw new DemoInputError(err instanceof InstagramUrlError ? err.message : "That Instagram link is not valid.");
  }

  if (target.kind !== "profile" || !target.handle) {
    throw new DemoInputError(
      "This demo tracks a profile's followers, so use a profile URL (instagram.com/username) rather than a post or Reel link.",
    );
  }

  return { handle: target.handle.toLowerCase(), profileUrl: target.normalizedUrl };
}

/** Clamps to the demo range and rounds to the step; throws outside the hard bounds. */
export function validateDemoQuantity(raw: number): number {
  if (!Number.isFinite(raw) || Number.isNaN(raw)) throw new DemoInputError("Enter a follower quantity.");
  const quantity = Math.round(raw);
  if (quantity < DEMO_LIMITS.min) {
    throw new DemoInputError(`The demo minimum is ${DEMO_LIMITS.min} followers.`);
  }
  if (quantity > DEMO_LIMITS.max) {
    throw new DemoInputError(
      `The demo maximum is ${DEMO_LIMITS.max} followers. Real campaigns are quoted in the service catalogue.`,
    );
  }
  const stepped = Math.round(quantity / DEMO_LIMITS.step) * DEMO_LIMITS.step;
  return Math.min(Math.max(stepped, DEMO_LIMITS.min), DEMO_LIMITS.max);
}

/**
 * Demo statuses are deliberately NOT the order state machine's vocabulary.
 * "simulation_complete" cannot be mistaken for a delivered campaign/order.
 */
export type DemoStatus = "simulating" | "simulation_complete";

/** Single source of truth for demo statuses; deliberately excludes fulfilment words. */
export const DEMO_STATUSES: readonly DemoStatus[] = ["simulating", "simulation_complete"] as const;

export type DemoSnapshot = {
  publicId: string;
  status: DemoStatus;
  handle: string;
  profileUrl: string;
  requestedQuantity: number;
  simulatedDelivered: number;
  remaining: number;
  percent: number;
  elapsedSeconds: number;
  durationSeconds: number;
  startedAt: string;
  completedAt: string | null;
  /** Always true: this endpoint cannot describe real delivery. */
  simulated: true;
  notice: string;
  /** Structurally impossible to be anything but 0: nothing here touches Instagram. */
  realFollowersDelivered: 0;
  /** Explicit statement that this run is not a fulfilment record. */
  deliveryStatus: "not_delivered";
  deliveryMessage: string;
};

export const DEMO_NOTICE = "Demo simulation only — no real Instagram followers are delivered.";

/** Shown next to every result so a simulator count is never read as delivery. */
export const DEMO_DELIVERY_MESSAGE =
  "No real followers were delivered. This run is a simulation stored outside the order and delivery records.";

/**
 * Pure progress computation so the timeline is deterministic and unit-testable.
 * Progress is a function of elapsed wall-clock time; no worker, no job, no polling cost.
 */
export function computeDemoProgress(
  run: Pick<DemoRun, "requestedQuantity" | "durationSeconds" | "startedAt">,
  now: Date = new Date(),
): { percent: number; simulatedDelivered: number; remaining: number; elapsedSeconds: number; completed: boolean } {
  const started = new Date(run.startedAt).getTime();
  const duration = Math.max(run.durationSeconds, 1);
  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - started) / 1000));
  const ratio = Math.min(elapsedSeconds / duration, 1);
  const percent = Math.round(ratio * 100);
  const simulatedDelivered = Math.min(
    run.requestedQuantity,
    Math.floor((run.requestedQuantity * Math.min(elapsedSeconds, duration)) / duration),
  );
  return {
    percent,
    simulatedDelivered,
    remaining: Math.max(run.requestedQuantity - simulatedDelivered, 0),
    elapsedSeconds,
    completed: elapsedSeconds >= duration,
  };
}

export function toSnapshot(run: DemoRun, now: Date = new Date()): DemoSnapshot {
  const progress = computeDemoProgress(run, now);
  // Legacy rows used "running"/"completed"; normalise them to the explicit vocabulary.
  const legacyCompleted = run.status === "completed" || run.status === "simulation_complete";
  const completed = legacyCompleted || progress.completed;
  return {
    publicId: run.publicId,
    status: completed ? "simulation_complete" : "simulating",
    handle: run.targetHandle,
    profileUrl: run.targetUrl,
    requestedQuantity: run.requestedQuantity,
    simulatedDelivered: completed ? run.requestedQuantity : progress.simulatedDelivered,
    remaining: completed ? 0 : progress.remaining,
    percent: completed ? 100 : progress.percent,
    elapsedSeconds: progress.elapsedSeconds,
    durationSeconds: run.durationSeconds,
    startedAt: new Date(run.startedAt).toISOString(),
    completedAt: run.completedAt ? new Date(run.completedAt).toISOString() : null,
    simulated: true,
    notice: DEMO_NOTICE,
    realFollowersDelivered: 0,
    deliveryStatus: "not_delivered",
    deliveryMessage: DEMO_DELIVERY_MESSAGE,
  };
}

export function hashIp(ip: string): string {
  return createHash("sha256").update(`demo:${ip}`).digest("hex").slice(0, 64);
}

export async function countRecentRuns(ipHash: string): Promise<number> {
  await getDbAsync();
  const rows = await db.execute(sql`
    select count(*)::int as count from "demo_runs"
    where "ip_hash" = ${ipHash} and "created_at" > now() - interval '1 hour'
  `);
  const row = (rows as unknown as { rows?: Record<string, unknown>[] }).rows?.[0];
  return Number(row?.count ?? 0);
}

export async function createDemoRun(input: {
  target: string;
  quantity: number;
  ip: string;
}): Promise<DemoSnapshot> {
  await getDbAsync();
  const normalized = normalizeDemoTarget(input.target);
  const quantity = validateDemoQuantity(input.quantity);
  const ipHash = hashIp(input.ip);

  if ((await countRecentRuns(ipHash)) >= DEMO_LIMITS.maxRunsPerHourPerIp) {
    throw new DemoInputError(
      "You have started several demos in the last hour. Please wait a little and try again.",
    );
  }

  const [run] = await db
    .insert(demoRuns)
    .values({
      publicId: `DEMO-${randomId(8)}`,
      targetHandle: normalized.handle,
      targetUrl: normalized.profileUrl,
      requestedQuantity: quantity,
      durationSeconds: DEMO_LIMITS.durationSeconds,
      status: "simulating",
      ipHash,
      startedAt: new Date(),
    })
    .returning();

  if (!run) throw new Error("Could not start the demo run.");
  logger.info("demo_run_started", { publicId: run.publicId, quantity, simulated: true });
  return toSnapshot(run);
}

export async function getDemoRun(publicId: string): Promise<DemoSnapshot | null> {
  await getDbAsync();
  const [run] = await db.select().from(demoRuns).where(eq(demoRuns.publicId, publicId)).limit(1);
  if (!run) return null;

  const snapshot = toSnapshot(run);
  // Persist completion once so the result is stable on later reads.
  if (snapshot.status === "simulation_complete" && run.status !== "simulation_complete") {
    await db
      .update(demoRuns)
      .set({ status: "simulation_complete", simulatedDelivered: run.requestedQuantity, completedAt: new Date() })
      .where(and(eq(demoRuns.id, run.id), eq(demoRuns.status, run.status)));
    return { ...snapshot, completedAt: new Date().toISOString() };
  }
  return snapshot;
}

export type RealDeliveryStatus = {
  available: boolean;
  /**
   * Every provider that could plausibly deliver `followers`, with the reason it cannot
   * currently be used. Names and health only — never credentials or secrets.
   */
  candidates: Array<{ key: string; name: string; kind: string; health: string; enabled: boolean; usable: boolean; reason: string }>;
  message: string;
  /** Compliant path to real reach — never "buy followers". */
  alternative: string;
};

/** Exact wording required wherever real delivery is not possible. */
export const REAL_DELIVERY_UNAVAILABLE = "Real delivery unavailable — provider not configured.";

/**
 * Reports whether a *genuine* delivery provider is operational for the `followers` service.
 *
 * A provider counts only when it is an external integration (Meta Ads or an approved
 * agency), enabled, not `unconfigured`/`down`, actually holding credentials, and claiming
 * the `followers` capability. The local simulator and the manual/creator-desk provider
 * never qualify: neither can add followers to an Instagram account, so counting them would
 * be a false claim.
 */
export async function getRealDeliveryStatus(): Promise<RealDeliveryStatus> {
  const alternative =
    "Compliant alternative: run an Instagram or Meta advertising campaign to reach real, interested people. Genuine followers follow when the creative, offer and audience are right — that is promotion, not manufactured engagement, and Amplifi quotes and tracks it as a campaign rather than a guaranteed count.";

  const unavailable: RealDeliveryStatus = {
    available: false,
    candidates: [],
    message: `${REAL_DELIVERY_UNAVAILABLE} No authorised Instagram growth provider is enabled in this deployment, so nothing on this site can add followers to an Instagram account.`,
    alternative,
  };

  try {
    await getDbAsync();
    const rows = await db.select().from(providers);
    const external = rows.filter((p) => p.kind === "meta_ads" || p.kind === "agency");

    const candidates = external.map((p) => {
      const supportsFollowers = Array.isArray(p.supportedKinds)
        ? (p.supportedKinds as string[]).includes("followers")
        : false;
      const configured = p.health !== "unconfigured" && p.health !== "down";
      const usable = p.enabled && configured && supportsFollowers;
      let reason = "Usable for paid campaigns";
      if (!configured) reason = p.health === "unconfigured" ? "Credentials not configured" : "Health check failing";
      else if (!p.enabled) reason = "Disabled by an administrator";
      else if (!supportsFollowers) reason = "Does not support the followers service";
      return {
        key: p.key,
        name: p.name,
        kind: p.kind,
        health: p.health,
        enabled: p.enabled,
        usable,
        reason,
      };
    });

    const live = candidates.filter((c) => c.usable);
    if (live.length === 0) {
      const detail =
        candidates.length === 0
          ? "No Meta Ads or agency adapter is installed."
          : candidates
              .map((c) => `${c.name} (${c.kind}) is ${c.enabled ? "enabled" : "disabled"} and ${c.health} — ${c.reason.toLowerCase()}.`)
              .join(" ");
      return {
        ...unavailable,
        candidates,
        // Keep the required sentence first so the UI always shows it verbatim.
        message: `${REAL_DELIVERY_UNAVAILABLE} ${detail} Nothing on this site can add followers to an Instagram account.`,
      };
    }

    return {
      available: true,
      candidates,
      message:
        "A delivery provider is configured for real campaigns. Real orders require the customer dashboard, payment and provider review — this public demo never places them, and demo runs never touch delivery records.",
      alternative,
    };
  } catch (err) {
    logger.warn("demo_provider_status_failed", { message: (err as Error).message });
    return unavailable;
  }
}
