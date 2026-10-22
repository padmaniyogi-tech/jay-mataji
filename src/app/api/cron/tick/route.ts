import { getEnv } from "@/lib/env";
import { NO_STORE_HEADERS } from "@/lib/http";
import { safeEqual } from "@/lib/ids";
import { captureException } from "@/lib/logger";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { runWorkerOnce } from "@/lib/jobs/worker";
import { sweepPendingProviderOrders } from "@/lib/orders/processing";

export const dynamic = "force-dynamic";

/**
 * Serverless-friendly worker trigger.
 * Auth: Authorization: Bearer <CRON_SECRET> (or ?secret= for platforms that cannot set headers).
 * Configure CRON_SECRET and call this every minute from your scheduler. In container
 * deployments, run `npm run worker` instead.
 */
async function handle(req: Request): Promise<Response> {
  const env = getEnv();
  const auth = req.headers.get("authorization") ?? "";
  const url = new URL(req.url);
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : (url.searchParams.get("secret") ?? "");
  if (!env.CRON_SECRET || !safeEqual(provided, env.CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }
  try {
    await ensureDatabaseReady();
    const result = await runWorkerOnce({ workerId: `cron-${Date.now()}`, batchSize: 10 });
    const swept = await sweepPendingProviderOrders(30);
    return Response.json({ ok: true, ...result, swept }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    captureException(err, { source: "cron_tick" });
    return Response.json({ error: "Worker tick failed" }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
