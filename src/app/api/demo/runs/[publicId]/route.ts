import { getClientIp, jsonError, jsonOk, withApiRoute } from "@/lib/http";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getDemoRun } from "@/lib/demo/service";

/**
 * Polls one demo run. Progress is derived from elapsed time server-side, so this is a
 * cheap read with no worker involvement and nothing to leak: the row holds no user,
 * no payment and no credentials.
 */
export const GET = withApiRoute(async (req) => {
  const ip = getClientIp(req);
  await enforceRateLimit(`demo-status:${ip}`, RATE_LIMITS.demoStatus.limit, RATE_LIMITS.demoStatus.windowSeconds);

  const publicId = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
  if (!/^DEMO-[0-9A-Z]{4,20}$/.test(publicId)) {
    return jsonError("That demo reference is not valid.", { status: 422, code: "demo_id_invalid" });
  }

  const run = await getDemoRun(publicId);
  if (!run) return jsonError("Demo run not found.", { status: 404, code: "demo_not_found" });
  return jsonOk({ run, simulated: true });
});
