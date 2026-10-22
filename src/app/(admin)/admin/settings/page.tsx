import { requirePermission } from "@/lib/auth/session";
import { getPlatformSettings } from "@/lib/settings";
import { getEnv } from "@/lib/env";
import { Alert, Badge, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { SettingsForm } from "@/components/admin/settings-form";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requirePermission("settings:manage");
  const settings = await getPlatformSettings(true);
  const env = getEnv();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Platform settings</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Commercial settings are stored in the database. Secrets stay in environment variables and are never editable here.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Commercial & routing"
          action={<Badge tone={env.DEMO_MODE ? "demo" : "success"}>{env.DEMO_MODE ? "demo mode" : "live mode"}</Badge>}
        />
        <CardBody>
          <SettingsForm settings={settings} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Environment (read-only)" />
        <CardBody className="grid gap-3 text-xs sm:grid-cols-2">
          <Row label="Payments adapter" value={env.PAYMENTS_PROVIDER ?? "unset"} />
          <Row label="Email adapter" value={env.EMAIL_PROVIDER ?? "unset"} />
          <Row label="Demo mode" value={env.DEMO_MODE ? "enabled" : "disabled"} />
          <Row label="Auto-verify demo emails" value={env.DEMO_AUTO_VERIFY_EMAIL ? "enabled" : "disabled"} />
          <Row label="Mock provider enabled" value={env.MOCK_PROVIDER_ENABLED ? "yes" : "no"} />
          <Row label="Webhook secret configured" value={env.RAZORPAY_WEBHOOK_SECRET ? "yes" : "no"} />
        </CardBody>
      </Card>

      <Alert tone="warn" title="Changing routing">
        Turning off automatic routing sends every paid order to manual review. This is the correct setting when no provider
        is configured for a service — orders must never be silently marked complete.
      </Alert>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 rounded-lg bg-canvas/60 px-3 py-2">
      <span className="text-ink-faint">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}
