"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { callApi } from "@/components/app/action-button";

const CATEGORIES = [
  { value: "general", label: "General question" },
  { value: "order", label: "Order or delivery" },
  { value: "payment", label: "Payment" },
  { value: "refund", label: "Refund" },
  { value: "account", label: "Account access" },
  { value: "reporting", label: "Report or measurement" },
];

export function TicketForm({ defaultOrderPublicId }: { defaultOrderPublicId?: string }) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("general");
  const [orderPublicId, setOrderPublicId] = useState(defaultOrderPublicId ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await callApi("/api/support/tickets", {
        subject,
        category,
        message,
        orderPublicId: orderPublicId.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error?.message ?? "Could not open the ticket.");
        return;
      }
      const ticket = (result.data as { ticket?: { publicId: string } }).ticket;
      router.push(ticket ? `/dashboard/support/${ticket.publicId}` : "/dashboard/support");
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
        <Field label="Subject" htmlFor="ticket-subject" required>
          <Input
            id="ticket-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            minLength={5}
            maxLength={180}
            placeholder="Views stopped at 40% of target"
          />
        </Field>
        <Field label="Category" htmlFor="ticket-category" required>
          <Select id="ticket-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Order ID (optional)" htmlFor="ticket-order" hint="Looks like AMP-1234ABCD.">
        <Input
          id="ticket-order"
          value={orderPublicId}
          onChange={(e) => setOrderPublicId(e.target.value.toUpperCase())}
          placeholder="AMP-…"
          maxLength={24}
        />
      </Field>
      <Field label="Message" htmlFor="ticket-message" required hint="Do not paste passwords, OTPs or session cookies.">
        <Textarea
          id="ticket-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          minLength={10}
          maxLength={4000}
          className="min-h-[120px]"
          placeholder="Explain what you expected and what happened."
        />
      </Field>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" loading={loading}>
        Open ticket
      </Button>
    </form>
  );
}
