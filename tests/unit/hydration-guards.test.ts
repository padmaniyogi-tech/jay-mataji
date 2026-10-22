import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static guards for the hydration investigation.
 *
 * The reported mismatch listed `bis_status`, `bis_frame_id`, `bis_body_id` and
 * `__processed_*` on <body>. None of those strings exist in this codebase, and the root
 * layout renders a plain `<body className="min-h-screen">`, so they can only be injected
 * into the live DOM by a browser extension after load. These tests keep it that way and
 * stop anyone "fixing" a third-party DOM mutation with a blanket suppression.
 */

const SRC = path.resolve(__dirname, "../../src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

const files = walk(SRC);

describe("hydration guards", () => {
  it("never uses suppressHydrationWarning as a blanket workaround", () => {
    const offenders = files.filter((file) => readFileSync(file, "utf8").includes("suppressHydrationWarning"));
    expect(offenders).toEqual([]);
  });

  it("never renders extension-injected attribute names", () => {
    const offenders = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      return /bis_status|bis_frame_id|bis_body_id|bis_skin_checked|__processed_/.test(source);
    });
    expect(offenders).toEqual([]);
  });

  it("keeps the root layout static and free of client-side attribute mutation", () => {
    const layout = readFileSync(path.join(SRC, "app/layout.tsx"), "utf8");
    expect(layout).toContain('<body className="min-h-screen">');
    expect(layout).toContain('<html lang="en">');
    expect(layout).not.toMatch(/use client/);
    expect(layout).not.toMatch(/dangerouslySetInnerHTML/);
    expect(layout).not.toMatch(/localStorage|window\./);
  });

  it("shows the required real-delivery message when no provider is configured", () => {
    const service = readFileSync(path.join(SRC, "lib/demo/service.ts"), "utf8");
    expect(service).toContain("Real delivery unavailable — provider not configured.");
  });
});
