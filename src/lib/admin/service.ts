import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, getDbAsync } from "@/lib/db";
import {
  auditLogs,
  coupons,
  orderEvents,
  orders,
  payments,
  providers,
  refunds,
  services,
  users,
  type Coupon,
  type Provider,
  type Service,
  type User,
} from "@/lib/db/schema";
import { AppError, NotFoundError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { encryptSecret, maskSecret } from "@/lib/crypto";
import { createAdapter } from "@/lib/providers/registry";
import { updatePlatformSettings, type PlatformSettings } from "@/lib/settings";
import { ACTIVE_STATUSES } from "@/lib/orders/status";

/* -------------------------------- overview -------------------------------- */

export type AdminOverview = {
  revenuePaise: number;
  revenue30dPaise: number;
  refundedPaise: number;
  ordersByStatus: Record<string, number>;
  totalOrders: number;
  activeOrders: number;
  pendingProvider: number;
  failedOrders: number;
  openTickets: number;
  totalCustomers: number;
  newCustomers30d: number;
  pendingRefunds: number;
  jobs: Record<string, number>;
  outboxPending: number;
  recentOrders: Array<{ publicId: string; status: string; totalPaise: number; quantity: number; serviceName: string; customerEmail: string; createdAt: Date }>;
};

export async function getAdminOverview(): Promise<AdminOverview> {
  await getDbAsync();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [paidTotals, revenue30, refundedTotals, statusRows, openTicketRows, customers, newCustomers, pendingRefundRows] =
    await Promise.all([
      db.select({ total: sql<number>`coalesce(sum(${payments.amountPaise}), 0)::int` }).from(payments).where(eq(payments.status, "paid")),
      db
        .select({ total: sql<number>`coalesce(sum(${payments.amountPaise}), 0)::int` })
        .from(payments)
        .where(and(eq(payments.status, "paid"), gte(payments.verifiedAt, since))),
      db.select({ total: sql<number>`coalesce(sum(${refunds.amountPaise}), 0)::int` }).from(refunds).where(eq(refunds.status, "processed")),
      db.select({ status: orders.status, count: sql<number>`count(*)::int` }).from(orders).groupBy(orders.status),
      db.select({ count: sql<number>`count(*)::int` }).from(sql`support_tickets`).where(sql`status in ('open','awaiting_agent')`),
      db.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.role, "customer")),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(and(eq(users.role, "customer"), gte(users.createdAt, since))),
      db.select({ count: sql<number>`count(*)::int` }).from(refunds).where(eq(refunds.status, "requested")),
    ]);

  const ordersByStatus: Record<string, number> = {};
  for (const row of statusRows) ordersByStatus[row.status] = Number(row.count);
  const totalOrders = Object.values(ordersByStatus).reduce((sum, value) => sum + value, 0);

  const recent = await db
    .select({
      publicId: orders.publicId,
      status: orders.status,
      totalPaise: orders.totalPaise,
      quantity: orders.quantity,
      serviceName: services.name,
      customerEmail: users.email,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .innerJoin(services, eq(services.id, orders.serviceId))
    .innerJoin(users, eq(users.id, orders.userId))
    .orderBy(desc(orders.createdAt))
    .limit(8);

  return {
    revenuePaise: Number(paidTotals[0]?.total ?? 0),
    revenue30dPaise: Number(revenue30[0]?.total ?? 0),
    refundedPaise: Number(refundedTotals[0]?.total ?? 0),
    ordersByStatus,
    totalOrders,
    activeOrders: ACTIVE_STATUSES.reduce((sum, status) => sum + (ordersByStatus[status] ?? 0), 0),
    pendingProvider: ordersByStatus.pending_provider ?? 0,
    failedOrders: ordersByStatus.failed ?? 0,
    openTickets: Number(openTicketRows[0]?.count ?? 0),
    totalCustomers: Number(customers[0]?.count ?? 0),
    newCustomers30d: Number(newCustomers[0]?.count ?? 0),
    pendingRefunds: Number(pendingRefundRows[0]?.count ?? 0),
    jobs: {},
    outboxPending: 0,
    recentOrders: recent,
  };
}

/** Captured revenue per day for the last N days (Asia/Kolkata boundaries applied in SQL). */
export async function revenueByDay(days = 14): Promise<Array<{ day: string; revenuePaise: number; orders: number }>> {
  await getDbAsync();
  const rows = await db.execute(sql`
    with days as (
      select generate_series(
        (current_date - ${days - 1}::int),
        current_date,
        interval '1 day'
      )::date as day
    )
    select to_char(days.day, 'YYYY-MM-DD') as day,
           coalesce(sum(p.amount_paise), 0)::int as revenue,
           count(p.id)::int as orders
    from days
    left join payments p
      on p.status = 'paid' and (p.verified_at at time zone 'Asia/Kolkata')::date = days.day
    group by days.day
    order by days.day
  `);
  const list = (rows as unknown as { rows?: Array<{ day: string; revenue: number; orders: number }> }).rows ?? [];
  return list.map((row) => ({ day: row.day, revenuePaise: Number(row.revenue), orders: Number(row.orders) }));
}

/* --------------------------------- orders --------------------------------- */

export type AdminOrderRow = {
  publicId: string;
  status: string;
  quantity: number;
  totalPaise: number;
  paymentStatus: string;
  createdAt: Date;
  targetUrl: string;
  serviceName: string;
  serviceKind: string;
  customerEmail: string;
  customerName: string;
  providerName: string | null;
};

export async function listAdminOrders(filters: {
  status?: string;
  search?: string;
  serviceSlug?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: AdminOrderRow[]; total: number }> {
  await getDbAsync();
  const conditions = [];
  if (filters.status && filters.status !== "all") conditions.push(eq(orders.status, filters.status as typeof orders.status.enumValues[number]));
  if (filters.serviceSlug) conditions.push(eq(services.slug, filters.serviceSlug));
  if (filters.search) {
    const term = `%${filters.search.replace(/[%_]/g, "")}%`;
    conditions.push(sql`(${orders.publicId} ILIKE ${term} OR ${users.email} ILIKE ${term} OR ${orders.targetUrl} ILIKE ${term})`);
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({
      publicId: orders.publicId,
      status: orders.status,
      quantity: orders.quantity,
      totalPaise: orders.totalPaise,
      paymentStatus: orders.paymentStatus,
      createdAt: orders.createdAt,
      targetUrl: orders.targetUrl,
      serviceName: services.name,
      serviceKind: services.kind,
      customerEmail: users.email,
      customerName: users.name,
      providerName: providers.name,
    })
    .from(orders)
    .innerJoin(services, eq(services.id, orders.serviceId))
    .innerJoin(users, eq(users.id, orders.userId))
    .leftJoin(providers, eq(providers.id, orders.providerId))
    .where(where)
    .orderBy(desc(orders.createdAt))
    .limit(filters.limit ?? 25)
    .offset(filters.offset ?? 0);

  const totalRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .innerJoin(services, eq(services.id, orders.serviceId))
    .innerJoin(users, eq(users.id, orders.userId))
    .where(where);

  return { rows, total: Number(totalRows[0]?.count ?? 0) };
}

export type AdminRefundRow = {
  id: string;
  amountPaise: number;
  status: string;
  reason: string;
  createdAt: Date;
  deciderNote: string | null;
  providerRefundId: string | null;
  orderPublicId: string;
  orderStatus: string;
  totalPaise: number;
  customerEmail: string;
  requestedByEmail: string | null;
};

export async function listAdminRefunds(status?: string): Promise<AdminRefundRow[]> {
  await getDbAsync();
  const rows = await db
    .select({
      id: refunds.id,
      amountPaise: refunds.amountPaise,
      status: refunds.status,
      reason: refunds.reason,
      createdAt: refunds.createdAt,
      deciderNote: refunds.deciderNote,
      providerRefundId: refunds.providerRefundId,
      orderPublicId: orders.publicId,
      orderStatus: orders.status,
      totalPaise: orders.totalPaise,
      customerEmail: users.email,
      requestedByEmail: sql<string | null>`null`,
    })
    .from(refunds)
    .innerJoin(orders, eq(orders.id, refunds.orderId))
    .innerJoin(users, eq(users.id, orders.userId))
    .where(status && status !== "all" ? eq(refunds.status, status as typeof refunds.status.enumValues[number]) : undefined)
    .orderBy(desc(refunds.createdAt))
    .limit(100);
  return rows;
}

export async function listUsersWithStats(): Promise<
  Array<Pick<User, "id" | "email" | "name" | "role" | "suspendedAt" | "createdAt" | "lastLoginAt" | "emailVerifiedAt"> & { orderCount: number; spendPaise: number }>
> {
  await getDbAsync();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      suspendedAt: users.suspendedAt,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
      emailVerifiedAt: users.emailVerifiedAt,
      orderCount: sql<number>`(select count(*)::int from ${orders} where ${orders.userId} = ${users.id})`,
      spendPaise: sql<number>`(select coalesce(sum(${orders.totalPaise}), 0)::int from ${orders} where ${orders.userId} = ${users.id} and ${orders.paymentStatus} = 'paid')`,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(200);
  return rows;
}

export async function listAuditLogs(limit = 100): Promise<Array<typeof auditLogs.$inferSelect>> {
  await getDbAsync();
  return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
}

export async function listProvidersWithHealth(): Promise<
  Array<Provider & { maskedCredentials: string; configured: boolean; adapterKinds: string[] }>
> {
  await getDbAsync();
  const rows = await db.select().from(providers).orderBy(providers.priority);
  return rows.map((provider) => {
    const adapter = createAdapter(provider);
    return {
      ...provider,
      maskedCredentials: maskSecret(provider.encryptedCredentials),
      configured: adapter.isConfigured(),
      adapterKinds: adapter.capabilities().kinds,
    };
  });
}

/* ------------------------------ mutations ------------------------------- */

function requireAdmin(user: { role: string }): void {
  if (user.role !== "admin") throw new AppError("Administrator role required.", { status: 403, code: "forbidden" });
}

export async function testProviderConnection(providerId: string, actor: { id: string; email: string; role: string; name: string }) {
  requireAdmin(actor);
  const stored = await db.select().from(providers).where(eq(providers.id, providerId)).limit(1);
  const row = stored[0];
  if (!row) throw new NotFoundError("Provider not found.");
  const adapter = createAdapter(row);
  const health = await adapter.healthCheck();
  await db
    .update(providers)
    .set({ health: health.status, lastHealthCheckAt: health.checkedAt, lastHealthMessage: health.message, updatedAt: new Date() })
    .where(eq(providers.id, row.id));
  await recordAudit(db, {
    action: "provider.health_checked",
    entityType: "provider",
    entityId: row.key,
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    metadata: { status: health.status, message: health.message, checkedAt: health.checkedAt.toISOString() },
  });
  return health;
}

export async function updateProviderSettings(input: {
  providerId: string;
  actor: { id: string; email: string; role: string; name: string };
  patch: Partial<Pick<Provider, "enabled" | "priority" | "reliabilityScore" | "minQuantity" | "maxQuantity" | "costPerUnitPaise" | "fixedCostPaise" | "estimatedDurationHours">>;
  credentials?: Record<string, string>;
  config?: Record<string, unknown>;
}): Promise<Provider> {
  requireAdmin(input.actor);
  const rows = await db.select().from(providers).where(eq(providers.id, input.providerId)).limit(1);
  const provider = rows[0];
  if (!provider) throw new NotFoundError("Provider not found.");

  if (input.patch.enabled === true) {
    const mergedCredentials = input.credentials
      ? { ...((provider.config?.credentials as Record<string, string> | undefined) ?? {}), ...input.credentials }
      : undefined;
    const adapter = createAdapter({ ...provider, encryptedCredentials: mergedCredentials ? encryptSecret(JSON.stringify(mergedCredentials)) : provider.encryptedCredentials });
    if (!adapter.isConfigured()) {
      throw new AppError("Add credentials and run a successful health check before enabling this provider.", {
        status: 409,
        code: "provider_unconfigured",
      });
    }
  }

  const updates: Record<string, unknown> = { ...input.patch, updatedAt: new Date() };
  if (input.credentials && Object.keys(input.credentials).length > 0) {
    const merged = { ...((provider.config?.credentials as Record<string, string> | undefined) ?? {}), ...input.credentials };
    updates.encryptedCredentials = encryptSecret(JSON.stringify(merged));
  }
  if (input.config) {
    updates.config = { ...(provider.config ?? {}), ...input.config };
  }

  const updated = await db.update(providers).set(updates).where(eq(providers.id, provider.id)).returning();
  await recordAudit(db, {
    action: "provider.updated",
    entityType: "provider",
    entityId: provider.key,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    actorRole: input.actor.role,
    metadata: { patch: input.patch, credentialsUpdated: Boolean(input.credentials), configUpdated: input.config ?? null },
  });
  return updated[0]!;
}

export async function updateService(input: {
  actor: { id: string; email: string; role: string };
  serviceId: string;
  patch: Partial<Pick<Service, "active" | "minQuantity" | "maxQuantity" | "requiresManualReview" | "estimatedDurationHours">> & { unitPricePaise?: number };
}): Promise<Service> {
  requireAdmin(input.actor);
  const rows = await db.select().from(services).where(eq(services.id, input.serviceId)).limit(1);
  const service = rows[0];
  if (!service) throw new NotFoundError("Service not found.");
  if (input.patch.minQuantity !== undefined && input.patch.maxQuantity !== undefined && input.patch.minQuantity > input.patch.maxQuantity) {
    throw new AppError("Minimum quantity cannot exceed the maximum.", { status: 422, code: "invalid_quantity" });
  }
  const updated = await db
    .update(services)
    .set({ ...input.patch, updatedAt: new Date() })
    .where(eq(services.id, service.id))
    .returning();
  await recordAudit(db, {
    action: "service.updated",
    entityType: "service",
    entityId: service.slug,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    actorRole: input.actor.role,
    metadata: { patch: input.patch },
  });
  return updated[0]!;
}

export async function createCoupon(input: {
  actor: { id: string; email: string; role: string };
  values: {
    code: string;
    type: "percent" | "fixed";
    value: number;
    description?: string;
    minOrderRupees: number;
    maxDiscountRupees?: number;
    maxRedemptions?: number;
    active: boolean;
  };
}): Promise<Coupon> {
  requireAdmin(input.actor);
  const code = input.values.code.trim().toUpperCase();
  if (input.values.type === "percent" && (input.values.value <= 0 || input.values.value > 100)) {
    throw new AppError("Percent coupons must be between 1 and 100.", { status: 422, code: "invalid_coupon" });
  }
  const existing = await db.select({ id: coupons.id }).from(coupons).where(sql`upper(${coupons.code}) = ${code}`).limit(1);
  if (existing[0]) throw new AppError("That coupon code already exists.", { status: 409, code: "coupon_exists" });

  const created = await db
    .insert(coupons)
    .values({
      code,
      type: input.values.type,
      value: input.values.type === "percent" ? Math.round(input.values.value) : Math.round(input.values.value * 100),
      description: input.values.description ?? null,
      minOrderPaise: Math.round(input.values.minOrderRupees * 100),
      maxDiscountPaise: input.values.maxDiscountRupees ? Math.round(input.values.maxDiscountRupees * 100) : null,
      maxRedemptions: input.values.maxRedemptions ?? null,
      active: input.values.active,
    })
    .returning();
  await recordAudit(db, {
    action: "coupon.created",
    entityType: "coupon",
    entityId: code,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    actorRole: input.actor.role,
    metadata: { type: input.values.type, value: input.values.value, maxRedemptions: input.values.maxRedemptions ?? null },
  });
  return created[0]!;
}

export async function toggleCoupon(couponId: string, active: boolean, actor: { id: string; email: string; role: string }): Promise<Coupon> {
  requireAdmin(actor);
  const updated = await db.update(coupons).set({ active }).where(eq(coupons.id, couponId)).returning();
  const coupon = updated[0];
  if (!coupon) throw new NotFoundError("Coupon not found.");
  await recordAudit(db, {
    action: "coupon.toggled",
    entityType: "coupon",
    entityId: coupon.code,
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    metadata: { active },
  });
  return coupon;
}

/** Runs the health check for every provider (admin "refresh all"). */
export async function refreshAllProviderHealth(actor: { id: string; email: string; role: string; name: string }): Promise<void> {
  requireAdmin(actor);
  const rows = await db.select().from(providers);
  for (const row of rows) {
    await testProviderConnection(row.id, actor);
  }
}

export async function saveSettings(
  actor: { id: string; email: string; role: string },
  patch: Partial<PlatformSettings>,
): Promise<PlatformSettings> {
  requireAdmin(actor);
  const settings = await updatePlatformSettings(patch);
  await recordAudit(db, {
    action: "settings.updated",
    entityType: "settings",
    entityId: "platform",
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    metadata: { patch: patch as Record<string, unknown> },
  });
  return settings;
}

export async function updateUser(input: {
  actor: { id: string; email: string; role: string };
  userId: string;
  role?: "customer" | "support" | "finance" | "admin";
  suspended?: boolean;
}): Promise<User> {
  requireAdmin(input.actor);
  const rows = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  const target = rows[0];
  if (!target) throw new NotFoundError("User not found.");
  if (target.id === input.actor.id && input.role && input.role !== target.role) {
    throw new AppError("You cannot change your own role.", { status: 409, code: "self_role_change" });
  }
  if (target.id === input.actor.id && input.suspended) {
    throw new AppError("You cannot suspend your own account.", { status: 409, code: "self_suspend" });
  }
  if (input.role !== undefined && input.role !== "admin" && target.role === "admin") {
    const admins = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(and(eq(users.role, "admin"), sql`${users.suspendedAt} is null`));
    if (Number(admins[0]?.count ?? 0) <= 1) {
      throw new AppError("At least one active administrator must remain.", { status: 409, code: "last_admin" });
    }
  }
  const updated = await db
    .update(users)
    .set({
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.suspended !== undefined ? { suspendedAt: input.suspended ? new Date() : null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, target.id))
    .returning();
  await recordAudit(db, {
    action: "user.updated",
    entityType: "user",
    entityId: target.email,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    actorRole: input.actor.role,
    metadata: { role: input.role ?? target.role, suspended: input.suspended ?? Boolean(target.suspendedAt) },
  });
  return updated[0]!;
}

export async function orderDetailForAdmin(publicId: string) {
  await getDbAsync();
  const rows = await db
    .select({ order: orders, service: services, provider: providers, customer: { id: users.id, name: users.name, email: users.email, role: users.role } })
    .from(orders)
    .innerJoin(services, eq(services.id, orders.serviceId))
    .innerJoin(users, eq(users.id, orders.userId))
    .leftJoin(providers, eq(providers.id, orders.providerId))
    .where(eq(orders.publicId, publicId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const events = await db.select().from(orderEvents).where(eq(orderEvents.orderId, row.order.id)).orderBy(desc(orderEvents.createdAt)).limit(200);
  return { ...row, events };
}

export async function recentProviderErrors(): Promise<Array<{ key: string; name: string; lastError: string | null; health: string }>> {
  await getDbAsync();
  return db
    .select({ key: providers.key, name: providers.name, lastError: providers.lastError, health: providers.health })
    .from(providers)
    .where(inArray(providers.health, ["degraded", "down"]));
}
