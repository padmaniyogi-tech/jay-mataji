import { z } from "zod";
import { assertSameOrigin, jsonOk, readJson, withApiRoute } from "@/lib/http";
import { RATE_LIMITS, enforceRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/auth/session";
import { refreshAllProviderHealth, testProviderConnection, updateProviderSettings } from "@/lib/admin/service";
import { providerUpdateSchema } from "@/lib/validation";
import { ForbiddenError } from "@/lib/errors";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("test"), providerId: z.string().uuid() }),
  z.object({ action: z.literal("refresh_all") }),
  providerUpdateSchema.extend({ action: z.literal("update") }),
]);

export const POST = withApiRoute(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  if (user.role !== "admin") throw new ForbiddenError("Administrator role required.");
  await enforceRateLimit(`admin-provider:${user.id}`, RATE_LIMITS.admin.limit, RATE_LIMITS.admin.windowSeconds);

  const body = await readJson(req, schema);

  if (body.action === "test") {
    const health = await testProviderConnection(body.providerId, user);
    return jsonOk({ status: health.status, message: health.message, checkedAt: health.checkedAt });
  }
  if (body.action === "refresh_all") {
    await refreshAllProviderHealth(user);
    return jsonOk({ message: "Health checks refreshed." });
  }

  const patch = {
    ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
    ...(body.priority !== undefined ? { priority: body.priority } : {}),
    ...(body.reliabilityScore !== undefined ? { reliabilityScore: body.reliabilityScore } : {}),
    ...(body.minQuantity !== undefined ? { minQuantity: body.minQuantity } : {}),
    ...(body.maxQuantity !== undefined ? { maxQuantity: body.maxQuantity } : {}),
    ...(body.costPerUnitPaise !== undefined ? { costPerUnitPaise: body.costPerUnitPaise } : {}),
    ...(body.fixedCostPaise !== undefined ? { fixedCostPaise: body.fixedCostPaise } : {}),
    ...(body.estimatedDurationHours !== undefined ? { estimatedDurationHours: body.estimatedDurationHours } : {}),
  };

  const provider = await updateProviderSettings({
    providerId: body.providerId,
    actor: user,
    patch,
    credentials: body.credentials,
    config: body.config,
  });
  return jsonOk({
    message: "Provider updated.",
    provider: { id: provider.id, enabled: provider.enabled, priority: provider.priority, health: provider.health },
  });
});
