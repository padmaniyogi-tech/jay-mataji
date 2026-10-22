#!/usr/bin/env tsx
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnvFiles } from "../src/lib/load-env";

loadEnvFiles();

function generatedPassword(): string {
  // Readable but strong: meets the 10-char + letter + number policy.
  return `Amp-${randomBytes(9).toString("base64url")}7`;
}

async function main() {
  const { getEnv } = await import("../src/lib/env");
  const {
    closeDatabase,
    db,
    getDbAsync,
    withTransaction,
  } = await import("../src/lib/db");
  const { applyMigrations } = await import("../src/lib/db/migrate");
  const schema = await import("../src/lib/db/schema");
  const { SEED_SERVICES, SEED_PROVIDERS, SEED_COUPONS } = await import("../src/lib/seed-data");
  const { DEFAULT_TEMPLATES } = await import("../src/lib/email");
  const { hashPassword } = await import("../src/lib/auth/password");
  const { calculateQuote } = await import("../src/lib/pricing");
  const { generatePublicId, generateReceiptNumber } = await import("../src/lib/ids");
  const { formatPaise } = await import("../src/lib/money");
  const { eq, sql } = await import("drizzle-orm");

  const env = getEnv();
  const isDemo = env.DEMO_MODE;
  if (env.NODE_ENV === "production" && !env.ALLOW_SEED_IN_PRODUCTION && !env.DEMO_MODE) {
    throw new Error(
      "Refusing to seed production. Set ALLOW_SEED_IN_PRODUCTION=true only for a deliberate demo deployment, or use `npm run create:admin`.",
    );
  }

  console.log("→ Applying migrations…");
  await getDbAsync();
  const migration = await applyMigrations({ log: (m) => console.log(`   ${m}`) });
  console.log(migration.applied.length ? `   applied ${migration.applied.length} migration(s)` : "   already up to date");

  /* ------------------------------- services ------------------------------- */
  for (const service of SEED_SERVICES) {
    const { packages, ...row } = service;
    const inserted = await db
      .insert(schema.services)
      .values({
        slug: row.slug,
        name: row.name,
        kind: row.kind,
        platform: "instagram",
        tagline: row.tagline,
        description: row.description,
        eligibility: row.eligibility,
        limitations: row.limitations,
        unitLabel: row.unitLabel,
        unitPricePaise: row.unitPricePaise,
        fixedFeePaise: row.fixedFeePaise,
        minQuantity: row.minQuantity,
        maxQuantity: row.maxQuantity,
        quantityStep: row.quantityStep,
        estimatedDurationHours: row.estimatedDurationHours,
        requiresContentUrl: row.requiresContentUrl,
        requiresAudience: row.requiresAudience,
        requiresBrief: row.requiresBrief,
        requiresManualReview: row.requiresManualReview,
        sortOrder: row.sortOrder,
        active: true,
        metadata: row.metadata,
      })
      .onConflictDoNothing({ target: schema.services.slug })
      .returning({ id: schema.services.id });

    const existing = inserted[0]
      ? inserted[0]
      : (await db.select({ id: schema.services.id }).from(schema.services).where(eq(schema.services.slug, row.slug)).limit(1))[0];
    if (!existing) throw new Error(`Could not seed service ${row.slug}`);

    const packageCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.servicePackages)
      .where(eq(schema.servicePackages.serviceId, existing.id));
    if (Number(packageCount[0]?.count ?? 0) === 0) {
      for (const [index, pkg] of packages.entries()) {
        await db.insert(schema.servicePackages).values({
          serviceId: existing.id,
          name: pkg.name,
          description: pkg.description,
          quantity: pkg.quantity,
          pricePaise: pkg.pricePaise,
          sortOrder: index,
          active: true,
        });
      }
    }
  }
  console.log(`✓ services: ${SEED_SERVICES.length}`);

  /* ------------------------------- providers ------------------------------ */
  for (const provider of SEED_PROVIDERS) {
    await db
      .insert(schema.providers)
      .values({
        key: provider.key,
        name: provider.name,
        kind: provider.kind,
        description: provider.description,
        enabled: provider.enabled,
        supportedKinds: provider.supportedKinds,
        minQuantity: provider.minQuantity,
        maxQuantity: provider.maxQuantity,
        costPerUnitPaise: provider.costPerUnitPaise,
        fixedCostPaise: provider.fixedCostPaise,
        estimatedDurationHours: provider.estimatedDurationHours,
        reliabilityScore: provider.reliabilityScore,
        priority: provider.priority,
        health: provider.health,
        config: provider.config,
      })
      .onConflictDoNothing({ target: schema.providers.key });
  }
  console.log(`✓ providers: ${SEED_PROVIDERS.length}`);

  /* -------------------------------- coupons ------------------------------- */
  for (const coupon of SEED_COUPONS) {
    await db
      .insert(schema.coupons)
      .values({
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        description: coupon.description,
        minOrderPaise: coupon.minOrderPaise,
        maxDiscountPaise: coupon.maxDiscountPaise,
        maxRedemptions: coupon.maxRedemptions,
        active: true,
      })
      .onConflictDoNothing();
  }
  console.log(`✓ coupons: ${SEED_COUPONS.length}`);

  /* -------------------------------- settings ------------------------------ */
  await db
    .insert(schema.settings)
    .values({
      key: "platform",
      value: {
        taxRateBps: 1800,
        taxLabel: "GST (18%)",
        supportEmail: "support@amplifi.local",
        refundWindowDays: 14,
        maxActiveOrdersPerUser: 10,
        autoRouteEnabled: true,
        demoBanner: isDemo,
        maintenanceMessage: null,
      },
    })
    .onConflictDoNothing();

  /* ---------------------------- email templates --------------------------- */
  for (const [key, tpl] of Object.entries(DEFAULT_TEMPLATES)) {
    await db
      .insert(schema.emailTemplates)
      .values({ key, subject: tpl.subject, body: tpl.body, enabled: true })
      .onConflictDoNothing();
  }
  console.log(`✓ email templates: ${Object.keys(DEFAULT_TEMPLATES).length}`);

  /* --------------------------------- users -------------------------------- */
  type SeedAccount = { role: "admin" | "customer" | "finance" | "support"; email: string; name: string; password: string };
  const accounts: SeedAccount[] = [
    {
      role: "admin",
      email: env.SEED_ADMIN_EMAIL,
      name: "Platform Admin",
      password: env.SEED_ADMIN_PASSWORD ?? generatedPassword(),
    },
    {
      role: "customer",
      email: env.SEED_CUSTOMER_EMAIL,
      name: "Demo Customer",
      password: env.SEED_CUSTOMER_PASSWORD ?? generatedPassword(),
    },
    { role: "finance", email: "finance@amplifi.local", name: "Finance Desk", password: generatedPassword() },
    { role: "support", email: "support@amplifi.local", name: "Support Agent", password: generatedPassword() },
  ];

  const credentials: string[] = [];
  const userIds: Record<string, string> = {};

  for (const account of accounts) {
    const existing = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = lower(${account.email})`).limit(1);
    if (existing[0]) {
      userIds[account.role] = existing[0].id;
      credentials.push(`${account.role.padEnd(8)} ${account.email}  (existing account — password unchanged)`);
      continue;
    }
    const passwordHash = await hashPassword(account.password);
    const inserted = await db
      .insert(schema.users)
      .values({
        email: account.email,
        name: account.name,
        passwordHash,
        role: account.role,
        emailVerifiedAt: new Date(),
      })
      .returning({ id: schema.users.id });
    if (!inserted[0]) throw new Error(`Failed to create ${account.role}`);
    userIds[account.role] = inserted[0].id;
    credentials.push(`${account.role.padEnd(8)} ${account.email}  ${account.password}`);
  }
  console.log(`✓ users: ${accounts.length} (roles: admin, customer, finance, support)`);

  /* ------------------------------ sample orders --------------------------- */
  const customerId = userIds.customer;
  const existingOrders = customerId
    ? await db.select({ count: sql<number>`count(*)::int` }).from(schema.orders).where(eq(schema.orders.userId, customerId))
    : [{ count: 0 }];

  if (customerId && Number(existingOrders[0]?.count ?? 0) === 0) {
    const services = await db.select().from(schema.services);
    const providers = await db.select().from(schema.providers);
    const mockProvider = providers.find((p) => p.key === "demo-simulator");
    const manualProvider = providers.find((p) => p.key === "campaign-team");

    const seedOrder = async (input: {
      serviceSlug: string;
      quantity: number;
      status: (typeof schema.orderStatusEnum.enumValues)[number];
      paymentStatus?: "pending" | "paid";
      providerId?: string | null;
      providerRef?: string | null;
      minutesAgo: number;
      delivered?: number | null;
      failure?: { code: string; message: string };
      refundRequested?: boolean;
    }) => {
      const service = services.find((s) => s.slug === input.serviceSlug);
      if (!service) return null;
      const quote = calculateQuote({ service, quantity: input.quantity, taxRateBps: 1800 });
      const createdAt = new Date(Date.now() - input.minutesAgo * 60_000);
      const publicId = generatePublicId();
      const paymentStatus = input.paymentStatus ?? (input.status === "pending_payment" ? "pending" : "paid");

      const order = await withTransaction(async (tx) => {
        const inserted = await tx
          .insert(schema.orders)
          .values({
            publicId,
            userId: customerId,
            serviceId: service.id,
            providerId: input.providerId ?? null,
            status: input.status,
            idempotencyKey: `seed-${publicId}`,
            targetUrl: service.requiresContentUrl
              ? "https://www.instagram.com/reel/DEMOSEED01/"
              : "https://www.instagram.com/demo.brand/",
            platform: "instagram",
            quantity: input.quantity,
            audienceCountry: service.requiresAudience ? "IN" : null,
            brief: service.requiresBrief
              ? "Seed campaign brief: promote the new collection to 18-34 year olds in metro India. (Demo sample order.)"
              : null,
            unitPricePaise: quote.unitPricePaise,
            subtotalPaise: quote.subtotalPaise,
            discountPaise: 0,
            taxPaise: quote.taxPaise,
            totalPaise: quote.totalPaise,
            paymentStatus,
            providerRef: input.providerRef ?? null,
            baselineCount: input.delivered !== undefined ? 0 : null,
            providerReportedCount: input.delivered ?? null,
            attributedCount: input.delivered ?? null,
            verifiedCount: null,
            remainingTarget: input.delivered != null ? Math.max(input.quantity - input.delivered, 0) : input.quantity,
            measurementSource: input.delivered != null ? "demo_simulation" : "unavailable",
            lastMeasuredAt: input.delivered != null ? createdAt : null,
            measurementNotes: input.delivered != null ? "DEMO DATA — NOT REAL INSTAGRAM ENGAGEMENT." : null,
            paidAt: paymentStatus === "paid" ? createdAt : null,
            submittedAt: input.providerRef ? createdAt : null,
            startedAt: input.providerRef ? createdAt : null,
            completedAt: ["completed", "partially_completed", "failed", "cancelled"].includes(input.status) ? createdAt : null,
            failureCode: input.failure?.code ?? null,
            failureMessage: input.failure?.message ?? null,
            createdAt,
            updatedAt: createdAt,
          })
          .returning();
        const row = inserted[0]!;

        await tx.insert(schema.payments).values({
          orderId: row.id,
          userId: customerId,
          provider: "mock",
          amountPaise: row.totalPaise,
          status: paymentStatus === "paid" ? "paid" : "pending",
          receiptNumber: generateReceiptNumber(row.publicId),
          providerPaymentId: paymentStatus === "paid" ? `mockpay_seed_${publicId.slice(4, 12)}` : null,
          verifiedAt: paymentStatus === "paid" ? createdAt : null,
          method: paymentStatus === "paid" ? "demo" : null,
          createdAt,
          updatedAt: createdAt,
        });

        const events: Array<{ kind: (typeof schema.campaignEventKindEnum.enumValues)[number]; message: string; from?: string; to?: string }> = [
          { kind: "created", message: "Sample order created by seed script.", to: "pending_payment" },
        ];
        if (paymentStatus === "paid") {
          events.push({ kind: "payment", message: "Demo payment marked captured (seed).", from: "pending_payment", to: "paid" });
        }
        if (input.providerRef) {
          events.push({ kind: "submitted", message: "Demo campaign submitted to the simulator (seed).", from: "queued", to: "in_progress" });
        }
        if (input.delivered != null) {
          events.push({
            kind: "delivered",
            message: `Demo simulation report: ${input.delivered}/${input.quantity} simulated units. DEMO DATA — NOT REAL INSTAGRAM ENGAGEMENT.`,
            from: "in_progress",
            to: input.status,
          });
        }
        if (input.refundRequested) {
          await tx.insert(schema.refunds).values({
            orderId: row.id,
            paymentId: (await tx.select({ id: schema.payments.id }).from(schema.payments).where(eq(schema.payments.orderId, row.id)).limit(1))[0]!.id,
            amountPaise: row.totalPaise,
            status: "requested",
            reason: "Seed sample: campaign failed before delivery began.",
          });
        }
        for (const [index, event] of events.entries()) {
          await tx.insert(schema.orderEvents).values({
            orderId: row.id,
            kind: event.kind,
            message: event.message,
            fromStatus: (event.from ?? null) as never,
            toStatus: (event.to ?? null) as never,
            actorLabel: "seed",
            createdAt: new Date(createdAt.getTime() + index * 1000),
          });
        }
        if (input.delivered != null) {
          await tx.insert(schema.orderMeasurements).values({
            orderId: row.id,
            source: "demo_simulation",
            isVerified: false,
            baselineCount: 0,
            latestCount: input.delivered,
            attributedCount: input.delivered,
            remainingTarget: Math.max(input.quantity - input.delivered, 0),
            providerRef: input.providerRef ?? null,
            evidence: { demo: true, note: "Seed sample — simulated, not real Instagram data." },
            notes: "DEMO DATA — NOT REAL INSTAGRAM ENGAGEMENT.",
            capturedAt: createdAt,
          });
        }
        return row;
      });
      return order;
    };

    await seedOrder({
      serviceSlug: "instagram-followers",
      quantity: 1_000,
      status: "completed",
      providerId: mockProvider?.id ?? null,
      providerRef: `mock_${generatePublicId()}_${Math.floor(Date.now() / 1000) - 900}_1000_success`,
      minutesAgo: 180,
      delivered: 1_000,
    });
    await seedOrder({
      serviceSlug: "instagram-reel-views",
      quantity: 5_000,
      status: "in_progress",
      providerId: mockProvider?.id ?? null,
      providerRef: `mock_${generatePublicId()}_${Math.floor(Date.now() / 1000) - 20}_5000_success`,
      minutesAgo: 2,
    });
    await seedOrder({
      serviceSlug: "instagram-likes",
      quantity: 500,
      status: "pending_payment",
      paymentStatus: "pending",
      minutesAgo: 5,
    });
    await seedOrder({
      serviceSlug: "influencer-promotion",
      quantity: 1,
      status: "refund_pending",
      providerId: manualProvider?.id ?? null,
      minutesAgo: 1440,
      failure: { code: "provider_rejected", message: "Seed sample: creator network could not accept the brief in time." },
      refundRequested: true,
    });
    await seedOrder({
      serviceSlug: "instagram-advertising-campaign",
      quantity: 50_000,
      status: "pending_provider",
      providerId: null,
      minutesAgo: 30,
    });
    console.log("✓ sample orders: 5 (completed, in-progress, pending payment, refund pending, pending provider)");
  } else {
    console.log("• sample orders already exist — skipped");
  }

  /* ------------------------------- credentials ---------------------------- */
  const dir = path.resolve(process.cwd(), ".data");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "seed-credentials.txt");
  writeFileSync(
    file,
    [
      "AMPLIFI DEMO CREDENTIALS (delete this file before any production use)",
      `Generated: ${new Date().toISOString()}`,
      "",
      ...credentials,
      "",
      "These accounts exist only in the local demo database.",
    ].join("\n"),
    "utf8",
  );

  const totalOrders = await db.select({ count: sql<number>`count(*)::int` }).from(schema.orders);
  console.log(`\n✓ Seed complete. Orders in database: ${Number(totalOrders[0]?.count ?? 0)}`);
  console.log(`\nDemo accounts (also written to ${path.relative(process.cwd(), file)}):`);
  for (const line of credentials) console.log(`  ${line}`);
  console.log("\nOpen http://localhost:3000 and sign in. Demo campaigns are labelled DEMO DATA.");

  await closeDatabase();
}

main().catch((err) => {
  console.error(`✗ Seed failed: ${(err as Error).message}`);
  if (process.env.DEBUG) console.error(err);
  process.exitCode = 1;
});
