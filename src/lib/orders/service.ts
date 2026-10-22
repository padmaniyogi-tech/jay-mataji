import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, getDbAsync, withTransaction, type Executor } from "@/lib/db";
import {
  coupons,
  orders,
  orderEvents,
  orderMeasurements,
  payments,
  refunds,
  services,
  users,
  type Coupon,
  type Order,
  type OrderStatus,
  type Service,
  type UserRole,
} from "@/lib/db/schema";
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { getEnv } from "@/lib/env";
import { getPlatformSettings } from "@/lib/settings";
import { calculateQuote, validateQuantity, type CouponRule, type Quote } from "@/lib/pricing";
import { validateTargetForService, InstagramUrlError, type InstagramTarget } from "@/lib/instagram";
import { generatePublicId, generateReceiptNumber } from "@/lib/ids";
import { formatPaise } from "@/lib/money";
import { recordAudit } from "@/lib/audit";
import { notifyUser } from "@/lib/notifications";
import { enqueueOutbox } from "@/lib/jobs/outbox";
import { enqueueJob } from "@/lib/jobs/queue";
import { getPaymentGateway, paymentProviderName } from "@/lib/payments/gateway";
import { mockSignature } from "@/lib/payments/mock";
import type { CheckoutHandoff, VerifiedPayment } from "@/lib/payments/types";
import { logger } from "@/lib/logger";
import type { CreateOrderInput } from "@/lib/validation";
import { ACTIVE_STATUSES } from "./status";
import { appendOrderEvent } from "./events";
import { assertTransition } from "./state-machine";
import type { SessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* -------------------------------------------------------------------------- */
/* Catalog + quoting                                                          */
/* -------------------------------------------------------------------------- */

export async function listActiveServices(): Promise<Service[]> {
  await getDbAsync();
  return db.select().from(services).where(eq(services.active, true)).orderBy(services.sortOrder);
}

export async function listAllServices(): Promise<Service[]> {
  await getDbAsync();
  return db.select().from(services).orderBy(services.sortOrder);
}

export async function getServiceBySlug(slug: string): Promise<Service | null> {
  await getDbAsync();
  const rows = await db.select().from(services).where(eq(services.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function requireService(slug: string): Promise<Service> {
  const service = await getServiceBySlug(slug);
  if (!service) throw new NotFoundError("Service not found.");
  return service;
}

export function toCouponRule(coupon: Coupon): CouponRule {
  return {
    id: coupon.id,
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    minOrderPaise: coupon.minOrderPaise,
    maxDiscountPaise: coupon.maxDiscountPaise,
    maxRedemptions: coupon.maxRedemptions,
    redemptionCount: coupon.redemptionCount,
    active: coupon.active,
    expiresAt: coupon.expiresAt,
  };
}

export async function loadCouponByCode(code: string): Promise<Coupon | null> {
  await getDbAsync();
  const rows = await db
    .select()
    .from(coupons)
    .where(sql`upper(${coupons.code}) = upper(${code.trim()})`)
    .limit(1);
  return rows[0] ?? null;
}

export type QuoteResult = {
  service: Service;
  quote: Quote;
  coupon: Coupon | null;
  couponMessage: string | null;
  target: InstagramTarget | null;
  targetError: string | null;
};

/** Server-authoritative quote. Also used to preview prices before checkout. */
export async function resolveQuote(input: {
  serviceSlug: string;
  quantity: number;
  couponCode?: string | null;
  targetUrl?: string | null;
}): Promise<QuoteResult> {
  const service = await requireService(input.serviceSlug);
  if (!service.active) throw new AppError("This service is currently unavailable.", { status: 409, code: "service_inactive" });

  const settings = await getPlatformSettings();
  const qtyCheck = validateQuantity(service, input.quantity);
  if (!qtyCheck.ok) throw new ValidationError(qtyCheck.reason);

  let coupon: Coupon | null = null;
  let couponMessage: string | null = null;
  if (input.couponCode) {
    coupon = await loadCouponByCode(input.couponCode);
    if (!coupon) couponMessage = "Coupon code not found.";
  }

  let target: InstagramTarget | null = null;
  let targetError: string | null = null;
  if (input.targetUrl) {
    try {
      target = validateTargetForService(input.targetUrl, service.kind);
    } catch (err) {
      targetError = err instanceof InstagramUrlError ? err.message : "Invalid Instagram URL.";
    }
  }

  const quote = calculateQuote({
    service,
    quantity: input.quantity,
    taxRateBps: settings.taxRateBps,
    coupon: coupon ? toCouponRule(coupon) : null,
  });

  if (coupon && quote.discountPaise === 0) {
    couponMessage = quote.warnings[0] ?? "Coupon could not be applied to this order.";
  }

  return { service, quote, coupon, couponMessage, target, targetError };
}

/* -------------------------------------------------------------------------- */
/* Order creation                                                             */
/* -------------------------------------------------------------------------- */

export type CreateOrderResult = {
  order: Order;
  checkout: CheckoutHandoff | null;
  reused: boolean;
  warning: string | null;
};

export async function findOrderByIdempotencyKey(userId: string, key: string): Promise<Order | null> {
  await getDbAsync();
  const rows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.userId, userId), eq(orders.idempotencyKey, key)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createOrder(input: {
  user: SessionUser;
  payload: CreateOrderInput;
  ip?: string | null;
}): Promise<CreateOrderResult> {
  const { user, payload } = input;
  await getDbAsync();

  const existing = await findOrderByIdempotencyKey(user.id, payload.idempotencyKey);
  if (existing) {
    return {
      order: existing,
      checkout: existing.status === "pending_payment" ? await buildHandoff(existing) : null,
      reused: true,
      warning: null,
    };
  }

  const service = await requireService(payload.serviceSlug);
  if (!service.active) throw new AppError("This service is currently unavailable.", { status: 409, code: "service_inactive" });

  // Target URL must match the service's target shape.
  let target: InstagramTarget;
  try {
    target = validateTargetForService(payload.targetUrl, service.kind);
  } catch (err) {
    throw new ValidationError(err instanceof Error ? err.message : "Invalid Instagram URL.");
  }

  if (service.requiresContentUrl && target.kind === "profile") {
    throw new ValidationError("This service needs a link to a specific post or Reel, not a profile.");
  }
  if (!service.requiresContentUrl && service.kind === "followers" && target.kind !== "profile") {
    throw new ValidationError("Follower campaigns target a profile URL.");
  }
  if (service.requiresAudience && !payload.audienceCountry) {
    throw new ValidationError("Choose a target audience country for this campaign.");
  }
  if (service.requiresBrief && (!payload.brief || payload.brief.trim().length < 20)) {
    throw new ValidationError("Please add a campaign brief (at least 20 characters) so we can route it correctly.");
  }

  const qtyCheck = validateQuantity(service, payload.quantity);
  if (!qtyCheck.ok) throw new ValidationError(qtyCheck.reason);

  // Package selection is validated server-side; the browser cannot invent a package price.
  let quantity = payload.quantity;
  let unitPricePaise = service.unitPricePaise;
  let packageId: string | null = null;
  if (payload.packageId) {
    if (!UUID_RE.test(payload.packageId)) throw new ValidationError("Invalid package.");
    const { servicePackages } = await import("@/lib/db/schema");
    const pkgRows = await db.select().from(servicePackages).where(eq(servicePackages.id, payload.packageId)).limit(1);
    const pkg = pkgRows[0];
    if (!pkg || pkg.serviceId !== service.id || !pkg.active) throw new ValidationError("That package is not available.");
    if (payload.quantity !== pkg.quantity) {
      throw new ValidationError(`Package "${pkg.name}" is for ${pkg.quantity.toLocaleString("en-IN")} units. Refresh the page and try again.`);
    }
    quantity = pkg.quantity;
    unitPricePaise = Math.round(pkg.pricePaise / pkg.quantity);
    packageId = pkg.id;
  }

  const settings = await getPlatformSettings();
  const coupon = payload.couponCode ? await loadCouponByCode(payload.couponCode) : null;
  const couponRule = coupon ? toCouponRule(coupon) : null;

  // Max concurrent orders (abuse protection).
  const activeCountRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(eq(orders.userId, user.id), inArray(orders.status, ACTIVE_STATUSES as OrderStatus[])));
  if (Number(activeCountRows[0]?.count ?? 0) >= settings.maxActiveOrdersPerUser) {
    throw new AppError(
      `You already have ${settings.maxActiveOrdersPerUser} active campaigns. Wait for one to finish or contact support.`,
      { status: 429, code: "too_many_active_orders" },
    );
  }

  const quoteService = { ...service, unitPricePaise, fixedFeePaise: service.fixedFeePaise };
  const quote = calculateQuote({
    service: quoteService,
    quantity,
    taxRateBps: settings.taxRateBps,
    coupon: couponRule,
  });

  if (payload.couponCode && couponRule && quote.discountPaise === 0) {
    throw new ValidationError(quote.warnings[0] ?? "That coupon cannot be applied to this order.");
  }

  let publicId = generatePublicId();
  let created: Order | null = null;
  let paymentRowId: string | null = null;

  for (let attempt = 0; attempt < 4 && !created; attempt++) {
    try {
      created = await withTransaction(async (tx) => {
        const inserted = await tx
          .insert(orders)
          .values({
            publicId,
            userId: user.id,
            serviceId: service.id,
            status: "pending_payment",
            idempotencyKey: payload.idempotencyKey,
            targetUrl: target.normalizedUrl,
            platform: service.platform,
            quantity,
            audienceCountry: payload.audienceCountry ?? null,
            brief: payload.brief ?? null,
            packageId,
            unitPricePaise,
            subtotalPaise: quote.subtotalPaise,
            discountPaise: quote.discountPaise,
            taxPaise: quote.taxPaise,
            totalPaise: quote.totalPaise,
            couponId: coupon?.id ?? null,
            couponCode: quote.couponCode,
            paymentStatus: "pending",
            remainingTarget: quantity,
            measurementSource: "unavailable",
          })
          .returning();

        const order = inserted[0];
        if (!order) throw new Error("Order insert returned no row.");

        const payment = await tx
          .insert(payments)
          .values({
            orderId: order.id,
            userId: user.id,
            provider: paymentProviderName(),
            amountPaise: order.totalPaise,
            receiptNumber: generateReceiptNumber(order.publicId),
            status: "pending",
            currency: "INR",
          })
          .returning({ id: payments.id });
        paymentRowId = payment[0]?.id ?? null;

        if (coupon && quote.discountPaise > 0) {
          const { couponRedemptions } = await import("@/lib/db/schema");
          await tx.insert(couponRedemptions).values({
            couponId: coupon.id,
            userId: user.id,
            orderId: order.id,
            discountPaise: quote.discountPaise,
          });
          await tx
            .update(coupons)
            .set({ redemptionCount: sql`${coupons.redemptionCount} + 1` })
            .where(eq(coupons.id, coupon.id));
        }

        await appendOrderEvent(tx, {
          orderId: order.id,
          kind: "created",
          message: `Order created for ${service.name} (${quantity.toLocaleString("en-IN")} ${service.unitLabel}).`,
          toStatus: "pending_payment",
          actor: { kind: "customer", userId: user.id, label: user.email },
          metadata: {
            totalPaise: order.totalPaise,
            coupon: quote.couponCode,
            targetUrl: target.normalizedUrl,
            targetKind: target.kind,
          },
        });

        return order;
      });
    } catch (err) {
      const message = (err as Error).message ?? "";
      if (/orders_idempotency_key|duplicate key/i.test(message)) {
        const dupe = await findOrderByIdempotencyKey(user.id, payload.idempotencyKey);
        if (dupe) {
          return { order: dupe, checkout: await buildHandoff(dupe), reused: true, warning: null };
        }
      }
      if (/orders_public_id_key/i.test(message)) {
        publicId = generatePublicId();
        continue;
      }
      throw err;
    }
  }

  if (!created) throw new AppError("Could not create the order. Please try again.", { status: 500, code: "order_create_failed" });

  // Schedule payment expiry (60 minutes) — never affects a paid order.
  await enqueueJob(
    { type: "payment.expire", dedupeKey: `payment:expire:${created.id}`, payload: { orderId: created.id }, runAt: new Date(Date.now() + 60 * 60_000) },
    db,
  ).catch((err) => logger.warn("payment_expiry_enqueue_failed", { message: (err as Error).message }));

  await recordAudit(db, {
    action: "order.created",
    entityType: "order",
    entityId: created.publicId,
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    metadata: { serviceSlug: service.slug, quantity, totalPaise: created.totalPaise, paymentRowId },
    ip: input.ip ?? null,
  });

  let checkout: CheckoutHandoff | null = null;
  let warning: string | null = null;
  try {
    checkout = await buildHandoff(created, { forceNewIntent: true });
  } catch (err) {
    warning =
      "We created your order, but the payment gateway is not reachable right now. Retry payment from the order page — no money has been captured.";
    logger.error("payment_intent_failed", { orderPublicId: created.publicId, message: (err as Error).message });
  }

  return { order: created, checkout, reused: false, warning };
}

/** Builds (or reuses) the gateway checkout handoff for a pending order. */
export async function buildHandoff(order: Order, options: { forceNewIntent?: boolean } = {}): Promise<CheckoutHandoff> {
  await getDbAsync();
  const gateway = getPaymentGateway();
  const paymentRows = await db
    .select()
    .from(payments)
    .where(eq(payments.orderId, order.id))
    .orderBy(desc(payments.createdAt))
    .limit(1);
  const payment = paymentRows[0];
  if (!payment) throw new NotFoundError("Payment record not found for this order.");
  if (payment.status === "paid") throw new ConflictError("This order is already paid.");

  const customerRows = await db.select().from(users).where(eq(users.id, order.userId)).limit(1);
  const customer = customerRows[0];
  if (!customer) throw new NotFoundError("Customer not found.");

  if (payment.providerOrderId && !options.forceNewIntent) {
    // Reuse an existing gateway order (e.g. customer refreshed checkout).
    return {
      provider: gateway.name,
      mode: gateway.mode,
      providerOrderId: payment.providerOrderId,
      amountPaise: order.totalPaise,
      currency: "INR",
      publicKey: gateway.name === "razorpay" ? getEnv().RAZORPAY_KEY_ID : undefined,
      merchantName: getEnv().APP_NAME,
      description: `Order ${order.publicId}`,
      prefill: { name: customer.name, email: customer.email, contact: customer.phone ?? undefined },
      mockAuthorizePath: gateway.name === "mock" ? "/api/payments/mock/authorize" : undefined,
      demo: gateway.demo,
    };
  }

  const intent = await gateway.createIntent({
    orderPublicId: order.publicId,
    amountPaise: order.totalPaise,
    currency: "INR",
    receipt: payment.receiptNumber,
    customer: { name: customer.name, email: customer.email, phone: customer.phone },
    notes: { orderPublicId: order.publicId },
  });

  await db
    .update(payments)
    .set({ providerOrderId: intent.providerOrderId, updatedAt: new Date(), provider: gateway.name })
    .where(eq(payments.id, payment.id));

  return intent;
}

/* -------------------------------------------------------------------------- */
/* Payment confirmation (single source of truth)                              */
/* -------------------------------------------------------------------------- */

export type ConfirmPaymentInput = {
  orderPublicId: string;
  providerOrderId: string;
  providerPaymentId: string;
  signature?: string | null;
  source: "checkout" | "webhook" | "mock";
  method?: string | null;
};

export async function confirmPayment(input: ConfirmPaymentInput): Promise<{ order: Order; alreadyProcessed: boolean }> {
  await getDbAsync();
  const gateway = getPaymentGateway();

  const orderRows = await db.select().from(orders).where(eq(orders.publicId, input.orderPublicId)).limit(1);
  const order = orderRows[0];
  if (!order) throw new NotFoundError("Order not found.");

  const paymentRows = await db
    .select()
    .from(payments)
    .where(and(eq(payments.orderId, order.id), eq(payments.providerOrderId, input.providerOrderId)))
    .limit(1);
  const payment = paymentRows[0];
  if (!payment) throw new NotFoundError("No matching payment attempt for this order.");

  let verified: VerifiedPayment;
  if (input.signature) {
    verified = await gateway.verifyPayment({
      providerOrderId: input.providerOrderId,
      providerPaymentId: input.providerPaymentId,
      signature: input.signature,
    });
  } else {
    verified = await gateway.fetchPayment(input.providerPaymentId);
  }

  if (!verified.ok) {
    await db
      .update(payments)
      .set({ status: "failed", failureReason: verified.reason ?? "Verification failed", updatedAt: new Date() })
      .where(and(eq(payments.id, payment.id), eq(payments.status, "pending")));
    throw new ValidationError(verified.reason ?? "Payment could not be verified.");
  }

  if (verified.amountPaise !== null && verified.amountPaise !== order.totalPaise) {
    logger.error("payment_amount_mismatch", {
      orderPublicId: order.publicId,
      expected: order.totalPaise,
      received: verified.amountPaise,
    });
    await recordAudit(db, {
      action: "payment.amount_mismatch",
      entityType: "payment",
      entityId: payment.id,
      metadata: { expected: order.totalPaise, received: verified.amountPaise },
    });
    throw new ConflictError("The paid amount does not match this order. Support has been notified.");
  }

  const result = await withTransaction(async (tx) => {
    const paymentUpdate = await tx
      .update(payments)
      .set({
        status: "paid",
        providerPaymentId: verified.providerPaymentId,
        method: verified.method ?? input.method ?? null,
        verifiedAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          verificationSource: input.source,
          gatewayStatus: String(verified.raw.status ?? "captured"),
        },
      })
      .where(and(eq(payments.id, payment.id), inArray(payments.status, ["pending", "authorized"])))
      .returning({ id: payments.id });

    if (paymentUpdate.length === 0) {
      const current = await tx.select().from(orders).where(eq(orders.id, order.id)).limit(1);
      return { order: current[0] ?? order, alreadyProcessed: true };
    }

    const orderUpdate = await tx
      .update(orders)
      .set({ status: "paid", paymentStatus: "paid", paidAt: new Date(), updatedAt: new Date() })
      .where(and(eq(orders.id, order.id), eq(orders.status, "pending_payment")))
      .returning();

    if (orderUpdate.length === 0) {
      return { order, alreadyProcessed: true };
    }

    const updated = orderUpdate[0]!;
    await appendOrderEvent(tx, {
      orderId: order.id,
      kind: "payment",
      message: `Payment of ${formatPaise(updated.totalPaise)} verified server-side (${input.source}).`,
      fromStatus: "pending_payment",
      toStatus: "paid",
      actor: { kind: "system", label: "payment-webhook" },
      metadata: {
        providerPaymentId: verified.providerPaymentId,
        source: input.source,
        amountPaise: updated.totalPaise,
      },
    });

    // Transactional outbox: the paid order and its routing job commit together.
    await enqueueOutbox(tx, "order.route", `order:route:${order.id}`, { orderId: order.id });

    await notifyUser(tx, {
      userId: order.userId,
      orderId: order.id,
      type: "order.paid",
      title: `Payment received for ${order.publicId}`,
      body: `We verified ${formatPaise(updated.totalPaise)}. Your campaign is being routed to an eligible delivery partner.`,
      href: `/dashboard/orders/${order.publicId}`,
      email: {
        template: "order_paid",
        data: {
          name: "there",
          orderId: order.publicId,
          total: formatPaise(updated.totalPaise),
          orderUrl: `${getEnv().APP_URL}/dashboard/orders/${order.publicId}`,
        },
        dedupeKey: `email:paid:${order.id}`,
      },
    });

    return { order: updated, alreadyProcessed: false };
  });

  if (!result.alreadyProcessed) {
    await recordAudit(db, {
      action: "payment.verified",
      entityType: "payment",
      entityId: payment.id,
      actorLabel: "system",
      metadata: { orderPublicId: order.publicId, amountPaise: order.totalPaise, source: input.source },
    });
    logger.info("payment_verified", { orderPublicId: order.publicId, source: input.source });
  }

  return result;
}

/** DEMO ONLY: simulates a successful/failed mock payment through the real verification path. */
export async function simulateMockPayment(input: {
  orderPublicId: string;
  userId: string;
  outcome: "success" | "failure";
}): Promise<{ order: Order; alreadyProcessed: boolean; demo: true }> {
  const env = getEnv();
  if (!env.DEMO_MODE || env.PAYMENTS_PROVIDER !== "mock") {
    throw new ForbiddenError("Simulated payments are only available in demo mode.");
  }
  const orderRows = await db.select().from(orders).where(eq(orders.publicId, input.orderPublicId)).limit(1);
  const order = orderRows[0];
  if (!order) throw new NotFoundError("Order not found.");
  if (order.userId !== input.userId) throw new ForbiddenError();

  const paymentRows = await db
    .select()
    .from(payments)
    .where(and(eq(payments.orderId, order.id), eq(payments.status, "pending")))
    .orderBy(desc(payments.createdAt))
    .limit(1);
  let payment = paymentRows[0];
  if (!payment) {
    const inserted = await db
      .insert(payments)
      .values({
        orderId: order.id,
        userId: order.userId,
        provider: "mock",
        amountPaise: order.totalPaise,
        receiptNumber: generateReceiptNumber(order.publicId, Date.now() % 1000),
        status: "pending",
      })
      .returning();
    payment = inserted[0]!;
  }

  let providerOrderId = payment.providerOrderId;
  if (!providerOrderId) {
    const gateway = getPaymentGateway();
    const intent = await gateway.createIntent({
      orderPublicId: order.publicId,
      amountPaise: order.totalPaise,
      currency: "INR",
      receipt: payment.receiptNumber,
      customer: { name: "Demo customer", email: "demo@amplifi.local" },
    });
    providerOrderId = intent.providerOrderId;
    await db.update(payments).set({ providerOrderId }).where(eq(payments.id, payment.id));
  }

  if (input.outcome === "failure") {
    await db
      .update(payments)
      .set({ status: "failed", failureReason: "Simulated payment decline (demo).", updatedAt: new Date() })
      .where(eq(payments.id, payment.id));
    await appendOrderEvent(db, {
      orderId: order.id,
      kind: "payment",
      message: "Demo payment declined (simulated). No money was charged.",
      actor: { kind: "system", label: "demo-payment" },
    });
    throw new ValidationError("Demo payment declined. The order is still awaiting payment — retry with a successful demo payment.");
  }

  const providerPaymentId = `mockpay_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const signature = mockSignature(providerOrderId, providerPaymentId);
  const result = await confirmPayment({
    orderPublicId: order.publicId,
    providerOrderId,
    providerPaymentId,
    signature,
    source: "mock",
    method: "demo",
  });
  return { ...result, demo: true };
}

/* -------------------------------------------------------------------------- */
/* Read models                                                                */
/* -------------------------------------------------------------------------- */

export type OrderWithService = { order: Order; service: Service };

export async function listOrdersForUser(
  userId: string,
  filters: { status?: string; serviceSlug?: string; search?: string; limit?: number; offset?: number } = {},
): Promise<{ rows: Array<Order & { serviceName: string; serviceKind: string }>; total: number }> {
  await getDbAsync();
  const conditions = [eq(orders.userId, userId)];
  if (filters.status && filters.status !== "all") conditions.push(eq(orders.status, filters.status as OrderStatus));
  if (filters.serviceSlug) conditions.push(eq(services.slug, filters.serviceSlug));
  if (filters.search) {
    const term = `%${filters.search.replace(/[%_]/g, "")}%`;
    conditions.push(sql`(${orders.publicId} ILIKE ${term} OR ${orders.targetUrl} ILIKE ${term})`);
  }

  const where = and(...conditions);
  const rows = await db
    .select({
      id: orders.id,
      publicId: orders.publicId,
      userId: orders.userId,
      serviceId: orders.serviceId,
      providerId: orders.providerId,
      status: orders.status,
      idempotencyKey: orders.idempotencyKey,
      targetUrl: orders.targetUrl,
      platform: orders.platform,
      quantity: orders.quantity,
      audienceCountry: orders.audienceCountry,
      audienceNotes: orders.audienceNotes,
      brief: orders.brief,
      packageId: orders.packageId,
      assetIds: orders.assetIds,
      currency: orders.currency,
      unitPricePaise: orders.unitPricePaise,
      subtotalPaise: orders.subtotalPaise,
      discountPaise: orders.discountPaise,
      taxPaise: orders.taxPaise,
      totalPaise: orders.totalPaise,
      couponId: orders.couponId,
      couponCode: orders.couponCode,
      paymentStatus: orders.paymentStatus,
      baselineCount: orders.baselineCount,
      latestCount: orders.latestCount,
      providerReportedCount: orders.providerReportedCount,
      attributedCount: orders.attributedCount,
      organicCount: orders.organicCount,
      verifiedCount: orders.verifiedCount,
      remainingTarget: orders.remainingTarget,
      measurementSource: orders.measurementSource,
      lastMeasuredAt: orders.lastMeasuredAt,
      measurementNotes: orders.measurementNotes,
      providerRef: orders.providerRef,
      providerResponse: orders.providerResponse,
      providerError: orders.providerError,
      retryCount: orders.retryCount,
      nextAttemptAt: orders.nextAttemptAt,
      submittedAt: orders.submittedAt,
      startedAt: orders.startedAt,
      completedAt: orders.completedAt,
      failureCode: orders.failureCode,
      failureMessage: orders.failureMessage,
      refundAmountPaise: orders.refundAmountPaise,
      refundedAt: orders.refundedAt,
      cancellationRequestedAt: orders.cancellationRequestedAt,
      cancelledAt: orders.cancelledAt,
      adminNotes: orders.adminNotes,
      paidAt: orders.paidAt,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      serviceName: services.name,
      serviceKind: services.kind,
    })
    .from(orders)
    .innerJoin(services, eq(services.id, orders.serviceId))
    .where(where)
    .orderBy(desc(orders.createdAt))
    .limit(filters.limit ?? 20)
    .offset(filters.offset ?? 0);

  const totalRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .innerJoin(services, eq(services.id, orders.serviceId))
    .where(where);

  return { rows, total: Number(totalRows[0]?.count ?? 0) };
}

export type OrderDetail = {
  order: Order;
  service: Service;
  provider: { id: string; name: string; kind: string; health: string } | null;
  events: Array<typeof orderEvents.$inferSelect>;
  measurements: Array<typeof orderMeasurements.$inferSelect>;
  payments: Array<typeof payments.$inferSelect>;
  refunds: Array<typeof refunds.$inferSelect>;
};

export async function getOrderForViewer(
  publicId: string,
  viewer: { id: string; role: UserRole },
): Promise<OrderDetail | null> {
  await getDbAsync();
  const rows = await db
    .select({ order: orders, service: services })
    .from(orders)
    .innerJoin(services, eq(services.id, orders.serviceId))
    .where(eq(orders.publicId, publicId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  // Cross-user isolation: customers only ever see their own orders.
  if (row.order.userId !== viewer.id && !hasPermission(viewer.role, "orders:read:all")) {
    return null;
  }

  const { providers } = await import("@/lib/db/schema");
  const providerRows = row.order.providerId
    ? await db
        .select({ id: providers.id, name: providers.name, kind: providers.kind, health: providers.health })
        .from(providers)
        .where(eq(providers.id, row.order.providerId))
        .limit(1)
    : [];

  const [events, measurements, paymentRows, refundRows] = await Promise.all([
    db.select().from(orderEvents).where(eq(orderEvents.orderId, row.order.id)).orderBy(desc(orderEvents.createdAt)).limit(100),
    db
      .select()
      .from(orderMeasurements)
      .where(eq(orderMeasurements.orderId, row.order.id))
      .orderBy(desc(orderMeasurements.capturedAt))
      .limit(100),
    db.select().from(payments).where(eq(payments.orderId, row.order.id)).orderBy(desc(payments.createdAt)),
    db.select().from(refunds).where(eq(refunds.orderId, row.order.id)).orderBy(desc(refunds.createdAt)),
  ]);

  return {
    order: row.order,
    service: row.service,
    provider: providerRows[0] ?? null,
    events,
    measurements,
    payments: paymentRows,
    refunds: refundRows,
  };
}

export async function requireOrderForViewer(publicId: string, viewer: { id: string; role: UserRole }): Promise<OrderDetail> {
  const detail = await getOrderForViewer(publicId, viewer);
  if (!detail) throw new NotFoundError("Order not found.");
  return detail;
}

export async function getOrderByPublicId(publicId: string, executor: Executor = db): Promise<Order | null> {
  await getDbAsync();
  const rows = await executor.select().from(orders).where(eq(orders.publicId, publicId)).limit(1);
  return rows[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Customer actions                                                           */
/* -------------------------------------------------------------------------- */

export async function requestCancellation(input: {
  publicId: string;
  user: SessionUser;
  reason: string;
}): Promise<Order> {
  const detail = await requireOrderForViewer(input.publicId, input.user);
  const order = detail.order;
  if (order.userId !== input.user.id) throw new ForbiddenError();

  const cancellableNow = ["pending_payment", "paid", "pending_review", "pending_provider"].includes(order.status);
  const requested = ["queued", "in_progress"].includes(order.status);
  if (!cancellableNow && !requested) {
    throw new AppError("This order can no longer be cancelled from the dashboard. Contact support.", {
      status: 409,
      code: "not_cancellable",
    });
  }

  const updated = await withTransaction(async (tx) => {
    const to = cancellableNow ? "cancelled" : "cancellation_requested";
    assertTransition(order.status, to, { kind: "customer", userId: input.user.id });
    const row = await tx
      .update(orders)
      .set({
        status: to,
        cancellationRequestedAt: new Date(),
        ...(to === "cancelled" ? { cancelledAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(orders.id, order.id), eq(orders.status, order.status)))
      .returning();
    const next = row[0];
    if (!next) throw new ConflictError("This order changed while you were working on it. Refresh and try again.");

    await appendOrderEvent(tx, {
      orderId: order.id,
      kind: "cancelled",
      message: to === "cancelled" ? `Cancelled by customer: ${input.reason}` : `Cancellation requested: ${input.reason}`,
      fromStatus: order.status,
      toStatus: to,
      actor: { kind: "customer", userId: input.user.id, label: input.user.email },
      metadata: { reason: input.reason },
    });

    if (to === "cancelled" && order.paymentStatus === "paid") {
      await enqueueOutbox(tx, "refund.process", `refund:auto:${order.id}`, { orderId: order.id, reason: "Order cancelled before delivery" });
    }
    return next;
  });

  await recordAudit(db, {
    action: "order.cancellation_requested",
    entityType: "order",
    entityId: order.publicId,
    actorId: input.user.id,
    actorEmail: input.user.email,
    actorRole: input.user.role,
    metadata: { reason: input.reason, automatic: cancellableNow },
  });

  return updated;
}

export async function requestRefund(input: { publicId: string; user: SessionUser; reason: string }): Promise<Order> {
  const detail = await requireOrderForViewer(input.publicId, input.user);
  const order = detail.order;
  if (order.userId !== input.user.id) throw new ForbiddenError();
  if (order.paymentStatus !== "paid") {
    throw new AppError("There is no captured payment to refund for this order.", { status: 409, code: "no_payment" });
  }
  if (!["completed", "partially_completed", "failed", "cancelled"].includes(order.status)) {
    throw new AppError("Refunds can be requested after delivery ends or the campaign fails.", {
      status: 409,
      code: "refund_not_available",
    });
  }
  const existing = await db
    .select({ id: refunds.id })
    .from(refunds)
    .where(and(eq(refunds.orderId, order.id), inArray(refunds.status, ["requested", "approved", "processing", "processed"])))
    .limit(1);
  if (existing[0]) throw new ConflictError("A refund request already exists for this order.");

  const delivered = order.verifiedCount ?? order.attributedCount;
  const prorated =
    delivered === null
      ? order.totalPaise
      : Math.max(Math.round(order.totalPaise * (1 - Math.min(delivered / order.quantity, 1))), 0);
  // A fully delivered order can still be disputed. Suggest the full amount, and never
  // create a zero-paise refund row — finance can approve a smaller figure.
  const suggested = Math.min(Math.max(prorated, 100), order.totalPaise);

  const updated = await withTransaction(async (tx) => {
    await tx.insert(refunds).values({
      orderId: order.id,
      paymentId: detail.payments.find((p) => p.status === "paid")?.id ?? detail.payments[0]!.id,
      amountPaise: suggested,
      status: "requested",
      reason: input.reason,
      requestedBy: input.user.id,
    });

    const next = await tx
      .update(orders)
      .set({ status: "refund_pending", updatedAt: new Date() })
      .where(and(eq(orders.id, order.id), eq(orders.status, order.status)))
      .returning();
    const row = next[0];
    if (!row) throw new ConflictError("This order changed while you were working on it. Refresh and try again.");

    // Validated customer transition: completed/failed/cancelled → refund_pending.
    await appendOrderEvent(tx, {
      orderId: order.id,
      kind: "refund",
      message: `Refund requested by customer (${formatPaise(suggested)} suggested): ${input.reason}`,
      fromStatus: order.status,
      toStatus: "refund_pending",
      actor: { kind: "customer", userId: input.user.id, label: input.user.email },
      metadata: { suggestedAmountPaise: suggested },
    });

    return row;
  });

  await recordAudit(db, {
    action: "refund.requested",
    entityType: "order",
    entityId: order.publicId,
    actorId: input.user.id,
    actorEmail: input.user.email,
    actorRole: input.user.role,
    metadata: { reason: input.reason, suggestedAmountPaise: suggested },
  });

  return updated;
}
