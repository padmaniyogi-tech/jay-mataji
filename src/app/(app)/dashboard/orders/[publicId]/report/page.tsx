import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getOrderForViewer } from "@/lib/orders/service";
import { formatDateTime, formatNumber, socialLabel } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { countryName } from "@/lib/countries";
import { Alert, Badge, Card, CardBody, CardHeader, Progress } from "@/components/ui/primitives";
import { DemoDataBadge, StatusBadge } from "@/components/orders/status-badge";
import { OrderTimeline } from "@/components/orders/timeline";
import { PrintButton } from "@/components/app/print-button";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/70 py-2 last:border-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="text-right text-sm text-ink">{value}</dd>
    </div>
  );
}

export default async function CampaignReportPage({ params }: { params: Promise<{ publicId: string }> }) {
  const user = await requireUser();
  const { publicId } = await params;
  const detail = await getOrderForViewer(publicId, user);
  if (!detail) notFound();
  const { order, service, provider, events, measurements, refunds } = detail;

  const demo = order.measurementSource === "demo_simulation";
  const delivered = order.verifiedCount ?? order.attributedCount;
  const percent = delivered !== null ? Math.min(Math.round((delivered / Math.max(order.quantity, 1)) * 100), 100) : null;
  const outcome =
    order.status === "completed"
      ? "Completed"
      : order.status === "partially_completed"
        ? "Partially completed"
        : order.status === "failed"
          ? "Failed"
          : order.status;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink-faint">
            <Link href={`/dashboard/orders/${order.publicId}`} className="hover:text-ink">
              {order.publicId}
            </Link>{" "}
            / Campaign report
          </p>
          <h2 className="mt-1 text-2xl font-bold">Campaign report</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Generated {formatDateTime(new Date())} · {service.name}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <PrintButton />
        </div>
      </div>

      {demo ? (
        <Alert tone="demo" title="DEMO DATA — NOT REAL INSTAGRAM ENGAGEMENT">
          This report describes a simulated campaign. No request was sent to Instagram and no real followers, views or
          likes were produced. Numbers below are simulation output, not platform analytics.
        </Alert>
      ) : (
        <Alert tone="info" title="How to read this report">
          Requested, provider-reported and verified values are separate on purpose. Attributed results cover this campaign
          only; your account&apos;s total numbers include organic activity and will differ.
        </Alert>
      )}

      <Card>
        <CardHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              Outcome <StatusBadge status={order.status} />
              {demo && <DemoDataBadge />}
            </span>
          }
          description={`${outcome} · provider: ${provider?.name ?? "not assigned"}`}
        />
        <CardBody className="space-y-4">
          <Progress value={percent} label="Attributed delivery vs requested target" tone={order.status === "completed" ? "success" : "progress"} demo={demo} />
          <dl className="grid gap-x-8 sm:grid-cols-2">
            <div>
              <Row label="Requested target" value={`${formatNumber(order.quantity)} ${service.unitLabel}`} />
              <Row label="Provider reported" value={order.providerReportedCount === null ? "Metric unavailable" : formatNumber(order.providerReportedCount)} />
              <Row label="Verified" value={order.verifiedCount === null ? "Not verified" : formatNumber(order.verifiedCount)} />
              <Row label="Attributed" value={order.attributedCount === null ? "Metric unavailable" : formatNumber(order.attributedCount)} />
            </div>
            <div>
              <Row label="Latest total measured" value={order.latestCount === null ? "Metric unavailable" : formatNumber(order.latestCount)} />
              <Row label="Organic growth" value={order.organicCount === null ? "Not attributable" : formatNumber(order.organicCount)} />
              <Row label="Remaining target" value={order.remainingTarget === null ? "Metric unavailable" : formatNumber(order.remainingTarget)} />
              <Row label="Measurement source" value={order.measurementSource.replace(/_/g, " ")} />
            </div>
          </dl>
          {order.measurementNotes && <p className="text-xs leading-relaxed text-ink-faint">{order.measurementNotes}</p>}
        </CardBody>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader title="Campaign" />
          <CardBody>
            <dl>
              <Row label="Order" value={order.publicId} />
              <Row label="Service" value={service.name} />
              <Row label="Target" value={socialLabel(order.targetUrl)} />
              <Row label="Audience" value={countryName(order.audienceCountry)} />
              <Row label="Started" value={formatDateTime(order.startedAt)} />
              <Row label="Ended" value={formatDateTime(order.completedAt)} />
            </dl>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Billing" />
          <CardBody>
            <dl>
              <Row label="Order total" value={formatPaise(order.totalPaise)} />
              <Row label="Payment status" value={order.paymentStatus} />
              <Row label="Refunded" value={formatPaise(order.refundAmountPaise)} />
              <Row label="Coupon" value={order.couponCode ?? "—"} />
              <Row label="Currency" value={order.currency} />
            </dl>
          </CardBody>
        </Card>
      </div>

      {measurements.length > 0 && (
        <Card>
          <CardHeader title="Evidence log" description="Every captured reading, with source and verification state." />
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                    <th className="py-2 pr-3">Captured</th>
                    <th className="py-2 pr-3">Source</th>
                    <th className="py-2 pr-3">Attributed</th>
                    <th className="py-2 pr-3">Latest total</th>
                    <th className="py-2 pr-3">Verified</th>
                    <th className="py-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {measurements.map((measurement) => (
                    <tr key={measurement.id} className="border-b border-line/60 align-top">
                      <td className="py-2 pr-3 text-xs text-ink-faint">{formatDateTime(measurement.capturedAt)}</td>
                      <td className="py-2 pr-3 text-xs">{measurement.source.replace(/_/g, " ")}</td>
                      <td className="py-2 pr-3 tabular-nums">{measurement.attributedCount === null ? "—" : formatNumber(measurement.attributedCount)}</td>
                      <td className="py-2 pr-3 tabular-nums">{measurement.latestCount === null ? "—" : formatNumber(measurement.latestCount)}</td>
                      <td className="py-2 pr-3">
                        <Badge tone={measurement.isVerified ? "success" : "neutral"}>{measurement.isVerified ? "Yes" : "No"}</Badge>
                      </td>
                      <td className="py-2 text-xs text-ink-faint">{measurement.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {refunds.length > 0 && (
        <Card>
          <CardHeader title="Refunds" />
          <CardBody className="space-y-2">
            {refunds.map((refund) => (
              <div key={refund.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3 text-sm">
                <div>
                  <p className="font-medium">{formatPaise(refund.amountPaise)}</p>
                  <p className="text-xs text-ink-faint">{refund.reason}</p>
                </div>
                <div className="text-right text-xs">
                  <Badge tone={refund.status === "processed" ? "success" : refund.status === "rejected" ? "danger" : "warn"}>{refund.status}</Badge>
                  <p className="mt-1 text-ink-faint">{formatDateTime(refund.processedAt ?? refund.createdAt)}</p>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Audit trail" description="Server-recorded events for this order." />
        <OrderTimeline events={events} />
      </Card>

      <p className="text-xs leading-relaxed text-ink-faint">
        This report is generated from data stored on our servers. It is not an Instagram analytics export. Where a platform
        does not expose a metric, this report says &ldquo;Metric unavailable&rdquo; rather than estimating.
      </p>
    </div>
  );
}
