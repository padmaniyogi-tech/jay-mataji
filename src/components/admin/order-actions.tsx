"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert, Badge, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { callApi } from "@/components/app/action-button";

type ProviderOption = { id: string; name: string; kind: string; enabled: boolean; health: string };
type StatusOption = { value: string; label: string };

export function AdminOrderActions({
  publicId,
  status,
  providers,
  statuses,
  deliveredTarget,
  canForce,
}: {
  publicId: string;
  status: string;
  providers: ProviderOption[];
  statuses: StatusOption[];
  deliveredTarget: number;
  canForce: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [providerId, setProviderId] = useState(providers[0]?.id ?? "");
  const [delivered, setDelivered] = useState(String(deliveredTarget));
  const [latest, setLatest] = useState("");
  const [forceStatus, setForceStatus] = useState(status);

  async function run(label: string, body: Record<string, unknown>) {
    setBusy(label);
    setError(null);
    setMessage(null);
    try {
      const result = await callApi(`/api/admin/orders/${publicId}/action`, body);
      if (!result.ok) {
        setError(result.error?.message ?? "Action failed.");
        return;
      }
      setMessage((result.data?.message as string) ?? "Action applied.");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader title="Staff actions" description="Every action is written to the audit log with your identity." />
      <CardBody className="space-y-4">
        {message && <Alert tone="success">{message}</Alert>}
        {error && <Alert tone="danger">{error}</Alert>}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" loading={busy === "retry"} onClick={() => run("retry", { action: "retry_provider" })}>
            Retry provider call
          </Button>
          <Button size="sm" variant="secondary" loading={busy === "route"} onClick={() => run("route", { action: "route" })}>
            Re-run routing
          </Button>
          {["pending_review", "pending_provider"].includes(status) && (
            <Button size="sm" variant="subtle" loading={busy === "progress"} onClick={() => run("progress", { action: "mark_in_progress" })}>
              Mark in progress
            </Button>
          )}
        </div>

        <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Field label="Assign provider" htmlFor="assign-provider" hint="Manual routing fallback; the order moves to queued.">
              <Select id="assign-provider" value={providerId} onChange={(e) => setProviderId(e.target.value)}>
                {providers.length === 0 && <option value="">No providers configured</option>}
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name} · {provider.kind} · {provider.health}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              size="sm"
              disabled={!providerId}
              loading={busy === "assign"}
              onClick={() => run("assign", { action: "assign_provider", providerId })}
            >
              Assign &amp; queue
            </Button>
          </div>

          <div className="space-y-2">
            <Field label="Record delivery (manual providers)" htmlFor="delivered-qty" hint="Writes verified measurements and completes the order.">
              <Input
                id="delivered-qty"
                type="number"
                min={0}
                value={delivered}
                onChange={(e) => setDelivered(e.target.value)}
                placeholder="Delivered quantity"
              />
            </Field>
            <Field label="Latest platform total (optional)" htmlFor="latest-count">
              <Input id="latest-count" type="number" min={0} value={latest} onChange={(e) => setLatest(e.target.value)} />
            </Field>
            <Button
              size="sm"
              loading={busy === "delivery"}
              onClick={() =>
                run("delivery", {
                  action: "record_delivery",
                  deliveredQuantity: Number(delivered),
                  ...(latest ? { latestCount: Number(latest) } : {}),
                })
              }
            >
              Record delivery
            </Button>
          </div>
        </div>

        <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Field label="Internal note" htmlFor="admin-note" hint="Appears on the order timeline for staff and the customer.">
              <Textarea id="admin-note" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[70px]" maxLength={2000} />
            </Field>
            <Button size="sm" variant="secondary" disabled={note.trim().length < 2} loading={busy === "note"} onClick={() => run("note", { action: "note", note })}>
              Add note
            </Button>
          </div>

          <div className="space-y-2">
            <Field label="Cancel order" htmlFor="cancel-reason" hint="Captured payments are queued for refund review.">
              <Input id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (min 5 chars)" maxLength={500} />
            </Field>
            <Button
              size="sm"
              variant="danger"
              disabled={reason.trim().length < 5}
              loading={busy === "cancel"}
              onClick={() => {
                if (!window.confirm("Cancel this order? This notifies the customer and starts refund review.")) return;
                void run("cancel", { action: "cancel", reason });
              }}
            >
              Cancel order
            </Button>
          </div>
        </div>

        {canForce && (
          <div className="space-y-2 border-t border-line pt-4">
            <div className="flex items-center gap-2">
              <Badge tone="danger">Admin only</Badge>
              <p className="text-xs text-ink-faint">Force a status only when reconciling an external provider manually.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Select aria-label="Force status" value={forceStatus} onChange={(e) => setForceStatus(e.target.value)}>
                {statuses.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Audit reason" aria-label="Force status reason" />
              <Button
                size="sm"
                variant="danger"
                disabled={reason.trim().length < 5}
                loading={busy === "force"}
                onClick={() => {
                  if (!window.confirm(`Force status to ${forceStatus}?`)) return;
                  void run("force", { action: "force_status", status: forceStatus, reason });
                }}
              >
                Force
              </Button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
