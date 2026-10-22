import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { getAdminOverview, revenueByDay } from "@/lib/admin/service";
import { formatDateTime, formatNumber } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { getEnv } from "@/lib/env";
import { Alert, Badge, Card, CardBody, CardHeader, StatCard, TableShell, Td, Th } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/orders/status-badge";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  await requirePermission("analytics:read").catch(() => null);
  const [overview, revenue] = await Promise.all([getAdminOverview(), revenueByDay(14)]);
  const env = getEnv();
  const maxRevenue = Math.max(...revenue.map((day) => day.revenuePaise), 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Operations overview</h2>
          <p className="mt-1 text-sm text-ink-soft">
            {env.DEMO_MODE ? "Demo environment — simulator provider and mock payments." : "Live environment."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/orders?status=pending_provider" className="rounded-lg border border-line px-3 py-2 text-sm hover:border-brand-300">
            {overview.pendingProvider} awaiting provider
          </Link>
          <Link href="/admin/refunds" className="rounded-lg border border-line px-3 py-2 text-sm hover:border-brand-300">
            {overview.pendingRefunds} refunds to review
          </Link>
        </div>
      </div>

      {overview.pendingProvider > 0 && (
        <Alert tone="warn" title="Orders need manual routing">
          {overview.pendingProvider} paid order(s) have no eligible provider. Assign a provider or refund from the order page.
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Captured revenue" value={formatPaise(overview.revenuePaise)} hint={`${formatPaise(overview.revenue30dPaise)} in 30 days`} />
        <StatCard label="Refunded" value={formatPaise(overview.refundedPaise)} tone="danger" />
        <StatCard label="Active orders" value={formatNumber(overview.activeOrders)} hint={`${formatNumber(overview.totalOrders)} total`} tone="progress" />
        <StatCard label="Customers" value={formatNumber(overview.totalCustomers)} hint={`+${formatNumber(overview.newCustomers30d)} in 30 days`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader title="Revenue, last 14 days" description="Captured payments only." />
          <CardBody>
            <div className="flex h-40 items-end gap-1.5">
              {revenue.map((day) => (
                <div key={day.day} className="flex flex-1 flex-col items-center gap-1" title={`${day.day}: ${formatPaise(day.revenuePaise)}`}>
                  <div
                    className="w-full rounded-t bg-brand-500/80"
                    style={{ height: `${Math.max((day.revenuePaise / maxRevenue) * 100, 2)}%` }}
                  />
                  <span className="text-[9px] text-ink-faint">{day.day.slice(8)}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Queue health" description="Jobs processed by the background worker." />
          <CardBody className="space-y-2 text-sm">
            <Row label="Pending" value={formatNumber(overview.jobs.pending ?? 0)} />
            <Row label="Running" value={formatNumber(overview.jobs.running ?? 0)} />
            <Row label="Retrying" value={formatNumber(overview.jobs.retrying ?? 0)} />
            <Row label="Failed / dead" value={formatNumber((overview.jobs.failed ?? 0) + (overview.jobs.dead ?? 0))} />
            <Row label="Email outbox pending" value={formatNumber(overview.outboxPending)} />
            <Row label="Open tickets" value={formatNumber(overview.openTickets)} />
            <p className="pt-2 text-xs text-ink-faint">
              Worker: <code className="rounded bg-canvas px-1">npm run worker</code>, or call{" "}
              <code className="rounded bg-canvas px-1">/api/cron/tick</code> from a scheduler.
            </p>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title="Recent orders"
            action={
              <Link href="/admin/orders" className="link text-sm">
                All orders
              </Link>
            }
          />
          <TableShell className="rounded-none border-0 shadow-none">
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Customer</Th>
                <Th>Status</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {overview.recentOrders.map((order) => (
                <tr key={order.publicId}>
                  <Td>
                    <Link href={`/admin/orders/${order.publicId}`} className="font-medium text-ink hover:text-brand-700">
                      {order.publicId}
                    </Link>
                    <p className="text-xs text-ink-faint">{order.serviceName}</p>
                  </Td>
                  <Td className="text-xs">{order.customerEmail}</Td>
                  <Td>
                    <StatusBadge status={order.status} />
                  </Td>
                  <Td className="text-right tabular-nums">{formatPaise(order.totalPaise)}</Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </Card>

        <Card>
          <CardHeader title="Orders by status" />
          <CardBody className="space-y-1.5 text-sm">
            {Object.entries(overview.ordersByStatus)
              .sort((a, b) => b[1] - a[1])
              .map(([status, count]) => (
                <div key={status} className="flex items-center justify-between gap-2">
                  <StatusBadge status={status} />
                  <span className="tabular-nums text-ink-soft">{formatNumber(count)}</span>
                </div>
              ))}
            {Object.keys(overview.ordersByStatus).length === 0 && <p className="text-xs text-ink-faint">No orders yet.</p>}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Environment" action={<Badge tone={env.DEMO_MODE ? "demo" : "success"}>{env.DEMO_MODE ? "Demo mode" : "Production mode"}</Badge>} />
        <CardBody className="grid gap-3 text-xs text-ink-soft sm:grid-cols-3">
          <p>
            Payment adapter: <strong className="text-ink">{env.PAYMENTS_PROVIDER}</strong>
          </p>
          <p>
            Email adapter: <strong className="text-ink">{env.EMAIL_PROVIDER}</strong>
          </p>
          <p>
            Captured at <strong className="text-ink">{formatDateTime(new Date())}</strong>
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-line/60 pb-1.5 last:border-0">
      <span className="text-ink-soft">{label}</span>
      <span className="font-medium tabular-nums text-ink">{value}</span>
    </div>
  );
}
