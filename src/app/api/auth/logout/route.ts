import { cookies } from "next/headers";
import { assertSameOrigin, jsonOk, withApiRoute } from "@/lib/http";
import { SESSION_COOKIE, clearSessionCookie, revokeSessionToken } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export const POST = withApiRoute(async (req) => {
  assertSameOrigin(req);
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const user = await getSessionUser();
  if (token) await revokeSessionToken(token);
  await clearSessionCookie();
  if (user) {
    await recordAudit(db, {
      action: "auth.logout",
      entityType: "user",
      entityId: user.id,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
    });
  }
  return jsonOk({ signedOut: true });
});
