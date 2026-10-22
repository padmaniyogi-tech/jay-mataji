import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { getTicketThread } from "@/lib/support";
import { formatDateTime } from "@/lib/format";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { StaffReplyForm, TicketStatusControl } from "@/components/admin/ticket-controls";

export const dynamic = "force-dynamic";

export default async function AdminTicketPage({ params }: { params: Promise<{ publicId: string }> }) {
  const staff = await requirePermission("tickets:manage");
  const { publicId } = await params;
  const thread = await getTicketThread(publicId, staff);
  if (!thread) notFound();
  const { ticket, messages, customerName } = thread;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <Link href="/admin/tickets" className="text-sm text-ink-faint hover:text-ink">
          ← All tickets
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold">{ticket.subject}</h2>
          <Badge tone={ticket.status === "resolved" ? "success" : ticket.status === "awaiting_agent" ? "warn" : "info"}>
            {ticket.status.replace(/_/g, " ")}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-ink-faint">
          {ticket.publicId} · {customerName ?? "customer"} · opened {formatDateTime(ticket.createdAt)}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Conversation" />
            <CardBody className="space-y-3">
              {messages.map((message) => (
                <div key={message.id} className="rounded-xl border border-line bg-canvas/40 p-3">
                  <p className="text-[11px] font-semibold text-ink-faint">
                    {message.authorLabel} ({message.authorRole}) · {formatDateTime(message.createdAt)}
                    {message.internal && <span className="ml-1 text-accent-700">· internal</span>}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{message.body}</p>
                </div>
              ))}
              {messages.length === 0 && <p className="text-sm text-ink-faint">No messages yet.</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Reply" />
            <CardBody>
              <StaffReplyForm publicId={ticket.publicId} />
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader title="Ticket" />
          <CardBody className="space-y-3 text-xs">
            <p>
              <span className="text-ink-faint">Category:</span> {ticket.category}
            </p>
            <p>
              <span className="text-ink-faint">Priority:</span> {ticket.priority}
            </p>
            <p>
              <span className="text-ink-faint">Updated:</span> {formatDateTime(ticket.updatedAt)}
            </p>
            <TicketStatusControl publicId={ticket.publicId} status={ticket.status} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
