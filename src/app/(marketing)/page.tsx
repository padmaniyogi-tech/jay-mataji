import Link from "next/link";
import { ArrowRight, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import { listActiveServices } from "@/lib/orders/service";
import { ServiceCard } from "@/components/services/service-card";
import { ButtonLink } from "@/components/ui/button";
import { Alert, Badge, Card, Progress } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/orders/status-badge";
import { formatPaise } from "@/lib/money";

const STEPS = [
  {
    title: "Pick a service and target",
    body: "Send a profile or post link and the quantity you want. We validate the URL, eligibility and limits before you pay.",
  },
  {
    title: "Pay securely in INR",
    body: "Prices are recalculated on the server. Razorpay handles payment; we never see or store card details.",
  },
  {
    title: "We route it automatically",
    body: "The routing engine picks an eligible provider — authorized ads, an approved partner or a vetted creator — based on service fit and reliability.",
  },
  {
    title: "Track verified results",
    body: "Progress appears only when a real measurement is available. Requested, provider-reported and verified numbers are always shown separately.",
  },
];

export default async function HomePage() {
  const services = await listActiveServices();
  const featured = services.slice(0, 6);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,#efe6ff_0%,transparent_70%)]" />
        <div className="container-page grid gap-12 pb-16 pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pb-24 lg:pt-20">
          <div className="animate-fade-up">
            <Badge tone="progress" className="mb-5">
              <ShieldCheck className="h-3.5 w-3.5" /> Compliant growth, by design
            </Badge>
            <h1 className="text-4xl font-bold leading-[1.05] sm:text-5xl lg:text-[3.4rem]">
              Order Instagram campaigns that <span className="text-brand-700">report real numbers</span> — or say they
              can&apos;t.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-soft">
              Amplifi turns follower, view, like and creator campaigns into a transparent, automated workflow: server-side
              pricing, authorized delivery partners, verified reporting and a dashboard that separates campaign results
              from organic growth.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <ButtonLink href="/services" size="lg">
                Browse services <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink href="/demo" size="lg" variant="secondary">
                Try the 45-second demo <Sparkles className="h-4 w-4" />
              </ButtonLink>
            </div>
            <dl className="mt-9 grid grid-cols-3 gap-4 border-t border-line pt-6 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-ink-faint">Payments</dt>
                <dd className="mt-1 font-semibold text-ink">Razorpay · INR</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-ink-faint">Delivery</dt>
                <dd className="mt-1 font-semibold text-ink">Authorized partners</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-ink-faint">Reporting</dt>
                <dd className="mt-1 font-semibold text-ink">Verified evidence</dd>
              </div>
            </dl>
          </div>

          {/* Product illustration */}
          <div className="animate-fade-up lg:justify-self-end">
            <div className="relative mx-auto w-full max-w-md">
              <div className="absolute -inset-3 -z-10 rounded-[2rem] bg-gradient-to-br from-brand-200/60 via-accent-100/50 to-transparent blur-xl" />
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-line bg-canvas/60 px-5 py-3">
                  <div>
                    <p className="text-xs font-medium text-ink-faint">Campaign · AMP-7K2QX4DY</p>
                    <p className="text-sm font-semibold">Reel views · 10,000 target</p>
                  </div>
                  <Badge tone="demo">Illustration</Badge>
                </div>
                <div className="space-y-5 px-5 py-5">
                  <div className="flex items-center justify-between gap-3">
                    <StatusBadge status="in_progress" />
                    <span className="text-xs text-ink-faint">Meta Ads · reported via insights</span>
                  </div>
                  <Progress value={62} label="Attributed to campaign" />
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-line bg-canvas/50 p-3">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Requested</p>
                      <p className="mt-1 font-semibold tabular-nums">10,000 views</p>
                    </div>
                    <div className="rounded-xl border border-line bg-canvas/50 p-3">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Verified</p>
                      <p className="mt-1 font-semibold tabular-nums">6,240 views</p>
                    </div>
                  </div>
                  <Alert tone="info" title="What this number means">
                    Provider-reported, ad-attributed plays only. Your post&apos;s total view count includes organic traffic
                    and will differ.
                  </Alert>
                  <div className="flex items-center justify-between text-xs text-ink-faint">
                    <span>Est. duration 96h</span>
                    <span>Total ₹4,306 incl. GST</span>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="container-page py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Service catalog</p>
            <h2 className="mt-2 text-3xl font-bold">Choose the outcome you actually need</h2>
            <p className="mt-2 max-w-2xl text-sm text-ink-soft">
              Every service lists real eligibility rules, delivery mechanics and limitations before checkout. Prices are
              per-unit and always recalculated server-side.
            </p>
          </div>
          <ButtonLink href="/services" variant="secondary">
            All services <ArrowRight className="h-4 w-4" />
          </ButtonLink>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-line bg-surface/60 py-16">
        <div className="container-page">
          <p className="eyebrow">How it works</p>
          <h2 className="mt-2 text-3xl font-bold">Automated where it should be. Human where it matters.</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <div key={step.title} className="surface p-5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-base font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="container-page py-16">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <Badge tone="success">
              <CheckCircle2 className="h-3.5 w-3.5" /> What we do
            </Badge>
            <ul className="mt-4 space-y-3 text-sm text-ink-soft">
              {[
                "Authorized Meta advertising through the official Marketing API.",
                "Approved promotional partners with signed delivery reports.",
                "Vetted creators who disclose sponsorships and deliver contracted work.",
                "Server-side price recalculation, idempotent orders and verified webhooks.",
                "Clear \"Metric unavailable\" states instead of invented progress.",
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-6">
            <Badge tone="danger">
              <Sparkles className="h-3.5 w-3.5" /> What we never do
            </Badge>
            <ul className="mt-4 space-y-3 text-sm text-ink-soft">
              {[
                "Fake accounts, bot networks or automated follows, likes and views.",
                "Asking for your Instagram password, session cookies or tokens.",
                "Scraping Instagram or calling unofficial endpoints.",
                "Promising a guaranteed follower, view or like count.",
                "Presenting simulated demo activity as real engagement.",
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span aria-hidden className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-danger" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      {/* CTA */}
      <section className="container-page pb-20">
        <div className="relative overflow-hidden rounded-3xl bg-brand-700 px-6 py-12 text-white sm:px-12">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-brand-500/40 blur-2xl" />
          <div className="relative max-w-2xl">
            <h2 className="text-3xl font-bold text-white">Start with a small, testable campaign.</h2>
            <p className="mt-3 text-sm leading-relaxed text-brand-100">
              Create an account, order a campaign and watch the routing and reporting workflow run. Demo mode lets you
              test the entire journey with simulated delivery — clearly labelled, never presented as real.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href="/register" size="lg" className="bg-white text-brand-800 hover:bg-brand-50">
                Create an account
              </ButtonLink>
              <ButtonLink href="/services" size="lg" variant="ghost" className="text-white hover:bg-brand-600 hover:text-white">
                Compare services
              </ButtonLink>
            </div>
            <p className="mt-4 text-xs text-brand-200">
              Example pricing shown on service pages · GST calculated at checkout · {formatPaise(49900)}+ typical entry
              campaigns
            </p>
          </div>
        </div>
      </section>

      <section className="container-page pb-20">
        <h2 className="text-2xl font-bold">Questions people ask before ordering</h2>
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {[
            {
              q: "Can you guarantee 1,000 followers?",
              a: "No legitimate provider can. Real growth depends on creative, audience fit and platform algorithms. We report what was measurably delivered and refund the undelivered portion where policy allows.",
            },
            {
              q: "Do you need my Instagram password?",
              a: "Never. We work with public URLs, authorized advertising APIs and creator collaborations. We never ask for passwords, cookies or access tokens.",
            },
            {
              q: "How do I know the numbers are real?",
              a: "Each order shows its measurement source. Meta-reported ad metrics and staff-verified creator deliverables are labelled; simulated demo activity is loudly marked DEMO DATA.",
            },
            {
              q: "What if no provider is available for my service?",
              a: "The order goes into a clearly labelled awaiting-provider state, the team is notified, and you can cancel for a refund before delivery starts.",
            },
          ].map((item) => (
            <details key={item.q} className="surface group p-5">
              <summary className="cursor-pointer list-none text-sm font-semibold text-ink marker:hidden">
                <span className="flex items-center justify-between gap-3">
                  {item.q}
                  <span className="text-ink-faint transition group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-2.5 text-sm leading-relaxed text-ink-soft">{item.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-8 text-sm text-ink-faint">
          Still deciding?{" "}
          <Link href="/contact" className="link">
            Talk to the team
          </Link>{" "}
          or read{" "}
          <Link href="/legal/refund" className="link">
            the refund policy
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
