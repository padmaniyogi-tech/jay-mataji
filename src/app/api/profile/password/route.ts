import { assertSameOrigin, jsonOk, readJson, withApiRoute } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { changePasswordSchema } from "@/lib/validation";
import { changePassword } from "@/lib/auth/service";
import { enforceRateLimit } from "@/lib/rate-limit";

export const POST = withApiRoute(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  await enforceRateLimit(`password-change:${user.id}`, 5, 60 * 60);
  const body = await readJson(req, changePasswordSchema);
  await changePassword(user, body.currentPassword, body.newPassword);
  return jsonOk({ changed: true, signedOut: true });
});
