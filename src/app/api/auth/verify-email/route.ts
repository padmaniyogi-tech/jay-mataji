import { z } from "zod";
import { assertSameOrigin, jsonOk, readJson, withApiRoute } from "@/lib/http";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/http";
import { verifyEmail } from "@/lib/auth/service";

const schema = z.object({ token: z.string().min(10).max(300) });

export const POST = withApiRoute(async (req) => {
  assertSameOrigin(req);
  await enforceRateLimit(`verify-email:${getClientIp(req)}`, RATE_LIMITS.passwordReset.limit, RATE_LIMITS.passwordReset.windowSeconds);
  const body = await readJson(req, schema);
  const result = await verifyEmail(body.token);
  return jsonOk(result);
});
