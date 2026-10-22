import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

export const userRoleEnum = pgEnum("user_role", ["customer", "support", "finance", "admin"]);
export const orderStatusEnum = pgEnum("order_status", [
  "pending_payment",
  "paid",
  "pending_review",
  "pending_provider",
  "queued",
  "in_progress",
  "partially_completed",
  "completed",
  "failed",
  "cancellation_requested",
  "cancelled",
  "refund_pending",
  "partially_refunded",
  "refunded",
]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "authorized",
  "paid",
  "failed",
  "partially_refunded",
  "refunded",
]);
export const serviceKindEnum = pgEnum("service_kind", [
  "followers",
  "reel_views",
  "video_views",
  "likes",
  "content_promotion",
  "influencer_promotion",
  "advertising_campaign",
]);
export const providerKindEnum = pgEnum("provider_kind", ["mock", "manual", "meta_ads", "agency"]);
export const jobStatusEnum = pgEnum("job_status", ["pending", "running", "completed", "failed", "dead"]);
export const outboxStatusEnum = pgEnum("outbox_status", ["pending", "dispatched", "failed"]);
export const refundStatusEnum = pgEnum("refund_status", [
  "requested",
  "approved",
  "rejected",
  "processing",
  "processed",
  "failed",
]);
export const ticketStatusEnum = pgEnum("ticket_status", [
  "open",
  "awaiting_customer",
  "awaiting_agent",
  "resolved",
  "closed",
]);
export const couponTypeEnum = pgEnum("coupon_type", ["percent", "fixed"]);
export const paymentProviderEnum = pgEnum("payment_provider", ["razorpay", "mock"]);
export const webhookStatusEnum = pgEnum("webhook_status", ["received", "processed", "ignored", "failed"]);
export const emailTokenTypeEnum = pgEnum("email_token_type", ["verify_email", "reset_password"]);
export const measurementSourceEnum = pgEnum("measurement_source", [
  "provider_api",
  "provider_report",
  "manual_verification",
  "unavailable",
  "demo_simulation",
]);
export const providerHealthEnum = pgEnum("provider_health", ["unconfigured", "healthy", "degraded", "down"]);
export const campaignEventKindEnum = pgEnum("campaign_event_kind", [
  "created",
  "payment",
  "submitted",
  "progress",
  "partial_delivery",
  "delivered",
  "failed",
  "cancelled",
  "refund",
  "note",
  "status_change",
  "measurement",
]);

/* -------------------------------------------------------------------------- */
/* Identity & access                                                          */
/* -------------------------------------------------------------------------- */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 320 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull().default("customer"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    company: varchar("company", { length: 160 }),
    phone: varchar("phone", { length: 32 }),
    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_key").on(sql`lower(${t.email})`), index("users_role_idx").on(t.role)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    userAgent: text("user_agent"),
    ip: varchar("ip", { length: 64 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sessions_token_key").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

export const emailTokens = pgTable(
  "email_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: emailTokenTypeEnum("type").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("email_tokens_hash_key").on(t.tokenHash), index("email_tokens_user_idx").on(t.userId)],
);

/* -------------------------------------------------------------------------- */
/* Catalog                                                                    */
/* -------------------------------------------------------------------------- */

export type ServiceMetadata = {
  metric: "followers" | "views" | "likes" | "reach" | "impressions" | "none";
  outcome: string;
  notes?: string[];
  /** Optional routing allow-list, e.g. ["agency","manual"] to forbid demo/Meta delivery. */
  providerKinds?: Array<"mock" | "manual" | "meta_ads" | "agency">;
};

export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    kind: serviceKindEnum("kind").notNull(),
    platform: varchar("platform", { length: 32 }).notNull().default("instagram"),
    tagline: varchar("tagline", { length: 200 }).notNull(),
    description: text("description").notNull(),
    eligibility: text("eligibility").notNull(),
    limitations: text("limitations").notNull(),
    unitLabel: varchar("unit_label", { length: 40 }).notNull().default("units"),
    unitPricePaise: integer("unit_price_paise").notNull(),
    fixedFeePaise: integer("fixed_fee_paise").notNull().default(0),
    minQuantity: integer("min_quantity").notNull().default(100),
    maxQuantity: integer("max_quantity").notNull().default(100000),
    quantityStep: integer("quantity_step").notNull().default(100),
    estimatedDurationHours: integer("estimated_duration_hours").notNull().default(72),
    requiresContentUrl: boolean("requires_content_url").notNull().default(false),
    requiresAudience: boolean("requires_audience").notNull().default(false),
    requiresBrief: boolean("requires_brief").notNull().default(false),
    requiresManualReview: boolean("requires_manual_review").notNull().default(false),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    metadata: jsonb("metadata").$type<ServiceMetadata>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("services_slug_key").on(t.slug), index("services_active_idx").on(t.active)],
);

export const servicePackages = pgTable(
  "service_packages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    description: varchar("description", { length: 240 }),
    quantity: integer("quantity").notNull(),
    pricePaise: integer("price_paise").notNull(),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("service_packages_service_idx").on(t.serviceId)],
);

