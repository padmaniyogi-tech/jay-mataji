/** UI-safe order status metadata (no database imports — used by client components). */

export const ORDER_STATUSES = [
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
] as const;

export type OrderStatusName = (typeof ORDER_STATUSES)[number];

export type StatusTone = "neutral" | "info" | "progress" | "success" | "warn" | "danger";

export const ORDER_STATUS_META: Record<
  OrderStatusName,
  { label: string; tone: StatusTone; description: string; terminal: boolean }
> = {
  pending_payment: {
    label: "Awaiting payment",
    tone: "warn",
    description: "Order created. Delivery starts only after payment is verified.",
    terminal: false,
  },
  paid: {
    label: "Paid",
    tone: "info",
    description: "Payment verified. The order is being prepared for routing.",
    terminal: false,
  },
  pending_review: {
    label: "In review",
    tone: "warn",
    description: "Our team is checking eligibility and creative requirements before routing.",
    terminal: false,
  },
  pending_provider: {
    label: "Awaiting provider",
    tone: "warn",
    description: "No eligible delivery partner is currently configured for this service. The team is notified.",
    terminal: false,
  },
  queued: {
    label: "Queued",
    tone: "info",
    description: "Assigned to an eligible provider and queued for submission.",
    terminal: false,
  },
  in_progress: {
    label: "In progress",
    tone: "progress",
    description: "The campaign is live with the delivery partner.",
    terminal: false,
  },
  partially_completed: {
    label: "Partially delivered",
    tone: "warn",
    description: "Delivery ended below the requested target. A partial refund may apply.",
    terminal: false,
  },
  completed: {
    label: "Completed",
    tone: "success",
    description: "The verified delivery report has been reconciled.",
    terminal: true,
  },
  failed: {
    label: "Failed",
    tone: "danger",
    description: "Delivery could not be completed. A refund review has been raised.",
    terminal: true,
  },
  cancellation_requested: {
    label: "Cancellation requested",
    tone: "warn",
    description: "Your cancellation request is being reviewed against the provider's status.",
    terminal: false,
  },
  cancelled: {
    label: "Cancelled",
    tone: "neutral",
    description: "The campaign was cancelled before completion.",
    terminal: true,
  },
  refund_pending: {
    label: "Refund pending",
    tone: "warn",
    description: "A refund is authorised and queued with the payment gateway.",
    terminal: false,
  },
  partially_refunded: {
    label: "Partially refunded",
    tone: "info",
    description: "A partial refund was processed for the undelivered portion.",
    terminal: true,
  },
  refunded: {
    label: "Refunded",
    tone: "info",
    description: "The order was refunded in full.",
    terminal: true,
  },
};

export const ACTIVE_STATUSES: OrderStatusName[] = [
  "paid",
  "pending_review",
  "pending_provider",
  "queued",
  "in_progress",
  "partially_completed",
  "cancellation_requested",
  "refund_pending",
];

export const FAILED_STATUSES: OrderStatusName[] = ["failed", "cancelled", "partially_refunded", "refunded"];

export function isActiveStatus(status: string): boolean {
  return (ACTIVE_STATUSES as string[]).includes(status);
}

export function statusLabel(status: string): string {
  return ORDER_STATUS_META[status as OrderStatusName]?.label ?? status;
}
