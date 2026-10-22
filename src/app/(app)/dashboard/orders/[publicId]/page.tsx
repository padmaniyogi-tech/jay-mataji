import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getOrderForViewer } from "@/lib/orders/service";
import { ORDER_STATUS_META, isActiveStatus } from "@/lib/orders/status";
import { formatDateTime, formatNumber, socialLabel } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { countryName } from "@/lib/countries";
import { Alert, Badge, Card, CardBody, CardHeader, StatCard } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { PaymentBadge, StatusBadge } from "@/components/orders/status-badge";
import { MeasurementPanel } from "@/components/orders/measurement-panel";
import { PriceSummary } from "@/components/orders/price-summary";
import { OrderTimeline } from "@/components/orders/timeline";
import { CancelOrderForm, RefundRequestForm } from "@/components/orders/customer-actions";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const user = await requireUser();
  const { publicId } = await params;
  const { paid } = await searchParams;
  const detail = await getOrderForViewer(publicId, user);
  if (!detail) notFound();

  const { order, service, provider, events, measurements, payments, refunds } = detail;
  const meta = ORDER_STATUS_META[order.status];
  const paidPayment = payments.find((p) => p.status === "paid");
  const canCancelNow = ["pending_payment", "paid", "pending_review", "pending_provider"].includes(order.status);
  const canRequestCancel = ["queued", "in_progress"].includes(order.status);
  const canRequestRefund =
    order.paymentStatus === "paid" && ["completed", "partially_completed", "failed", "cancelled"].includes(order.status) && refunds.length === 0;
  const hasOpenRefund = refunds.some((r) => ["requested", "approved", "processing"].includes(r.status));

  return (
    <div className="space-y-6">
      {paid === "1" && (
        <Alert tone="success" title="Payment verified">
          {order.paymentStatus === "paid"
            ? "Your payment is confirmed. The campaign is being routed automatically — this page updates as soon as a partner reports progress."
            : "We received the callback and are verifying it server-side. Refresh in a moment."}
        </Alert>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold">{order.publicId}</h2>
            <StatusBadge status={order.status} />
            <PaymentBadge status={order.paymentStatus} />
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            {service.name} · {formatNumber(order.quantity)} {service.unitLabel} · created {formatDateTime(order.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/dashboard/orders/${order.publicId}/receipt`} variant="secondary" size="sm">
            Receipt
          </ButtonLink>
          {["completed", "partially_completed"].includes(order.status) && (
            <ButtonLink href={`/dashboard/orders/${order.publicId}/report`} size="sm">
              Campaign report
            </ButtonLink>
          )}
          <ButtonLink href={`/dashboard/support?order=${order.publicId}`} variant="secondary" size="sm">
            Get help
          </ButtonLink>
        </div>
      </div>

      <Alert
        tone={meta.tone === "danger" ? "danger" : meta.tone === "warn" ? "warn" : meta.tone === "success" ? "success" : "info"}
        title={meta.label}
      >
        {meta.description}
      </Alert>

      {order.status === "pending_payment" && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">Complete payment to start delivery</p>
              <p className="text-sm text-ink-soft">
                Amount due {formatPaise(order.totalPaise)}. Delivery begins only after server-side verification.
              </p>
            </div>
            <ButtonLink href={`/dashboard/checkout/${order.publicId}`}>Pay now</ButtonLink>
          </div>
        </Card>
      )}

      {order.failureMessage && (
        <Alert tone="danger" title="Campaign issue">
          {order.failureMessage}
          {order.failureCode && <span className="ml-1 text-xs opacity-70">({order.failureCode})</span>}
        </Alert>
      )}

      {order.status === "pending_provider" && (
        <Alert tone="warn" title="Awaiting an eligible delivery partner">
          Your payment is safe. No approved partner was available for this service automatically, so our team has been
          notified and will route your order manually. You can cancel for a refund before delivery starts.
        </Alert>
      )}

      {hasOpenRefund && (
        <Alert tone="info" title="Refund in progress">
          {refunds
            .filter((r) => ["requested", "approved", "processing"].includes(r.status))
            .map((r) => (
              <p key={r.id}>
                {formatPaise(r.amountPaise)} · status {r.status} · requested {formatDateTime(r.createdAt)}
              </p>
            ))}
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Requested target" value={`${formatNumber(order.quantity)}`} hint={service.unitLabel} />
        <StatCard
          label="Verified / attributed"
          value={order.verifiedCount !== null ? formatNumber(order.verifiedCount) : order.attributedCount !== null ? formatNumber(order.attributedCount) : "Unavailable"}
          hint={order.measurementSource.replace(/_/g, " ")}
        />
        <StatCard
          label="Remaining target"
          value={order.remainingTarget === null ? "Unavailable" : formatNumber(order.remainingTarget)}
          hint="Based on best available evidence"
        />
        <StatCard label="Total paid" value={formatPaise(order.totalPaise)} hint={paidPayment ? formatDateTime(paidPayment.verifiedAt) : "Not paid"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Campaign progress" description="Measurements are stored with their source; nothing is inferred." />
            <CardBody>
              <MeasurementPanel order={order} unitLabel={service.unitLabel} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Activity timeline" description="Every status change is recorded server-side." />
            <OrderTimeline events={events} />
          </Card>

          {measurements.length > 0 && (
            <Card>
              <CardHeader title="Measurement evidence" description="Immutable readings captured during the campaign." />
              <CardBody className="space-y-2">
                {measurements.map((measurement) => (
                  <div key={measurement.id} className="rounded-xl border border-line bg-canvas/40 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {measurement.source.replace(/_/g, " ")} {measurement.isVerified ? "· verified" : "· unverified"}
                      </span>
                      <span className="text-xs text-ink-faint">{formatDateTime(measurement.capturedAt)}</span>
                    </div>
                    <p className="mt-1 text-xs text-ink-soft">
                      Provider reported: {measurement.attributedCount === null ? "—" : formatNumber(measurement.attributedCount)} ·
                      Latest total: {measurement.latestCount === null ? "unavailable" : formatNumber(measurement.latestCount)} ·
                      Remaining: {measurement.remainingTarget === null ? "—" : formatNumber(measurement.remainingTarget)}
                    </p>
                    {measurement.notes && <p className="mt-1 text-xs text-ink-faint">{measurement.notes}</p>}
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Order details" />
            <CardBody className="space-y-3 text-sm">
              <Row label="Service" value={service.name} />
              <Row label="Target URL" value={<span className="break-all">{socialLabel(order.targetUrl)}</span>} />
              <Row label="Platform" value={order.platform === "instagram" ? "Instagram" : order.platform} />
              <Row label="Audience" value={countryName(order.audienceCountry)} />
              <Row label="Provider" value={provider ? provider.name : order.status === "pending_provider" ? "Awaiting assignment" : "Not assigned"} />
              <Row label="Estimated duration" value={`${service.estimatedDurationHours} hours`} />
              {order.submittedAt && <Row label="Submitted" value={formatDateTime(order.submittedAt)} />}
              {order.startedAt && <Row label="Started" value={formatDateTime(order.startedAt)} />}
              {order.completedAt && <Row label="Ended" value={formatDateTime(order.completedAt)} />}
              {order.couponCode && <Row label="Coupon" value={order.couponCode} />}
              {order.brief && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Brief</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-soft">{order.brief}</p>
                </div>
              )}
              {isActiveStatus(order.status) && (
                <p className="rounded-lg bg-canvas px-3 py-2 text-xs text-ink-faint">
                  Next action: nothing needed from you. The engine polls the provider and updates this page.
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Payment" action={<Badge tone="neutral">{order.currency}</Badge>} />
            <CardBody className="space-y-3">
              <PriceSummary order={order} />
              <div className="space-y-2 text-xs text-ink-faint">
                {payments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between gap-2">
                    <span>
                      {payment.provider} · {payment.receiptNumber}
                    </span>
                    <PaymentBadge status={payment.status} />
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Actions" />
            <CardBody className="flex flex-wrap gap-2">
              {order.status === "pending_payment" && <ButtonLink href={`/dashboard/checkout/${order.publicId}`} size="sm">Pay now</ButtonLink>}
              {(canCancelNow || canRequestCancel) && (
                <CancelOrderForm orderPublicId={order.publicId} canCancelImmediately={canCancelNow} />
              )}
              {canRequestRefund && <RefundRequestForm orderPublicId={order.publicId} />}
              {refunds.length > 0 && !hasOpenRefund && (
                <p className="text-xs text-ink-faint">
                  Refund history: {refunds.map((r) => `${formatPaise(r.amountPaise)} (${r.status})`).join(", ")}
                </p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <p className="text-xs text-ink-faint">
        Need the full audit trail?{" "}
        <Link href={`/dashboard/orders/${order.publicId}/report`} className="link">
          Open the campaign report
        </Link>{" "}
        or contact support — quote order {order.publicId}.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</span>
      <span className="text-right text-sm text-ink">{value}</span>
    </div>
  );
}
