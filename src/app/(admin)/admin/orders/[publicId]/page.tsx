import Link from "next/link";
import { notFound } from "next/navigation";
import { asc } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/session";
import { getOrderForViewer } from "@/lib/orders/service";
import { db } from "@/lib/db";
import { providers, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ORDER_STATUSES, statusLabel } from "@/lib/orders/status";
import { formatDateTime, formatNumber, socialLabel } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { countryName } from "@/lib/countries";
import { Alert, Badge, Card, CardBody, CardHeader, TableShell, Td, Th } from "@/components/ui/primitives";
import { DemoDataBadge, PaymentBadge, StatusBadge } from "@/components/orders/status-badge";
import { OrderTimeline } from "@/components/orders/timeline";
import { MeasurementPanel } from "@/components/orders/measurement-panel";
import { AdminOrderActions } from "@/components/admin/order-actions";

export const dynamic = "force-dynamic";

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ publicId: string }> }) {
  const staff = await requirePermission("orders:read:all");
  const { publicId } = await params;
  const detail = await getOrderForViewer(publicId, staff);
  if (!detail) notFound();

  const { order, service, events, measurements, payments, refunds } = detail;
  const customerRows = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, order.userId)).limit(1);
  const customer = customerRows[0];

  const providerRows = await db
    .select({ id: providers.id, name: providers.name, kind: providers.kind, enabled: providers.enabled, health: providers.health })
    .from(providers)
    .orderBy(asc(providers.priority));

  const activeProvider = providerRows.find((row) => row.id === order.providerId);
  const isMock = activeProvider?.kind === "mock";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/orders" className="text-sm text-ink-faint hover:text-ink">
            ← All orders
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold">{order.publicId}</h2>
            <StatusBadge status={order.status} />
            <PaymentBadge status={order.paymentStatus} />
            {order.measurementSource === "demo_simulation" && <DemoDataBadge />}
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            {service.name} · {formatNumber(order.quantity)} {service.unitLabel} · {formatPaise(order.totalPaise)} · created{" "}
            {formatDateTime(order.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/dashboard/orders/${order.publicId}`} className="rounded-lg border border-line px-3 py-2 text-sm hover:border-brand-300">
            Customer view
          </Link>
          <Link href="/admin/refunds" className="rounded-lg border border-line px-3 py-2 text-sm hover:border-brand-300">
            Refunds
          </Link>
        </div>
      </div>

      {isMock && (
        <Alert tone="demo" title="Simulator provider">
          Delivery for this order comes from the local demo simulator. Measurements are labelled DEMO DATA and no external
          platform was contacted.
        </Alert>
      )}
      {order.status === "pending_provider" && (
        <Alert tone="warn" title="Manual routing required">
          No eligible provider was available. Assign one below, or cancel with a refund.
        </Alert>
      )}
      {order.failureMessage && (
        <Alert tone="danger" title={`Provider error${order.failureCode ? ` (${order.failureCode})` : ""}`}>
          {order.failureMessage}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Delivery" description="Requested vs provider-reported vs verified." />
            <CardBody>
              <MeasurementPanel order={order} unitLabel={service.unitLabel} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Timeline" description="Immutable audit history for this order." />
            <OrderTimeline events={events} showActor />
          </Card>

          <TableShell>
            <thead>
              <tr>
                <Th>Payment</Th>
                <Th>Provider ref</Th>
                <Th>Status</Th>
                <Th className="text-right">Amount</Th>
                <Th>Verified</Th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <Td className="text-xs">
                    {payment.provider} · {payment.receiptNumber}
                  </Td>
                  <Td className="break-all text-xs">{payment.providerPaymentId ?? "—"}</Td>
                  <Td>
                    <PaymentBadge status={payment.status} />
                  </Td>
                  <Td className="text-right tabular-nums">{formatPaise(payment.amountPaise)}</Td>
                  <Td className="text-xs">{formatDateTime(payment.verifiedAt)}</Td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr>
                  <Td className="text-xs text-ink-faint" >No payments recorded.</Td>
                  <Td /><Td /><Td /><Td />
                </tr>
              )}
            </tbody>
          </TableShell>

          {measurements.length > 0 && (
            <TableShell>
              <thead>
                <tr>
                  <Th>Captured</Th>
                  <Th>Source</Th>
                  <Th className="text-right">Attributed</Th>
                  <Th className="text-right">Latest</Th>
                  <Th>Verified</Th>
                  <Th>Note</Th>
                </tr>
              </thead>
              <tbody>
                {measurements.map((measurement) => (
                  <tr key={measurement.id}>
                    <Td className="text-xs">{formatDateTime(measurement.capturedAt)}</Td>
                    <Td className="text-xs">{measurement.source.replace(/_/g, " ")}</Td>
                    <Td className="text-right tabular-nums">{measurement.attributedCount === null ? "—" : formatNumber(measurement.attributedCount)}</Td>
                    <Td className="text-right tabular-nums">{measurement.latestCount === null ? "unavailable" : formatNumber(measurement.latestCount)}</Td>
                    <Td>
                      <Badge tone={measurement.isVerified ? "success" : "neutral"}>{measurement.isVerified ? "yes" : "no"}</Badge>
                    </Td>
                    <Td className="text-xs">{measurement.notes ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Order facts" />
            <CardBody className="space-y-2 text-sm">
              <Row label="Customer" value={<span className="break-all">{customer ? `${customer.name} · ${customer.email}` : "—"}</span>} />
              <Row label="Target" value={<span className="break-all">{socialLabel(order.targetUrl)}</span>} />
              <Row label="Audience" value={countryName(order.audienceCountry)} />
              <Row label="Provider" value={activeProvider ? `${activeProvider.name} (${activeProvider.kind})` : "Unassigned"} />
              <Row label="Provider ref" value={order.providerRef ?? "—"} />
              <Row label="Retries" value={String(order.retryCount)} />
              <Row label="Measurement source" value={order.measurementSource.replace(/_/g, " ")} />
              <Row label="Last measured" value={formatDateTime(order.lastMeasuredAt)} />
              <Row label="Submitted" value={formatDateTime(order.submittedAt)} />
              <Row label="Started" value={formatDateTime(order.startedAt)} />
              <Row label="Completed" value={formatDateTime(order.completedAt)} />
              {order.couponCode && <Row label="Coupon" value={order.couponCode} />}
              {order.adminNotes && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Internal notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-ink-soft">{order.adminNotes}</p>
                </div>
              )}
            </CardBody>
          </Card>

          {refunds.length > 0 && (
            <Card>
              <CardHeader title="Refunds" />
              <CardBody className="space-y-2 text-xs">
                {refunds.map((refund) => (
                  <div key={refund.id} className="flex items-center justify-between gap-2">
                    <span>
                      {formatPaise(refund.amountPaise)} · {refund.reason}
                    </span>
                    <Badge tone={refund.status === "processed" ? "success" : refund.status === "rejected" ? "danger" : "warn"}>{refund.status}</Badge>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          <AdminOrderActions
            publicId={order.publicId}
            status={order.status}
            providers={providerRows.map((row) => ({ id: row.id, name: row.name, kind: row.kind, enabled: row.enabled, health: row.health }))}
            statuses={ORDER_STATUSES.map((status) => ({ value: status, label: statusLabel(status) }))}
            deliveredTarget={order.quantity}
            canForce={staff.role === "admin"}
          />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</span>
      <span className="text-right text-sm text-ink">{value}</span>
    </div>
  );
}
