import { assertSameOrigin, jsonOk, withApiRoute } from "@/lib/http";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/auth/session";
import { buildHandoff, getOrderForViewer } from "@/lib/orders/service";
import { AppError, NotFoundError } from "@/lib/errors";

export const POST = withApiRoute(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  await enforceRateLimit(`checkout:${user.id}`, RATE_LIMITS.checkout.limit, RATE_LIMITS.checkout.windowSeconds);

  const url = new URL(req.url);
  const publicId = url.pathname.split("/").filter(Boolean)[2];
  if (!publicId) throw new NotFoundError("Order not found.");

  const detail = await getOrderForViewer(publicId, user);
  if (!detail) throw new NotFoundError("Order not found.");
  if (detail.order.userId !== user.id) throw new NotFoundError("Order not found.");
  if (detail.order.status !== "pending_payment") {
    throw new AppError("This order is not awaiting payment.", { status: 409, code: "not_payable" });
  }

  const checkout = await buildHandoff(detail.order, { forceNewIntent: true });
  return jsonOk({ checkout });
});
