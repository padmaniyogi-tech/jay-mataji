import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getTicketThread } from "@/lib/support";
import { formatDateTime } from "@/lib/format";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { ReplyForm } from "@/components/support/reply-form";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "success" | "warn" | "info" | "neutral"> = {
  open: "info",
  awaiting_agent: "warn",
  awaiting_customer: "info",
  resolved: "success",
  closed: "neutral",
};

export default async function TicketPage({ params }: { params: Promise<{ publicId: string }> }) {
  const user = await requireUser();
  const { publicId } = await params;
  const thread = await getTicketThread(publicId, user);
  if (!thread || thread.ticket.userId !== user.id) notFound();
  const { ticket, messages } = thread;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href="/dashboard/support" className="text-sm text-ink-soft hover:text-ink">
          ← All tickets
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold">{ticket.subject}</h2>
          <Badge tone={STATUS_TONE[ticket.status] ?? "neutral"}>{ticket.status.replace(/_/g, " ")}</Badge>
        </div>
        <p className="mt-1 text-xs text-ink-faint">
          {ticket.publicId} · {ticket.category} · opened {formatDateTime(ticket.createdAt)}
        </p>
      </div>

      <Card>
        <CardHeader title="Conversation" description="Only you and our team can read this thread." />
        <CardBody className="space-y-3">
          {messages.map((message) => {
            const staff = message.authorRole !== "customer";
            return (
              <div key={message.id} className={staff ? "flex justify-start" : "flex justify-end"}>
                <div
                  className={
                    staff
                      ? "max-w-[85%] rounded-2xl rounded-tl-sm border border-line bg-canvas px-4 py-3"
                      : "max-w-[85%] rounded-2xl rounded-tr-sm bg-brand-600 px-4 py-3 text-white"
                  }
                >
                  <p className={staff ? "text-[11px] font-semibold text-ink-faint" : "text-[11px] font-semibold text-brand-100"}>
                    {message.authorLabel} · {formatDateTime(message.createdAt)}
                    {message.internal ? " · internal note" : ""}
                  </p>
                  <p className={staff ? "mt-1 whitespace-pre-wrap text-sm text-ink" : "mt-1 whitespace-pre-wrap text-sm"}>
                    {message.body}
                  </p>
                </div>
              </div>
            );
          })}
        </CardBody>
      </Card>

      {["resolved", "closed"].includes(ticket.status) ? (
        <Card>
          <CardBody>
            <ReplyForm ticketPublicId={ticket.publicId} closed />
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader title="Add a reply" />
          <CardBody>
            <ReplyForm ticketPublicId={ticket.publicId} closed={false} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
