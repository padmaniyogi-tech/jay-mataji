import { z } from "zod";
import { assertSameOrigin, getClientIp, jsonError, jsonOk, readJson, withApiRoute } from "@/lib/http";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { DEMO_LIMITS, DemoInputError, createDemoRun } from "@/lib/demo/service";

const schema = z.object({
  target: z.string().trim().min(2).max(200),
  quantity: z.coerce.number().int().positive(),
});

/**
 * Starts a public demo run.
 *
 * No authentication, no email, no payment — and intentionally no path to the orders,
 * payments or provider-submission tables. The response is always labelled as simulated.
 */
export const POST = withApiRoute(async (req) => {
  assertSameOrigin(req);
  const ip = getClientIp(req);
  await enforceRateLimit(`demo-start:${ip}`, RATE_LIMITS.demoStart.limit, RATE_LIMITS.demoStart.windowSeconds);

  const body = await readJson(req, schema);

  try {
    const run = await createDemoRun({ target: body.target, quantity: body.quantity, ip });
    return jsonOk({ run, simulated: true, limits: DEMO_LIMITS });
  } catch (err) {
    if (err instanceof DemoInputError) {
      return jsonError(err.message, { status: 422, code: err.code });
    }
    throw err;
  }
});
