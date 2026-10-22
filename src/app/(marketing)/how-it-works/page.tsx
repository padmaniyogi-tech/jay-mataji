import type { Metadata } from "next";
import { CheckCircle2, Clock, CreditCard, GitBranch, ShieldCheck, XCircle } from "lucide-react";
import { Alert, Badge, Card } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { ORDER_STATUS_META, ORDER_STATUSES } from "@/lib/orders/status";

export const metadata: Metadata = {
  title: "How delivery works",
  description:
    "The full Amplifi workflow: validation, server-side pricing, payment verification, provider routing, submission, polling, evidence reconciliation and refunds.",
};

const PHASES = [
  {
    icon: ShieldCheck,
    title: "1. Validation before money moves",
    body: "The URL is parsed against Instagram's public URL shapes, matched to the service (profile vs post/Reel), and checked against quantity limits, service availability and your account state. Prices are recalculated on the server with the platform tax and any valid coupon.",
  },
  {
    icon: CreditCard,
    title: "2. Payment verified server-side",
    body: "Razorpay collects payment. We only mark an order paid after verifying the gateway signature and fetching the payment, and the captured amount must match the order exactly. Duplicate webhooks are de-duplicated by event id.",
  },
  {
    icon: GitBranch,
    title: "3. Transactional outbox → routing",
    body: "Payment verification writes an outbox row in the same database transaction. A dispatcher turns it into a durable job, so a committed payment can never lose its dispatch. The router scores eligible providers by capability, availability, cost, duration and reliability.",
  },
  {
    icon: Clock,
    title: "4. Submission with idempotency",
    body: "Provider submission carries a stable idempotency key derived from the order. Transient failures retry with exponential backoff; permanent failures stop immediately and open a refund review. No duplicate paid campaigns.",
  },
  {
    icon: CheckCircle2,
    title: "5. Polling + webhooks + reconciliation",
    body: "Progress is polled from the provider and verified webhooks are accepted. Each reading is stored as an immutable measurement with its source. When delivery ends, the final result is reconciled to completed, partially completed or failed.",
  },
  {
    icon: XCircle,
    title: "6. Refunds are financial decisions",
    body: "Customers can request cancellation or a refund. Finance approves amounts (never above the captured payment minus prior refunds), and the refund job executes exactly once, recording the gateway reference.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="container-page py-12">
      <div className="max-w-3xl">
        <Badge tone="progress">Delivery engine</Badge>
        <h1 className="mt-4 text-4xl font-bold">What happens after you click “Start order”</h1>
        <p className="mt-3 text-base leading-relaxed text-ink-soft">
          Ordering a campaign is not the same thing as generating engagement. This page documents exactly what the
          platform does, what requires an external provider, and where we deliberately stop.
        </p>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {PHASES.map((phase) => (
          <Card key={phase.title} className="p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <phase.icon className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="mt-3 text-base font-semibold">{phase.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{phase.body}</p>
          </Card>
        ))}
      </div>

      <section className="mt-12">
        <h2 className="text-2xl font-bold">The order state machine</h2>
        <p className="mt-2 max-w-3xl text-sm text-ink-soft">
          Every transition is validated on the server against an explicit allow-list and the actor&apos;s role. Customers
          can never mark an order complete or alter verified results.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ORDER_STATUSES.map((status) => (
            <div key={status} className="surface p-4">
              <p className="text-sm font-semibold">{ORDER_STATUS_META[status].label}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">{ORDER_STATUS_META[status].description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12 grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Measurement definitions</h2>
          <dl className="mt-3 space-y-3 text-sm">
            {[
              ["Requested target", "The quantity you ordered — shown for every order."],
              ["Baseline", "A legitimate starting measurement, if the provider exposes one."],
              ["Provider-reported", "The partner's own delivery number. Not verified by default."],
              ["Attributed", "The slice credibly attributed to this campaign, never your total account delta."],
              ["Verified", "Confirmed against provider evidence or staff verification."],
              ["Remaining target", "Requested minus the best available delivered number."],
            ].map(([term, definition]) => (
              <div key={term}>
                <dt className="font-semibold text-ink">{term}</dt>
                <dd className="text-ink-soft">{definition}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card className="p-6">
          <h2 className="text-lg font-semibold">What requires external credentials</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-soft">
            <li>
              <strong>Meta advertising:</strong> ad account, payment method, linked Page, <code>ads_management</code> app
              review and a creative source. Without them the provider stays unconfigured and orders route to managed
              review instead.
            </li>
            <li>
              <strong>Approved agency:</strong> a contracted partner implementing our documented API and passing a sandbox
              test campaign.
            </li>
            <li>
              <strong>Creator network:</strong> staffed campaign operations; deliverables are verified manually.
            </li>
            <li>
              <strong>Payments:</strong> Razorpay keys plus a verified webhook endpoint.
            </li>
            <li>
              <strong>Email:</strong> an SMTP provider for real delivery (console capture in demo).
            </li>
          </ul>
          <Alert tone="warn" className="mt-4">
            We never claim a provider is live until its credentials, API calls, webhook verification and delivery workflow
            have been tested in this environment.
          </Alert>
        </Card>
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <ButtonLink href="/services">Browse services</ButtonLink>
        <ButtonLink href="/contact" variant="secondary">
          Talk to the team
        </ButtonLink>
      </div>
    </div>
  );
}
