import { jsonOk, withApiRoute } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { getOrderForViewer } from "@/lib/orders/service";
import { NotFoundError } from "@/lib/errors";

export const dynamic = "force-dynamic";

/** Single order for the signed-in owner (or staff with read-all). */
export const GET = withApiRoute(async (req) => {
  const user = await requireUser();
  const segments = new URL(req.url).pathname.split("/").filter(Boolean);
  const publicId = decodeURIComponent(segments[2] ?? "");
  const detail = publicId ? await getOrderForViewer(publicId, user) : null;
  if (!detail) throw new NotFoundError("Order not found.");
  return jsonOk({
    order: detail.order,
    service: {
      slug: detail.service.slug,
      name: detail.service.name,
      unitLabel: detail.service.unitLabel,
      estimatedDurationHours: detail.service.estimatedDurationHours,
    },
    provider: detail.provider,
    events: detail.events,
    measurements: detail.measurements,
    payments: detail.payments.map((payment) => ({
      id: payment.id,
      provider: payment.provider,
      status: payment.status,
      amountPaise: payment.amountPaise,
      receiptNumber: payment.receiptNumber,
      verifiedAt: payment.verifiedAt,
    })),
    refunds: detail.refunds,
  });
});
