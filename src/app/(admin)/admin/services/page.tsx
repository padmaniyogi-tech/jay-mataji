import { requirePermission } from "@/lib/auth/session";
import { listAllServices } from "@/lib/orders/service";
import { formatNumber } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { Alert, Badge, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { ServicePricingForm } from "@/components/admin/service-form";

export const dynamic = "force-dynamic";

export default async function AdminServicesPage() {
  await requirePermission("services:manage");
  const services = await listAllServices();

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Services &amp; pricing</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Prices are stored in integer paise and always recalculated on the server when an order is created. Saving a price
          here changes future quotes only.
        </p>
      </div>

      <Alert tone="warn" title="Do not promise outcomes">
        Descriptions and reports must never guarantee follower counts, virality or engagement. Services with manual review
        cannot auto-route until a human approves the request.
      </Alert>

      {services.map((service) => (
        <Card key={service.id}>
          <CardHeader
            title={
              <span className="flex flex-wrap items-center gap-2">
                {service.name}
                <Badge tone={service.active ? "success" : "neutral"}>{service.active ? "listed" : "hidden"}</Badge>
                {service.requiresManualReview && <Badge tone="warn">manual review</Badge>}
                <Badge tone="neutral">{service.kind}</Badge>
              </span>
            }
            description={`${service.slug} · ${formatNumber(service.minQuantity)}–${formatNumber(service.maxQuantity)} ${service.unitLabel} · from ${formatPaise(service.unitPricePaise)} per unit`}
          />
          <CardBody>
            <ServicePricingForm
              serviceId={service.id}
              unitPricePaise={service.unitPricePaise}
              minQuantity={service.minQuantity}
              maxQuantity={service.maxQuantity}
              active={service.active}
              requiresManualReview={service.requiresManualReview}
              estimatedDurationHours={service.estimatedDurationHours}
            />
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
