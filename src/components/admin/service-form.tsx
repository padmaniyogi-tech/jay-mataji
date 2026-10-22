"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { callApi } from "@/components/app/action-button";
import { formatPaise } from "@/lib/money";

export function ServicePricingForm({
  serviceId,
  unitPricePaise,
  minQuantity,
  maxQuantity,
  active,
  requiresManualReview,
  estimatedDurationHours,
}: {
  serviceId: string;
  unitPricePaise: number;
  minQuantity: number;
  maxQuantity: number;
  active: boolean;
  requiresManualReview: boolean;
  estimatedDurationHours: number;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    unitPriceRupees: String(unitPricePaise / 100),
    minQuantity: String(minQuantity),
    maxQuantity: String(maxQuantity),
    estimatedDurationHours: String(estimatedDurationHours),
    active,
    requiresManualReview,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const result = await callApi("/api/admin/services/action", {
        serviceId,
        unitPriceRupees: Number(form.unitPriceRupees),
        minQuantity: Number(form.minQuantity),
        maxQuantity: Number(form.maxQuantity),
        estimatedDurationHours: Number(form.estimatedDurationHours),
        active: form.active,
        requiresManualReview: form.requiresManualReview,
      });
      if (!result.ok) {
        setError(result.error?.message ?? "Could not update the service.");
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="space-y-1 text-[11px] font-medium text-ink-faint">
          Price / unit (₹)
          <Input value={form.unitPriceRupees} onChange={(e) => setForm({ ...form, unitPriceRupees: e.target.value })} className="h-8 text-xs" />
          <span className="block tabular-nums">{formatPaise(Math.round((Number(form.unitPriceRupees) || 0) * 100))}</span>
        </label>
        <label className="space-y-1 text-[11px] font-medium text-ink-faint">
          Min
          <Input value={form.minQuantity} onChange={(e) => setForm({ ...form, minQuantity: e.target.value })} className="h-8 text-xs" />
        </label>
        <label className="space-y-1 text-[11px] font-medium text-ink-faint">
          Max
          <Input value={form.maxQuantity} onChange={(e) => setForm({ ...form, maxQuantity: e.target.value })} className="h-8 text-xs" />
        </label>
        <label className="space-y-1 text-[11px] font-medium text-ink-faint">
          ETA (h)
          <Input value={form.estimatedDurationHours} onChange={(e) => setForm({ ...form, estimatedDurationHours: e.target.value })} className="h-8 text-xs" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-soft">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-3.5 w-3.5" />
          Listed in catalog
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={form.requiresManualReview}
            onChange={(e) => setForm({ ...form, requiresManualReview: e.target.checked })}
            className="h-3.5 w-3.5"
          />
          Requires manual review
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={save} loading={busy}>
          Save
        </Button>
        {saved && <span className="text-[11px] text-success">Saved</span>}
        {error && <span className="text-[11px] text-danger">{error}</span>}
      </div>
    </div>
  );
}
