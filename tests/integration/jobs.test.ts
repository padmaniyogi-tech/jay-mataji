import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { initTestDatabase, closeDatabase, db, withTransaction } from "@/lib/db";
import { applyMigrations } from "@/lib/db/migrate";
import { enqueueJob, claimNextJob } from "@/lib/jobs/queue";
import { enqueueOutbox, dispatchOutbox, pendingOutboxCount } from "@/lib/jobs/outbox";
import { sql } from "drizzle-orm";

/**
 * Real Postgres semantics (via in-memory PGlite) for the queue.
 * These tests exercise deduplication and outbox dispatch — the two properties that
 * prevent duplicate provider submissions and lost payment events.
 */
describe("job queue", () => {
  beforeAll(async () => {
    await initTestDatabase();
    await applyMigrations({ log: () => undefined });
  }, 120_000);

  afterAll(async () => {
    await closeDatabase();
  });

  it("deduplicates identical work items", async () => {
    const first = await enqueueJob({ type: "order.submit", dedupeKey: "order:A:provider:1", payload: { orderId: "a" } });
    const second = await enqueueJob({ type: "order.submit", dedupeKey: "order:A:provider:1", payload: { orderId: "a" } });
    expect(second.id).toBe(first.id);
    expect(second.deduped).toBe(true);
  });

  it("claims each job at most once across workers", async () => {
    await enqueueJob({ type: "order.poll", dedupeKey: "poll:1", payload: { orderId: "b" } });
    const claimedIds: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const job = await claimNextJob(`worker-${i % 3}`);
      if (!job) break;
      expect(claimedIds).not.toContain(job.id);
      claimedIds.push(job.id);
    }
    expect(claimedIds.length).toBeGreaterThan(0);
  });

  it("does not dispatch future work", async () => {
    await enqueueOutbox(db, "email.send", "email:later", { to: "x@y.z" }, { availableAt: new Date(Date.now() + 60_000) });
    const before = await pendingOutboxCount();
    const result = await dispatchOutbox(50);
    expect(result.dispatched).toBe(0);
    expect(await pendingOutboxCount()).toBe(before);
  });

  it("dispatches due outbox rows exactly once", async () => {
    await enqueueOutbox(db, "email.send", "email:now", { to: "x@y.z", template: "order_paid" });
    const first = await dispatchOutbox(50);
    expect(first.dispatched).toBeGreaterThanOrEqual(1);
    const second = await dispatchOutbox(50);
    expect(second.dispatched).toBe(0);
  });

  it("rolls back queued work when the business transaction fails", async () => {
    await expect(
      withTransaction(async (tx) => {
        await enqueueJob({ type: "order.route", dedupeKey: "route:rollback", payload: { orderId: "c" } }, tx);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const rows = await db.execute(sql`select count(*)::int as count from "jobs" where dedupe_key = 'route:rollback'`);
    const count = (rows as unknown as { rows: Array<{ count: number }> }).rows[0]?.count ?? 0;
    expect(Number(count)).toBe(0);
  });
});
