"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/primitives";
import { callApi } from "@/components/app/action-button";
import type { PlatformSettings } from "@/lib/settings";

export function SettingsForm({ settings }: { settings: PlatformSettings }) {
  const router = useRouter();
  const [form, setForm] = useState({
    taxRatePercent: String(settings.taxRateBps / 100),
    taxLabel: settings.taxLabel,
    supportEmail: settings.supportEmail,
    refundWindowDays: String(settings.refundWindowDays),
    maxActiveOrdersPerUser: String(settings.maxActiveOrdersPerUser),
    autoRouteEnabled: settings.autoRouteEnabled,
    demoBanner: settings.demoBanner,
    maintenanceMessage: settings.maintenanceMessage ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const result = await callApi("/api/admin/settings/action", {
        taxRatePercent: Number(form.taxRatePercent),
        taxLabel: form.taxLabel,
        supportEmail: form.supportEmail,
        refundWindowDays: Number(form.refundWindowDays),
        maxActiveOrdersPerUser: Number(form.maxActiveOrdersPerUser),
        autoRouteEnabled: form.autoRouteEnabled,
        demoBanner: form.demoBanner,
        maintenanceMessage: form.maintenanceMessage.trim() ? form.maintenanceMessage.trim() : null,
      });
      if (!result.ok) {
        setError(result.error?.message ?? "Could not save settings.");
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tax rate (%)" htmlFor="tax-rate" required hint="Applied server-side when quoting and creating orders.">
          <Input id="tax-rate" type="number" step="0.01" min={0} max={50} value={form.taxRatePercent} onChange={(e) => setForm({ ...form, taxRatePercent: e.target.value })} required />
        </Field>
        <Field label="Tax label" htmlFor="tax-label" required>
          <Input id="tax-label" value={form.taxLabel} onChange={(e) => setForm({ ...form, taxLabel: e.target.value })} required maxLength={60} />
        </Field>
        <Field label="Support email" htmlFor="support-email" required>
          <Input id="support-email" type="email" value={form.supportEmail} onChange={(e) => setForm({ ...form, supportEmail: e.target.value })} required />
        </Field>
        <Field label="Refund window (days)" htmlFor="refund-window" required>
          <Input id="refund-window" type="number" min={0} max={120} value={form.refundWindowDays} onChange={(e) => setForm({ ...form, refundWindowDays: e.target.value })} required />
        </Field>
        <Field label="Max active orders per customer" htmlFor="max-active" required>
          <Input id="max-active" type="number" min={1} max={100} value={form.maxActiveOrdersPerUser} onChange={(e) => setForm({ ...form, maxActiveOrdersPerUser: e.target.value })} required />
        </Field>
      </div>

      <div className="space-y-2 rounded-xl border border-line bg-canvas/50 p-3 text-sm">
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={form.autoRouteEnabled} onChange={(e) => setForm({ ...form, autoRouteEnabled: e.target.checked })} className="mt-1 h-4 w-4" />
          <span>
            <strong>Automatic routing</strong>
            <span className="block text-xs text-ink-faint">
              When off, paid orders wait in review for a staff member to assign a provider.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={form.demoBanner} onChange={(e) => setForm({ ...form, demoBanner: e.target.checked })} className="mt-1 h-4 w-4" />
          <span>
            <strong>Show demo banner</strong>
            <span className="block text-xs text-ink-faint">Only rendered when DEMO_MODE is enabled in the environment.</span>
          </span>
        </label>
      </div>

      <Field label="Maintenance message" htmlFor="maintenance" hint="Leave blank for normal operation. Shown as a site-wide banner when set.">
        <Textarea id="maintenance" value={form.maintenanceMessage} onChange={(e) => setForm({ ...form, maintenanceMessage: e.target.value })} maxLength={300} className="min-h-[70px]" />
      </Field>

      {error && <Alert tone="danger">{error}</Alert>}
      {saved && <Alert tone="success">Settings saved.</Alert>}
      <Button type="submit" loading={busy}>
        Save settings
      </Button>
    </form>
  );
}
