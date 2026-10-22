import { assertSameOrigin, jsonOk, readJson, withApiRoute } from "@/lib/http";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/auth/session";
import { adminOrderActionSchema } from "@/lib/validation";
import { performAdminOrderAction } from "@/lib/orders/admin";
import { isStaff } from "@/lib/auth/permissions";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

export const POST = withApiRoute(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  if (!isStaff(user.role)) throw new ForbiddenError("Staff access required.");
  await enforceRateLimit(`admin-order:${user.id}`, RATE_LIMITS.admin.limit, RATE_LIMITS.admin.windowSeconds);

  const segments = new URL(req.url).pathname.split("/").filter(Boolean);
  const publicId = segments[3] ? decodeURIComponent(segments[3]) : "";
  if (!publicId) throw new NotFoundError("Order not found.");

  const body = await readJson(req, adminOrderActionSchema);
  const result = await performAdminOrderAction({ publicId, actor: user, action: body });
  return jsonOk({ message: result.message, status: result.order.status });
});
