import { getDbAsync } from "./index";
import { applyMigrations } from "./migrate";
import { getEnv, validateEnvironment } from "@/lib/env";
import { logger } from "@/lib/logger";

let bootstrapped: Promise<void> | null = null;
let sideEffectsStarted = false;

/**
 * Node-only one-time setup: environment diagnostics and the in-process demo worker.
 * Kept out of `instrumentation.ts` so the edge compilation unit never pulls in `pg`.
 */
async function startServerSideEffects(): Promise<void> {
  if (sideEffectsStarted) return;
  sideEffectsStarted = true;
  const env = getEnv();
  for (const warning of validateEnvironment(env)) {
    if (warning.level === "error") logger.error("env_warning", { message: warning.message });
    else logger.warn("env_warning", { message: warning.message });
  }
  // Undefined outside the Next server (tsx scripts); edge runtime is never used by this app.
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!env.INLINE_WORKER && !(env.DEMO_MODE && env.NODE_ENV !== "production")) return;
  try {
    const { startInlineWorker } = await import("@/lib/jobs/inline-worker");
    startInlineWorker();
  } catch (err) {
    logger.error("inline_worker_start_failed", { message: (err as Error).message });
  }
}

/**
 * Ensures the database connection exists. In non-production it also applies pending
 * migrations so `npm run dev` works immediately after install. Production deployments
 * run `npm run db:migrate` as an explicit release step (never auto-DDL in prod).
 */
export function ensureDatabaseReady(): Promise<void> {
  if (!bootstrapped) {
    bootstrapped = (async () => {
      await getDbAsync();
      const env = getEnv();
      if (env.NODE_ENV !== "production") {
        try {
          const result = await applyMigrations();
          if (result.applied.length > 0) {
            logger.info("migrations_applied", { applied: result.applied });
          }
        } catch (err) {
          logger.error("migration_check_failed", { message: (err as Error).message });
          throw err;
        }
      }
      await startServerSideEffects();
    })().catch((err) => {
      bootstrapped = null;
      throw err;
    });
  }
  return bootstrapped;
}
