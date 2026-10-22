import { z } from "zod";
import { assertSameOrigin, jsonOk, readJson, withApiRoute } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/notifications";

const schema = z.object({ id: z.string().uuid().optional(), all: z.boolean().optional() });

export const POST = withApiRoute(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const body = await readJson(req, schema);
  if (body.all) {
    const count = await markAllNotificationsRead(user.id);
    return jsonOk({ updated: count });
  }
  if (!body.id) return jsonOk({ updated: 0 });
  const ok = await markNotificationRead(user.id, body.id);
  return jsonOk({ updated: ok ? 1 : 0 });
});
