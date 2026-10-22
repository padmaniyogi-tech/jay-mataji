import { assertSameOrigin, jsonOk, readJson, withApiRoute } from "@/lib/http";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/auth/session";
import { ticketSchema } from "@/lib/validation";
import { createTicket, listTicketsForUser } from "@/lib/support";

export const POST = withApiRoute(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  await enforceRateLimit(`ticket:${user.id}`, RATE_LIMITS.support.limit, RATE_LIMITS.support.windowSeconds);
  const body = await readJson(req, ticketSchema);
  const ticket = await createTicket({
    user,
    subject: body.subject,
    category: body.category ?? "general",
    message: body.message,
    orderPublicId: body.orderPublicId,
  });
  return jsonOk({ ticket: { publicId: ticket.publicId, status: ticket.status } });
});

export const GET = withApiRoute(async () => {
  const user = await requireUser();
  const tickets = await listTicketsForUser(user.id);
  return jsonOk({ tickets });
});
