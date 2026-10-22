import { z } from "zod";
import { assertSameOrigin, jsonOk, readJson, withApiRoute } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { requestCancellation } from "@/lib/orders/service";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import { NotFoundError } from "@/lib/errors";

const schema = z.object({ reason: z.string().trim().min(5, "Add a short reason.").max(500) });

export const POST = withApiRoute(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  await enforceRateLimit(`cancel:${user.id}`, RATE_LIMITS.orderCreate.limit, RATE_LIMITS.orderCreate.windowSeconds);
  const publicId = new URL(req.url).pathname.split("/").filter(Boolean)[2];
  if (!publicId) throw new NotFoundError("Order not found.");
  const body = await readJson(req, schema);
  const order = await requestCancellation({ publicId, user, reason: body.reason });
  return jsonOk({
    message:
      order.status === "cancelled"
        ? "Order cancelled. Any captured payment is queued for refund review."
        : "Cancellation requested. Our team will confirm with the delivery partner.",
    status: order.status,
  });
});
