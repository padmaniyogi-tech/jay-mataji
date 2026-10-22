"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/primitives";
import { callApi } from "@/components/app/action-button";

export function ProviderTestButton({ providerId, disabled }: { providerId: string; disabled?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const response = await callApi("/api/admin/providers/action", { action: "test", providerId });
      if (!response.ok) {
        setError(response.error?.message ?? "Health check failed.");
        return;
      }
      const data = response.data as { status?: string; message?: string };
      setResult(`${data.status ?? "checked"} — ${data.message ?? ""}`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button size="sm" variant="secondary" onClick={run} loading={loading} disabled={disabled}>
        Run health check
      </Button>
      {result && <p className="max-w-xs text-[11px] text-ink-soft">{result}</p>}
      {error && <p className="max-w-xs text-[11px] font-medium text-danger">{error}</p>}
    </div>
  );
}

const CREDENTIAL_FIELDS: Record<string, Array<{ key: string; label: string }>> = {
  meta: [
    { key: "accessToken", label: "Meta access token" },
    { key: "adAccountId", label: "Ad account ID" },
    { key: "pageId", label: "Facebook page ID" },
  ],
  agency: [
    { key: "baseUrl", label: "Agency API base URL" },
    { key: "apiKey", label: "Agency API key" },
    { key: "webhookSecret", label: "Webhook signing secret" },
  ],
  mock: [],
  manual: [],
};

export function ProviderConfigForm({
  providerId,
  kind,
  enabled,
  priority,
  reliabilityScore,
  minQuantity,
  maxQuantity,
  costPerUnitPaise,
  durationHours,
}: {
  providerId: string;
  kind: string;
  enabled: boolean;
  priority: number;
  reliabilityScore: number;
  minQuantity: number;
  maxQuantity: number;
  costPerUnitPaise: number;
  durationHours: number;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    enabled,
    priority: String(priority),
    reliabilityScore: String(reliabilityScore),
    minQuantity: String(minQuantity),
    maxQuantity: String(maxQuantity),
    costPerUnitPaise: String(costPerUnitPaise),
    durationHours: String(durationHours),
  });
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const fields = CREDENTIAL_FIELDS[kind] ?? [];

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const body: Record<string, unknown> = {
        action: "update",
        providerId,
        enabled: form.enabled,
        priority: Number(form.priority),
        reliabilityScore: Number(form.reliabilityScore),
        minQuantity: Number(form.minQuantity),
        maxQuantity: Number(form.maxQuantity),
        costPerUnitPaise: Number(form.costPerUnitPaise),
        estimatedDurationHours: Number(form.durationHours),
      };
      const cleaned = Object.fromEntries(Object.entries(credentials).filter(([, value]) => value.trim() !== ""));
      if (Object.keys(cleaned).length > 0) body.credentials = cleaned;
      const result = await callApi("/api/admin/providers/action", body);
      if (!result.ok) {
        setError(result.error?.message ?? "Could not save the provider.");
        return;
      }
      setCredentials({});
      setMessage("Provider saved.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <label className="space-y-1">
          <span className="font-medium text-ink-faint">Priority</span>
          <Input value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="h-9 text-xs" />
        </label>
        <label className="space-y-1">
          <span className="font-medium text-ink-faint">Reliability</span>
          <Input value={form.reliabilityScore} onChange={(e) => setForm({ ...form, reliabilityScore: e.target.value })} className="h-9 text-xs" />
        </label>
        <label className="space-y-1">
          <span className="font-medium text-ink-faint">Min qty</span>
          <Input value={form.minQuantity} onChange={(e) => setForm({ ...form, minQuantity: e.target.value })} className="h-9 text-xs" />
        </label>
        <label className="space-y-1">
          <span className="font-medium text-ink-faint">Max qty</span>
          <Input value={form.maxQuantity} onChange={(e) => setForm({ ...form, maxQuantity: e.target.value })} className="h-9 text-xs" />
        </label>
        <label className="space-y-1">
          <span className="font-medium text-ink-faint">Cost / unit (paise)</span>
          <Input value={form.costPerUnitPaise} onChange={(e) => setForm({ ...form, costPerUnitPaise: e.target.value })} className="h-9 text-xs" />
        </label>
        <label className="space-y-1">
          <span className="font-medium text-ink-faint">ETA (hours)</span>
          <Input value={form.durationHours} onChange={(e) => setForm({ ...form, durationHours: e.target.value })} className="h-9 text-xs" />
        </label>
        <label className="space-y-1">
          <span className="font-medium text-ink-faint">Routing</span>
          <Select
            value={form.enabled ? "on" : "off"}
            onChange={(e) => setForm({ ...form, enabled: e.target.value === "on" })}
            className="h-9 text-xs"
          >
            <option value="on">Enabled</option>
            <option value="off">Disabled</option>
          </Select>
        </label>
      </div>

      <button type="button" onClick={() => setOpen(!open)} className="text-xs font-medium text-brand-700 hover:underline">
        {open ? "Hide credentials" : "Add or rotate credentials"}
      </button>

      {open && (
        <div className="space-y-2 rounded-xl border border-line bg-canvas/60 p-3">
          {fields.length === 0 ? (
            <p className="text-xs text-ink-faint">
              This adapter needs no API credentials. Manual providers are operated by staff; the demo provider only runs in
              demo mode.
            </p>
          ) : (
            fields.map((field) => (
              <Field key={field.key} label={field.label} htmlFor={`cred-${field.key}`} hint="Encrypted at rest with AES-256-GCM; never returned to the browser.">
                <Input
                  id={`cred-${field.key}`}
                  type="password"
                  autoComplete="off"
                  value={credentials[field.key] ?? ""}
                  onChange={(e) => setCredentials({ ...credentials, [field.key]: e.target.value })}
                  placeholder="Leave blank to keep the existing value"
                />
              </Field>
            ))
          )}
          {kind !== "mock" && kind !== "manual" && (
            <Alert tone="warn" title="Not live until tested">
              Saving credentials does not verify them. Run the health check and complete one end-to-end campaign before
              telling customers this integration is live.
            </Alert>
          )}
        </div>
      )}

      {error && <Alert tone="danger">{error}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}
      <Button size="sm" onClick={save} loading={busy}>
        Save provider
      </Button>
    </div>
  );
}