/* -------------------------------------------------------------------------- */
/* Providers                                                                  */
/* -------------------------------------------------------------------------- */

export type ProviderConfig = {
  /** Non-secret reference to an env var holding the credential, e.g. META_ACCESS_TOKEN */
  credentialEnv?: string;
  [key: string]: unknown;
};

export const providers = pgTable(
  "providers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: varchar("key", { length: 60 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    kind: providerKindEnum("kind").notNull(),
    description: text("description").notNull().default(""),
    enabled: boolean("enabled").notNull().default(false),
    supportedKinds: jsonb("supported_kinds").$type<string[]>().notNull(),
    minQuantity: integer("min_quantity").notNull().default(1),
    maxQuantity: integer("max_quantity").notNull().default(1000000),
    costPerUnitPaise: integer("cost_per_unit_paise").notNull().default(0),
    fixedCostPaise: integer("fixed_cost_paise").notNull().default(0),
    estimatedDurationHours: integer("estimated_duration_hours").notNull().default(72),
    reliabilityScore: integer("reliability_score").notNull().default(80),
    priority: integer("priority").notNull().default(100),
    health: providerHealthEnum("health").notNull().default("unconfigured"),
    lastHealthCheckAt: timestamp("last_health_check_at", { withTimezone: true }),
    lastHealthMessage: text("last_health_message"),
    lastError: text("last_error"),
    /** Secrets are stored encrypted (AES-256-GCM) — never plaintext, never exposed to the browser. */
    encryptedCredentials: text("encrypted_credentials"),
    config: jsonb("config").$type<ProviderConfig>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("providers_key_key").on(t.key), index("providers_enabled_idx").on(t.enabled)],
);

/* -------------------------------------------------------------------------- */
/* Orders                                                                     */
/* -------------------------------------------------------------------------- */

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: varchar("public_id", { length: 24 }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    providerId: uuid("provider_id").references(() => providers.id, { onDelete: "set null" }),
    status: orderStatusEnum("status").notNull().default("pending_payment"),
    idempotencyKey: varchar("idempotency_key", { length: 120 }).notNull(),

    // Request
    targetUrl: text("target_url").notNull(),
    platform: varchar("platform", { length: 32 }).notNull().default("instagram"),
    quantity: integer("quantity").notNull(),
    audienceCountry: varchar("audience_country", { length: 2 }),
    audienceNotes: varchar("audience_notes", { length: 300 }),
    brief: text("brief"),
    packageId: uuid("package_id").references(() => servicePackages.id, { onDelete: "set null" }),
    assetIds: jsonb("asset_ids").$type<string[]>().notNull().default([]),

    // Money (integer paise, INR)
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),
    unitPricePaise: integer("unit_price_paise").notNull(),
    subtotalPaise: integer("subtotal_paise").notNull(),
    discountPaise: integer("discount_paise").notNull().default(0),
    taxPaise: integer("tax_paise").notNull().default(0),
    totalPaise: integer("total_paise").notNull(),
    couponId: uuid("coupon_id"),
    couponCode: varchar("coupon_code", { length: 40 }),
    paymentStatus: paymentStatusEnum("payment_status").notNull().default("pending"),

    // Delivery / measurement — each field is independent on purpose.
    baselineCount: integer("baseline_count"),
    latestCount: integer("latest_count"),
    providerReportedCount: integer("provider_reported_count"),
    attributedCount: integer("attributed_count"),
    organicCount: integer("organic_count"),
    verifiedCount: integer("verified_count"),
    remainingTarget: integer("remaining_target"),
    measurementSource: measurementSourceEnum("measurement_source").notNull().default("unavailable"),
    lastMeasuredAt: timestamp("last_measured_at", { withTimezone: true }),
    measurementNotes: text("measurement_notes"),

    providerRef: varchar("provider_ref", { length: 160 }),
    providerResponse: jsonb("provider_response").$type<Record<string, unknown>>(),
    providerError: text("provider_error"),
    retryCount: integer("retry_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failureCode: varchar("failure_code", { length: 60 }),
    failureMessage: text("failure_message"),

    // Refunds
    refundAmountPaise: integer("refund_amount_paise").notNull().default(0),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),

    cancellationRequestedAt: timestamp("cancellation_requested_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    adminNotes: text("admin_notes"),

    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("orders_public_id_key").on(t.publicId),
    uniqueIndex("orders_idempotency_key").on(t.userId, t.idempotencyKey),
    index("orders_user_idx").on(t.userId, t.createdAt),
    index("orders_status_idx").on(t.status),
    index("orders_provider_idx").on(t.providerId),
  ],
);

