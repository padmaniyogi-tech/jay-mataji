import { z } from "zod";
import { assertSameOrigin, jsonOk, readJson, withApiRoute } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { createCoupon, toggleCoupon } from "@/lib/admin/service";
import { couponSchema } from "@/lib/validation";
import { ForbiddenError } from "@/lib/errors";

const schema = z.discriminatedUnion("action", [
  couponSchema.extend({ action: z.literal("create") }),
  z.object({ action: z.literal("toggle"), couponId: z.string().uuid(), active: z.boolean() }),
]);

export const POST = withApiRoute(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  if (user.role !== "admin") throw new ForbiddenError("Administrator role required.");
  const body = await readJson(req, schema);
  if (body.action === "create") {
    const coupon = await createCoupon({
      actor: user,
      values: {
        code: body.code,
        type: body.type,
        value: body.value,
        description: body.description,
        minOrderRupees: body.minOrderRupees ?? 0,
        maxDiscountRupees: body.maxDiscountRupees,
        maxRedemptions: body.maxRedemptions,
        active: body.active ?? true,
      },
    });
    return jsonOk({ message: "Coupon created.", code: coupon.code });
  }
  await toggleCoupon(body.couponId, body.active, user);
  return jsonOk({ message: "Coupon updated." });
});
