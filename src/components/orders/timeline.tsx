import type { OrderEvent } from "@/lib/db/schema";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/primitives";
import { StatusBadge } from "./status-badge";

const KIND_LABEL: Record<string, string> = {
  created: "Order created",
  payment: "Payment",
  submitted: "Provider",
  progress: "Progress",
  partial_delivery: "Partial delivery",
  delivered: "Delivered",
  failed: "Failed",
  cancelled: "Cancellation",
  refund: "Refund",
  note: "Note",
  status_change: "Status",
  measurement: "Evidence",
};

export function OrderTimeline({ events, showActor = false }: { events: OrderEvent[]; showActor?: boolean }) {
  if (events.length === 0) {
    return <p className="px-5 py-6 text-sm text-ink-faint">No activity recorded yet.</p>;
  }
  return (
    <ol className="divide-y divide-line/70">
      {events.map((event) => (
        <li key={event.id} className="flex gap-3 px-5 py-3.5">
          <div className="flex flex-col items-center pt-1">
            <span className="h-2 w-2 rounded-full bg-brand-400" aria-hidden />
            <span className="mt-1 w-px flex-1 bg-line" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{KIND_LABEL[event.kind] ?? event.kind}</Badge>
              {event.toStatus && <StatusBadge status={event.toStatus} />}
              <span className="text-xs text-ink-faint">{formatDateTime(event.createdAt)}</span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{event.message}</p>
            {showActor && (
              <p className="mt-1 text-xs text-ink-faint">
                Actor: {event.actorLabel} ({event.actorRole ?? "system"})
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
