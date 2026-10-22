"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { callApi } from "@/components/app/action-button";

export function ProfileForm({
  name,
  company,
  phone,
  marketingOptIn,
}: {
  name: string;
  company: string | null;
  phone: string | null;
  marketingOptIn: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState({ name, company: company ?? "", phone: phone ?? "" });
  const [optIn, setOptIn] = useState(marketingOptIn);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const result = await callApi(
        "/api/profile",
        { name: form.name, company: form.company || null, phone: form.phone || null, marketingOptIn: optIn },
        "PATCH",
      );
      if (!result.ok) {
        setError(result.error?.message ?? "Could not save your profile.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="profile-name" required>
          <Input id="profile-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} maxLength={120} />
        </Field>
        <Field label="Company / brand" htmlFor="profile-company">
          <Input id="profile-company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} maxLength={120} />
        </Field>
      </div>
      <Field label="Phone" htmlFor="profile-phone" hint="Used only for campaign issues, never for marketing calls.">
        <Input id="profile-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={20} placeholder="+91 90000 00000" />
      </Field>
      <label className="flex items-start gap-2 text-sm text-ink-soft">
        <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} className="mt-1 h-4 w-4 rounded border-line" />
        <span>Email me product updates and offers. Order and payment emails are always sent.</span>
      </label>
      {error && <Alert tone="danger">{error}</Alert>}
      {saved && <Alert tone="success">Profile updated.</Alert>}
      <Button type="submit" loading={loading}>
        Save changes
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (next !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const result = await callApi("/api/profile/password", { currentPassword: current, newPassword: next }, "PATCH");
      if (!result.ok) {
        setError(result.error?.message ?? "Could not change your password.");
        return;
      }
      setSaved(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Current password" htmlFor="current-password" required>
        <Input id="current-password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="New password" htmlFor="new-password" required hint="At least 10 characters; do not reuse an old password.">
          <Input id="new-password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={10} />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm-password" required>
          <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={10} />
        </Field>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {saved && <Alert tone="success">Password changed. Other sessions were signed out.</Alert>}
      <Button type="submit" loading={loading}>
        Change password
      </Button>
    </form>
  );
}
