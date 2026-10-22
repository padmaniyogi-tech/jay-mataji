import { Badge, Dot, type Tone } from "@/components/ui/primitives";
import { ORDER_STATUS_META, type OrderStatusName } from "@/lib/orders/status";

const MAP: Record<string, Tone> = {
  pending_payment: "warn",
  paid: "info",
  pending_review: "warn",
  pending_provider: "warn",
  queued: "info",
  in_progress: "progress",
  partially_completed: "warn",
  completed: "success",
  failed: "danger",
  cancellation_requested: "warn",
  cancelled: "neutral",
  refund_pending: "warn",
  partially_refunded: "info",
  refunded: "info",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = MAP[status] ?? "neutral";
  const label = ORDER_STATUS_META[status as OrderStatusName]?.label ?? status;
  return (
    <Badge tone={tone}>
      <Dot tone={tone} />
      {label}
    </Badge>
  );
}

export function PaymentBadge({ status }: { status: string }) {
  const map: Record<string, { tone: Tone; label: string }> = {
    pending: { tone: "warn", label: "Payment pending" },
    authorized: { tone: "info", label: "Authorised" },
    paid: { tone: "success", label: "Paid" },
    failed: { tone: "danger", label: "Payment failed" },
    partially_refunded: { tone: "info", label: "Partially refunded" },
    refunded: { tone: "info", label: "Refunded" },
  };
  const item = map[status] ?? { tone: "neutral" as Tone, label: status };
  return <Badge tone={item.tone}>{item.label}</Badge>;
}

export function DemoDataBadge({ className }: { className?: string }) {
  return (
    <Badge tone="demo" className={className}>
      DEMO DATA — NOT REAL INSTAGRAM ENGAGEMENT
    </Badge>
  );
}
