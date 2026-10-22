import type { Metadata } from "next";
import { listActiveServices } from "@/lib/orders/service";
import { ServiceCard } from "@/components/services/service-card";
import { Alert, Badge } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Services & pricing",
  description:
    "Instagram follower, Reel view, video view, like, content promotion, influencer and advertising campaigns with transparent per-unit pricing and eligibility rules.",
};

export default async function ServicesPage() {
  const services = await listActiveServices();

  return (
    <div className="container-page py-12">
      <div className="max-w-3xl">
        <Badge tone="progress">Catalog</Badge>
        <h1 className="mt-4 text-4xl font-bold">Services with honest mechanics</h1>
        <p className="mt-3 text-base leading-relaxed text-ink-soft">
          Every service page explains what is actually delivered, which authorized mechanism is used, what you must
          provide, and what cannot be guaranteed. Unit prices are in INR and GST is added at checkout.
        </p>
      </div>

      <Alert tone="info" title="How quantities work" className="mt-8">
        You choose a target quantity (followers, views, likes, impressions or creator deliverables). After payment the
        routing engine selects a provider that supports that service and quantity. Providers report what they delivered;
        verified numbers are shown separately from provider-reported ones, and organic growth is never counted as
        campaign delivery.
      </Alert>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((service) => (
          <ServiceCard key={service.id} service={service} />
        ))}
      </div>

      <div className="mt-12 grid gap-4 md:grid-cols-2">
        <div className="surface p-6">
          <h2 className="text-lg font-semibold">What we never sell</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-soft">
            <li>• Fake accounts, bot followers, automated likes or artificial views.</li>
            <li>• Guaranteed follower, view or like counts.</li>
            <li>• Instagram passwords, session cookies or scraped data.</li>
            <li>• “Instant” delivery that cannot be evidenced by an authorized provider.</li>
          </ul>
        </div>
        <div className="surface p-6">
          <h2 className="text-lg font-semibold">How delivery is evidenced</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-soft">
            <li>• Authorized ads: first-party ad insights from the platform.</li>
            <li>• Approved partners: signed delivery reports, reconciled against the order.</li>
            <li>• Creators: staff-verified deliverables with links and screenshots.</li>
            <li>• Nothing measurable? The order shows “Metric unavailable”.</li>
          </ul>
        </div>
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-6">
        <div>
          <p className="text-base font-semibold">Not sure which service fits?</p>
          <p className="mt-1 text-sm text-ink-soft">Open a support ticket after signing up, or read the delivery guide first.</p>
        </div>
        <div className="flex gap-2">
          <ButtonLink href="/how-it-works" variant="secondary">
            Delivery guide
          </ButtonLink>
          <ButtonLink href="/register">Create account</ButtonLink>
        </div>
      </div>
    </div>
  );
}
