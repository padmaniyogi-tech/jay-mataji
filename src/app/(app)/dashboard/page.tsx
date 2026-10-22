import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, services } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { formatDateTime, formatNumber } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { ACTIVE_STATUSES, FAILED_STATUSES } from "@/lib/orders/status";
import { Alert, Card, CardHeader, EmptyState, StatCard, TableShell, Td, Th } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge, PaymentBadge } from "@/components/orders/status-badge";
import { ResendVerificationButton } from "@/components/auth/forms";
import { socialLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const env = getEnv();

  const [stats, recent] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${orders.status} = any(${sql.raw(`array['${ACTIVE_STATUSES.join("','")}']::order_status[]`)}))::int`,
        completed: sql<number>`count(*) filter (where ${orders.status} = 'completed')::int`,
        failed: sql<number>`count(*) filter (where ${orders.status} = any(${sql.raw(`array['${FAILED_STATUSES.join("','")}']::order_status[]`)}))::int`,
        spend: sql<number>`coalesce(sum(${orders.totalPaise}) filter (where ${orders.paymentStatus} = 'paid'), 0)::int`,
      })
      .from(orders)
      .where(eq(orders.userId, user.id)),
    db
      .select({
        publicId: orders.publicId,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        quantity: orders.quantity,
        totalPaise: orders.totalPaise,
        targetUrl: orders.targetUrl,
        createdAt: orders.createdAt,
        serviceName: services.name,
        unitLabel: services.unitLabel,
      })
      .from(orders)
      .innerJoin(services, eq(services.id, orders.serviceId))
      .where(eq(orders.userId, user.id))
      .orderBy(desc(orders.createdAt))
      .limit(5),
  ]);

  const summary = stats[0];
  const emailUnverified = !user.emailVerifiedAt;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Hi {user.name.split(" ")[0]}</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Track campaigns, download reports and manage refunds in one place.
          </p>
        </div>
        <ButtonLink href="/services">Start a new campaign</ButtonLink>
      </div>

      {emailUnverified && (
        <Alert tone="warn" title="Verify your email address">
          <p>
            Order creation is locked until your email is verified{env.DEMO_MODE ? " (demo mode currently exempts this)" : ""}.
            Check your inbox, or send a fresh link.
          </p>
          <div className="mt-2">
            <ResendVerificationButton />
          </div>
        </Alert>
      )}

      {env.DEMO_MODE && (
        <Alert tone="demo" title="Demo environment">
          Campaigns are delivered by a local simulator and payments use the mock adapter. Everything works end to end, but
          no real Instagram activity happens and no money is charged.
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total orders" value={formatNumber(summary?.total ?? 0)} />
        <StatCard label="Active campaigns" value={formatNumber(summary?.active ?? 0)} tone="progress" />
        <StatCard label="Completed" value={formatNumber(summary?.completed ?? 0)} tone="success" />
        <StatCard label="Failed / cancelled" value={formatNumber(summary?.failed ?? 0)} tone="danger" />
        <StatCard label="Total spend" value={formatPaise(summary?.spend ?? 0)} hint="Payments captured" />
      </div>

      <Card>
        <CardHeader
          title="Recent orders"
          description="Statuses update automatically as the delivery engine reports progress."
          action={
            <Link href="/dashboard/orders" className="link text-sm">
              View all
            </Link>
          }
        />
        {recent.length === 0 ? (
          <EmptyState
            title="No campaigns yet"
            description="Pick a service, paste a public Instagram URL and set a target. You can test the whole flow in demo mode."
            action={<ButtonLink href="/services">Browse services</ButtonLink>}
          />
        ) : (
          <TableShell className="rounded-none border-0 shadow-none">
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Service</Th>
                <Th>Target</Th>
                <Th>Status</Th>
                <Th>Payment</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {recent.map((order) => (
                <tr key={order.publicId} className="transition hover:bg-canvas/50">
                  <Td>
                    <Link href={`/dashboard/orders/${order.publicId}`} className="font-semibold text-ink hover:text-brand-700">
                      {order.publicId}
                    </Link>
                    <p className="text-xs text-ink-faint">{formatDateTime(order.createdAt)}</p>
                  </Td>
                  <Td>
                    <p className="font-medium text-ink">{order.serviceName}</p>
                    <p className="text-xs text-ink-faint">{socialLabel(order.targetUrl)}</p>
                  </Td>
                  <Td className="tabular-nums">
                    {formatNumber(order.quantity)} {order.unitLabel}
                  </Td>
                  <Td>
                    <StatusBadge status={order.status} />
                  </Td>
                  <Td>
                    <PaymentBadge status={order.paymentStatus} />
                  </Td>
                  <Td className="text-right tabular-nums">{formatPaise(order.totalPaise)}</Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm font-semibold">How results are reported</p>
          <p className="mt-1 text-sm text-ink-soft">
            Requested, provider-reported and verified numbers are always separate. Organic growth is never counted as
            campaign delivery.
          </p>
          <Link href="/how-it-works" className="link mt-2 inline-block text-sm">
            Read the delivery guide
          </Link>
        </Card>
        <Card className="p-5">
          <p className="text-sm font-semibold">Need a hand?</p>
          <p className="mt-1 text-sm text-ink-soft">Open a ticket and our campaign team will reply inside the dashboard.</p>
          <Link href="/dashboard/support" className="link mt-2 inline-block text-sm">
            Contact support
          </Link>
        </Card>
        <Card className="p-5">
          <p className="text-sm font-semibold">Account & security</p>
          <p className="mt-1 text-sm text-ink-soft">Update your profile, change your password and manage notifications.</p>
          <Link href="/dashboard/settings" className="link mt-2 inline-block text-sm">
            Open settings
          </Link>
        </Card>
      </div>
    </div>
  );
}
