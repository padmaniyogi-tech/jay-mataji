import { assertSameOrigin, jsonOk, withApiRoute } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/auth/session";
import { resendVerificationEmail } from "@/lib/auth/service";

export const POST = withApiRoute(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  await enforceRateLimit(`resend-verify:${user.id}`, 3, 60 * 60);
  await resendVerificationEmail(user);
  return jsonOk({ sent: true });
});
