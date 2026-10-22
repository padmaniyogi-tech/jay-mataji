"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { callApi } from "@/components/app/action-button";
import { formatPaise } from "@/lib/money";

export function RefundActions({
  refundId,
  amountPaise,
  status,
}: {
  refundId: string;
  amountPaise: number;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState(String(amountPaise));
  const [error, setError] = useState<string | null>(null);

  async function run(action: "approve" | "reject" | "retry") {
    setBusy(action);
    setError(null);
    try {
      const body: Record<string, unknown> = { refundId, action };
      if (note.trim()) body.note = note.trim();
      if (action === "approve" && Number(amount) !== amountPaise && Number(amount) > 0) body.amountPaise = Number(amount);
      const result = await callApi("/api/admin/refunds/action", body);
      if (!result.ok) {
        setError(result.error?.message ?? "Refund action failed.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(null);
    }
  }

  if (status === "processed" || status === "rejected" || status === "failed") {
    return <p className="text-xs text-ink-faint">No action available.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Refund amount in paise"
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="h-9 w-32 text-xs"
        />
        <span className="text-[11px] text-ink-faint">{formatPaise(Number(amount) || 0)}</span>
      </div>
      <Input
        aria-label="Decision note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Decision note (required to reject)"
        className="h-9 text-xs"
        maxLength={1000}
      />
      <div className="flex flex-wrap gap-2">
        {status === "requested" && (
          <>
            <Button size="sm" loading={busy === "approve"} onClick={() => run("approve")}>
              Approve
            </Button>
            <Button size="sm" variant="danger" disabled={note.trim().length < 3} loading={busy === "reject"} onClick={() => run("reject")}>
              Reject
            </Button>
          </>
        )}
        {["approved", "processing", "failed"].includes(status) && (
          <Button size="sm" variant="secondary" loading={busy === "retry"} onClick={() => run("retry")}>
            Execute refund
          </Button>
        )}
      </div>
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}
