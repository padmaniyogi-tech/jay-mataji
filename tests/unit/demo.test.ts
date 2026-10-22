import { describe, expect, it } from "vitest";
import {
  DEMO_LIMITS,
  DEMO_NOTICE,
  DemoInputError,
  computeDemoProgress,
  normalizeDemoTarget,
  toSnapshot,
  validateDemoQuantity,
} from "@/lib/demo/service";

/**
 * These tests pin down the guarantees of the public demo:
 *  - the accepted input shapes (and everything that must be rejected),
 *  - the quantity envelope,
 *  - and that progress is a pure function of time that finishes exactly at 100%,
 *    capped at the requested quantity so it can never report more than asked.
 */

describe("normalizeDemoTarget", () => {
  it("accepts a bare handle, an @handle and mixed case", () => {
    expect(normalizeDemoTarget("amplifi_demo")).toEqual({
      handle: "amplifi_demo",
      profileUrl: "https://www.instagram.com/amplifi_demo/",
    });
    expect(normalizeDemoTarget("@Amplifi.Demo").handle).toBe("amplifi.demo");
    expect(normalizeDemoTarget("  @brand_1  ").handle).toBe("brand_1");
  });

  it("accepts profile URLs with and without a scheme or trailing slash", () => {
    for (const input of [
      "https://www.instagram.com/amplifi_demo/",
      "http://instagram.com/amplifi_demo",
      "instagram.com/amplifi_demo",
      "https://m.instagram.com/amplifi_demo/",
    ]) {
      expect(normalizeDemoTarget(input)).toEqual({
        handle: "amplifi_demo",
        profileUrl: "https://www.instagram.com/amplifi_demo/",
      });
    }
  });

  it("rejects post and Reel links because followers are counted per profile", () => {
    expect(() => normalizeDemoTarget("https://www.instagram.com/reel/CxAbCdEf123/")).toThrow(DemoInputError);
    expect(() => normalizeDemoTarget("https://www.instagram.com/p/CxAbCdEf123/")).toThrow(/profile/i);
  });

  it("rejects non-Instagram hosts and URL credentials", () => {
    expect(() => normalizeDemoTarget("https://example.com/brand")).toThrow(DemoInputError);
    expect(() => normalizeDemoTarget("https://user:pass@instagram.com/brand")).toThrow(DemoInputError);
  });

  it("rejects malformed handles and Instagram section routes", () => {
    expect(() => normalizeDemoTarget("@bad name")).toThrow(DemoInputError);
    expect(() => normalizeDemoTarget("has!bang")).toThrow(DemoInputError);
    expect(() => normalizeDemoTarget("@explore")).toThrow(/section/i);
    expect(() => normalizeDemoTarget("")).toThrow(DemoInputError);
    expect(() => normalizeDemoTarget("a".repeat(31))).toThrow(DemoInputError);
  });
});

describe("validateDemoQuantity", () => {
  it("accepts values inside the demo envelope and snaps to the step", () => {
    expect(validateDemoQuantity(DEMO_LIMITS.min)).toBe(DEMO_LIMITS.min);
    expect(validateDemoQuantity(1049)).toBe(1000);
    expect(validateDemoQuantity(1074)).toBe(1100);
    expect(validateDemoQuantity(DEMO_LIMITS.max)).toBe(DEMO_LIMITS.max);
  });

  it("rejects values outside the envelope", () => {
    expect(() => validateDemoQuantity(DEMO_LIMITS.min - 1)).toThrow(DemoInputError);
    expect(() => validateDemoQuantity(DEMO_LIMITS.max + 1)).toThrow(DemoInputError);
    expect(() => validateDemoQuantity(Number.NaN)).toThrow(DemoInputError);
  });
});

describe("computeDemoProgress", () => {
  const startedAt = new Date("2026-01-01T00:00:00.000Z");
  const run = { requestedQuantity: 1000, durationSeconds: 40, startedAt };

  it("starts at zero and never reports negative progress", () => {
    const before = computeDemoProgress(run, new Date("2025-12-31T23:59:58.000Z"));
    expect(before.percent).toBe(0);
    expect(before.simulatedDelivered).toBe(0);
    expect(before.completed).toBe(false);
  });

  it("advances linearly and caps at the requested quantity", () => {
    const half = computeDemoProgress(run, new Date(startedAt.getTime() + 20_000));
    expect(half.percent).toBe(50);
    expect(half.simulatedDelivered).toBe(500);
    expect(half.remaining).toBe(500);

    const done = computeDemoProgress(run, new Date(startedAt.getTime() + 40_000));
    expect(done.percent).toBe(100);
    expect(done.simulatedDelivered).toBe(1000);
    expect(done.remaining).toBe(0);
    expect(done.completed).toBe(true);
  });

  it("stays at 100% long after the window closes", () => {
    const late = computeDemoProgress(run, new Date(startedAt.getTime() + 86_400_000));
    expect(late.percent).toBe(100);
    expect(late.simulatedDelivered).toBe(1000);
    expect(late.simulatedDelivered).toBeLessThanOrEqual(run.requestedQuantity);
  });
});

describe("toSnapshot", () => {
  const base = {
    id: "11111111-1111-1111-1111-111111111111",
    publicId: "DEMO-ABCD1234",
    targetHandle: "amplifi_demo",
    targetUrl: "https://www.instagram.com/amplifi_demo/",
    requestedQuantity: 500,
    simulatedDelivered: 0,
    durationSeconds: 30,
    status: "running" as const,
    ipHash: null,
    startedAt: new Date("2026-01-01T00:00:00.000Z"),
    completedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  it("is always labelled as simulated and carries the honesty notice", () => {
    const snapshot = toSnapshot(base, new Date("2026-01-01T00:00:10.000Z"));
    expect(snapshot.simulated).toBe(true);
    expect(snapshot.notice).toBe(DEMO_NOTICE);
    expect(DEMO_NOTICE).toMatch(/no real instagram followers/i);
    expect(snapshot.status).toBe("running");
    expect(snapshot.simulatedDelivered).toBe(166);
  });

  it("forces a completed snapshot to the full requested quantity", () => {
    const snapshot = toSnapshot(base, new Date("2026-01-01T00:01:00.000Z"));
    expect(snapshot.status).toBe("completed");
    expect(snapshot.percent).toBe(100);
    expect(snapshot.simulatedDelivered).toBe(500);
    expect(snapshot.remaining).toBe(0);
  });

  it("keeps the demo envelope small enough to be a simulation, not a bulk tool", () => {
    expect(DEMO_LIMITS.max).toBeLessThanOrEqual(10_000);
    expect(DEMO_LIMITS.min).toBeGreaterThan(0);
    expect(DEMO_LIMITS.durationSeconds).toBeGreaterThan(0);
  });
});
