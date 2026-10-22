"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/primitives";
import { callApi } from "@/components/app/action-button";

export function CouponForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    code: "",
    type: "percent" as "percent" | "fixed",
    value: "10",
    description: "",
    minOrderRupees: "0",
    maxDiscountRupees: "",
    maxRedemptions: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await callApi("/api/admin/coupons/action", {
        action: "create",
        code: form.code.toUpperCase(),
        type: form.type,
        value: Number(form.value),
        ...(form.description ? { description: form.description } : {}),
        minOrderRupees: Number(form.minOrderRupees || 0),
        ...(form.maxDiscountRupees ? { maxDiscountRupees: Number(form.maxDiscountRupees) } : {}),
        ...(form.maxRedemptions ? { maxRedemptions: Number(form.maxRedemptions) } : {}),
        active: true,
      });
      if (!result.ok) {
        setError(result.error?.message ?? "Could not create the coupon.");
        return;
      }
      setMessage(`Coupon ${form.code.toUpperCase()} created.`);
      setForm({ ...form, code: "", description: "" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Code" htmlFor="coupon-code" required>
          <Input id="coupon-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} required minLength={2} maxLength={40} placeholder="LAUNCH20" />
        </Field>
        <Field label="Type" htmlFor="coupon-type" required>
          <Select id="coupon-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as "percent" | "fixed" })}>
            <option value="percent">Percent off</option>
            <option value="fixed">Fixed ₹ off</option>
          </Select>
        </Field>
        <Field
          label={form.type === "percent" ? "Percent (1–100)" : "Amount (₹)"}
          htmlFor="coupon-value"
          required
        >
          <Input id="coupon-value" type="number" min={1} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Min order (₹)" htmlFor="coupon-min">
          <Input id="coupon-min" type="number" min={0} value={form.minOrderRupees} onChange={(e) => setForm({ ...form, minOrderRupees: e.target.value })} />
        </Field>
        <Field label="Max discount (₹)" htmlFor="coupon-max-discount">
          <Input id="coupon-max-discount" type="number" min={0} value={form.maxDiscountRupees} onChange={(e) => setForm({ ...form, maxDiscountRupees: e.target.value })} placeholder="Optional" />
        </Field>
        <Field label="Max redemptions" htmlFor="coupon-max-redemptions">
          <Input id="coupon-max-redemptions" type="number" min={1} value={form.maxRedemptions} onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })} placeholder="Optional" />
        </Field>
      </div>
      <Field label="Description" htmlFor="coupon-description">
        <Input id="coupon-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={240} placeholder="Launch offer for new brands" />
      </Field>
      {error && <Alert tone="danger">{error}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}
      <Button type="submit" loading={busy}>
        Create coupon
      </Button>
    </form>
  );
}

export function CouponToggle({ couponId, active }: { couponId: string; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const result = await callApi("/api/admin/coupons/action", { action: "toggle", couponId, active: !active });
      if (!result.ok) {
        setError(result.error?.message ?? "Update failed.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button size="sm" variant={active ? "secondary" : "subtle"} onClick={toggle} loading={busy}>
        {active ? "Disable" : "Enable"}
      </Button>
      {error && <p className="mt-1 text-[11px] text-danger">{error}</p>}
    </div>
  );
}
