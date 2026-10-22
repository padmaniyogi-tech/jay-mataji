"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";

type ApiError = { error?: { message: string; details?: Array<{ path: string; message: string }> } };

export function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFields({});
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = (await res.json().catch(() => ({}))) as ApiError;
      if (!res.ok) {
        setError(json.error?.message ?? "Could not send your message.");
        const next: Record<string, string> = {};
        for (const issue of json.error?.details ?? []) next[issue.path] = issue.message;
        setFields(next);
        return;
      }
      setSent(true);
      setForm({ name: "", email: "", message: "" });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <Alert tone="success" title="Message sent">
        Thanks — your message reached our support inbox. You will usually hear back within one business day. Nothing
        was charged and no campaign was started.
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="Your name" htmlFor="name" error={fields.name}>
        <Input
          id="name"
          autoComplete="name"
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          required
        />
      </Field>
      <Field label="Email" htmlFor="email" error={fields.email}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
          required
        />
      </Field>
      <Field
        label="How can we help?"
        htmlFor="message"
        error={fields.message}
        hint="Please do not include Instagram passwords, session cookies or access tokens — we never ask for them."
      >
        <Textarea
          id="message"
          rows={6}
          value={form.message}
          onChange={(e) => update("message", e.target.value)}
          required
        />
      </Field>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" loading={loading}>
        Send message
      </Button>
    </form>
  );
}
