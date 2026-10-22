import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { listNotificationsForUser, markAllNotificationsRead } from "@/lib/notifications";
import { formatDateTime } from "@/lib/format";
import { Badge, Card, EmptyState } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/app/submit-button";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await listNotificationsForUser(user.id, 60);

  async function markAll() {
    "use server";
    const me = await requireUser();
    await markAllNotificationsRead(me.id);
  }

  const unread = items.filter((item) => !item.readAt).length;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Notifications</h2>
          <p className="mt-1 text-sm text-ink-soft">
            {unread > 0 ? `${unread} unread` : "You're all caught up."} Order, payment and refund updates appear here.
          </p>
        </div>
        {unread > 0 && (
          <form action={markAll}>
            <SubmitButton variant="secondary" size="sm">Mark all as read</SubmitButton>
          </form>
        )}
      </div>

      {items.length === 0 ? (
        <Card>
          <EmptyState title="Nothing yet" description="You'll be notified when an order is paid, starts delivering or completes." />
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Card key={item.id} className={item.readAt ? "p-4" : "border-brand-200 bg-brand-50/40 p-4"}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={item.readAt ? "neutral" : "info"}>{item.type.replace(/_/g, " ")}</Badge>
                {!item.readAt && <span className="h-2 w-2 rounded-full bg-brand-600" aria-label="Unread" />}
                <span className="ml-auto text-xs text-ink-faint">{formatDateTime(item.createdAt)}</span>
              </div>
              <p className="mt-2 font-semibold text-ink">{item.title}</p>
              <p className="mt-0.5 text-sm text-ink-soft">{item.body}</p>
              {item.href && (
                <Link href={item.href} className="link mt-2 inline-block text-sm">
                  View details →
                </Link>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
