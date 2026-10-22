import { and, eq, sql } from "drizzle-orm";
import { db, getDbAsync, withTransaction, type Executor } from "@/lib/db";
import { outbox, type Job } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { enqueueJob, type JobType } from "./queue";

/**
 * Transactional outbox.
 *
 * A business transaction (e.g. "payment verified") writes its outbox row in the SAME
 * database transaction. A dispatcher later turns outbox rows into durable jobs, so a
 * committed payment can never end up without a dispatch attempt, and a rolled-back
 * transaction never leaks a job.
 */

export type OutboxTopic = JobType;

export async function enqueueOutbox(
  executor: Executor,
  topic: OutboxTopic,
  dedupeKey: string,
  payload: Record<string, unknown>,
  options: { availableAt?: Date } = {},
): Promise<void> {
  await executor
    .insert(outbox)
    .values({
      topic,
      dedupeKey,
      payload,
      availableAt: options.availableAt ?? new Date(),
    })
    .onConflictDoNothing({ target: outbox.dedupeKey });
}

export type DispatchResult = { dispatched: number; failed: number };

/** Moves due outbox rows into the job queue. Safe to run concurrently. */
export async function dispatchOutbox(limit = 25): Promise<DispatchResult> {
  await getDbAsync();
  let dispatched = 0;
  let failed = 0;

  for (let processed = 0; processed < limit; processed++) {
    const handled = await withTransaction(async (tx) => {
      const result = await tx.execute(sql`
        select * from "outbox"
        where "status" = 'pending' and "available_at" <= now()
        order by "created_at" asc
        limit 1
        for update skip locked
      `);
      const rows = (result as unknown as { rows?: Record<string, unknown>[] }).rows ?? [];
      const row = rows[0];
      if (!row) return false;

      const id = String(row.id);
      const topic = String(row.topic) as JobType;
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      try {
        await enqueueJob(
          { type: topic, dedupeKey: `outbox:${id}`, payload, maxAttempts: 8 },
          tx,
        );
        await tx
          .update(outbox)
          .set({ status: "dispatched", dispatchedAt: new Date() })
          .where(eq(outbox.id, id));
        dispatched += 1;
      } catch (err) {
        failed += 1;
        logger.error("outbox_dispatch_failed", { outboxId: id, message: (err as Error).message });
        await tx
          .update(outbox)
          .set({
            attempts: sql`${outbox.attempts} + 1`,
            lastError: (err as Error).message.slice(0, 1000),
            status: sql`case when ${outbox.attempts} + 1 >= 10 then 'failed'::outbox_status else 'pending'::outbox_status end`,
            availableAt: new Date(Date.now() + 60_000),
          })
          .where(eq(outbox.id, id));
      }
      return true;
    });
    if (!handled) break;
  }

  return { dispatched, failed };
}

export async function pendingOutboxCount(): Promise<number> {
  await getDbAsync();
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(outbox)
    .where(eq(outbox.status, "pending"));
  return Number(result[0]?.count ?? 0);
}

export async function outboxForOrder(_orderId: string): Promise<Array<{ id: string; topic: string; status: string }>> {
  await getDbAsync();
  return db
    .select({ id: outbox.id, topic: outbox.topic, status: outbox.status })
    .from(outbox)
    .where(and(eq(outbox.status, "pending"), sql`${outbox.payload}->>'orderId' = ${_orderId}`))
    .limit(20);
}

export type { Job };
