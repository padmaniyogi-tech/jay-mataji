import { assertSameOrigin, getClientIp, jsonOk, readJson, withApiRoute } from "@/lib/http";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";
import { authenticate } from "@/lib/auth/service";
import { setSessionCookie } from "@/lib/auth/session";
import { homeForRole } from "@/lib/auth/permissions";

export const POST = withApiRoute(async (req) => {
  assertSameOrigin(req);
  const ip = getClientIp(req);
  const body = await readJson(req, loginSchema);

  // Limit per IP and per account to blunt credential stuffing.
  await enforceRateLimit(`login:ip:${ip}`, RATE_LIMITS.login.limit, RATE_LIMITS.login.windowSeconds);
  await enforceRateLimit(`login:acct:${body.email}`, RATE_LIMITS.login.limit, RATE_LIMITS.login.windowSeconds);

  const { user, token, expiresAt } = await authenticate({
    email: body.email,
    password: body.password,
    ip,
    userAgent: req.headers.get("user-agent"),
  });
  await setSessionCookie(token, expiresAt);

  return jsonOk({
    user: { id: user.id, email: user.email, name: user.name, role: user.role, emailVerified: Boolean(user.emailVerifiedAt) },
    redirectTo: homeForRole(user.role),
  });
});
