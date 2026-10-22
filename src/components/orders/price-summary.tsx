import type { Order } from "@/lib/db/schema";
import { formatPaise } from "@/lib/money";

export function PriceSummary({ order }: { order: Pick<Order, "unitPricePaise" | "quantity" | "subtotalPaise" | "discountPaise" | "taxPaise" | "totalPaise" | "couponCode" | "refundAmountPaise" | "currency"> }) {
  return (
    <dl className="space-y-1.5 text-sm">
      <div className="flex justify-between">
        <dt className="text-ink-soft">
          {order.quantity.toLocaleString("en-IN")} × {formatPaise(order.unitPricePaise)}
        </dt>
        <dd className="tabular-nums">{formatPaise(order.subtotalPaise)}</dd>
      </div>
      {order.discountPaise > 0 && (
        <div className="flex justify-between text-success">
          <dt>Discount {order.couponCode ? `(${order.couponCode})` : ""}</dt>
          <dd className="tabular-nums">−{formatPaise(order.discountPaise)}</dd>
        </div>
      )}
      <div className="flex justify-between">
        <dt className="text-ink-soft">GST</dt>
        <dd className="tabular-nums">{formatPaise(order.taxPaise)}</dd>
      </div>
      <div className="flex justify-between border-t border-line pt-1.5 text-base font-semibold">
        <dt>Total paid</dt>
        <dd className="tabular-nums">{formatPaise(order.totalPaise)}</dd>
      </div>
      {order.refundAmountPaise > 0 && (
        <div className="flex justify-between text-info">
          <dt>Refunded</dt>
          <dd className="tabular-nums">{formatPaise(order.refundAmountPaise)}</dd>
        </div>
      )}
      <p className="pt-1 text-xs text-ink-faint">All amounts in {order.currency}. GST as configured at order time.</p>
    </dl>
  );
}
