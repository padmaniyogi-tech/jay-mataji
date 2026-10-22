import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { servicePackages, type ServicePackage } from "@/lib/db/schema";
import { getServiceBySlug } from "@/lib/orders/service";
import { getSessionUser } from "@/lib/auth/session";
import { getPlatformSettings } from "@/lib/settings";
import { describeProviderAvailability } from "@/lib/providers/status";
import { formatNumber } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { Alert, Badge, Card } from "@/components/ui/primitives";
import { ServiceIcon } from "@/components/services/service-icon";
import { OrderForm } from "@/components/orders/order-form";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const service = await getServiceBySlug(slug);
  if (!service) return { title: "Service not found" };
  return { title: service.name, description: service.tagline };
}

export default async function ServiceDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = await getServiceBySlug(slug);
  if (!service || !service.active) notFound();

  const [packages, user, settings, availability] = await Promise.all([
    db.select().from(servicePackages).where(eq(servicePackages.serviceId, service.id)).orderBy(servicePackages.sortOrder),
    getSessionUser(),
    getPlatformSettings(),
    describeProviderAvailability(service.kind),
  ]);

  const activePackages = packages.filter((p: ServicePackage) => p.active);

  return (
    <div className="container-page py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-ink-faint">
        <Link href="/services" className="hover:text-brand-700">
          Services
        </Link>{" "}
        <span aria-hidden>/</span> <span className="text-ink-soft">{service.name}</span>
      </nav>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <ServiceIcon kind={service.kind} className="h-6 w-6" />
              </span>
              <Badge tone={service.requiresManualReview ? "info" : "progress"}>
                {service.requiresManualReview ? "Managed campaign" : "Authorized ad delivery"}
              </Badge>
            </div>
            <h1 className="mt-4 text-3xl font-bold sm:text-4xl">{service.name}</h1>
            <p className="mt-3 text-base leading-relaxed text-ink-soft">{service.description}</p>
          </div>

          <Card className="p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">Pricing</h2>
            <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
              <p className="text-2xl font-bold">
                {formatPaise(service.unitPricePaise)}
                <span className="text-sm font-medium text-ink-faint"> / {service.unitLabel}</span>
              </p>
              {service.fixedFeePaise > 0 && (
                <p className="text-sm text-ink-soft">
                  + {formatPaise(service.fixedFeePaise)} campaign management fee
                </p>
              )}
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-ink-faint">Quantity range</dt>
                <dd className="font-medium">
                  {formatNumber(service.minQuantity)} – {formatNumber(service.maxQuantity)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-faint">Step</dt>
                <dd className="font-medium">{formatNumber(service.quantityStep)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-faint">Estimated duration</dt>
                <dd className="font-medium">{service.estimatedDurationHours} hours</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-ink-faint">
              Taxes: {settings.taxLabel}. Prices are recalculated server-side at checkout; the browser cannot change them.
            </p>
          </Card>

          <Card className="p-5">
            <h2 className="text-lg font-semibold">Delivery status in this environment</h2>
            <Alert tone={availability.demoOnly ? "demo" : availability.usable ? "info" : "warn"} title={availability.headline} className="mt-3">
              {availability.detail}
            </Alert>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-ink-faint">Authorized</dt>
                <dd className="font-semibold">{availability.configured}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-faint">Managed</dt>
                <dd className="font-semibold">{availability.manual}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-faint">Demo</dt>
                <dd className="font-semibold">{availability.demo}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-faint">Unconfigured</dt>
                <dd className="font-semibold">{availability.unavailable}</dd>
              </div>
            </dl>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="p-5">
              <h2 className="text-base font-semibold">Eligibility</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{service.eligibility}</p>
            </Card>
            <Card className="p-5">
              <h2 className="text-base font-semibold">Limitations</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{service.limitations}</p>
            </Card>
          </div>

          <Card className="p-5">
            <h2 className="text-lg font-semibold">What you will see in your report</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {[
                ["Requested target", `The ${service.unitLabel} quantity you ordered.`],
                ["Baseline measurement", "Only if a legitimate starting measurement exists."],
                ["Provider-reported", "What the delivery partner says it delivered."],
                ["Verified", "Confirmed against provider evidence or staff verification."],
                ["Organic growth", "Never inferred. Shown only if a provider reports it separately."],
                ["Metric unavailable", "Shown instead of a number when nothing can be measured."],
              ].map(([title, body]) => (
                <div key={title} className="rounded-xl border border-line bg-canvas/50 p-3">
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-soft">{body}</p>
                </div>
              ))}
            </div>
            {service.metadata?.notes && service.metadata.notes.length > 0 && (
              <ul className="mt-4 space-y-1 text-xs text-ink-faint">
                {service.metadata.notes.map((note) => (
                  <li key={note}>• {note}</li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="lg:sticky lg:top-24">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Start an order</h2>
              <Badge tone="neutral">{service.estimatedDurationHours}h est.</Badge>
            </div>
            <p className="mt-1 text-sm text-ink-soft">
              {user ? "You'll review and pay on the next step." : "Sign in to place this order. No card details are stored."}
            </p>
            <div className="mt-5">
              <OrderForm
                service={{
                  slug: service.slug,
                  name: service.name,
                  kind: service.kind,
                  unitLabel: service.unitLabel,
                  unitPricePaise: service.unitPricePaise,
                  fixedFeePaise: service.fixedFeePaise,
                  minQuantity: service.minQuantity,
                  maxQuantity: service.maxQuantity,
                  quantityStep: service.quantityStep,
                  estimatedDurationHours: service.estimatedDurationHours,
                  requiresContentUrl: service.requiresContentUrl,
                  requiresAudience: service.requiresAudience,
                  requiresBrief: service.requiresBrief,
                  requiresManualReview: service.requiresManualReview,
                  limitations: service.limitations,
                  eligibility: service.eligibility,
                }}
                packages={activePackages.map((pkg) => ({
                  id: pkg.id,
                  name: pkg.name,
                  description: pkg.description,
                  quantity: pkg.quantity,
                  pricePaise: pkg.pricePaise,
                }))}
                authenticated={Boolean(user)}
              />
            </div>
          </Card>
          <p className="mt-4 px-1 text-xs leading-relaxed text-ink-faint">
            By continuing you agree to the{" "}
            <Link href="/legal/terms" className="link">
              terms
            </Link>
            ,{" "}
            <Link href="/legal/refund" className="link">
              refund policy
            </Link>{" "}
            and confirm you are authorized to promote this account.
          </p>
        </div>
      </div>
    </div>
  );
}
