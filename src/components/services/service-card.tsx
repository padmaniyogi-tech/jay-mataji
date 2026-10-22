import Link from "next/link";
import type { Service } from "@/lib/db/schema";
import { formatPaise } from "@/lib/money";
import { formatNumber } from "@/lib/format";
import { Badge } from "@/components/ui/primitives";
import { ServiceIcon } from "./service-icon";

export function ServiceCard({ service }: { service: Service }) {
  const isQuote = service.unitLabel !== "creator deliverables";
  return (
    <Link
      href={`/services/${service.slug}`}
      className="group surface flex h-full flex-col p-5 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lift"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 transition group-hover:bg-brand-100">
          <ServiceIcon kind={service.kind} />
        </span>
        {service.requiresManualReview ? (
          <Badge tone="info">Managed campaign</Badge>
        ) : (
          <Badge tone="progress">Ad delivery</Badge>
        )}
      </div>
      <h3 className="mt-4 text-base font-semibold text-ink">{service.name}</h3>
      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-soft">{service.tagline}</p>
      <div className="mt-4 flex items-end justify-between border-t border-line pt-3">
        <div>
          <p className="text-xs text-ink-faint">From</p>
          <p className="text-sm font-semibold text-ink">
            {isQuote ? `${formatPaise(service.unitPricePaise)} / ${service.unitLabel}` : `${formatPaise(service.unitPricePaise)} / deliverable`}
            {service.fixedFeePaise > 0 && (
              <span className="ml-1 text-xs font-normal text-ink-faint">+ {formatPaise(service.fixedFeePaise)} fee</span>
            )}
          </p>
        </div>
        <p className="text-xs text-ink-faint">
          {formatNumber(service.minQuantity)}–{formatNumber(service.maxQuantity)} {isQuote ? service.unitLabel : "units"}
        </p>
      </div>
    </Link>
  );
}
