import { assertSameOrigin, jsonOk, readJson, withApiRoute } from "@/lib/http";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/auth/session";
import { mockAuthorizeSchema } from "@/lib/validation";
import { simulateMockPayment } from "@/lib/orders/service";
import { getEnv } from "@/lib/env";
import { ForbiddenError } from "@/lib/errors";

/**
 * DEMO ONLY. Simulates a gateway callback through the same verification path as production.
 * Guarded by DEMO_MODE + PAYMENTS_PROVIDER=mock; it can never be enabled in a live deployment.
 */
export const POST = withApiRoute(async (req) => {
  assertSameOrigin(req);
  const env = getEnv();
  if (!env.DEMO_MODE || env.PAYMENTS_PROVIDER !== "mock") {
    throw new ForbiddenError("Simulated payments are disabled in this environment.");
  }
  const user = await requireUser();
  await enforceRateLimit(`mock-pay:${user.id}`, RATE_LIMITS.checkout.limit, RATE_LIMITS.checkout.windowSeconds);

  const body = await readJson(req, mockAuthorizeSchema);
  const result = await simulateMockPayment({
    orderPublicId: body.orderPublicId,
    userId: user.id,
    outcome: body.outcome ?? "success",
  });

  return jsonOk({
    orderPublicId: result.order.publicId,
    status: result.order.status,
    redirectTo: `/dashboard/orders/${result.order.publicId}?paid=1`,
    demo: true,
  });
});
