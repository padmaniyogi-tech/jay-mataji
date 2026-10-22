import { assertSameOrigin, jsonOk, readJson, withApiRoute } from "@/lib/http";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/auth/session";
import { razorpayVerifySchema } from "@/lib/validation";
import { confirmPayment, getOrderForViewer } from "@/lib/orders/service";
import { NotFoundError } from "@/lib/errors";
import { paymentProviderName } from "@/lib/payments/gateway";

export const POST = withApiRoute(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  await enforceRateLimit(`razorpay-verify:${user.id}`, RATE_LIMITS.checkout.limit, RATE_LIMITS.checkout.windowSeconds);

  if (paymentProviderName() !== "razorpay") {
    throw new NotFoundError("Razorpay is not enabled on this deployment.");
  }

  const body = await readJson(req, razorpayVerifySchema);
  const detail = await getOrderForViewer(body.orderPublicId, user);
  if (!detail || detail.order.userId !== user.id) throw new NotFoundError("Order not found.");

  const result = await confirmPayment({
    orderPublicId: body.orderPublicId,
    providerOrderId: body.razorpay_order_id,
    providerPaymentId: body.razorpay_payment_id,
    signature: body.razorpay_signature,
    source: "checkout",
  });

  return jsonOk({
    orderPublicId: result.order.publicId,
    status: result.order.status,
    redirectTo: `/dashboard/orders/${result.order.publicId}?paid=1`,
  });
});
