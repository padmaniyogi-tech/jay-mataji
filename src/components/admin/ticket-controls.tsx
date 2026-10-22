"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/field";
import { callApi } from "@/components/app/action-button";

const STATUSES = ["open", "awaiting_agent", "awaiting_customer", "resolved", "closed"] as const;

export function StaffReplyForm({ publicId }: { publicId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await callApi("/api/admin/tickets/action", {
        action: "reply",
        publicId,
        message,
        ...(internal ? { internal: true } : {}),
      });
      if (!result.ok) {
        setError(result.error?.message ?? "Could not save the reply.");
        return;
      }
      setMessage("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <label htmlFor="staff-reply" className="text-xs font-semibold text-ink">
        Reply to customer
      </label>
      <Textarea
        id="staff-reply"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        required
        minLength={1}
        maxLength={4000}
        className="min-h-[90px]"
        placeholder="Reply text. Never ask for Instagram passwords, session cookies or OTPs."
      />
      <label className="flex items-center gap-2 text-xs text-ink-soft">
        <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="h-3.5 w-3.5" />
        Internal note (hidden from the customer)
      </label>
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
      <Button type="submit" size="sm" loading={busy}>
        Send
      </Button>
    </form>
  );
}

export function TicketStatusControl({ publicId, status }: { publicId: string; status: string }) {
  const router = useRouter();
  const [next, setNext] = useState(status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const result = await callApi("/api/admin/tickets/action", { action: "status", publicId, status: next });
      if (!result.ok) {
        setError(result.error?.message ?? "Could not update the status.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Select value={next} onChange={(e) => setNext(e.target.value)} aria-label="Ticket status" className="h-9 text-xs">
        {STATUSES.map((value) => (
          <option key={value} value={value}>
            {value.replace(/_/g, " ")}
          </option>
        ))}
      </Select>
      <Button size="sm" variant="secondary" onClick={save} loading={busy} disabled={next === status}>
        Update status
      </Button>
      {error && <p className="text-[11px] text-danger">{error}</p>}
    </div>
  );
}
