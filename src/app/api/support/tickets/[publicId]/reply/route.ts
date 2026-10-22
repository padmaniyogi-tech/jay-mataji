import { assertSameOrigin, jsonOk, readJson, withApiRoute } from "@/lib/http";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/auth/session";
import { ticketReplySchema } from "@/lib/validation";
import { addTicketMessage } from "@/lib/support";

export const POST = withApiRoute(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  await enforceRateLimit(`ticket-reply:${user.id}`, RATE_LIMITS.support.limit, RATE_LIMITS.support.windowSeconds);
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const publicId = segments[3];
  if (!publicId) return jsonOk({ sent: false });
  const body = await readJson(req, ticketReplySchema);
  await addTicketMessage({ publicId, author: user, body: body.message, internal: body.internal });
  return jsonOk({ sent: true });
});
