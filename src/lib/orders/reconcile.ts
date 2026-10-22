import { eq } from "drizzle-orm";
import { db, getDbAsync } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { enqueueOutbox } from "@/lib/jobs/outbox";

/**
 * Provider webhooks do not mutate money or status directly. They schedule an immediate,
 * deduplicated reconciliation poll so all state changes still flow through the same
 * evidence-checked processing path (and stay idempotent if webhooks repeat).
 */
export async function enqueueReconciliationForOrder(orderId: string, reason: string): Promise<void> {
  await getDbAsync();
  const rows = await db.select({ id: orders.id, providerRef: orders.providerRef }).from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!rows[0]?.providerRef) return;
  await enqueueOutbox(
    db,
    "order.poll",
    `order:poll:webhook:${orderId}:${Date.now()}`,
    { orderId, seq: Math.floor(Date.now() / 1000), reason },
    { availableAt: new Date() },
  );
}
