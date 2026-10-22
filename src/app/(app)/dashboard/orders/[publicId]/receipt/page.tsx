import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getOrderForViewer } from "@/lib/orders/service";
import { formatDateTime } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { Card, CardBody } from "@/components/ui/primitives";
import { PrintButton } from "@/components/app/print-button";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({ params }: { params: Promise<{ publicId: string }> }) {
  const user = await requireUser();
  const { publicId } = await params;
  const detail = await getOrderForViewer(publicId, user);
  if (!detail) notFound();
  const { order, service, payments } = detail;
  const payment = payments.find((p) => p.status === "paid" || p.status === "partially_refunded" || p.status === "refunded");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/dashboard/orders/${order.publicId}`} className="text-sm text-ink-soft hover:text-ink">
          ← Back to order
        </Link>
        <PrintButton label="Print receipt" />
      </div>

      <Card>
        <CardBody className="space-y-6 p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-bold">Amplifi</p>
              <p className="text-xs text-ink-faint">Campaign platform · India</p>
            </div>
            <div className="text-right text-xs text-ink-faint">
              <p className="font-semibold uppercase tracking-wide text-ink">Receipt</p>
              <p>{payment?.receiptNumber ?? "—"}</p>
              <p>Order {order.publicId}</p>
              <p>{formatDateTime(order.paidAt ?? order.createdAt)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Billed to</p>
              <p className="mt-1 font-medium">{user.name}</p>
              <p className="text-ink-soft">{user.email}</p>
              {user.company && <p className="text-ink-soft">{user.company}</p>}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Payment</p>
              <p className="mt-1 font-medium">{payment ? `${payment.provider} · ${payment.status}` : "Not paid"}</p>
              {payment?.providerPaymentId && <p className="break-all text-xs text-ink-soft">Ref: {payment.providerPaymentId}</p>}
              {payment?.method && <p className="text-xs text-ink-soft">Method: {payment.method}</p>}
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="py-2">Description</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line/60">
                <td className="py-2">
                  {service.name}
                  <span className="block text-xs text-ink-faint">
                    {order.quantity.toLocaleString("en-IN")} {service.unitLabel} · {order.targetUrl}
                  </span>
                </td>
                <td className="py-2 text-right tabular-nums">{formatPaise(order.subtotalPaise)}</td>
              </tr>
              {order.discountPaise > 0 && (
                <tr className="border-b border-line/60 text-success">
                  <td className="py-2">Discount {order.couponCode ? `(${order.couponCode})` : ""}</td>
                  <td className="py-2 text-right tabular-nums">−{formatPaise(order.discountPaise)}</td>
                </tr>
              )}
              <tr className="border-b border-line/60">
                <td className="py-2">GST</td>
                <td className="py-2 text-right tabular-nums">{formatPaise(order.taxPaise)}</td>
              </tr>
              <tr className="font-semibold">
                <td className="py-2">Total</td>
                <td className="py-2 text-right tabular-nums">{formatPaise(order.totalPaise)}</td>
              </tr>
              {order.refundAmountPaise > 0 && (
                <tr className="text-info">
                  <td className="py-2">Refunded</td>
                  <td className="py-2 text-right tabular-nums">−{formatPaise(order.refundAmountPaise)}</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="border-t border-line pt-4 text-xs leading-relaxed text-ink-faint">
            <p>
              This receipt covers platform and campaign services. Follower, view and like counts are never guaranteed.
              Where a provider cannot measure a metric, the order report states &ldquo;Metric unavailable&rdquo;.
            </p>
            <p className="mt-2">
              {payment?.provider === "mock"
                ? "DEMO RECEIPT — this payment was simulated and no money changed hands."
                : "Payment processed by Razorpay. Retain this receipt for your records."}
            </p>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
