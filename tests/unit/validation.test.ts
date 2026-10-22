import { describe, expect, it } from "vitest";
import { createOrderSchema, emailSchema, quoteSchema, registerSchema } from "@/lib/validation";

describe("request validation", () => {
  it("normalises emails", () => {
    expect(emailSchema.parse("  Demo@Example.COM ")).toBe("demo@example.com");
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });

  it("rejects registration without a strong password", () => {
    const base = { name: "Test User", email: "test@example.com" };
    expect(registerSchema.safeParse({ ...base, password: "short" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: "long-enough-9" }).success).toBe(true);
  });

  it("coerces quantities but rejects fractions and junk", () => {
    expect(quoteSchema.parse({ serviceSlug: "instagram-likes", quantity: "500" }).quantity).toBe(500);
    expect(quoteSchema.safeParse({ serviceSlug: "instagram-likes", quantity: "500.5" }).success).toBe(false);
    expect(quoteSchema.safeParse({ serviceSlug: "instagram-likes", quantity: "abc" }).success).toBe(false);
    expect(quoteSchema.safeParse({ serviceSlug: "instagram-likes", quantity: -5 }).success).toBe(false);
  });

  it("requires an idempotency key on order creation", () => {
    const body = {
      serviceSlug: "instagram-likes",
      quantity: 500,
      targetUrl: "https://www.instagram.com/p/CxAbCdEf123/",
    };
    expect(createOrderSchema.safeParse(body).success).toBe(false);
    expect(createOrderSchema.safeParse({ ...body, idempotencyKey: "abc12345" }).success).toBe(true);
  });

  it("rejects coupon injection characters", () => {
    expect(quoteSchema.safeParse({ serviceSlug: "instagram-likes", quantity: 500, couponCode: "A' OR 1=1" }).success).toBe(false);
    expect(quoteSchema.safeParse({ serviceSlug: "instagram-likes", quantity: 500, couponCode: "SAVE10" }).success).toBe(true);
  });
});
