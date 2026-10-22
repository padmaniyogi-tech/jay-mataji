#!/usr/bin/env tsx
/**
 * Standalone queue worker.
 *
 *   npm run worker          # long-running (production / docker compose)
 *   npm run worker:once     # single drain, useful in CI and cron
 */
import { loadEnvFiles } from "../lib/load-env";

loadEnvFiles();

async function main() {
  const once = process.argv.includes("--once");
  const { getEnv } = await import("../lib/env");
  const { applyMigrations } = await import("../lib/db/migrate");
  const { getDbAsync, closeDatabase } = await import("../lib/db");
  const { runWorkerOnce } = await import("../lib/jobs/worker");
  const { logger } = await import("../lib/logger");

  const env = getEnv();
  await getDbAsync();
  const migration = await applyMigrations({ log: (m: string) => console.log(`   ${m}`) });
  if (migration.applied.length) logger.info("worker_migrations_applied", { applied: migration.applied });

  const workerId = env.WORKER_ID ?? `worker-${process.pid}`;

  if (once) {
    const result = await runWorkerOnce({ workerId, batchSize: env.WORKER_BATCH_SIZE });
    console.log(`✓ worker tick complete: ${result.processed} processed, ${result.failed} failed, ${result.dispatched} dispatched`);
    await closeDatabase();
    return;
  }

  console.log(`→ Amplifi worker ${workerId} started (poll ${env.WORKER_POLL_MS}ms). Ctrl+C to stop.`);
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    console.log("\n→ Stopping worker…");
    await closeDatabase().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  let running = false;
  while (!stopping) {
    if (!running) {
      running = true;
      try {
        const result = await runWorkerOnce({ workerId, batchSize: env.WORKER_BATCH_SIZE });
        if (result.processed || result.failed) {
          logger.info("worker_tick", result);
        }
      } catch (err) {
        logger.error("worker_tick_error", { message: (err as Error).message });
      } finally {
        running = false;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, env.WORKER_POLL_MS));
  }
}

main().catch((err) => {
  console.error(`✗ Worker crashed: ${(err as Error).message}`);
  process.exitCode = 1;
});
