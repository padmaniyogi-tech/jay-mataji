"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { callApi } from "@/components/app/action-button";

export function ReplyForm({ ticketPublicId, closed }: { ticketPublicId: string; closed: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await callApi(`/api/support/tickets/${ticketPublicId}/reply`, { message });
      if (!result.ok) {
        setError(result.error?.message ?? "Could not send the reply.");
        return;
      }
      setMessage("");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      {closed && (
        <Alert tone="info" title="This ticket is closed">
          Sending a reply reopens it so our team sees your message.
        </Alert>
      )}
      <label htmlFor="ticket-reply" className="text-xs font-semibold text-ink">
        Reply
      </label>
      <Textarea
        id="ticket-reply"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        required
        minLength={2}
        maxLength={4000}
        className="min-h-[90px]"
        placeholder="Add details, screenshots references or your order ID…"
      />
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
      <Button type="submit" size="sm" loading={loading}>
        Send reply
      </Button>
    </form>
  );
}
