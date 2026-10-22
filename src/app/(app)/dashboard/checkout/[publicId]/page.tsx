import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { buildHandoff, getOrderForViewer } from "@/lib/orders/service";
import { formatDateTime, formatNumber, socialLabel } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { countryName } from "@/lib/countries";
import { Alert, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { PriceSummary } from "@/components/orders/price-summary";
import { PaymentPanel } from "@/components/payments/payment-panel";
import { StatusBadge } from "@/components/orders/status-badge";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({ params }: { params: Promise<{ publicId: string }> }) {
  const user = await requireUser();
  const { publicId } = await params;
  const detail = await getOrderForViewer(publicId, user);
  if (!detail || detail.order.userId !== user.id) notFound();

  const { order, service } = detail;
  if (order.status !== "pending_payment") redirect(`/dashboard/orders/${order.publicId}`);

  let handoff = null;
  let handoffError: string | null = null;
  try {
    handoff = await buildHandoff(order);
  } catch (err) {
    handoffError = (err as Error).message;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm text-ink-faint">
          <Link href={`/dashboard/orders/${order.publicId}`} className="hover:text-ink">
            Order {order.publicId}
          </Link>{" "}
          / Checkout
        </p>
        <h2 className="mt-1 text-2xl font-bold">Complete your payment</h2>
        <p className="mt-1 text-sm text-ink-soft">Payment is verified server-side before the campaign is routed.</p>
      </div>

      {handoffError && (
        <Alert tone="warn" title="Payment gateway issue">
          {handoffError}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader title="Payment" description="Cards, UPI and netbanking are handled by the gateway." />
          <CardBody>
            <PaymentPanel orderPublicId={order.publicId} handoff={handoff} amountPaise={order.totalPaise} />
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Order summary" action={<StatusBadge status={order.status} />} />
            <CardBody className="space-y-3 text-sm">
              <div>
                <p className="font-semibold text-ink">{service.name}</p>
                <p className="text-xs text-ink-faint">{socialLabel(order.targetUrl)}</p>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-ink-faint">Target</dt>
                  <dd className="font-medium text-ink">
                    {formatNumber(order.quantity)} {service.unitLabel}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-faint">Audience</dt>
                  <dd className="font-medium text-ink">{countryName(order.audienceCountry)}</dd>
                </div>
                <div>
                  <dt className="text-ink-faint">Est. duration</dt>
                  <dd className="font-medium text-ink">{service.estimatedDurationHours}h</dd>
                </div>
                <div>
                  <dt className="text-ink-faint">Created</dt>
                  <dd className="font-medium text-ink">{formatDateTime(order.createdAt)}</dd>
                </div>
              </dl>
              <div className="border-t border-line pt-3">
                <PriceSummary order={order} />
              </div>
            </CardBody>
          </Card>

          <Alert tone="neutral" title="No guarantees, no bots">
            We never generate fake followers, likes or views. Delivery comes from authorized advertising, approved partners
            or vetted creators, and results are reported only when measured. Total payable now:{" "}
            <strong>{formatPaise(order.totalPaise)}</strong>.
          </Alert>
        </div>
      </div>
    </div>
  );
}
