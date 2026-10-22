import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { listAdminRefunds } from "@/lib/admin/service";
import { formatDateTime } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { Alert, Badge, Card, EmptyState, TableShell, Td, Th } from "@/components/ui/primitives";
import { RefundActions } from "@/components/admin/refund-actions";

export const dynamic = "force-dynamic";

const TONE: Record<string, "success" | "danger" | "warn" | "info" | "neutral"> = {
  requested: "warn",
  approved: "info",
  processing: "info",
  processed: "success",
  rejected: "neutral",
  failed: "danger",
};

export default async function AdminRefundsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requirePermission("refunds:approve");
  const { status } = await searchParams;
  const rows = await listAdminRefunds(status ?? "all");
  const pending = rows.filter((row) => row.status === "requested");

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Refunds</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Approvals are capped at the captured amount minus refunds already requested, approved, processing or processed.
        </p>
      </div>

      {pending.length > 0 && (
        <Alert tone="warn" title={`${pending.length} refund request(s) awaiting a decision`}>
          Approving queues execution with the payment gateway. Rejections require a note that the customer can read.
        </Alert>
      )}

      <Card className="p-4">
        <form method="get" className="flex flex-wrap items-end gap-2 text-sm">
          <label className="space-y-1 text-xs font-medium text-ink-soft">
            Status
            <select
              name="status"
              defaultValue={status ?? "all"}
              className="block h-10 rounded-xl border border-line bg-surface px-3 text-sm"
            >
              {["all", "requested", "approved", "processing", "processed", "rejected", "failed"].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="h-10 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">
            Filter
          </button>
        </form>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <EmptyState title="No refunds" description="Customer refund requests will appear here for approval." />
        </Card>
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Customer</Th>
              <Th>Reason</Th>
              <Th className="text-right">Amount</Th>
              <Th>Status</Th>
              <Th>Decision</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((refund) => (
              <tr key={refund.id} className="align-top">
                <Td>
                  <Link href={`/admin/orders/${refund.orderPublicId}`} className="font-medium text-ink hover:text-brand-700">
                    {refund.orderPublicId}
                  </Link>
                  <p className="text-xs text-ink-faint">{formatDateTime(refund.createdAt)}</p>
                  <p className="text-xs text-ink-faint">Order total {formatPaise(refund.totalPaise)}</p>
                </Td>
                <Td className="text-xs">{refund.customerEmail}</Td>
                <Td className="max-w-[240px] text-xs">{refund.reason}</Td>
                <Td className="text-right tabular-nums">{formatPaise(refund.amountPaise)}</Td>
                <Td>
                  <Badge tone={TONE[refund.status] ?? "neutral"}>{refund.status}</Badge>
                  {refund.providerRefundId && <p className="mt-1 break-all text-[10px] text-ink-faint">{refund.providerRefundId}</p>}
                </Td>
                <Td>
                  <RefundActions refundId={refund.id} amountPaise={refund.amountPaise} status={refund.status} />
                  {refund.deciderNote && <p className="mt-1 max-w-[200px] text-[10px] text-ink-faint">{refund.deciderNote}</p>}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
