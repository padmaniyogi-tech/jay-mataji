import { requirePermission } from "@/lib/auth/session";
import { listProvidersWithHealth } from "@/lib/admin/service";
import { formatDateTime, formatNumber } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { Alert, Badge, Card, CardBody, CardHeader, StatCard } from "@/components/ui/primitives";
import { ProviderConfigForm, ProviderTestButton } from "@/components/admin/provider-forms";

export const dynamic = "force-dynamic";

const HEALTH_TONE: Record<string, "success" | "warn" | "danger" | "neutral" | "info"> = {
  healthy: "success",
  degraded: "warn",
  unhealthy: "danger",
  unconfigured: "neutral",
  unknown: "info",
};

const KIND_LABEL: Record<string, string> = {
  mock: "Demo simulator",
  manual: "Manual / creator team",
  meta: "Authorized ad campaign (Meta)",
  agency: "Approved external agency",
};

export default async function AdminProvidersPage() {
  const staff = await requirePermission("providers:read");
  const rows = await listProvidersWithHealth();
  const isAdmin = staff.role === "admin";

  const configured = rows.filter((row) => row.configured).length;
  const healthy = rows.filter((row) => row.health === "healthy").length;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Delivery providers</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Routing uses only enabled, configured providers, ordered by compatibility, price, ETA and reliability.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Providers" value={formatNumber(rows.length)} />
        <StatCard label="Configured" value={formatNumber(configured)} hint="Credentials present and adapter usable" />
        <StatCard label="Healthy" value={formatNumber(healthy)} hint="Passed the most recent health check" tone={healthy > 0 ? "success" : "warn"} />
      </div>

      <Alert tone="info" title="Status is evidence-based">
        An integration is only marked healthy after a successful live API call. Meta Ads and agency adapters stay
        &ldquo;unconfigured&rdquo; until real credentials are added and a test campaign completes — this platform never
        claims an integration is live before that.
      </Alert>

      {rows.map((provider) => (
        <Card key={provider.id}>
          <CardHeader
            title={
              <span className="flex flex-wrap items-center gap-2">
                {provider.name}
                <Badge tone={HEALTH_TONE[provider.health] ?? "neutral"}>{provider.health}</Badge>
                <Badge tone={provider.enabled ? "success" : "neutral"}>{provider.enabled ? "routing enabled" : "disabled"}</Badge>
                {provider.adapterKinds.includes("mock") && <Badge tone="demo">demo only</Badge>}
              </span>
            }
            description={`${KIND_LABEL[provider.kind] ?? provider.kind} · key ${provider.key} · priority ${provider.priority} · reliability ${provider.reliabilityScore}`}
            action={isAdmin ? <ProviderTestButton providerId={provider.id} /> : undefined}
          />
          <CardBody className="space-y-4">
            <dl className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="font-semibold uppercase tracking-wide text-ink-faint">Supports</dt>
                <dd className="mt-0.5 text-ink">{provider.supportedKinds.join(", ") || "—"}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-wide text-ink-faint">Quantity range</dt>
                <dd className="mt-0.5 tabular-nums text-ink">
                  {formatNumber(provider.minQuantity)} – {formatNumber(provider.maxQuantity)}
                </dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-wide text-ink-faint">Cost / unit</dt>
                <dd className="mt-0.5 tabular-nums text-ink">{formatPaise(provider.costPerUnitPaise)}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-wide text-ink-faint">Last check</dt>
                <dd className="mt-0.5 text-ink">{formatDateTime(provider.lastHealthCheckAt)}</dd>
              </div>
            </dl>

            {provider.lastHealthMessage && <p className="text-xs text-ink-soft">Last check: {provider.lastHealthMessage}</p>}
            {provider.lastError && <p className="text-xs font-medium text-danger">Last error: {provider.lastError}</p>}
            <p className="break-all text-xs text-ink-faint">Credentials: {provider.maskedCredentials || "none stored"}</p>

            {isAdmin ? (
              <ProviderConfigForm
                providerId={provider.id}
                kind={provider.kind}
                enabled={provider.enabled}
                priority={provider.priority}
                reliabilityScore={provider.reliabilityScore}
                minQuantity={provider.minQuantity}
                maxQuantity={provider.maxQuantity}
                costPerUnitPaise={provider.costPerUnitPaise}
                durationHours={provider.estimatedDurationHours}
              />
            ) : (
              <p className="text-xs text-ink-faint">Administrator role required to change provider settings.</p>
            )}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