export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    kind: campaignEventKindEnum("kind").notNull(),
    fromStatus: orderStatusEnum("from_status"),
    toStatus: orderStatusEnum("to_status"),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorRole: varchar("actor_role", { length: 32 }),
    actorLabel: varchar("actor_label", { length: 80 }).notNull().default("system"),
    message: text("message").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId, t.createdAt)],
);

/** Append-only measurements used to build delivery evidence timelines. */
export const orderMeasurements = pgTable(
  "order_measurements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    source: measurementSourceEnum("source").notNull(),
    isVerified: boolean("is_verified").notNull().default(false),
    baselineCount: integer("baseline_count"),
    latestCount: integer("latest_count"),
    attributedCount: integer("attributed_count"),
    remainingTarget: integer("remaining_target"),
    providerRef: varchar("provider_ref", { length: 160 }),
    evidence: jsonb("evidence").$type<Record<string, unknown>>(),
    notes: text("notes"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_measurements_order_idx").on(t.orderId, t.capturedAt)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    provider: paymentProviderEnum("provider").notNull(),
    providerOrderId: varchar("provider_order_id", { length: 120 }),
    providerPaymentId: varchar("provider_payment_id", { length: 120 }),
    amountPaise: integer("amount_paise").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),
    status: paymentStatusEnum("status").notNull().default("pending"),
    method: varchar("method", { length: 40 }),
    receiptNumber: varchar("receipt_number", { length: 60 }).notNull(),
    failureReason: text("failure_reason"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payments_receipt_key").on(t.receiptNumber),
    index("payments_order_idx").on(t.orderId),
    uniqueIndex("payments_provider_payment_idx").on(t.provider, t.providerPaymentId),
    uniqueIndex("payments_provider_order_idx").on(t.provider, t.providerOrderId),
  ],
);

export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" }),
    amountPaise: integer("amount_paise").notNull(),
    status: refundStatusEnum("status").notNull().default("requested"),
    reason: text("reason").notNull(),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    deciderNote: text("decider_note"),
    providerRefundId: varchar("provider_refund_id", { length: 120 }),
    providerResponse: jsonb("provider_response").$type<Record<string, unknown>>(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("refunds_order_idx").on(t.orderId), index("refunds_status_idx").on(t.status)],
);

export const coupons = pgTable(
  "coupons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 40 }).notNull(),
    type: couponTypeEnum("type").notNull(),
    /** percent: basis points (500 = 5%); fixed: paise */
    value: integer("value").notNull(),
    description: varchar("description", { length: 240 }),
    minOrderPaise: integer("min_order_paise").notNull().default(0),
    maxDiscountPaise: integer("max_discount_paise"),
    maxRedemptions: integer("max_redemptions"),
    redemptionCount: integer("redemption_count").notNull().default(0),
    active: boolean("active").notNull().default(true),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("coupons_code_key").on(sql`upper(${t.code})`)],
);

export const couponRedemptions = pgTable(
  "coupon_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    couponId: uuid("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    discountPaise: integer("discount_paise").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("coupon_redemptions_order_key").on(t.orderId), index("coupon_redemptions_user_idx").on(t.userId)],
);

/* -------------------------------------------------------------------------- */
/* Reliability: outbox, jobs, webhooks, rate limits                           */
/* -------------------------------------------------------------------------- */

