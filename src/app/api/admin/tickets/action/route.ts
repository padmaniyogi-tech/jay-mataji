import { z } from "zod";
import { assertSameOrigin, jsonOk, readJson, withApiRoute } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { addTicketMessage, setTicketStatus } from "@/lib/support";
import { isStaff } from "@/lib/auth/permissions";
import { ForbiddenError } from "@/lib/errors";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reply"), publicId: z.string().min(3).max(32), message: z.string().trim().min(1).max(4000), internal: z.boolean().optional() }),
  z.object({ action: z.literal("status"), publicId: z.string().min(3).max(32), status: z.enum(["open", "awaiting_customer", "awaiting_agent", "resolved", "closed"]) }),
]);

export const POST = withApiRoute(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  if (!isStaff(user.role)) throw new ForbiddenError("Staff access required.");
  const body = await readJson(req, schema);
  if (body.action === "reply") {
    await addTicketMessage({ publicId: body.publicId, author: user, body: body.message, internal: body.internal });
    return jsonOk({ message: "Reply saved." });
  }
  await setTicketStatus(body.publicId, body.status, user);
  return jsonOk({ message: "Ticket updated." });
});
