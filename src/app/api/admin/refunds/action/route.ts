import { assertSameOrigin, jsonOk, readJson, withApiRoute } from "@/lib/http";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/auth/session";
import { adminRefundActionSchema } from "@/lib/validation";
import { approveRefund, processRefund, rejectRefund } from "@/lib/orders/refunds";
import { hasPermission } from "@/lib/auth/permissions";
import { ForbiddenError, ValidationError } from "@/lib/errors";

export const POST = withApiRoute(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  if (!hasPermission(user.role, "refunds:approve")) throw new ForbiddenError("Finance or admin role required.");
  await enforceRateLimit(`admin-refund:${user.id}`, RATE_LIMITS.admin.limit, RATE_LIMITS.admin.windowSeconds);

  const body = await readJson(req, adminRefundActionSchema);
  if (body.action === "approve") {
    const refund = await approveRefund({ refundId: body.refundId, actor: user, amountPaise: body.amountPaise, note: body.note });
    return jsonOk({ message: `Refund approved (${refund.amountPaise} paise). Execution queued.`, status: refund.status });
  }
  if (body.action === "reject") {
    if (!body.note) throw new ValidationError("A note is required when rejecting a refund.");
    const refund = await rejectRefund({ refundId: body.refundId, actor: user, note: body.note });
    return jsonOk({ message: "Refund rejected.", status: refund.status });
  }
  const result = await processRefund(body.refundId);
  return jsonOk({ message: result.message, processed: result.processed });
});
