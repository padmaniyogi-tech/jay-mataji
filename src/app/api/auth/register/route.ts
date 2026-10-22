import { assertSameOrigin, getClientIp, jsonOk, readJson, withApiRoute } from "@/lib/http";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import { registerSchema } from "@/lib/validation";
import { registerUser } from "@/lib/auth/service";
import { setSessionCookie } from "@/lib/auth/session";
import { homeForRole } from "@/lib/auth/permissions";

export const POST = withApiRoute(async (req) => {
  assertSameOrigin(req);
  const ip = getClientIp(req);
  await enforceRateLimit(`register:${ip}`, RATE_LIMITS.register.limit, RATE_LIMITS.register.windowSeconds);

  const body = await readJson(req, registerSchema);
  const { user, token, expiresAt } = await registerUser({
    name: body.name,
    email: body.email,
    password: body.password,
    marketingOptIn: body.marketingOptIn,
    ip,
    userAgent: req.headers.get("user-agent"),
  });
  await setSessionCookie(token, expiresAt);

  return jsonOk({
    user: { id: user.id, email: user.email, name: user.name, role: user.role, emailVerified: Boolean(user.emailVerifiedAt) },
    redirectTo: homeForRole(user.role),
  });
});
