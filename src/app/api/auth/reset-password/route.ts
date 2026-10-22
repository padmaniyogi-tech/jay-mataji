import { assertSameOrigin, getClientIp, jsonOk, readJson, withApiRoute } from "@/lib/http";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import { resetPasswordSchema } from "@/lib/validation";
import { resetPassword } from "@/lib/auth/service";

export const POST = withApiRoute(async (req) => {
  assertSameOrigin(req);
  await enforceRateLimit(`reset:${getClientIp(req)}`, RATE_LIMITS.passwordReset.limit, RATE_LIMITS.passwordReset.windowSeconds);
  const body = await readJson(req, resetPasswordSchema);
  await resetPassword(body.token, body.password);
  return jsonOk({ reset: true });
});
