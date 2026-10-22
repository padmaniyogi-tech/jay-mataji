import { assertSameOrigin, jsonOk, readJson, withApiRoute } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { requestRefund } from "@/lib/orders/service";
import { refundRequestSchema } from "@/lib/validation";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import { NotFoundError } from "@/lib/errors";

export const POST = withApiRoute(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  await enforceRateLimit(`refund-req:${user.id}`, RATE_LIMITS.support.limit, RATE_LIMITS.support.windowSeconds);
  const publicId = new URL(req.url).pathname.split("/").filter(Boolean)[2];
  if (!publicId) throw new NotFoundError("Order not found.");
  const body = await readJson(req, refundRequestSchema.pick({ reason: true }));
  const order = await requestRefund({ publicId, user, reason: body.reason });
  return jsonOk({ message: "Refund request submitted. Finance will review it and update this order.", status: order.status });
});
