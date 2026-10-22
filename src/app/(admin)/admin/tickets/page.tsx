import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { listAllTickets } from "@/lib/support";
import { formatDateTime } from "@/lib/format";
import { Badge, Card, EmptyState, TableShell, Td, Th } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

const TONE: Record<string, "success" | "warn" | "info" | "neutral"> = {
  open: "info",
  awaiting_agent: "warn",
  awaiting_customer: "info",
  resolved: "success",
  closed: "neutral",
};

export default async function AdminTicketsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requirePermission("tickets:manage");
  const { status } = await searchParams;
  const rows = await listAllTickets(status ?? "all");

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Support tickets</h2>
        <p className="mt-1 text-sm text-ink-soft">Internal notes are never shown to customers.</p>
      </div>

      <Card className="p-4">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-xs font-medium text-ink-soft">
            Status
            <select name="status" defaultValue={status ?? "all"} className="block h-10 rounded-xl border border-line bg-surface px-3 text-sm">
              {["all", "open", "awaiting_agent", "awaiting_customer", "resolved", "closed"].map((value) => (
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
          <EmptyState title="No tickets" description="Customer questions will appear here." />
        </Card>
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Ticket</Th>
              <Th>Customer</Th>
              <Th>Category</Th>
              <Th>Status</Th>
              <Th>Updated</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((ticket) => (
              <tr key={ticket.publicId} className="hover:bg-canvas/50">
                <Td>
                  <Link href={`/admin/tickets/${ticket.publicId}`} className="font-medium text-ink hover:text-brand-700">
                    {ticket.subject}
                  </Link>
                  <p className="text-xs text-ink-faint">{ticket.publicId}</p>
                </Td>
                <Td className="text-xs">{ticket.customerName ?? "—"}</Td>
                <Td className="text-xs">{ticket.category}</Td>
                <Td>
                  <Badge tone={TONE[ticket.status] ?? "neutral"}>{ticket.status.replace(/_/g, " ")}</Badge>
                </Td>
                <Td className="text-xs">{formatDateTime(ticket.updatedAt)}</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
