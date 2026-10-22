import { assertSameOrigin, getClientIp, jsonOk, readJson, withApiRoute } from "@/lib/http";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import { quoteSchema } from "@/lib/validation";
import { resolveQuote } from "@/lib/orders/service";

/** Public price preview. The checkout price is recalculated again when the order is created. */
export const POST = withApiRoute(async (req) => {
  assertSameOrigin(req);
  await enforceRateLimit(`quote:${getClientIp(req)}`, RATE_LIMITS.quote.limit, RATE_LIMITS.quote.windowSeconds);
  const body = await readJson(req, quoteSchema);
  const result = await resolveQuote({
    serviceSlug: body.serviceSlug,
    quantity: body.quantity,
    couponCode: body.couponCode,
  });
  return jsonOk({ quote: result.quote, couponMessage: result.couponMessage, targetError: result.targetError });
});
