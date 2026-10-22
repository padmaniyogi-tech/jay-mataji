import { and, eq, sql } from "drizzle-orm";
import { db, getDbAsync, type Executor } from "@/lib/db";
import { jobs, type Job } from "@/lib/db/schema";
import { logger } from "@/lib/logger";

/** Durable Postgres job queue with idempotent enqueue + SKIP LOCKED claiming. */

export type JobType =
  | "order.route"
  | "order.submit"
  | "order.poll"
  | "order.timeout"
  | "payment.expire"
  | "email.send"
  | "refund.process"
  | "provider.health";

export type EnqueueInput = {
  type: JobType;
  /** Unique per logical unit of work — makes enqueue idempotent under retries. */
  dedupeKey: string;
  payload: Record<string, unknown>;
  queue?: string;
  runAt?: Date;
  maxAttempts?: number;
};

export async function enqueueJob(
  input: EnqueueInput,
  executor: Executor = db,
): Promise<{ id: string; deduped: boolean }> {
  const inserted = await executor
    .insert(jobs)
    .values({
      queue: input.queue ?? "default",
      type: input.type,
      dedupeKey: input.dedupeKey,
      payload: input.payload,
      runAt: input.runAt ?? new Date(),
      maxAttempts: input.maxAttempts ?? 6,
    })
    .onConflictDoNothing({ target: jobs.dedupeKey })
    .returning({ id: jobs.id });

  if (inserted[0]) return { id: inserted[0].id, deduped: false };

  const existing = await executor
    .select({ id: jobs.id, status: jobs.status, runAt: jobs.runAt })
    .from(jobs)
    .where(eq(jobs.dedupeKey, input.dedupeKey))
    .limit(1);
  if (!existing[0]) throw new Error(`Job ${input.dedupeKey} could not be loaded after conflict.`);
  return { id: existing[0].id, deduped: true };
}

export type ClaimedJob = Job;

/**
 * Claim one due job atomically. `FOR UPDATE SKIP LOCKED` lets many workers (and serverless
 * instances) poll the same table without double processing.
 */
export async function claimNextJob(workerId: string): Promise<ClaimedJob | null> {
  await getDbAsync();
  const result = await db.execute(sql`
    update "jobs" set
      "status" = 'running',
      "locked_at" = now(),
      "locked_by" = ${workerId},
      "attempts" = "attempts" + 1,
      "updated_at" = now()
    where "id" = (
      select "id" from "jobs"
      where "status" = 'pending' and "run_at" <= now()
      order by "run_at" asc
      limit 1
      for update skip locked
    )
    returning *
  `);
  const rows = (result as unknown as { rows?: Record<string, unknown>[] }).rows ?? [];
  return rows[0] ? (rows[0] as unknown as ClaimedJob) : null;
}

export async function completeJob(jobId: string): Promise<void> {
  await getDbAsync();
  await db
    .update(jobs)
    .set({ status: "completed", completedAt: new Date(), lockedAt: null, updatedAt: new Date(), lastError: null })
    .where(eq(jobs.id, jobId));
}

export function computeBackoffMs(attempts: number, baseMs = 5_000, capMs = 15 * 60_000): number {
  const exponential = Math.min(baseMs * Math.pow(2, Math.max(attempts - 1, 0)), capMs);
  const jitter = Math.random() * exponential * 0.2; // spread retries to avoid thundering herds
  return Math.round(exponential + jitter);
}

export async function failJob(job: ClaimedJob, error: unknown): Promise<{ retried: boolean; dead: boolean }> {
  await getDbAsync();
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
  const attempts = Number(job.attempts);
  const dead = attempts >= Number(job.maxAttempts);

  if (dead) {
    await db
      .update(jobs)
      .set({ status: "dead", lastError: message, lockedAt: null, updatedAt: new Date() })
      .where(eq(jobs.id, job.id));
    logger.error("job_dead_letter", { jobId: job.id, type: job.type, attempts, message });
    return { retried: false, dead: true };
  }

  const delay = computeBackoffMs(attempts);
  await db
    .update(jobs)
    .set({
      status: "pending",
      lastError: message,
      lockedAt: null,
      lockedBy: null,
      runAt: new Date(Date.now() + delay),
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, job.id));
  logger.warn("job_retry_scheduled", { jobId: job.id, type: job.type, attempts, delayMs: delay, message });
  return { retried: true, dead: false };
}

/** Recover jobs whose worker died mid-flight. */
export async function releaseStaleJobs(staleAfterSeconds = 600): Promise<number> {
  await getDbAsync();
  const result = await db.execute(sql`
    update "jobs" set "status" = 'pending', "locked_at" = null, "locked_by" = null, "updated_at" = now()
    where "status" = 'running' and "locked_at" < now() - (${staleAfterSeconds} * interval '1 second')
    returning "id"
  `);
  const rows = (result as unknown as { rows?: unknown[] }).rows ?? [];
  if (rows.length > 0) logger.warn("stale_jobs_released", { count: rows.length });
  return rows.length;
}

export async function jobStats(): Promise<Record<string, number>> {
  await getDbAsync();
  const result = await db.execute(sql`select "status", count(*)::int as count from "jobs" group by "status"`);
  const rows = (result as unknown as { rows?: { status: string; count: number }[] }).rows ?? [];
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
}

export async function recentJobs(limit = 50): Promise<Job[]> {
  await getDbAsync();
  return db.select().from(jobs).orderBy(sql`${jobs.createdAt} desc`).limit(limit);
}

export async function pendingJobsForOrder(orderId: string): Promise<Job[]> {
  await getDbAsync();
  return db
    .select()
    .from(jobs)
    .where(and(sql`${jobs.payload}->>'orderId' = ${orderId}`, eq(jobs.status, "pending")))
    .orderBy(jobs.runAt);
}
