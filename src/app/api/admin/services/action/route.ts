import { z } from "zod";
import { assertSameOrigin, jsonOk, readJson, withApiRoute } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { updateService } from "@/lib/admin/service";
import { ForbiddenError } from "@/lib/errors";

const schema = z.object({
  serviceId: z.string().uuid(),
  active: z.boolean().optional(),
  unitPriceRupees: z.coerce.number().min(0).max(1_000_000).optional(),
  minQuantity: z.coerce.number().int().min(1).optional(),
  maxQuantity: z.coerce.number().int().min(1).optional(),
  requiresManualReview: z.boolean().optional(),
  estimatedDurationHours: z.coerce.number().int().min(1).max(2160).optional(),
});

export const POST = withApiRoute(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  if (user.role !== "admin") throw new ForbiddenError("Administrator role required.");
  const body = await readJson(req, schema);
  const service = await updateService({
    actor: user,
    serviceId: body.serviceId,
    patch: {
      ...(body.active !== undefined ? { active: body.active } : {}),
      ...(body.unitPriceRupees !== undefined ? { unitPricePaise: Math.round(body.unitPriceRupees * 100) } : {}),
      ...(body.minQuantity !== undefined ? { minQuantity: body.minQuantity } : {}),
      ...(body.maxQuantity !== undefined ? { maxQuantity: body.maxQuantity } : {}),
      ...(body.requiresManualReview !== undefined ? { requiresManualReview: body.requiresManualReview } : {}),
      ...(body.estimatedDurationHours !== undefined ? { estimatedDurationHours: body.estimatedDurationHours } : {}),
    },
  });
  return jsonOk({ message: "Service updated.", service: { id: service.id, active: service.active, unitPricePaise: service.unitPricePaise } });
});
