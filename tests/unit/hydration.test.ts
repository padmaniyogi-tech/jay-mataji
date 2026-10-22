// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { DemoRunner } from "@/components/demo/demo-runner";
import { formatCount, formatUtcTime } from "@/lib/demo/format";

/**
 * App-side hydration regression tests.
 *
 * React logs "Hydration failed / did not match" via console.error when the markup produced
 * on the server differs from the first client render. These tests render the real component
 * with react-dom/server, hydrate it in jsdom, and fail if React reports any mismatch.
 *
 * Scope note: this proves the application markup is deterministic. It cannot see attributes
 * injected by a *browser extension* into the live DOM (for example `bis_status`,
 * `bis_frame_id`, `bis_body_id` or `__processed_*`), because those never reach the server
 * HTML and never exist in a clean document — see tests/unit/hydration-server.test.ts.
 */

const PROPS = {
  limits: { min: 100, max: 5000, step: 100, durationSeconds: 45 },
  realDeliveryAvailable: false,
  realDeliveryMessage: "Real delivery unavailable — provider not configured.",
  realDeliveryAlternative: "Run an advertising campaign to reach real people.",
};

let errors: string[];
let originalError: typeof console.error;

beforeEach(() => {
  errors = [];
  originalError = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args.map((a) => String(a)).join(" "));
  };
  // React 19 requires this flag for act() outside a test renderer.
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  console.error = originalError;
  document.body.innerHTML = "";
});

function hydrationProblems(): string[] {
  return errors.filter((message) => /hydrat|did not match|server rendered|server html|text content does not match/i.test(message));
}

describe("DemoRunner hydration", () => {
  it("hydrates the server markup without a mismatch", async () => {
    const html = renderToString(createElement(DemoRunner, PROPS));

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    await act(async () => {
      hydrateRoot(container, createElement(DemoRunner, PROPS));
    });

    expect(hydrationProblems()).toEqual([]);
  });

  it("renders byte-identical markup on repeated server renders", () => {
    const first = renderToString(createElement(DemoRunner, PROPS));
    const second = renderToString(createElement(DemoRunner, PROPS));
    expect(first).toBe(second);
  });

  it("contains no extension-injected attributes in server output", () => {
    const html = renderToString(createElement(DemoRunner, PROPS));
    expect(html).not.toMatch(/bis_/);
    expect(html).not.toMatch(/__processed/);
  });
});

describe("deterministic formatting (no ICU/locale dependence)", () => {
  it("groups numbers the same way in every runtime", () => {
    // These are the values the demo UI renders; any locale drift here would be a mismatch.
    expect(formatCount(500)).toBe("500");
    expect(formatCount(1000)).toBe("1,000");
    expect(formatCount(2500)).toBe("2,500");
    expect(formatCount(5000)).toBe("5,000");
    expect(formatCount(100000)).toBe("1,00,000");
    expect(formatCount(12345678)).toBe("1,23,45,678");
    expect(formatCount(0)).toBe("0");
    expect(formatCount(-1500)).toBe("-1,500");
    expect(formatCount(Number.NaN)).toBe("0");
  });

  it("formats timestamps in UTC without locale lookup", () => {
    expect(formatUtcTime("2026-01-01T09:05:07.000Z")).toBe("09:05:07 UTC");
    expect(formatUtcTime("not-a-date")).toBe("—");
  });
});
