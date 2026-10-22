import { describe, expect, it } from "vitest";
import { calculateQuote, evaluateCoupon, validateQuantity } from "@/lib/pricing";

const service = {
  id: "svc-reel-views",
  unitPricePaise: 8,
  minQuantity: 500,
  maxQuantity: 1_000_000,
  fixedFeePaise: 0,
  quantityStep: 1,
};

describe("pricing engine", () => {
  it("computes subtotal, tax and total in integer paise", () => {
    const quote = calculateQuote({ service, quantity: 5000, taxRateBps: 1800, coupon: null });
    expect(quote.subtotalPaise).toBe(40_000);
    expect(quote.taxPaise).toBe(7_200);
    expect(quote.totalPaise).toBe(47_200);
    expect(Number.isInteger(quote.totalPaise)).toBe(true);
  });

  it("applies percentage coupons with a discount cap", () => {
    const coupon = {
      id: "c1",
      code: "LAUNCH20",
      type: "percent" as const,
      /** basis points: 2000 = 20% */
      value: 2_000,
      minOrderPaise: 10_000,
      maxDiscountPaise: 5_000,
      maxRedemptions: null,
      redemptionCount: 0,
      active: true,
      expiresAt: null,
    };
    const quote = calculateQuote({ service, quantity: 5000, taxRateBps: 1800, coupon });
    expect(quote.discountPaise).toBe(5_000);
    expect(quote.taxPaise).toBe(6_300);
    expect(quote.totalPaise).toBe(41_300);
  });

  it("ignores coupons below the minimum order value", () => {
    const evaluation = evaluateCoupon(
      {
        id: "c2",
        code: "BIGONLY",
        type: "fixed",
        value: 100,
        minOrderPaise: 100_000,
        maxDiscountPaise: null,
        maxRedemptions: null,
        redemptionCount: 0,
        active: true,
        expiresAt: null,
      },
      40_000,
    );
    expect(evaluation.ok).toBe(false);
  });

  it("rejects expired, disabled and exhausted coupons", () => {
    const base = {
      id: "c3",
      code: "X",
      type: "fixed" as const,
      value: 100,
      minOrderPaise: 0,
      maxDiscountPaise: null,
      maxRedemptions: 1,
      redemptionCount: 0,
      active: true,
      expiresAt: null as Date | null,
    };
    expect(evaluateCoupon({ ...base, active: false }, 10_000).ok).toBe(false);
    expect(evaluateCoupon({ ...base, expiresAt: new Date(Date.now() - 1000) }, 10_000).ok).toBe(false);
    expect(evaluateCoupon({ ...base, redemptionCount: 1 }, 10_000).ok).toBe(false);
  });

  it("enforces service quantity limits", () => {
    expect(validateQuantity(service, 499).ok).toBe(false);
    expect(validateQuantity(service, 500).ok).toBe(true);
    expect(validateQuantity(service, 1_000_001).ok).toBe(false);
    expect(validateQuantity(service, 1000.5).ok).toBe(false);
  });

  it("never produces fractional paise for awkward prices", () => {
    const quote = calculateQuote({
      service: { ...service, unitPricePaise: 7, fixedFeePaise: 499 },
      quantity: 1234,
      taxRateBps: 1800,
      coupon: null,
    });
    for (const value of [quote.subtotalPaise, quote.taxPaise, quote.totalPaise]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});
