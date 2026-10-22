"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/primitives";
import { callApi } from "@/components/app/action-button";

export function CancelOrderForm({ orderPublicId, canCancelImmediately }: { orderPublicId: string; canCancelImmediately: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await callApi(`/api/orders/${orderPublicId}/cancel`, { reason });
      if (!result.ok) {
        setError(result.error?.message ?? "Could not submit the cancellation.");
        return;
      }
      setDone((result.data?.message as string) ?? "Cancellation submitted.");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (done) return <Alert tone="info">{done}</Alert>;

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {canCancelImmediately ? "Cancel order" : "Request cancellation"}
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl border border-line bg-canvas/50 p-3">
      <label htmlFor="cancel-reason" className="text-xs font-semibold text-ink">
        Why are you cancelling?
      </label>
      <Textarea
        id="cancel-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="min-h-[70px]"
        maxLength={500}
        required
        placeholder="Campaign priorities changed."
      />
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="danger" loading={loading}>
          {canCancelImmediately ? "Confirm cancellation" : "Send request"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Keep order
        </Button>
      </div>
      {!canCancelImmediately && (
        <p className="text-[11px] text-ink-faint">
          Delivery may already be running. Our team will check with the provider before cancelling.
        </p>
      )}
    </form>
  );
}

export function RefundRequestForm({ orderPublicId }: { orderPublicId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await callApi(`/api/orders/${orderPublicId}/refund`, { reason });
      if (!result.ok) {
        setError(result.error?.message ?? "Could not submit the refund request.");
        return;
      }
      setDone((result.data?.message as string) ?? "Refund request submitted.");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (done) return <Alert tone="info">{done}</Alert>;

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Request a refund
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl border border-line bg-canvas/50 p-3">
      <label htmlFor="refund-reason" className="text-xs font-semibold text-ink">
        Tell us what went wrong
      </label>
      <Textarea
        id="refund-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="min-h-[70px]"
        maxLength={1000}
        required
        placeholder="The campaign delivered fewer views than requested…"
      />
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={loading}>
          Submit request
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      <p className="text-[11px] text-ink-faint">Finance reviews every refund. You&apos;ll be notified of the decision.</p>
    </form>
  );
}
