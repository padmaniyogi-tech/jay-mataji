import type { Order } from "@/lib/db/schema";
import { formatDateTime, formatNumber } from "@/lib/format";
import { Alert, Progress } from "@/components/ui/primitives";
import { DemoDataBadge } from "./status-badge";

const SOURCE_LABEL: Record<string, string> = {
  provider_api: "Provider API (first-party platform insights)",
  provider_report: "Provider delivery report",
  manual_verification: "Manual verification by the campaign team",
  demo_simulation: "Demo simulation (no external request)",
  unavailable: "No measurement available",
};

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-canvas/50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] leading-snug text-ink-faint">{hint}</p>}
    </div>
  );
}

export function MeasurementPanel({ order, unitLabel = "units" }: { order: Order; unitLabel?: string }) {
  const demo = order.measurementSource === "demo_simulation";
  const bestDelivered = order.verifiedCount ?? order.attributedCount ?? null;
  const percent =
    bestDelivered !== null ? Math.min(Math.round((bestDelivered / Math.max(order.quantity, 1)) * 100), 100) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">Delivery measurement</p>
          <p className="text-xs text-ink-faint">
            Source: {SOURCE_LABEL[order.measurementSource] ?? order.measurementSource}
            {order.lastMeasuredAt ? ` · ${formatDateTime(order.lastMeasuredAt)}` : ""}
          </p>
        </div>
        {demo && <DemoDataBadge />}
      </div>

      <Progress value={percent} label={`Attributed to this campaign (${unitLabel})`} demo={demo} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Metric label="Requested target" value={`${formatNumber(order.quantity)} units`} />
        <Metric
          label="Provider reported"
          value={order.providerReportedCount === null ? "Metric unavailable" : formatNumber(order.providerReportedCount)}
          hint="What the delivery partner says it delivered."
        />
        <Metric
          label="Verified"
          value={order.verifiedCount === null ? "Not verified yet" : formatNumber(order.verifiedCount)}
          hint="Confirmed against provider evidence or staff verification."
        />
        <Metric
          label="Latest measured total"
          value={order.latestCount === null ? "Metric unavailable" : formatNumber(order.latestCount)}
          hint="Platform total, if exposed. Includes organic activity."
        />
        <Metric
          label="Organic growth"
          value={order.organicCount === null ? "Not attributable" : formatNumber(order.organicCount)}
          hint="Never inferred from total-count changes."
        />
        <Metric
          label="Remaining target"
          value={order.remainingTarget === null ? "Metric unavailable" : formatNumber(order.remainingTarget)}
        />
      </div>

      {demo && (
        <Alert tone="demo" title="DEMO DATA — NOT REAL INSTAGRAM ENGAGEMENT">
          These numbers come from the local simulator. Nothing was sent to Instagram and no real followers, views or likes
          were created. Production orders show provider-reported evidence instead.
        </Alert>
      )}
      {!demo && order.measurementSource === "unavailable" && (
        <Alert tone="neutral" title="Metric unavailable">
          No legitimate measurement exists for this order yet. We will not display a guessed number.
        </Alert>
      )}
      {order.measurementSource === "provider_api" && (
        <Alert tone="info" title="About ad-attributed metrics">
          These figures are reported by the advertising platform for this campaign only. Your post or profile&apos;s total
          numbers include organic activity and will differ.
        </Alert>
      )}
      {order.measurementNotes && <p className="text-xs leading-relaxed text-ink-faint">{order.measurementNotes}</p>}
    </div>
  );
}
