import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { listTicketsForUser } from "@/lib/support";
import { formatDateTime } from "@/lib/format";
import { Badge, Card, CardBody, CardHeader, EmptyState } from "@/components/ui/primitives";
import { TicketForm } from "@/components/support/ticket-form";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "success" | "warn" | "info" | "neutral"> = {
  open: "info",
  awaiting_agent: "warn",
  awaiting_customer: "info",
  resolved: "success",
  closed: "neutral",
};

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const user = await requireUser();
  const { order } = await searchParams;
  const tickets = await listTicketsForUser(user.id);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Support</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Questions about delivery, reporting or refunds? Open a ticket — replies appear here and in your email.
        </p>
      </div>

      <Card>
        <CardHeader title="New ticket" description="Include your order ID if it relates to a campaign." />
        <CardBody>
          <TicketForm defaultOrderPublicId={order} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Your tickets" description={`${tickets.length} total`} />
        {tickets.length === 0 ? (
          <EmptyState title="No tickets yet" description="When you open one, the thread and status appear here." />
        ) : (
          <ul className="divide-y divide-line">
            {tickets.map((ticket) => (
              <li key={ticket.publicId}>
                <Link href={`/dashboard/support/${ticket.publicId}`} className="flex flex-wrap items-center gap-2 px-5 py-3.5 hover:bg-canvas/60">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{ticket.subject}</p>
                    <p className="text-xs text-ink-faint">
                      {ticket.publicId} · {ticket.category} · updated {formatDateTime(ticket.updatedAt)}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[ticket.status] ?? "neutral"}>{ticket.status.replace(/_/g, " ")}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
