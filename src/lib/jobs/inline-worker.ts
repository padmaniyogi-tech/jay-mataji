import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { runWorkerOnce } from "./worker";

type WorkerState = { timer: NodeJS.Timeout | null; running: boolean; startedAt: number };

const globalKey = "__amplifiInlineWorker" as const;
type GlobalWithWorker = typeof globalThis & { [globalKey]?: WorkerState };

/**
 * Development convenience: runs the queue worker inside the Next.js process so a single
 * `npm run dev` gives a fully working demo. In production, run `npm run worker` as its own
 * service (or a cron hitting /api/cron/tick) — never rely on the web process for delivery.
 */
export function startInlineWorker(): void {
  const g = globalThis as GlobalWithWorker;
  if (g[globalKey]?.timer) return;

  const env = getEnv();
  if (!env.DEMO_MODE && !env.INLINE_WORKER) return;
  if (env.NODE_ENV === "production" && !env.INLINE_WORKER) return;

  const state: WorkerState = { timer: null, running: false, startedAt: Date.now() };
  g[globalKey] = state;

  const tick = async () => {
    if (state.running) return;
    state.running = true;
    try {
      const result = await runWorkerOnce({ workerId: `inline-${process.pid}`, batchSize: env.WORKER_BATCH_SIZE });
      if (result.processed || result.failed || result.dispatched) {
        logger.debug("inline_worker_tick", result);
      }
    } catch (err) {
      logger.error("inline_worker_error", { message: (err as Error).message });
    } finally {
      state.running = false;
    }
  };

  state.timer = setInterval(() => void tick(), env.WORKER_POLL_MS);
  // Kick once shortly after boot so a pending job doesn't wait a full interval.
  setTimeout(() => void tick(), 1500);
  logger.warn("inline_worker_started", {
    intervalMs: env.WORKER_POLL_MS,
    message: "Demo mode: the job worker is running inside the web process. Use `npm run worker` in production.",
  });
}

export function stopInlineWorker(): void {
  const g = globalThis as GlobalWithWorker;
  const state = g[globalKey];
  if (state?.timer) clearInterval(state.timer);
  if (state) state.timer = null;
}
