import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, getDbAsync, withTransaction } from "@/lib/db";
import { orders, supportTickets, ticketMessages, users, type SupportTicket, type TicketMessage } from "@/lib/db/schema";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { generateTicketPublicId } from "@/lib/ids";
import { recordAudit } from "@/lib/audit";
import { notifyStaff, notifyUser } from "@/lib/notifications";
import { getEnv } from "@/lib/env";
import type { SessionUser } from "@/lib/auth/session";
import { isStaff } from "@/lib/auth/permissions";

export async function createTicket(input: {
  user: SessionUser;
  subject: string;
  category: string;
  message: string;
  orderPublicId?: string;
}): Promise<SupportTicket> {
  await getDbAsync();
  let orderId: string | null = null;
  if (input.orderPublicId) {
    const rows = await db
      .select({ id: orders.id, userId: orders.userId })
      .from(orders)
      .where(eq(orders.publicId, input.orderPublicId))
      .limit(1);
    if (!rows[0] || rows[0].userId !== input.user.id) throw new NotFoundError("Order not found.");
    orderId = rows[0].id;
  }

  const ticket = await withTransaction(async (tx) => {
    const inserted = await tx
      .insert(supportTickets)
      .values({
        publicId: generateTicketPublicId(),
        userId: input.user.id,
        orderId,
        subject: input.subject,
        category: input.category,
        status: "open",
      })
      .returning();
    const row = inserted[0]!;
    await tx.insert(ticketMessages).values({
      ticketId: row.id,
      authorId: input.user.id,
      authorLabel: input.user.name,
      authorRole: input.user.role,
      body: input.message,
    });
    await notifyStaff(tx, {
      type: "ticket.created",
      title: `New support ticket: ${row.subject}`,
      body: `${input.user.name} (${input.user.email}) opened ${row.publicId}.`,
      href: `/admin/tickets/${row.publicId}`,
      roles: ["admin", "support"],
      orderId,
    });
    return row;
  });

  await recordAudit(db, {
    action: "ticket.created",
    entityType: "ticket",
    entityId: ticket.publicId,
    actorId: input.user.id,
    actorEmail: input.user.email,
    actorRole: input.user.role,
    metadata: { category: input.category, orderId },
  });
  return ticket;
}

export type TicketThread = { ticket: SupportTicket; messages: TicketMessage[]; customerName: string | null };

export async function getTicketThread(publicId: string, viewer: SessionUser): Promise<TicketThread | null> {
  await getDbAsync();
  const rows = await db.select().from(supportTickets).where(eq(supportTickets.publicId, publicId)).limit(1);
  const ticket = rows[0];
  if (!ticket) return null;
  if (ticket.userId !== viewer.id && !isStaff(viewer.role)) return null;

  const messages = await db
    .select()
    .from(ticketMessages)
    .where(and(eq(ticketMessages.ticketId, ticket.id), isStaff(viewer.role) ? undefined : eq(ticketMessages.internal, false)))
    .orderBy(ticketMessages.createdAt);

  const customer = await db.select({ name: users.name }).from(users).where(eq(users.id, ticket.userId)).limit(1);
  return { ticket, messages, customerName: customer[0]?.name ?? null };
}

export async function listTicketsForUser(userId: string): Promise<SupportTicket[]> {
  await getDbAsync();
  return db.select().from(supportTickets).where(eq(supportTickets.userId, userId)).orderBy(desc(supportTickets.updatedAt)).limit(50);
}

export async function listAllTickets(status?: string): Promise<Array<SupportTicket & { customerName: string | null }>> {
  await getDbAsync();
  const rows = await db
    .select({ ticket: supportTickets, customerName: users.name })
    .from(supportTickets)
    .leftJoin(users, eq(users.id, supportTickets.userId))
    .where(status && status !== "all" ? sql`${supportTickets.status} = ${status}` : undefined)
    .orderBy(desc(supportTickets.updatedAt))
    .limit(100);
  return rows.map((row) => ({ ...row.ticket, customerName: row.customerName }));
}

export async function addTicketMessage(input: {
  publicId: string;
  author: SessionUser;
  body: string;
  internal?: boolean;
}): Promise<void> {
  await getDbAsync();
  const rows = await db.select().from(supportTickets).where(eq(supportTickets.publicId, input.publicId)).limit(1);
  const ticket = rows[0];
  if (!ticket) throw new NotFoundError("Ticket not found.");
  const staff = isStaff(input.author.role);
  if (ticket.userId !== input.author.id && !staff) throw new ForbiddenError();
  if (input.internal && !staff) throw new ForbiddenError("Internal notes are staff-only.");
  if (["closed", "resolved"].includes(ticket.status)) {
    // Reopen on a new customer message so conversations are not lost.
    if (!staff) {
      await db.update(supportTickets).set({ status: "open", updatedAt: new Date() }).where(eq(supportTickets.id, ticket.id));
    }
  }

  await withTransaction(async (tx) => {
    await tx.insert(ticketMessages).values({
      ticketId: ticket.id,
      authorId: input.author.id,
      authorLabel: input.author.name,
      authorRole: input.author.role,
      body: input.body,
      internal: input.internal ?? false,
    });
    const nextStatus = staff ? "awaiting_customer" : "awaiting_agent";
    await tx
      .update(supportTickets)
      .set({ status: nextStatus, updatedAt: new Date(), assignedTo: staff ? input.author.id : ticket.assignedTo })
      .where(eq(supportTickets.id, ticket.id));

    if (staff && !input.internal) {
      await notifyUser(tx, {
        userId: ticket.userId,
        orderId: ticket.orderId,
        type: "ticket.reply",
        title: `Reply to ${ticket.publicId}`,
        body: input.body.slice(0, 200),
        href: `/dashboard/support/${ticket.publicId}`,
        email: {
          template: "ticket_reply",
          data: {
            name: "there",
            ticketId: ticket.publicId,
            message: input.body.slice(0, 500),
            ticketUrl: `${getEnv().APP_URL}/dashboard/support/${ticket.publicId}`,
          },
          dedupeKey: `email:ticket:${ticket.id}:${Date.now()}`,
        },
      });
    }
    if (!staff) {
      await notifyStaff(tx, {
        type: "ticket.reply",
        title: `Customer replied on ${ticket.publicId}`,
        body: input.body.slice(0, 200),
        href: `/admin/tickets/${ticket.publicId}`,
        roles: ["admin", "support"],
        orderId: ticket.orderId,
      });
    }
  });
}

export async function setTicketStatus(publicId: string, status: string, actor: SessionUser): Promise<void> {
  if (!isStaff(actor.role)) throw new ForbiddenError();
  await getDbAsync();
  const allowed = ["open", "awaiting_customer", "awaiting_agent", "resolved", "closed"];
  if (!allowed.includes(status)) throw new Error("Invalid status");
  await db.update(supportTickets).set({ status: status as SupportTicket["status"], updatedAt: new Date() }).where(eq(supportTickets.publicId, publicId));
  await recordAudit(db, {
    action: "ticket.status_changed",
    entityType: "ticket",
    entityId: publicId,
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    metadata: { status },
  });
}

export async function openTicketCount(): Promise<number> {
  await getDbAsync();
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(supportTickets)
    .where(inArray(supportTickets.status, ["open", "awaiting_agent"]));
  return Number(rows[0]?.count ?? 0);
}
