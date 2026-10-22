import { assertSameOrigin, getClientIp, jsonOk, readJson, withApiRoute } from "@/lib/http";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import { forgotPasswordSchema } from "@/lib/validation";
import { requestPasswordReset } from "@/lib/auth/service";

export const POST = withApiRoute(async (req) => {
  assertSameOrigin(req);
  await enforceRateLimit(`forgot:${getClientIp(req)}`, RATE_LIMITS.passwordReset.limit, RATE_LIMITS.passwordReset.windowSeconds);
  const body = await readJson(req, forgotPasswordSchema);
  await requestPasswordReset(body.email);
  // Always the same response — never reveal whether an account exists.
  return jsonOk({ sent: true });
});
