import { z } from "zod";
import { assertSameOrigin, jsonOk, readJson, withApiRoute } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { saveSettings } from "@/lib/admin/service";
import { ForbiddenError } from "@/lib/errors";

const schema = z.object({
  taxRatePercent: z.coerce.number().min(0).max(50).optional(),
  taxLabel: z.string().trim().min(2).max(60).optional(),
  supportEmail: z.string().email().optional(),
  refundWindowDays: z.coerce.number().int().min(0).max(120).optional(),
  maxActiveOrdersPerUser: z.coerce.number().int().min(1).max(100).optional(),
  autoRouteEnabled: z.boolean().optional(),
  demoBanner: z.boolean().optional(),
  maintenanceMessage: z.string().trim().max(300).nullable().optional(),
});

export const POST = withApiRoute(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  if (user.role !== "admin") throw new ForbiddenError("Administrator role required.");
  const body = await readJson(req, schema);
  const settings = await saveSettings(user, {
    ...(body.taxRatePercent !== undefined ? { taxRateBps: Math.round(body.taxRatePercent * 100) } : {}),
    ...(body.taxLabel !== undefined ? { taxLabel: body.taxLabel } : {}),
    ...(body.supportEmail !== undefined ? { supportEmail: body.supportEmail } : {}),
    ...(body.refundWindowDays !== undefined ? { refundWindowDays: body.refundWindowDays } : {}),
    ...(body.maxActiveOrdersPerUser !== undefined ? { maxActiveOrdersPerUser: body.maxActiveOrdersPerUser } : {}),
    ...(body.autoRouteEnabled !== undefined ? { autoRouteEnabled: body.autoRouteEnabled } : {}),
    ...(body.demoBanner !== undefined ? { demoBanner: body.demoBanner } : {}),
    ...(body.maintenanceMessage !== undefined ? { maintenanceMessage: body.maintenanceMessage } : {}),
  });
  return jsonOk({ message: "Settings saved.", settings });
});
