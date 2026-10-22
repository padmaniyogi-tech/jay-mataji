import { assertSameOrigin, getClientIp, jsonOk, parsePagination, readJson, withApiRoute } from "@/lib/http";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import { createOrderSchema } from "@/lib/validation";
import { createOrder, listOrdersForUser } from "@/lib/orders/service";
import { requireVerifiedUser } from "@/lib/auth/session";

export const POST = withApiRoute(async (req) => {
  assertSameOrigin(req);
  const user = await requireVerifiedUser();
  await enforceRateLimit(`order-create:${user.id}`, RATE_LIMITS.orderCreate.limit, RATE_LIMITS.orderCreate.windowSeconds);

  const body = await readJson(req, createOrderSchema);
  const result = await createOrder({ user, payload: body, ip: getClientIp(req) });

  return jsonOk({
    order: {
      publicId: result.order.publicId,
      status: result.order.status,
      totalPaise: result.order.totalPaise,
      quantity: result.order.quantity,
    },
    checkout: result.checkout,
    warning: result.warning,
    reused: result.reused,
  });
});

export const GET = withApiRoute(async (req) => {
  const user = await requireVerifiedUser();
  const url = new URL(req.url);
  const { page, pageSize, offset } = parsePagination(url);
  const result = await listOrdersForUser(user.id, {
    status: url.searchParams.get("status") ?? undefined,
    serviceSlug: url.searchParams.get("service") ?? undefined,
    search: url.searchParams.get("q") ?? undefined,
    limit: pageSize,
    offset,
  });
  return jsonOk({ orders: result.rows, total: result.total, page, pageSize });
});
