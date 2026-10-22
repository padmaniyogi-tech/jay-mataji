import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { getEnv } from "@/lib/env";
import { NO_STORE_HEADERS } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Liveness/readiness probe. Never exposes secrets or customer data. */
export async function GET(): Promise<Response> {
  const env = getEnv();
  const started = Date.now();
  let database: "ok" | "error" = "ok";
  let detail: string | null = null;
  try {
    await ensureDatabaseReady();
    await db.execute(sql`select 1`);
  } catch (err) {
    database = "error";
    detail = (err as Error).message.slice(0, 200);
  }

  const healthy = database === "ok";
  return Response.json(
    {
      status: healthy ? "ok" : "degraded",
      time: new Date().toISOString(),
      latencyMs: Date.now() - started,
      checks: {
        database,
        payments: env.PAYMENTS_PROVIDER,
        email: env.EMAIL_PROVIDER,
        demoMode: env.DEMO_MODE,
        worker: env.INLINE_WORKER || env.DEMO_MODE ? "inline" : "external",
      },
      ...(detail ? { detail } : {}),
    },
    { status: healthy ? 200 : 503, headers: NO_STORE_HEADERS },
  );
}
