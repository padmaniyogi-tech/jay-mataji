import { z } from "zod";
import { applyPercentBps, clamp } from "./money";

/** Server-authoritative pricing. The browser's number is never trusted. */

export type PricingService = {
  id: string;
  unitPricePaise: number;
  fixedFeePaise: number;
  minQuantity: number;
  maxQuantity: number;
  quantityStep: number;
};

export type CouponRule = {
  id: string;
  code: string;
  type: "percent" | "fixed";
  /** percent => basis points (500 = 5%); fixed => paise */
  value: number;
  minOrderPaise: number;
  maxDiscountPaise: number | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  active: boolean;
  expiresAt: Date | null;
};

export type QuoteInput = {
  service: PricingService;
  quantity: number;
  taxRateBps: number;
  coupon?: CouponRule | null;
  now?: Date;
};

export type Quote = {
  currency: "INR";
  quantity: number;
  unitPricePaise: number;
  subtotalPaise: number;
  fixedFeePaise: number;
  discountPaise: number;
  taxablePaise: number;
  taxRateBps: number;
  taxPaise: number;
  totalPaise: number;
  couponCode: string | null;
  warnings: string[];
};

export type CouponEvaluation =
  | { ok: true; coupon: CouponRule; discountPaise: number }
  | { ok: false; reason: string };

export const quantitySchema = z.number().int().positive().max(10_000_000);

export function validateQuantity(service: PricingService, quantity: number): { ok: true } | { ok: false; reason: string } {
  if (!Number.isInteger(quantity)) return { ok: false, reason: "Quantity must be a whole number." };
  if (quantity < service.minQuantity) {
    return { ok: false, reason: `Minimum quantity for this service is ${service.minQuantity.toLocaleString("en-IN")}.` };
  }
  if (quantity > service.maxQuantity) {
    return { ok: false, reason: `Maximum quantity for this service is ${service.maxQuantity.toLocaleString("en-IN")}.` };
  }
  if (service.quantityStep > 1 && quantity % service.quantityStep !== 0) {
    return { ok: false, reason: `Quantity must be in steps of ${service.quantityStep.toLocaleString("en-IN")}.` };
  }
  return { ok: true };
}

export function evaluateCoupon(coupon: CouponRule | null | undefined, subtotalPaise: number, now = new Date()): CouponEvaluation {
  if (!coupon) return { ok: false, reason: "Coupon not found." };
  if (!coupon.active) return { ok: false, reason: "This coupon is no longer active." };
  if (coupon.expiresAt && coupon.expiresAt.getTime() < now.getTime()) {
    return { ok: false, reason: "This coupon has expired." };
  }
  if (coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions) {
    return { ok: false, reason: "This coupon has reached its redemption limit." };
  }
  if (subtotalPaise < coupon.minOrderPaise) {
    return {
      ok: false,
      reason: `This coupon requires a minimum order of ₹${(coupon.minOrderPaise / 100).toLocaleString("en-IN")}.`,
    };
  }
  let discount =
    coupon.type === "percent"
      ? applyPercentBps(subtotalPaise, clamp(coupon.value, 0, 10_000), "down")
      : Math.min(coupon.value, subtotalPaise);
  if (coupon.maxDiscountPaise !== null) discount = Math.min(discount, coupon.maxDiscountPaise);
  discount = clamp(discount, 0, subtotalPaise);
  if (discount <= 0) return { ok: false, reason: "This coupon does not reduce the price of this order." };
  return { ok: true, coupon, discountPaise: discount };
}

export function calculateQuote(input: QuoteInput): Quote {
  const qty = validateQuantity(input.service, input.quantity);
  if (!qty.ok) throw new Error(qty.reason);

  const subtotalPaise = input.service.unitPricePaise * input.quantity;
  const fixedFeePaise = input.service.fixedFeePaise;
  const gross = subtotalPaise + fixedFeePaise;

  let discountPaise = 0;
  let couponCode: string | null = null;
  const warnings: string[] = [];

  if (input.coupon) {
    // Discounts apply to the variable (quantity) component only, never to tax.
    const evaluation = evaluateCoupon(input.coupon, subtotalPaise, input.now);
    if (evaluation.ok) {
      discountPaise = Math.min(evaluation.discountPaise, subtotalPaise);
      couponCode = evaluation.coupon.code;
    } else {
      warnings.push(evaluation.reason);
    }
  }

  const taxablePaise = Math.max(gross - discountPaise, 0);
  const taxPaise = applyPercentBps(taxablePaise, clamp(input.taxRateBps, 0, 5000));
  const totalPaise = taxablePaise + taxPaise;

  return {
    currency: "INR",
    quantity: input.quantity,
    unitPricePaise: input.service.unitPricePaise,
    subtotalPaise,
    fixedFeePaise,
    discountPaise,
    taxablePaise,
    taxRateBps: input.taxRateBps,
    taxPaise,
    totalPaise,
    couponCode,
    warnings,
  };
}

/** Zero-decimal currencies only INR here; Razorpay expects paise integers. */
export function assertPayableAmount(paise: number): void {
  if (!Number.isInteger(paise) || paise < 100) {
    throw new Error("Payable amount must be an integer of at least ₹1 (100 paise).");
  }
  if (paise > 50_000_000) {
    throw new Error("Amount exceeds the configured per-order ceiling (₹5,00,000).");
  }
}
