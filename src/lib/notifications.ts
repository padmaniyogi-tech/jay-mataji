import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, getDbAsync, type Executor } from "@/lib/db";
import { notifications, users } from "@/lib/db/schema";

export type NotificationRow = typeof notifications.$inferSelect;
import { enqueueOutbox } from "@/lib/jobs/outbox";
import { logger } from "@/lib/logger";
import type { EmailTemplateKey } from "@/lib/email";

export type NotifyInput = {
  userId: string;
  orderId?: string | null;
  type: string;
  title: string;
  body: string;
  href?: string | null;
  email?: {
    template: EmailTemplateKey;
    data: Record<string, unknown>;
    dedupeKey?: string;
  };
};

/**
 * Writes an in-app notification and (optionally) schedules the matching email through the
 * transactional outbox. Call inside the same transaction as the status change when the
 * notification must be atomic with it.
 */
export async function notifyUser(executor: Executor, input: NotifyInput): Promise<string | null> {
  const inserted = await executor
    .insert(notifications)
    .values({
      userId: input.userId,
      orderId: input.orderId ?? null,
      type: input.type,
      title: input.title,
      body: input.body,
      href: input.href ?? null,
    })
    .returning({ id: notifications.id });

  const id = inserted[0]?.id ?? null;

  if (input.email && id) {
    const recipient = await executor
      .select({ email: users.email, name: users.name, suspendedAt: users.suspendedAt })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);
    const user = recipient[0];
    if (user && !user.suspendedAt) {
      await enqueueOutbox(
        executor,
        "email.send",
        input.email.dedupeKey ?? `email:${id}`,
        {
          to: user.email,
          name: user.name,
          template: input.email.template,
          data: input.email.data,
          orderId: input.orderId ?? null,
          notificationId: id,
        },
      );
    }
  }

  return id;
}

/** Notify every active admin (and optionally support/finance). */
export async function notifyStaff(
  executor: Executor,
  input: Omit<NotifyInput, "userId"> & { roles?: Array<"admin" | "support" | "finance"> },
): Promise<number> {
  const roles = input.roles ?? ["admin"];
  const staff = await executor
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(and(inArray(users.role, roles), isNull(users.suspendedAt)));

  for (const member of staff) {
    await notifyUser(executor, {
      ...input,
      userId: member.id,
      // Only the first staff member triggers the email to avoid duplicate alerts.
      email:
        input.email && member.id === staff[0]?.id
          ? { ...input.email, dedupeKey: input.email.dedupeKey ?? `staff:${input.type}:${Date.now()}` }
          : undefined,
    });
  }
  logger.info("staff_notified", { type: input.type, count: staff.length });
  return staff.length;
}

export async function markNotificationRead(userId: string, notificationId: string): Promise<boolean> {
  await getDbAsync();
  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return updated.length > 0;
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  await getDbAsync();
  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return updated.length;
}

export async function unreadNotificationCount(userId: string): Promise<number> {
  await getDbAsync();
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(rows[0]?.count ?? 0);
}

/** Newest notifications for the signed-in customer's notification centre. */
export async function listNotificationsForUser(userId: string, limit = 50): Promise<NotificationRow[]> {
  await getDbAsync();
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(Math.min(Math.max(limit, 1), 200));
}
