import { describe, expect, it } from "vitest";
import { applyPercentBps, clamp, formatPaise, percentOf, rupeesToPaise } from "@/lib/money";

describe("money helpers", () => {
  it("formats integer paise as INR", () => {
    expect(formatPaise(0)).toBe("₹0.00");
    expect(formatPaise(47200)).toBe("₹472.00");
    expect(formatPaise(123456789)).toContain("12,34,567.89");
  });

  it("keeps paise integral when converting rupees", () => {
    expect(rupeesToPaise(19.99)).toBe(1999);
    expect(Number.isInteger(rupeesToPaise(0.1 + 0.2))).toBe(true);
    expect(() => rupeesToPaise(Number.NaN)).toThrow();
  });

  it("applies basis points with half-up rounding", () => {
    expect(applyPercentBps(40000, 1800)).toBe(7200);
    expect(applyPercentBps(333, 1800)).toBe(60);
    expect(applyPercentBps(333, 1800, "down")).toBe(59);
    expect(percentOf(40000, 1800)).toBe(7200);
  });

  it("clamps values", () => {
    expect(clamp(120, 0, 100)).toBe(100);
    expect(clamp(-1, 0, 100)).toBe(0);
  });
});