export const outbox = pgTable(
  "outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    topic: varchar("topic", { length: 60 }).notNull(),
    dedupeKey: varchar("dedupe_key", { length: 160 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: outboxStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("outbox_dedupe_key").on(t.dedupeKey), index("outbox_status_idx").on(t.status, t.availableAt)],
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    queue: varchar("queue", { length: 60 }).notNull(),
    type: varchar("type", { length: 60 }).notNull(),
    dedupeKey: varchar("dedupe_key", { length: 200 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: jobStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: varchar("locked_by", { length: 80 }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("jobs_dedupe_key").on(t.dedupeKey),
    index("jobs_poll_idx").on(t.status, t.runAt),
  ],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: varchar("source", { length: 40 }).notNull(),
    externalId: varchar("external_id", { length: 160 }).notNull(),
    payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
    signatureValid: boolean("signature_valid").notNull().default(false),
    status: webhookStatusEnum("status").notNull().default("received"),
    error: text("error"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("webhook_events_source_external_key").on(t.source, t.externalId)],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: varchar("key", { length: 200 }).primaryKey(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("rate_limits_expiry_idx").on(t.expiresAt)],
);

/* -------------------------------------------------------------------------- */
/* Content: notifications, tickets, audit, settings, uploads                  */
/* -------------------------------------------------------------------------- */

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    type: varchar("type", { length: 60 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    body: text("body").notNull(),
    href: varchar("href", { length: 200 }),
    readAt: timestamp("read_at", { withTimezone: true }),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: varchar("public_id", { length: 24 }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    subject: varchar("subject", { length: 180 }).notNull(),
    category: varchar("category", { length: 40 }).notNull().default("general"),
    status: ticketStatusEnum("status").notNull().default("open"),
    priority: varchar("priority", { length: 20 }).notNull().default("normal"),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("support_tickets_public_key").on(t.publicId), index("support_tickets_user_idx").on(t.userId)],
);

export const ticketMessages = pgTable(
  "ticket_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    authorLabel: varchar("author_label", { length: 80 }).notNull(),
    authorRole: varchar("author_role", { length: 32 }).notNull().default("customer"),
    body: text("body").notNull(),
    internal: boolean("internal").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ticket_messages_ticket_idx").on(t.ticketId, t.createdAt)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorEmail: varchar("actor_email", { length: 320 }),
    actorRole: varchar("actor_role", { length: 32 }),
    action: varchar("action", { length: 80 }).notNull(),
    entityType: varchar("entity_type", { length: 40 }).notNull(),
    entityId: varchar("entity_id", { length: 80 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ip: varchar("ip", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt), index("audit_logs_actor_idx").on(t.actorId)],
);

export const settings = pgTable("settings", {
  key: varchar("key", { length: 80 }).primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const emailTemplates = pgTable("email_templates", {
  key: varchar("key", { length: 60 }).primaryKey(),
  subject: varchar("subject", { length: 200 }).notNull(),
  body: text("body").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const uploads = pgTable(
  "uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    filename: varchar("filename", { length: 200 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: varchar("storage_key", { length: 160 }).notNull(),
    checksum: varchar("checksum", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("uploads_user_idx").on(t.userId)],
);

/* -------------------------------------------------------------------------- */
/* Public demo runs (isolated from orders/payments)                           */
/* -------------------------------------------------------------------------- */

/**
 * Anonymous "test Instagram followers" demo runs.
 *
 * Deliberately NOT the orders table: a demo run has no user, no money, no payment
 * record, no provider submission and no invoice, so it can never be reported as a
 * paid production campaign or included in revenue metrics. Progress is derived from
 * elapsed time on read, so nothing is queued and no worker capacity is consumed.
 */
export const demoRuns = pgTable(
  "demo_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: varchar("public_id", { length: 24 }).notNull(),
    targetHandle: varchar("target_handle", { length: 30 }).notNull(),
    targetUrl: text("target_url").notNull(),
    requestedQuantity: integer("requested_quantity").notNull(),
    /** Simulated only — never a measurement of a real Instagram account. */
    simulatedDelivered: integer("simulated_delivered").notNull().default(0),
    durationSeconds: integer("duration_seconds").notNull().default(45),
    status: varchar("status", { length: 20 }).notNull().default("running"),
    /** Hashed client IP for abuse detection; the raw address is never stored. */
    ipHash: varchar("ip_hash", { length: 64 }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("demo_runs_public_id_key").on(t.publicId), index("demo_runs_created_idx").on(t.createdAt)],
);

/* -------------------------------------------------------------------------- */
/* Relations (query convenience)                                              */
/* -------------------------------------------------------------------------- */

export const orderRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  service: one(services, { fields: [orders.serviceId], references: [services.id] }),
  provider: one(providers, { fields: [orders.providerId], references: [providers.id] }),
  events: many(orderEvents),
  payments: many(payments),
  measurements: many(orderMeasurements),
}));

export type User = typeof users.$inferSelect;
export type Service = typeof services.$inferSelect;
export type ServicePackage = typeof servicePackages.$inferSelect;
export type Provider = typeof providers.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderStatus = Order["status"];
export type OrderEvent = typeof orderEvents.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Refund = typeof refunds.$inferSelect;
export type Coupon = typeof coupons.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type SupportTicket = typeof supportTickets.$inferSelect;
export type TicketMessage = typeof ticketMessages.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Upload = typeof uploads.$inferSelect;
export type DemoRun = typeof demoRuns.$inferSelect;
export type UserRole = User["role"];
